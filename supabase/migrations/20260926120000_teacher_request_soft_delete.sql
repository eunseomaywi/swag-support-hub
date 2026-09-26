-- Forward-only soft deletion. No existing requests, sessions or email history are deleted.
alter table public.peer_support_requests
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id) on delete restrict,
  add constraint peer_request_deletion_pair check ((deleted_at is null) = (deleted_by is null));
alter table public.peer_sessions add column request_deleted_at timestamptz;
comment on column public.peer_sessions.request_deleted_at is
  'Internal retirement marker; preserves the recorded session status but releases active booking conflicts.';

-- An exclusion predicate cannot join its parent. Keep a guarded retirement marker instead.
alter table public.peer_sessions drop constraint peer_session_no_overlap;
alter table public.peer_sessions add constraint peer_session_no_overlap exclude using gist
  (mentor_id with =,tstzrange(scheduled_start,scheduled_end,'[)') with &&)
  where (status='confirmed' and request_deleted_at is null);
alter table public.peer_sessions drop constraint peer_session_student_no_overlap;
alter table public.peer_sessions add constraint peer_session_student_no_overlap exclude using gist
  (student_email_snapshot with =,tstzrange(scheduled_start,scheduled_end,'[)') with &&)
  where (status='confirmed' and student_email_snapshot is not null and request_deleted_at is null);
drop index public.peer_sessions_one_active_request_idx;
create unique index peer_sessions_one_active_request_idx on public.peer_sessions(request_id)
  where status='confirmed' and request_deleted_at is null;
drop index public.peer_sessions_one_active_slot_idx;
create unique index peer_sessions_one_active_slot_idx on public.peer_sessions(slot_id)
  where status='confirmed' and request_deleted_at is null;

alter table public.peer_support_actions drop constraint peer_support_actions_action_check;
alter table public.peer_support_actions add constraint peer_support_actions_action_check check
 (action in ('submitted','claimed','assigned','reassigned','dismissed','dismissal_undone','scheduled',
 'confirmed','session_cancelled','request_cancelled','completed','no_show','status_corrected','escalated',
 'escalation_access_granted','email_retry_requested','settings_updated','request_deleted'));

-- Internal, automatically updatable views centralise the same exclusion before pagination,
-- counts and conflict checks. They grant no new read capability to any API user.
create view public.peer_active_requests with (security_invoker=true) as
  select * from public.peer_support_requests where deleted_at is null;
create view public.peer_active_sessions with (security_invoker=true) as
  select s.* from public.peer_sessions s where s.request_deleted_at is null
  and exists(select 1 from public.peer_support_requests r where r.id=s.request_id and r.deleted_at is null);
revoke all on public.peer_active_requests,public.peer_active_sessions from public,anon,authenticated,service_role;
create policy peer_requests_exclude_deleted on public.peer_support_requests as restrictive
 for all to authenticated using (deleted_at is null) with check (deleted_at is null);
create policy peer_sessions_exclude_retired on public.peer_sessions as restrictive
 for all to authenticated using (request_deleted_at is null) with check (request_deleted_at is null);

-- Patch only relation references in the reviewed existing workflow functions. Keep their
-- signatures, row types, permissions, role checks, locking and INSERT targets unchanged.
-- This also closes still-callable legacy detail/token paths, rather than filtering in JS.
do $migration$
declare f record; definition text;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname=any(array[
  'list_available_peer_requests','list_my_peer_cases','get_my_peer_case','list_my_peer_sessions',
  'get_peer_dashboard_counts','list_teacher_peer_support_overview','get_teacher_peer_support_counts',
  'peer_detail_internal','get_teacher_peer_request','get_teacher_peer_meeting','get_my_peer_case_detail',
  'list_teacher_peer_requests_v2','list_peer_supporter_candidates','list_peer_supporter_candidates_v2',
  'claim_peer_request','teacher_assign_peer_request','teacher_reassign_peer_request',
  'preview_peer_request_confirmation','confirm_peer_meeting','dismiss_peer_request','undo_dismiss_peer_request',
  'cancel_peer_request','cancel_my_peer_session','complete_my_peer_case','mark_peer_case_no_show',
  'teacher_correct_peer_outcome','escalate_my_peer_case','authorize_swag_escalation',
  'list_peer_escalations','get_peer_escalation','get_peer_request_management','get_peer_request_management_v2',
  'get_peer_request_management_internal','get_peer_request_management_internal_v2','cancel_peer_request_internal',
  'retry_confirmation_email','claim_confirmation_email_jobs','assignment_email_is_current','prepare_assignment_email',
  'set_peer_assignment_policy'
 ]) loop
  definition:=pg_get_functiondef(f.oid);
  definition:=regexp_replace(definition,'\m(from|join|update)\s+public\.peer_support_requests\M','\1 public.peer_active_requests','gi');
  definition:=regexp_replace(definition,'\m(from|join|update)\s+public\.peer_sessions\M','\1 public.peer_active_sessions','gi');
  execute definition;
 end loop;
end;
$migration$;

create or replace function public.peer_request_id_for_token(p_token text)
returns uuid language sql stable security definer set search_path='' as $$
 select a.request_id from public.peer_request_access_tokens a
 join public.peer_active_requests r on r.id=a.request_id
 where p_token ~ '^[0-9a-f]{64}$' and a.token_hash=extensions.digest(p_token,'sha256')
 and a.revoked_at is null and a.expires_at>now();
$$;

-- Outbox-only attention counts must also exclude the parent, including in-flight failures.
create or replace function public.get_teacher_peer_support_counts()
returns table(open_count bigint,active_count bigint,scheduled_count bigint,escalated_count bigint,
 today_count bigint,completed_count bigint,email_attention_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or public.current_app_role()<>'teacher' then
  raise exception 'teacher access required' using errcode='42501'; end if;
 return query select count(*) filter(where status='open'),count(*) filter(where status='accepted'),
 count(*) filter(where status='scheduled'),count(*) filter(where status='escalated'),
 (select count(*) from public.peer_active_sessions where status='confirmed'
  and (scheduled_start at time zone 'Asia/Seoul')::date=(now() at time zone 'Asia/Seoul')::date),
 count(*) filter(where status='completed'),
 (select count(*) from public.peer_confirmation_email_outbox j join public.peer_active_requests r on r.id=j.request_id
  where j.status in ('failed','uncertain')) from public.peer_active_requests;
end;
$$;
create or replace function public.get_peer_dashboard_counts()
returns table(available_count bigint,my_active_case_count bigint,my_upcoming_session_count bigint,
 my_available_slot_count bigint,email_attention_count bigint)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or public.current_app_role() not in ('peer_mentor','swag_member') then
  raise exception 'peer support capability required' using errcode='42501'; end if;
 return query select
 (select count(*) from public.peer_active_requests r where r.status='open' and r.assigned_mentor_id is null
  and not exists(select 1 from public.peer_request_dismissals d where d.request_id=r.id and d.mentor_id=actor)),
 (select count(*) from public.peer_active_requests r where r.assigned_mentor_id=actor and r.status in ('accepted','scheduled')),
 (select count(*) from public.peer_active_sessions s where s.mentor_id=actor and s.status='confirmed' and s.scheduled_start>now()),
 0::bigint,
 (select count(*) from public.peer_confirmation_email_outbox j join public.peer_active_requests r on r.id=j.request_id
  join public.peer_confirmation_events e on e.id=j.confirmation_event_id
  where e.mentor_id=actor and j.status in ('failed','uncertain'));
end;
$$;

create function public.guard_peer_request_deletion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.deleted_at is not null then raise exception 'request no longer available' using errcode='55000'; end if;
 if new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by then
  if auth.uid() is null or public.current_app_role()<>'teacher' or new.deleted_by is distinct from auth.uid()
   or not exists(select 1 from public.staff_members where profile_id=auth.uid() and staff_type='teacher' and booking_enabled)
   then raise exception 'active teacher required' using errcode='42501'; end if;
  if new.deleted_at is null or (to_jsonb(new)-array['deleted_at','deleted_by','updated_at'])
    is distinct from (to_jsonb(old)-array['deleted_at','deleted_by','updated_at'])
   then raise exception 'invalid deletion update' using errcode='22023'; end if;
 end if;
 return new;
end;
$$;
create trigger peer_request_deletion_guard before update on public.peer_support_requests
 for each row execute function public.guard_peer_request_deletion();

create function public.guard_peer_session_parent()
returns trigger language plpgsql security definer set search_path='' as $$
declare parent public.peer_support_requests%rowtype;
begin
 select * into parent from public.peer_support_requests where id=new.request_id for update;
 if not found then raise exception 'request no longer available' using errcode='55000'; end if;
 if parent.deleted_at is not null then
  if tg_op='UPDATE' and old.request_deleted_at is null and new.request_deleted_at=parent.deleted_at
    and parent.deleted_by=auth.uid() and public.current_app_role()='teacher'
    and (to_jsonb(new)-array['request_deleted_at','updated_at']) is not distinct from (to_jsonb(old)-array['request_deleted_at','updated_at'])
   then return new; end if;
  raise exception 'request no longer available' using errcode='55000';
 end if;
 if new.request_deleted_at is not null then raise exception 'invalid session retirement' using errcode='22023'; end if;
 return new;
end;
$$;
create trigger peer_session_parent_guard before insert or update on public.peer_sessions
 for each row execute function public.guard_peer_session_parent();

create function public.teacher_delete_peer_request(p_request_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.peer_support_requests%rowtype; actor uuid:=auth.uid();
begin
 if actor is null or public.current_app_role()<>'teacher'
  or not exists(select 1 from public.staff_members where profile_id=actor and staff_type='teacher' and booking_enabled)
  then raise exception 'active teacher required' using errcode='42501'; end if;
 -- Same lock as claim/assignment/confirmation; no client-supplied role or audit actor.
 select * into r from public.peer_support_requests where id=p_request_id for update;
 if not found then return false; end if;
 if r.deleted_at is not null then return true; end if;
 update public.peer_support_requests set deleted_at=now(),deleted_by=actor where id=r.id;
 update public.peer_sessions set request_deleted_at=now() where request_id=r.id and request_deleted_at is null;
 update public.peer_confirmation_email_outbox set status='suppressed',suppressed_at=now(),last_error_code='request_deleted',lease_owner=null,lease_expires_at=null
  where request_id=r.id and provider_message_id is null and status in ('queued','retrying','failed','uncertain');
 update public.peer_assignment_email_outbox set status='superseded',last_error_code='request_deleted',lease_owner=null,lease_expires_at=null
  where request_id=r.id and provider_message_id is null and status in ('pending','failed','needs-review');
 -- Processing jobs retain their lease/history. Pre-send checks suppress unstarted sends;
 -- an already-started external send may still finish and record real provider acceptance.
 insert into public.peer_support_actions(request_id,actor_id,action) values(r.id,actor,'request_deleted');
 return true;
end;
$$;

create function public.guard_peer_email_parent()
returns trigger language plpgsql security definer set search_path='' as $$
declare removed boolean;
begin
 if tg_op='INSERT' then
  perform 1 from public.peer_support_requests where id=new.request_id and deleted_at is null for update;
  if not found then raise exception 'request no longer available' using errcode='55000'; end if;
 else
  select deleted_at is not null into removed from public.peer_support_requests where id=new.request_id;
  if removed then
   if tg_table_name='peer_confirmation_email_outbox' and new.status in ('queued','retrying','failed') then
    new.status:='suppressed';new.suppressed_at:=now();new.last_error_code:='request_deleted';
   elsif tg_table_name='peer_assignment_email_outbox' and new.status in ('pending','failed') then
    new.status:='superseded';new.last_error_code:='request_deleted';
   end if;
  end if;
 end if;
 return new;
end;
$$;
create trigger peer_confirmation_parent_guard before insert or update on public.peer_confirmation_email_outbox
 for each row execute function public.guard_peer_email_parent();
create trigger peer_assignment_parent_guard before insert or update on public.peer_assignment_email_outbox
 for each row execute function public.guard_peer_email_parent();
create trigger peer_confirmation_event_parent_guard before insert on public.peer_confirmation_events
 for each row execute function public.guard_peer_email_parent();

-- Stale reads in preferences/escalation RPCs must not create a child record after
-- deletion. An audit insert fails the whole mutation transaction, not just its log.
create function public.guard_peer_active_child()
returns trigger language plpgsql security definer set search_path='' as $$
declare parent public.peer_support_requests%rowtype;
begin
 select * into parent from public.peer_support_requests where id=new.request_id for update;
 if parent.id is null then raise exception 'request no longer available' using errcode='55000'; end if;
 if parent.deleted_at is not null then
  if tg_table_name='peer_support_actions' then
   if new.action='request_deleted' and new.actor_id=parent.deleted_by
     and auth.uid()=parent.deleted_by and public.current_app_role()='teacher' then return new; end if;
  end if;
  raise exception 'request no longer available' using errcode='55000';
 end if;
 return new;
end;
$$;
create trigger peer_dismissal_parent_guard before insert on public.peer_request_dismissals
 for each row execute function public.guard_peer_active_child();
create trigger peer_escalation_parent_guard before insert on public.peer_escalation_access
 for each row execute function public.guard_peer_active_child();
create trigger peer_action_parent_guard before insert on public.peer_support_actions
 for each row execute function public.guard_peer_active_child();

create function public.prepare_confirmation_email_send(p_dispatch_secret text,p_job_id uuid,p_worker_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.peer_support_requests%rowtype; j public.peer_confirmation_email_outbox%rowtype;
begin
 if p_dispatch_secret is null or extensions.digest(p_dispatch_secret,'sha256')<>
  decode('362b81c16c8f0c831b5ed94530bb81d2edba81f86640bc4cea5e3aa3e2a6793d','hex') then
  raise exception 'email dispatcher authorization failed' using errcode='42501'; end if;
 select * into r from public.peer_support_requests where id=(select request_id from public.peer_confirmation_email_outbox where id=p_job_id) for update;
 select * into j from public.peer_confirmation_email_outbox where id=p_job_id for update;
 if j.id is null or j.status<>'processing' or j.lease_owner is distinct from p_worker_id or j.lease_expires_at<=now() then return false; end if;
 if r.id is null or r.deleted_at is not null or r.status<>'scheduled' or not exists(
  select 1 from public.peer_active_sessions s join public.peer_confirmation_events e on e.id=j.confirmation_event_id
   where s.id=j.session_id and s.status='confirmed' and s.scheduled_end>now()
    and s.schedule_version=e.schedule_version and s.mentor_id=e.mentor_id and r.assigned_mentor_id=e.mentor_id
 ) then
  update public.peer_confirmation_email_outbox set status='suppressed',suppressed_at=now(),last_error_code='request_no_longer_sendable',lease_owner=null,lease_expires_at=null where id=j.id;
  return false;
 end if;
 return true;
end;
$$;

revoke all on function public.teacher_delete_peer_request(uuid) from public,anon,authenticated,service_role;
grant execute on function public.teacher_delete_peer_request(uuid) to authenticated;
revoke all on function public.prepare_confirmation_email_send(text,uuid,uuid) from public,anon,authenticated,service_role;
-- Existing SMTP RPC runtime uses anon + the protected dispatch secret, not service_role.
grant execute on function public.prepare_confirmation_email_send(text,uuid,uuid) to anon,authenticated;
revoke all on function public.guard_peer_request_deletion(),public.guard_peer_session_parent(),public.guard_peer_email_parent(),public.guard_peer_active_child() from public,anon,authenticated;
notify pgrst,'reload schema';
