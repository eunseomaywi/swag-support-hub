-- Identity is user-editable; authority and operational approval are not.
alter table public.profiles add column year_group text
  check (year_group is null or year_group in ('Year 7','Year 8','Year 9','Year 10','Year 11','Year 12','Year 13'));

create function public.validate_staff_identity(p_name text,p_year text,p_role public.app_role)
returns void language plpgsql immutable set search_path='' as $$
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 100
    or p_name ~ '[<>[:cntrl:]]' then
    raise exception 'name must be 1-100 characters without HTML or control characters' using errcode='22023';
  end if;
  if p_role in ('peer_mentor','swag_member') and
    (p_year is null or p_year not in ('Year 7','Year 8','Year 9','Year 10','Year 11','Year 12','Year 13')) then
    raise exception 'select a school year group' using errcode='22023';
  end if;
  if p_role='teacher' and p_year is not null then
    raise exception 'teacher profiles do not require a year group' using errcode='22023';
  end if;
end;
$$;
revoke all on function public.validate_staff_identity(text,text,public.app_role) from public,anon,authenticated;
-- Preserve the pre-existing self-name permission, but validate this legacy path too.
create function public.validate_profile_name_change()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.full_name is distinct from old.full_name then
    if new.full_name is null or char_length(btrim(new.full_name)) not between 1 and 100
      or new.full_name ~ '[<>[:cntrl:]]' then
      raise exception 'name must be 1-100 characters without HTML or control characters' using errcode='22023'; end if;
    new.full_name:=btrim(new.full_name);
  end if;
  return new;
end;
$$;
revoke all on function public.validate_profile_name_change() from public,anon,authenticated;
create trigger profiles_validate_name before update of full_name on public.profiles
for each row execute function public.validate_profile_name_change();

create function public.save_my_staff_profile(p_full_name text,p_year_group text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.app_role;
begin
  select role into actor_role from public.profiles where id=actor for update;
  if actor is null or actor_role is null or actor_role not in ('peer_mentor','swag_member','teacher') then
    raise exception 'internal profile access required' using errcode='42501'; end if;
  perform public.validate_staff_identity(p_full_name,p_year_group,actor_role);
  update public.profiles set full_name=btrim(p_full_name),year_group=p_year_group where id=actor;
  return (select jsonb_build_object('id',id,'full_name',full_name,'year_group',year_group,'role',role) from public.profiles where id=actor);
end;
$$;

-- A direct trusted role edit never silently grants operational approval.
create function public.sync_staff_role_after_trusted_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.role is distinct from old.role then
    update public.staff_members set booking_enabled=false,
      staff_type=case when new.role='student' then staff_type else new.role end
      where profile_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_staff_role_after_trusted_change() from public,anon,authenticated;
create trigger profiles_sync_staff_role after update of role on public.profiles
for each row execute function public.sync_staff_role_after_trusted_change();

-- Trusted admin only; explicit approval is mandatory, never derived from user metadata.
create function public.admin_set_staff_registration(p_profile_id uuid,p_role public.app_role,p_booking_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_role is null or p_booking_enabled is null or p_role='student' then
    raise exception 'explicit internal role and operational approval required' using errcode='22023'; end if;
  perform 1 from public.profiles where id=p_profile_id for update;
  if not found then return false; end if;
  update public.profiles set role=p_role,year_group=case when p_role='teacher' then null else year_group end where id=p_profile_id;
  insert into public.staff_members(profile_id,staff_type,booking_enabled) values(p_profile_id,p_role,p_booking_enabled)
    on conflict(profile_id) do update set staff_type=excluded.staff_type,booking_enabled=excluded.booking_enabled;
  return true;
end;
$$;
revoke all on function public.admin_set_staff_registration(uuid,public.app_role,boolean) from public,anon,authenticated;
grant execute on function public.admin_set_staff_registration(uuid,public.app_role,boolean) to service_role;

create function public.supporter_identity_internal(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('supporter_id',p_id,'supporter_name',p.full_name,
    'supporter_year_group',p.year_group,'supporter_role',p.role,
    'supporter_details_available',p.id is not null,
    'supporter_active',coalesce(s.booking_enabled and s.staff_type=p.role,false))
  from (values(p_id)) input(id) left join public.profiles p on p.id=input.id
  left join public.staff_members s on s.profile_id=p.id;
$$;
revoke all on function public.supporter_identity_internal(uuid) from public,anon,authenticated;

create function public.list_support_team()
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or public.current_app_role()<>'teacher' then raise exception 'teacher access required' using errcode='42501'; end if;
  return query select public.supporter_identity_internal(p.id)
    from public.profiles p join public.staff_members s on s.profile_id=p.id
    where p.role in ('peer_mentor','swag_member','teacher') order by p.full_name nulls last,p.id;
end;
$$;
create function public.teacher_save_supporter_profile(p_profile_id uuid,p_full_name text,p_year_group text)
returns boolean language plpgsql security definer set search_path='' as $$
declare target_role public.app_role;
begin
  if auth.uid() is null or public.current_app_role()<>'teacher' then raise exception 'teacher access required' using errcode='42501'; end if;
  select p.role into target_role from public.profiles p join public.staff_members s on s.profile_id=p.id
    where p.id=p_profile_id and p.role in ('peer_mentor','swag_member') and s.staff_type=p.role for update of p;
  if not found then raise exception 'registered supporter required' using errcode='42501'; end if;
  perform public.validate_staff_identity(p_full_name,p_year_group,target_role);
  update public.profiles set full_name=btrim(p_full_name),year_group=p_year_group where id=p_profile_id;
  return true;
end;
$$;

-- Preserve existing assignments and safety actions when identity fields are missing.
-- No forced fake backfill, and profile completion is guidance, not staff approval.

-- Existing no-show RPC already validates actor, assignment, session state and end time.
-- The old assignment constraint accidentally omitted that legitimate terminal state.
alter table public.peer_support_requests drop constraint peer_support_assignment_state_check;
alter table public.peer_support_requests add constraint peer_support_assignment_state_check check (
  (status='open' and assigned_mentor_id is null and assigned_at is null)
  or status='cancelled'
  or (status in ('accepted','scheduled','completed','escalated','no_show') and assigned_mentor_id is not null and assigned_at is not null)
);
grant execute on function public.teacher_correct_peer_outcome(uuid,text,text) to authenticated;

-- New events capture display identity once. Legacy events are deliberately NOT backfilled.
alter table public.peer_confirmation_events add column identity_snapshot jsonb;
create function public.capture_confirmation_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.identity_snapshot is distinct from old.identity_snapshot then
      raise exception 'confirmation identity is immutable' using errcode='22023'; end if;
    return new;
  end if;
  select jsonb_build_object('version',1,'student_name',r.student_name,'student_year_group',r.year_group,
    'supporter_name',p.full_name,'supporter_year_group',p.year_group,'supporter_role',p.role,
    'teacher_name',t.full_name) into new.identity_snapshot
  from public.peer_support_requests r join public.profiles p on p.id=new.mentor_id
    join public.profiles t on t.id=new.supervisor_teacher_id where r.id=new.request_id;
  return new;
end;
$$;
revoke all on function public.capture_confirmation_identity() from public,anon,authenticated;
create trigger peer_confirmation_identity before insert or update on public.peer_confirmation_events
for each row execute function public.capture_confirmation_identity();

-- Reuse the existing secret-gated lease/claim logic; do not create or reactivate jobs.
create function public.claim_confirmation_email_jobs_v2(p_dispatch_secret text,p_worker_id uuid,p_limit integer default 10,p_lease_seconds integer default 120)
returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
  return query select to_jsonb(job) || jsonb_build_object(
    'student_name',coalesce(e.identity_snapshot->>'student_name',job.student_name),
    'student_year_group',e.identity_snapshot->>'student_year_group',
    'mentor_name',e.identity_snapshot->>'supporter_name',
    'mentor_year_group',e.identity_snapshot->>'supporter_year_group',
    'mentor_role',e.identity_snapshot->>'supporter_role',
    'teacher_name',e.identity_snapshot->>'teacher_name',
    'identity_snapshot_version',coalesce((e.identity_snapshot->>'version')::integer,0))
  from public.claim_confirmation_email_jobs(p_dispatch_secret,p_worker_id,p_limit,p_lease_seconds) job
  join public.peer_confirmation_events e on e.session_id=job.session_id;
end;
$$;

create function public.peer_detail_internal(p_request_id uuid,p_session_id uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'request_id',r.id,'student_name',r.student_name,'year_group',r.year_group,'contact_email',r.contact_email,
  'category',r.category,'private_explanation',r.private_explanation,'status',r.status,
  'preferred_date',r.preferred_date,'preferred_periods',r.preferred_periods,
  'preferred_time',array_to_string(array(select public.phase5_period_label(v) from unnest(r.preferred_periods) v),', '),
  'submitted_at',r.created_at,'assigned_at',r.assigned_at,'assignment_method',r.assignment_method,
  'session_id',s.id,'session_start',s.scheduled_start,'session_end',s.scheduled_end,
  'session_label',s.time_label,'session_period',s.period,'session_location',s.location,'session_status',s.status,
  'supervisor_teacher_name',case when e.identity_snapshot is not null then e.identity_snapshot->>'teacher_name' else null end,
  'confirmation_identity',e.identity_snapshot,
  'student_email_job_id',sj.id,'mentor_email_job_id',mj.id,'teacher_email_job_id',tj.id,
  'student_email_status',sj.status,'mentor_email_status',mj.status,'teacher_email_status',tj.status,
  'escalation_reason',r.escalation_reason,'escalated_at',r.escalated_at
 ) || public.supporter_identity_internal(r.assigned_mentor_id)
 from public.peer_support_requests r
 left join lateral(select cs.* from public.peer_sessions cs where cs.request_id=r.id and (p_session_id is null or cs.id=p_session_id) order by cs.created_at desc limit 1) s on true
 left join public.peer_confirmation_events e on e.session_id=s.id
 left join public.peer_confirmation_email_outbox sj on sj.confirmation_event_id=e.id and sj.recipient_kind='student'
 left join public.peer_confirmation_email_outbox mj on mj.confirmation_event_id=e.id and mj.recipient_kind='mentor'
 left join public.peer_confirmation_email_outbox tj on tj.confirmation_event_id=e.id and tj.recipient_kind='teacher'
 where r.id=p_request_id;
$$;
revoke all on function public.peer_detail_internal(uuid,uuid) from public,anon,authenticated;

create function public.get_teacher_peer_request(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or public.current_app_role()<>'teacher' then raise exception 'teacher access required' using errcode='42501'; end if;
 result:=public.peer_detail_internal(p_request_id);
 if result is null then return null; end if;
 return result || jsonb_build_object('history',coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'created_at',a.created_at) order by a.created_at)
   from public.peer_support_actions a where a.request_id=p_request_id),'[]'::jsonb));
end;
$$;
create function public.get_teacher_peer_meeting(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare request_id uuid;
begin
 if auth.uid() is null or public.current_app_role()<>'teacher' then raise exception 'teacher access required' using errcode='42501'; end if;
 select s.request_id into request_id from public.peer_sessions s where s.id=p_session_id;
 if not found then return null; end if;
 return public.peer_detail_internal(request_id,p_session_id);
end;
$$;
create function public.get_my_peer_case_detail(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or public.current_app_role() not in ('peer_mentor','swag_member') then raise exception 'peer support capability required' using errcode='42501'; end if;
 if not exists(select 1 from public.peer_support_requests r where r.id=p_request_id and r.assigned_mentor_id=auth.uid()) then return null; end if;
 result:=public.peer_detail_internal(p_request_id);
 if result->>'status'='escalated' then
   return jsonb_build_object('request_id',p_request_id,'status','escalated'); end if;
 return result;
end;
$$;

create function public.list_peer_supporter_candidates_v2(p_request_id uuid)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or public.current_app_role()<>'teacher' then raise exception 'teacher access required' using errcode='42501'; end if;
 return query select public.supporter_identity_internal(c.profile_id) || jsonb_build_object('active_case_count',c.active_case_count,
  'conflicting_periods',coalesce((select array_agg(period.period order by period.period)
    from public.peer_support_requests r cross join public.peer_support_settings settings
    join public.peer_support_periods period on period.period=any(r.preferred_periods)
    where r.id=p_request_id and settings.singleton and period.start_time is not null and exists(
      select 1 from public.peer_sessions s where s.mentor_id=c.profile_id and s.status='confirmed'
      and tstzrange(s.scheduled_start,s.scheduled_end,'[)') && tstzrange(
        (r.preferred_date+period.start_time) at time zone settings.display_timezone,
        (r.preferred_date+period.end_time) at time zone settings.display_timezone,'[)'))),'{}'::text[]))
 from public.list_peer_supporter_candidates(p_request_id) c;
end;
$$;

create function public.list_teacher_peer_requests_v2(p_filter text default 'all',p_page_size integer default 40,p_page_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or public.current_app_role()<>'teacher' then raise exception 'teacher access required' using errcode='42501'; end if;
 if p_filter not in ('all','open','needs_attention','assigned','scheduled','today','completed','cancelled','no_show','escalated','email','closed') then
   raise exception 'invalid request filter' using errcode='22023'; end if;
 with rows as (
  select r.*,s.id as session_id,s.scheduled_start,s.scheduled_end,
    exists(select 1 from public.peer_confirmation_email_outbox j where j.request_id=r.id and j.status in ('failed','uncertain')) as email_attention,
    r.status='open' and (r.created_at<=now()-make_interval(hours=>settings.assignment_attention_hours)
      or r.preferred_date<=(now() at time zone 'Asia/Seoul')::date+1) as needs_attention
  from public.peer_support_requests r cross join public.peer_support_settings settings
  left join lateral(select cs.* from public.peer_sessions cs where cs.request_id=r.id order by cs.created_at desc limit 1) s on true
 ),filtered as (
  select * from rows where p_filter='all'
   or (p_filter='needs_attention' and (needs_attention or email_attention or status='escalated'))
   or (p_filter='email' and email_attention)
   or (p_filter='assigned' and status='accepted')
   or (p_filter='today' and status='scheduled' and (scheduled_start at time zone 'Asia/Seoul')::date=(now() at time zone 'Asia/Seoul')::date)
   or (p_filter='closed' and status in ('completed','cancelled','no_show'))
   or p_filter=status::text
 ),page as (
  select * from filtered order by case when status='open' then 0 when status='accepted' then 1 else 2 end,created_at,id
    limit least(greatest(coalesce(p_page_size,40),1),100) offset greatest(coalesce(p_page_offset,0),0)
 ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce(jsonb_agg(
    jsonb_build_object('request_id',p.id,'student_name',p.student_name,'year_group',p.year_group,'status',p.status,
    'preferred_date',p.preferred_date,'preferred_periods',p.preferred_periods,'submitted_at',p.created_at,
    'session_id',p.session_id,'session_start',p.scheduled_start,'session_end',p.scheduled_end,
    'email_attention',p.email_attention,'needs_attention',p.needs_attention) || public.supporter_identity_internal(p.assigned_mentor_id)),'[]'::jsonb)) into result from page p;
 return result;
end;
$$;

-- Student links expose only their own assigned supporter, never a staff directory.
create function public.get_peer_request_management_v2(p_token text)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
 return query select to_jsonb(m) || jsonb_build_object(
  'supporter_id',r.assigned_mentor_id,'assigned_mentor_name',case when m.session_id is null then p.full_name else e.identity_snapshot->>'supporter_name' end,
  'supporter_year_group',case when m.session_id is null then p.year_group else e.identity_snapshot->>'supporter_year_group' end,
  'supporter_role',case when m.session_id is null then p.role::text else e.identity_snapshot->>'supporter_role' end,
  'identity_recorded',m.session_id is null or e.identity_snapshot is not null)
 from public.get_peer_request_management(p_token) m join public.peer_support_requests r on r.id=m.request_id
 left join public.profiles p on p.id=r.assigned_mentor_id left join public.peer_confirmation_events e on e.session_id=m.session_id;
end;
$$;
create function public.get_peer_request_management_internal_v2(p_dispatch_secret text,p_request_id uuid,p_session_id uuid,p_schedule_version uuid)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
 return query select to_jsonb(m) || jsonb_build_object('supporter_id',e.mentor_id,
  'assigned_mentor_name',e.identity_snapshot->>'supporter_name','supporter_year_group',e.identity_snapshot->>'supporter_year_group',
  'supporter_role',e.identity_snapshot->>'supporter_role','identity_recorded',e.identity_snapshot is not null)
 from public.get_peer_request_management_internal(p_dispatch_secret,p_request_id,p_session_id,p_schedule_version) m
 left join public.peer_confirmation_events e on e.session_id=m.session_id;
end;
$$;

revoke all on function public.save_my_staff_profile(text,text),public.list_support_team(),
 public.teacher_save_supporter_profile(uuid,text,text),public.get_teacher_peer_request(uuid),public.get_teacher_peer_meeting(uuid),
 public.get_my_peer_case_detail(uuid),public.list_peer_supporter_candidates_v2(uuid),public.list_teacher_peer_requests_v2(text,integer,integer)
 from public,anon,authenticated;
grant execute on function public.save_my_staff_profile(text,text),public.list_support_team(),
 public.teacher_save_supporter_profile(uuid,text,text),public.get_teacher_peer_request(uuid),public.get_teacher_peer_meeting(uuid),
 public.get_my_peer_case_detail(uuid),public.list_peer_supporter_candidates_v2(uuid),public.list_teacher_peer_requests_v2(text,integer,integer)
 to authenticated;
revoke all on function public.claim_confirmation_email_jobs_v2(text,uuid,integer,integer),public.get_peer_request_management_v2(text),
 public.get_peer_request_management_internal_v2(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_confirmation_email_jobs_v2(text,uuid,integer,integer),public.get_peer_request_management_v2(text),
 public.get_peer_request_management_internal_v2(text,uuid,uuid,uuid) to anon,authenticated;

notify pgrst,'reload schema';
