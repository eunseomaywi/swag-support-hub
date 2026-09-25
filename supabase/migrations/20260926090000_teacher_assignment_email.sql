-- A separate event/outbox keeps the existing confirmation-only SMTP queue isolated.
create table public.peer_assignment_email_outbox (
  event_id uuid primary key default extensions.gen_random_uuid(),
  event_type text not null default 'TEACHER_ASSIGNMENT' check (event_type='TEACHER_ASSIGNMENT'),
  request_id uuid not null references public.peer_support_requests(id),
  recipient_id uuid not null references public.profiles(id),
  actor_id uuid not null references public.profiles(id),
  recipient_address text not null,
  recipient_name text,
  recipient_role public.app_role not null check (recipient_role in ('peer_mentor','swag_member')),
  preferred_date date not null,
  preferred_periods text[] not null,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','processing','provider-accepted','failed','needs-review','superseded')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_owner uuid,
  lease_expires_at timestamptz,
  first_attempt_at timestamptz,
  provider_message_id text,
  last_error_code text,
  payload jsonb,
  unique(event_id,recipient_id)
);
create index peer_assignment_email_due on public.peer_assignment_email_outbox(next_attempt_at) where status in ('pending','processing');
alter table public.peer_assignment_email_outbox enable row level security;
revoke all on public.peer_assignment_email_outbox from public,anon,authenticated;
grant all on public.peer_assignment_email_outbox to service_role;

create function public.record_teacher_assignment_email()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipient public.profiles%rowtype; account_email text;
begin
  if new.assigned_mentor_id is not distinct from old.assigned_mentor_id then return new; end if;
  -- Supersede any unsent prior assignment, including A -> B -> A transitions.
  update public.peer_assignment_email_outbox set status='superseded',lease_owner=null,lease_expires_at=null
    where request_id=new.id and status in ('pending','processing','failed');
  if new.assignment_method<>'teacher_assignment' or new.assigned_mentor_id is null then return new; end if;
  if auth.uid() is null or public.current_app_role()<>'teacher' or new.assigned_by is distinct from auth.uid()
    or not exists(select 1 from public.staff_members where profile_id=auth.uid() and staff_type='teacher' and booking_enabled)
  then raise exception 'active teacher required' using errcode='42501'; end if;
  select * into recipient from public.profiles where id=new.assigned_mentor_id;
  select email into account_email from auth.users where id=new.assigned_mentor_id and deleted_at is null
    and (banned_until is null or banned_until<=now());
  if recipient.role not in ('peer_mentor','swag_member') or account_email is null
    or account_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or not exists(select 1 from public.staff_members where profile_id=recipient.id and staff_type=recipient.role and booking_enabled)
  then raise exception 'active supporter account required' using errcode='42501'; end if;
  insert into public.peer_assignment_email_outbox(request_id,recipient_id,actor_id,recipient_address,recipient_name,recipient_role,preferred_date,preferred_periods)
    values(new.id,recipient.id,auth.uid(),account_email,recipient.full_name,recipient.role,new.preferred_date,new.preferred_periods);
  return new;
end;
$$;
revoke all on function public.record_teacher_assignment_email() from public,anon,authenticated;
create trigger peer_teacher_assignment_email after update of assigned_mentor_id on public.peer_support_requests
  for each row execute function public.record_teacher_assignment_email();

create function public.assignment_email_is_current(p_event_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.peer_assignment_email_outbox e
    join public.peer_support_requests r on r.id=e.request_id
    join public.profiles p on p.id=e.recipient_id
    join auth.users u on u.id=e.recipient_id
    where e.event_id=p_event_id and r.status='accepted' and r.assigned_mentor_id=e.recipient_id
      and r.assignment_method='teacher_assignment' and r.preferred_date=e.preferred_date and r.preferred_periods=e.preferred_periods
      and p.role=e.recipient_role and u.email=e.recipient_address and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=now())
      and exists(select 1 from public.staff_members s where s.profile_id=p.id and s.staff_type=p.role and s.booking_enabled)
      and not exists(select 1 from public.peer_assignment_email_outbox newer where newer.request_id=e.request_id and newer.created_at>e.created_at));
$$;

create function public.claim_assignment_email_job(p_worker_id uuid)
returns setof public.peer_assignment_email_outbox language plpgsql security definer set search_path='' as $$
begin
  if p_worker_id is null then raise exception 'worker required'; end if;
  update public.peer_assignment_email_outbox e set status='superseded',lease_owner=null,lease_expires_at=null
    where status in ('pending','processing','failed') and not public.assignment_email_is_current(e.event_id);
  -- Stop before Resend's 24h boundary, even if the previous worker crashed after acceptance.
  update public.peer_assignment_email_outbox set status='needs-review',last_error_code='idempotency_window_expired',lease_owner=null,lease_expires_at=null
    where (status='pending' or (status='processing' and lease_expires_at<=now())) and first_attempt_at<=now()-interval '23 hours';
  update public.peer_assignment_email_outbox set status='needs-review',last_error_code='attempt_limit',lease_owner=null,lease_expires_at=null
    where (status='pending' or (status='processing' and lease_expires_at<=now())) and attempts>=5;
  return query
    update public.peer_assignment_email_outbox e set status='processing',lease_owner=p_worker_id,
      lease_expires_at=now()+interval '120 seconds',attempts=e.attempts+1
    where e.event_id=(select q.event_id from public.peer_assignment_email_outbox q
      where q.event_type='TEACHER_ASSIGNMENT' and ((q.status='pending' and q.next_attempt_at<=now())
        or (q.status='processing' and q.lease_expires_at<=now()))
      order by q.created_at for update skip locked limit 1)
    returning e.*;
end;
$$;

create function public.prepare_assignment_email(p_event_id uuid,p_worker_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.peer_assignment_email_outbox%rowtype;
begin
  -- Lock request before outbox, matching the assignment trigger's lock order.
  perform 1 from public.peer_support_requests where id=(select request_id from public.peer_assignment_email_outbox where event_id=p_event_id) for update;
  select * into job from public.peer_assignment_email_outbox where event_id=p_event_id for update;
  if job.status<>'processing' or job.lease_owner is distinct from p_worker_id or job.lease_expires_at<=now() then return null; end if;
  if not public.assignment_email_is_current(p_event_id) then
    update public.peer_assignment_email_outbox set status='superseded',lease_owner=null,lease_expires_at=null where event_id=p_event_id;
    return null;
  end if;
  if job.first_attempt_at<=now()-interval '23 hours' then
    update public.peer_assignment_email_outbox set status='needs-review',last_error_code='idempotency_window_expired',lease_owner=null,lease_expires_at=null where event_id=p_event_id;
    return null;
  end if;
  if job.payload is null then
    if p_payload->'to' is distinct from jsonb_build_array(job.recipient_address) or p_payload ?| array['cc','bcc','reply_to']
      or p_payload->>'subject' is distinct from 'A peer support request has been assigned to you | SWAG'
    then raise exception 'invalid assignment payload'; end if;
    update public.peer_assignment_email_outbox set payload=p_payload where event_id=p_event_id;
  end if;
  update public.peer_assignment_email_outbox set first_attempt_at=coalesce(first_attempt_at,now()) where event_id=p_event_id;
  return coalesce(job.payload,p_payload);
end;
$$;

create function public.finish_assignment_email(p_event_id uuid,p_worker_id uuid,p_outcome text,p_message_id text default null,p_error_code text default null,p_retry_seconds integer default 60)
returns boolean language plpgsql security definer set search_path='' as $$
declare job public.peer_assignment_email_outbox%rowtype;
begin
  select * into job from public.peer_assignment_email_outbox where event_id=p_event_id for update;
  if job.status<>'processing' or job.lease_owner is distinct from p_worker_id then return false; end if;
  if p_outcome not in ('accepted','temporary','uncertain','permanent') then raise exception 'invalid outcome'; end if;
  if p_outcome='accepted' and (p_message_id is null or length(p_message_id)>200) then raise exception 'message id required'; end if;
  if p_error_code is not null and p_error_code !~ '^[a-z0-9_]{1,80}$' then raise exception 'invalid error code'; end if;
  update public.peer_assignment_email_outbox set
    status=case when p_outcome='accepted' then 'provider-accepted' when p_outcome='permanent' then 'failed'
      when attempts>=5 then 'needs-review' else 'pending' end,
    provider_message_id=p_message_id,last_error_code=p_error_code,
    next_attempt_at=now()+make_interval(secs=>greatest(60,least(3600,coalesce(p_retry_seconds,60)),(30*power(2,attempts))::integer)),
    lease_owner=null,lease_expires_at=null where event_id=p_event_id;
  return true;
end;
$$;

create function public.get_assignment_email_status(p_request_id uuid,p_retry_event_id uuid default null)
returns table(event_id uuid,status text,attempts integer,last_error_code text) language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or public.current_app_role()<>'teacher' then raise exception 'teacher required' using errcode='42501'; end if;
  if p_retry_event_id is not null then
    update public.peer_assignment_email_outbox e set status='pending',next_attempt_at=now(),last_error_code=null
      where e.event_id=p_retry_event_id and e.request_id=p_request_id and e.status='failed' and e.attempts<5
        and (e.first_attempt_at is null or e.first_attempt_at>now()-interval '23 hours')
        and public.assignment_email_is_current(e.event_id);
  end if;
  return query select e.event_id,e.status,e.attempts,e.last_error_code from public.peer_assignment_email_outbox e
    where e.request_id=p_request_id order by e.created_at desc limit 1;
end;
$$;
revoke all on function public.assignment_email_is_current(uuid),public.claim_assignment_email_job(uuid),public.prepare_assignment_email(uuid,uuid,jsonb),public.finish_assignment_email(uuid,uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.assignment_email_is_current(uuid),public.claim_assignment_email_job(uuid),public.prepare_assignment_email(uuid,uuid,jsonb),public.finish_assignment_email(uuid,uuid,text,text,text,integer) to service_role;
revoke all on function public.get_assignment_email_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_assignment_email_status(uuid,uuid) to authenticated;
comment on function public.teacher_assign_peer_request(uuid,uuid) is 'Teacher-only atomic assignment. The trigger records one Resend notification for a changed assignee. No appointment is confirmed.';
