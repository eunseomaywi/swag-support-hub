-- Final peer-support workflow: assignment and meeting confirmation are separate actions.
-- This is forward-only and preserves all legacy requests, sessions and delivery history.

alter table public.peer_support_requests
  add column if not exists assignment_method text,
  add column if not exists assigned_by uuid references public.profiles (id) on delete set null;

alter table public.peer_support_requests
  drop constraint if exists peer_support_requests_assignment_method_check;
alter table public.peer_support_requests
  add constraint peer_support_requests_assignment_method_check check (
    assignment_method is null or assignment_method in ('self_claim', 'teacher_assignment')
  );

comment on column public.peer_support_requests.assignment_method is
  'Null means a legacy assignment whose origin was not recorded. New assignments are self_claim or teacher_assignment.';

alter table public.peer_sessions
  add column if not exists student_email_snapshot text;

update public.peer_sessions session
set student_email_snapshot = lower(request.contact_email)
from public.peer_support_requests request
where request.id = session.request_id and session.student_email_snapshot is null;

alter table public.peer_sessions
  drop constraint if exists peer_sessions_student_email_snapshot_check;
alter table public.peer_sessions
  add constraint peer_sessions_student_email_snapshot_check check (
    student_email_snapshot is null or (
      char_length(student_email_snapshot) between 3 and 254
      and student_email_snapshot ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'peer_session_student_no_overlap'
      and conrelid = 'public.peer_sessions'::regclass
  ) then
    alter table public.peer_sessions add constraint peer_session_student_no_overlap
      exclude using gist (
        student_email_snapshot with =,
        tstzrange(scheduled_start, scheduled_end, '[)') with &&
      ) where (status = 'confirmed' and student_email_snapshot is not null);
  end if;
end;
$$;

alter table public.peer_support_settings
  add column if not exists assignment_attention_hours integer not null default 24
    check (assignment_attention_hours between 1 and 168);

create or replace function public.list_teacher_candidates()
returns table(profile_id uuid,full_name text)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or public.current_app_role()<>'teacher' then
    raise exception 'teacher access required' using errcode='42501'; end if;
  return query select profile.id,profile.full_name from public.profiles profile
    join public.staff_members staff on staff.profile_id=profile.id
    where profile.role='teacher' and profile.email is not null
      and staff.staff_type='teacher' and staff.booking_enabled
    order by profile.full_name nulls last,profile.id;
end;
$$;

create or replace function public.save_peer_support_settings(
  p_location_guidance text,p_supervisor_teacher_id uuid,p_active_weekdays smallint[],
  p_break_start time without time zone,p_break_end time without time zone,
  p_lunch_1_start time without time zone,p_lunch_1_end time without time zone,
  p_lunch_2_start time without time zone,p_lunch_2_end time without time zone
)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid();
begin
  if actor_id is null or public.current_app_role()<>'teacher' then raise exception 'teacher access required' using errcode='42501'; end if;
  if p_location_guidance is null or char_length(btrim(p_location_guidance)) not between 1 and 160
    or p_active_weekdays is null or cardinality(p_active_weekdays)=0
    or not(p_active_weekdays<@array[1,2,3,4,5,6,7]::smallint[])
    or cardinality(p_active_weekdays)<>cardinality(array(select distinct value from unnest(p_active_weekdays) value))
    or p_break_start is null or p_break_end is null or p_break_start>=p_break_end
    or p_lunch_1_start is null or p_lunch_1_end is null or p_lunch_1_start>=p_lunch_1_end
    or p_lunch_2_start is null or p_lunch_2_end is null or p_lunch_2_start>=p_lunch_2_end
  then raise exception 'complete valid school schedule required' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles profile join public.staff_members staff on staff.profile_id=profile.id
    where profile.id=p_supervisor_teacher_id and profile.role='teacher' and profile.email is not null
      and staff.staff_type='teacher' and staff.booking_enabled)
  then raise exception 'active supervisor teacher required' using errcode='22023'; end if;
  update public.peer_support_settings set location_guidance=btrim(p_location_guidance),
    supervisor_teacher_id=p_supervisor_teacher_id,active_weekdays=p_active_weekdays,updated_by=actor_id
    where singleton;
  update public.peer_support_periods set start_time=case period when 'break' then p_break_start when 'lunch_1' then p_lunch_1_start else p_lunch_2_start end,
    end_time=case period when 'break' then p_break_end when 'lunch_1' then p_lunch_1_end else p_lunch_2_end end
    where period in ('break','lunch_1','lunch_2');
  return true;
end;
$$;

alter table public.peer_support_actions
  drop constraint if exists peer_support_actions_action_check;
alter table public.peer_support_actions
  add constraint peer_support_actions_action_check check (
    action in (
      'submitted', 'claimed', 'assigned', 'reassigned', 'dismissed', 'dismissal_undone',
      'scheduled', 'confirmed', 'session_cancelled', 'request_cancelled', 'completed',
      'no_show', 'status_corrected', 'escalated', 'escalation_access_granted',
      'email_retry_requested', 'settings_updated'
    )
  );

-- Phase 5 represented confirmed appointments as accepted requests with a confirmed session.
-- Promote only that unambiguous legacy shape to scheduled; no dates or assignment metadata are invented.
update public.peer_support_requests request
set status = 'scheduled'
where request.status = 'accepted'
  and exists (
    select 1 from public.peer_sessions session
    where session.request_id = request.id and session.status = 'confirmed'
  );

drop function if exists public.list_available_peer_requests(boolean, integer, integer);
create function public.list_available_peer_requests(
  p_include_dismissed boolean default false,
  p_page_size integer default 20,
  p_page_offset integer default 0
)
returns table (
  request_id uuid, student_name text, year_group text, category text,
  private_explanation text, preferred_date date, preferred_time text,
  preferred_periods text[], submitted_at timestamptz, dismissed boolean, stale boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); actor_role public.app_role := public.current_app_role();
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member')
    or not exists (
      select 1 from public.staff_members staff
      where staff.profile_id = actor_id and staff.staff_type = actor_role
        and staff.booking_enabled
    )
  then raise exception 'active peer support capability required' using errcode = '42501'; end if;

  return query select request.id, request.student_name, request.year_group, request.category,
    request.private_explanation, request.preferred_date,
    array_to_string(array(select public.phase5_period_label(value)
      from unnest(request.preferred_periods) value), ', '),
    request.preferred_periods, request.created_at, dismissal.request_id is not null,
    request.preferred_date < (now() at time zone 'Asia/Seoul')::date
  from public.peer_support_requests request
  left join public.peer_request_dismissals dismissal
    on dismissal.request_id = request.id and dismissal.mentor_id = actor_id
  where request.status = 'open' and request.assigned_mentor_id is null
    and lower(request.contact_email) is distinct from lower((
      select profile.email from public.profiles profile where profile.id = actor_id
    ))
    and (p_include_dismissed or dismissal.request_id is null)
  order by request.created_at, request.id
  limit least(greatest(coalesce(p_page_size, 20), 1), 50)
  offset greatest(coalesce(p_page_offset, 0), 0);
end;
$$;

create or replace function public.claim_peer_request(p_request_id uuid)
returns table (success boolean, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid(); actor_role public.app_role := public.current_app_role();
  request_row public.peer_support_requests%rowtype; actor_email text;
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member')
    or not exists (
      select 1 from public.staff_members staff
      where staff.profile_id = actor_id and staff.staff_type = actor_role
        and staff.booking_enabled
    )
  then raise exception 'active peer support capability required' using errcode = '42501'; end if;

  select profile.email into actor_email from public.profiles profile where profile.id = actor_id;
  select request.* into request_row from public.peer_support_requests request
    where request.id = p_request_id for update;
  if not found then return query select false, 'not_found'::text; return; end if;
  if lower(request_row.contact_email) = lower(actor_email) then
    return query select false, 'self_assignment_blocked'::text; return;
  end if;
  if request_row.status <> 'open' or request_row.assigned_mentor_id is not null then
    return query select false, 'already_assigned'::text; return;
  end if;

  update public.peer_support_requests set status = 'accepted', assigned_mentor_id = actor_id,
    assigned_at = now(), assignment_method = 'self_claim', assigned_by = actor_id
  where id = p_request_id;
  delete from public.peer_request_dismissals where request_id = p_request_id;
  insert into public.peer_support_actions(request_id, actor_id, action, details)
    values (p_request_id, actor_id, 'claimed', jsonb_build_object('assignment_method','self_claim'));
  return query select true, 'accepted'::text;
end;
$$;

create function public.list_peer_supporter_candidates(p_request_id uuid)
returns table (
  profile_id uuid, full_name text, supporter_role public.app_role,
  active_case_count bigint, conflicting_periods text[]
)
language plpgsql stable security definer set search_path = '' as $$
declare request_row public.peer_support_requests%rowtype;
begin
  if auth.uid() is null or public.current_app_role() <> 'teacher' then
    raise exception 'teacher access required' using errcode = '42501'; end if;
  select * into request_row from public.peer_support_requests where id = p_request_id;
  if not found then return; end if;

  return query
  select profile.id, profile.full_name, profile.role,
    (select count(*) from public.peer_support_requests assigned
      where assigned.assigned_mentor_id = profile.id and assigned.status in ('accepted','scheduled')),
    coalesce((select array_agg(distinct session.period order by session.period)
      from public.peer_sessions session
      where session.mentor_id = profile.id and session.status = 'confirmed'
        and (session.scheduled_start at time zone 'Asia/Seoul')::date = request_row.preferred_date
        and session.period = any(request_row.preferred_periods)), '{}'::text[])
  from public.profiles profile
  join public.staff_members staff on staff.profile_id = profile.id
  where profile.role in ('peer_mentor','swag_member')
    and staff.staff_type = profile.role and staff.booking_enabled
    and profile.email is not null
    and lower(profile.email) <> lower(request_row.contact_email)
  order by profile.full_name nulls last, profile.id;
end;
$$;

create function public.teacher_assign_peer_request(p_request_id uuid, p_supporter_id uuid)
returns table (success boolean, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid(); request_row public.peer_support_requests%rowtype;
  supporter public.profiles%rowtype;
begin
  if actor_id is null or public.current_app_role() <> 'teacher' then
    raise exception 'teacher access required' using errcode = '42501'; end if;
  select * into supporter from public.profiles where id = p_supporter_id;
  if not found or supporter.role not in ('peer_mentor','swag_member')
    or not exists (select 1 from public.staff_members staff where staff.profile_id=supporter.id
      and staff.staff_type=supporter.role and staff.booking_enabled)
  then return query select false, 'supporter_not_active'::text; return; end if;

  select * into request_row from public.peer_support_requests where id=p_request_id for update;
  if not found then return query select false, 'not_found'::text; return; end if;
  if lower(request_row.contact_email)=lower(supporter.email) then
    return query select false, 'self_assignment_blocked'::text; return; end if;
  if request_row.status<>'open' or request_row.assigned_mentor_id is not null then
    return query select false, 'already_assigned'::text; return; end if;

  update public.peer_support_requests set status='accepted', assigned_mentor_id=supporter.id,
    assigned_at=now(), assignment_method='teacher_assignment', assigned_by=actor_id
  where id=request_row.id;
  delete from public.peer_request_dismissals where request_id=request_row.id;
  insert into public.peer_support_actions(request_id,actor_id,action,details)
    values(request_row.id,actor_id,'assigned',jsonb_build_object(
      'supporter_id',supporter.id,'assignment_method','teacher_assignment'));
  return query select true,'assigned'::text;
end;
$$;

create function public.teacher_reassign_peer_request(p_request_id uuid, p_supporter_id uuid)
returns table (success boolean, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid:=auth.uid(); request_row public.peer_support_requests%rowtype;
  supporter public.profiles%rowtype; previous_id uuid;
begin
  if actor_id is null or public.current_app_role()<>'teacher' then
    raise exception 'teacher access required' using errcode='42501'; end if;
  select * into supporter from public.profiles where id=p_supporter_id;
  if not found or supporter.role not in ('peer_mentor','swag_member')
    or not exists(select 1 from public.staff_members staff where staff.profile_id=supporter.id
      and staff.staff_type=supporter.role and staff.booking_enabled)
  then return query select false,'supporter_not_active'::text; return; end if;
  select * into request_row from public.peer_support_requests where id=p_request_id for update;
  if not found then return query select false,'not_found'::text; return; end if;
  if request_row.status<>'accepted' or request_row.assigned_mentor_id is null
    or exists(select 1 from public.peer_confirmation_events event where event.request_id=request_row.id)
  then return query select false,'not_reassignable'::text; return; end if;
  if lower(request_row.contact_email)=lower(supporter.email) then
    return query select false,'self_assignment_blocked'::text; return; end if;
  previous_id:=request_row.assigned_mentor_id;
  if previous_id=supporter.id then return query select true,'already_assigned'::text; return; end if;
  update public.peer_support_requests set assigned_mentor_id=supporter.id, assigned_at=now(),
    assignment_method='teacher_assignment',assigned_by=actor_id where id=request_row.id;
  insert into public.peer_support_actions(request_id,actor_id,action,details)
    values(request_row.id,actor_id,'reassigned',jsonb_build_object(
      'previous_supporter_id',previous_id,'supporter_id',supporter.id));
  return query select true,'reassigned'::text;
end;
$$;

create or replace function public.preview_peer_request_confirmation(p_request_id uuid)
returns table (
  request_id uuid, preferred_date date, period text, period_label text,
  scheduled_start timestamptz, scheduled_end timestamptz,
  display_timezone text, location_guidance text, ready boolean, readiness_issue text
)
language plpgsql stable security definer set search_path = '' as $$
declare actor_id uuid:=auth.uid(); actor_role public.app_role:=public.current_app_role();
begin
  if actor_id is null or actor_role not in ('peer_mentor','swag_member') then
    raise exception 'peer support capability required' using errcode='42501'; end if;
  return query
  select request.id,request.preferred_date,requested.period,period.label,
    case when period.start_time is null then null else
      (request.preferred_date+period.start_time) at time zone settings.display_timezone end,
    case when period.end_time is null then null else
      (request.preferred_date+period.end_time) at time zone settings.display_timezone end,
    settings.display_timezone,settings.location_guidance,
    request.status='accepted' and request.assigned_mentor_id=actor_id
      and settings.location_guidance is not null and settings.supervisor_teacher_id is not null
      and teacher.role='teacher' and teacher.email is not null
      and exists(select 1 from public.staff_members staff where staff.profile_id=teacher.id
        and staff.staff_type='teacher' and staff.booking_enabled)
      and period.start_time is not null and period.end_time is not null
      and extract(isodow from request.preferred_date)::smallint=any(settings.active_weekdays)
      and ((request.preferred_date+period.start_time) at time zone settings.display_timezone)>now(),
    case
      when request.status<>'accepted' or request.assigned_mentor_id<>actor_id then 'not_assigned_to_you'
      when settings.supervisor_teacher_id is null then 'supervisor_teacher_missing'
      when teacher.role is distinct from 'teacher' or teacher.email is null then 'supervisor_teacher_invalid'
      when not exists(select 1 from public.staff_members staff where staff.profile_id=teacher.id
        and staff.staff_type='teacher' and staff.booking_enabled) then 'supervisor_teacher_inactive'
      when settings.location_guidance is null then 'location_missing'
      when period.start_time is null or period.end_time is null then 'period_time_missing'
      when not(extract(isodow from request.preferred_date)::smallint=any(settings.active_weekdays)) then 'date_not_active'
      when ((request.preferred_date+period.start_time) at time zone settings.display_timezone)<=now() then 'appointment_in_past'
      else null end
  from public.peer_support_requests request
  cross join public.peer_support_settings settings
  cross join lateral unnest(request.preferred_periods) requested(period)
  join public.peer_support_periods period on period.period=requested.period
  left join public.profiles teacher on teacher.id=settings.supervisor_teacher_id
  where request.id=p_request_id and settings.singleton
  order by case requested.period when 'break' then 1 when 'lunch_1' then 2 else 3 end;
end;
$$;

create function public.confirm_peer_meeting(p_request_id uuid,p_period text)
returns table(success boolean,outcome text,session_id uuid,confirmation_event_id uuid)
language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid:=auth.uid(); actor_role public.app_role:=public.current_app_role();
  request_row public.peer_support_requests%rowtype; settings_row public.peer_support_settings%rowtype;
  period_row public.peer_support_periods%rowtype; supporter public.profiles%rowtype;
  teacher public.profiles%rowtype; new_session_id uuid; new_event_id uuid;
  start_at timestamptz; end_at timestamptz; schedule_token uuid:=gen_random_uuid();
begin
  if actor_id is null or actor_role not in ('peer_mentor','swag_member')
    or not exists(select 1 from public.staff_members staff where staff.profile_id=actor_id
      and staff.staff_type=actor_role and staff.booking_enabled)
  then raise exception 'active peer support capability required' using errcode='42501'; end if;
  if p_period not in ('break','lunch_1','lunch_2') then
    raise exception 'invalid period' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_id::text,0));
  select * into request_row from public.peer_support_requests where id=p_request_id for update;
  if not found then return query select false,'not_found'::text,null::uuid,null::uuid; return; end if;
  if request_row.assigned_mentor_id=actor_id and request_row.status='scheduled' then
    select event.session_id,event.id into new_session_id,new_event_id
      from public.peer_confirmation_events event where event.request_id=request_row.id;
    if found then return query select true,'already_confirmed'::text,new_session_id,new_event_id; return; end if;
  end if;
  if request_row.status<>'accepted' or request_row.assigned_mentor_id<>actor_id then
    return query select false,'not_assigned_to_you'::text,null::uuid,null::uuid; return; end if;
  if not(p_period=any(request_row.preferred_periods)) then
    return query select false,'period_not_requested'::text,null::uuid,null::uuid; return; end if;

  select * into settings_row from public.peer_support_settings where singleton for share;
  select * into period_row from public.peer_support_periods where period=p_period for share;
  select * into supporter from public.profiles where id=actor_id;
  select * into teacher from public.profiles where id=settings_row.supervisor_teacher_id;
  if settings_row.location_guidance is null or cardinality(settings_row.active_weekdays)=0
    or period_row.start_time is null or period_row.end_time is null
    or supporter.email is null or teacher.id is null or teacher.role<>'teacher' or teacher.email is null
    or not exists(select 1 from public.staff_members staff where staff.profile_id=teacher.id
      and staff.staff_type='teacher' and staff.booking_enabled)
  then return query select false,'configuration_not_ready'::text,null::uuid,null::uuid; return; end if;
  if not(extract(isodow from request_row.preferred_date)::smallint=any(settings_row.active_weekdays)) then
    return query select false,'date_not_active'::text,null::uuid,null::uuid; return; end if;
  start_at:=(request_row.preferred_date+period_row.start_time) at time zone settings_row.display_timezone;
  end_at:=(request_row.preferred_date+period_row.end_time) at time zone settings_row.display_timezone;
  if start_at<=now() then return query select false,'appointment_in_past'::text,null::uuid,null::uuid; return; end if;
  if exists(select 1 from public.peer_sessions session where session.status='confirmed'
    and session.mentor_id=actor_id and tstzrange(session.scheduled_start,session.scheduled_end,'[)')&&tstzrange(start_at,end_at,'[)'))
  then return query select false,'supporter_conflict'::text,null::uuid,null::uuid; return; end if;
  if exists(select 1 from public.peer_sessions session where session.status='confirmed'
    and lower(session.student_email_snapshot)=lower(request_row.contact_email)
    and tstzrange(session.scheduled_start,session.scheduled_end,'[)')&&tstzrange(start_at,end_at,'[)'))
  then return query select false,'student_conflict'::text,null::uuid,null::uuid; return; end if;

  begin
    insert into public.peer_sessions(request_id,slot_id,mentor_id,scheduled_start,scheduled_end,
      time_label,location,period,display_timezone,supervisor_teacher_id,schedule_version,status,
      student_email_snapshot)
    values(request_row.id,null,actor_id,start_at,end_at,period_row.label,
      settings_row.location_guidance,p_period,settings_row.display_timezone,teacher.id,schedule_token,
      'confirmed',lower(request_row.contact_email)) returning id into new_session_id;
  exception when exclusion_violation or unique_violation then
    return query select false,'schedule_conflict'::text,null::uuid,null::uuid; return;
  end;
  update public.peer_support_requests set status='scheduled' where id=request_row.id;
  insert into public.peer_confirmation_events(request_id,session_id,mentor_id,supervisor_teacher_id,schedule_version)
    values(request_row.id,new_session_id,actor_id,teacher.id,schedule_token) returning id into new_event_id;
  insert into public.peer_confirmation_email_outbox(confirmation_event_id,request_id,session_id,
    recipient_kind,recipient_address,idempotency_key)
  values(new_event_id,request_row.id,new_session_id,'student',lower(request_row.contact_email),
    'peer-confirmed/'||new_event_id||'/student');
  insert into public.peer_confirmation_email_outbox(confirmation_event_id,request_id,session_id,
    recipient_kind,recipient_profile_id,recipient_address,idempotency_key)
  values(new_event_id,request_row.id,new_session_id,'mentor',supporter.id,lower(supporter.email),
    'peer-confirmed/'||new_event_id||'/mentor');
  insert into public.peer_confirmation_email_outbox(confirmation_event_id,request_id,session_id,
    recipient_kind,recipient_profile_id,recipient_address,idempotency_key)
  values(new_event_id,request_row.id,new_session_id,'teacher',teacher.id,lower(teacher.email),
    'peer-confirmed/'||new_event_id||'/teacher');
  insert into public.peer_support_actions(request_id,actor_id,action,details)
    values(request_row.id,actor_id,'confirmed',jsonb_build_object('period',p_period,
      'session_id',new_session_id,'supervisor_teacher_id',teacher.id));
  return query select true,'confirmed'::text,new_session_id,new_event_id;
end;
$$;

create or replace function public.confirm_and_accept_peer_request(p_request_id uuid,p_period text)
returns table(success boolean,outcome text,session_id uuid,confirmation_event_id uuid)
language plpgsql security definer set search_path='' as $$
begin
  perform p_request_id,p_period;
  if auth.uid() is null or public.current_app_role() not in ('peer_mentor','swag_member') then
    raise exception 'peer support capability required' using errcode='42501'; end if;
  return query select false,'use_assignment_then_confirmation'::text,null::uuid,null::uuid;
end;
$$;

create function public.get_peer_assignment_policy()
returns table(assignment_attention_hours integer)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or public.current_app_role()<>'teacher' then
    raise exception 'teacher access required' using errcode='42501'; end if;
  return query select settings.assignment_attention_hours from public.peer_support_settings settings where singleton;
end;
$$;

create function public.set_peer_assignment_policy(p_assignment_attention_hours integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid();
begin
  if actor_id is null or public.current_app_role()<>'teacher' then
    raise exception 'teacher access required' using errcode='42501'; end if;
  if p_assignment_attention_hours not between 1 and 168 then
    raise exception 'attention hours must be between 1 and 168' using errcode='22023'; end if;
  update public.peer_support_settings set assignment_attention_hours=p_assignment_attention_hours,
    updated_by=actor_id where singleton;
  insert into public.peer_support_actions(request_id,actor_id,action,details)
    select request.id,actor_id,'settings_updated',jsonb_build_object(
      'assignment_attention_hours',p_assignment_attention_hours)
    from public.peer_support_requests request order by request.created_at limit 1;
  return true;
end;
$$;

drop function if exists public.list_teacher_peer_support_overview(integer,integer);
create function public.list_teacher_peer_support_overview(p_page_size integer default 40,p_page_offset integer default 0)
returns table(
  request_id uuid,student_name text,year_group text,private_explanation text,
  mentor_id uuid,mentor_name text,category text,preferred_date date,preferred_periods text[],
  confirmed_period text,session_start timestamptz,session_end timestamptz,location text,
  status public.peer_request_status,assignment_method text,assigned_at timestamptz,submitted_at timestamptz,
  student_email_job_id uuid,mentor_email_job_id uuid,teacher_email_job_id uuid,
  student_email_status text,mentor_email_status text,teacher_email_status text,
  stale boolean,needs_attention boolean,near_requested_date boolean
)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or public.current_app_role()<>'teacher' then
    raise exception 'teacher access required' using errcode='42501'; end if;
  return query select request.id,request.student_name,request.year_group,request.private_explanation,
    request.assigned_mentor_id,mentor.full_name,request.category,request.preferred_date,
    request.preferred_periods,session.period,session.scheduled_start,session.scheduled_end,session.location,
    request.status,request.assignment_method,request.assigned_at,request.created_at,
    student_job.id,mentor_job.id,teacher_job.id,student_job.status,mentor_job.status,teacher_job.status,
    request.preferred_date<(now() at time zone 'Asia/Seoul')::date,
    request.status='open' and request.created_at <= now()-make_interval(hours=>settings.assignment_attention_hours),
    request.status='open' and request.preferred_date <= (now() at time zone 'Asia/Seoul')::date+1
  from public.peer_support_requests request
  cross join public.peer_support_settings settings
  left join public.profiles mentor on mentor.id=request.assigned_mentor_id
  left join lateral(select current_session.* from public.peer_sessions current_session
    where current_session.request_id=request.id order by current_session.created_at desc limit 1) session on true
  left join public.peer_confirmation_events event on event.request_id=request.id
  left join public.peer_confirmation_email_outbox student_job on student_job.confirmation_event_id=event.id and student_job.recipient_kind='student'
  left join public.peer_confirmation_email_outbox mentor_job on mentor_job.confirmation_event_id=event.id and mentor_job.recipient_kind='mentor'
  left join public.peer_confirmation_email_outbox teacher_job on teacher_job.confirmation_event_id=event.id and teacher_job.recipient_kind='teacher'
  order by case when request.status='open' then 0 when request.status='accepted' then 1 else 2 end,
    request.created_at,request.id
  limit least(greatest(coalesce(p_page_size,40),1),100)
  offset greatest(coalesce(p_page_offset,0),0);
end;
$$;

create or replace function public.teacher_correct_peer_outcome(p_request_id uuid,p_expected_status text,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid();request_status public.peer_request_status;
begin
  if actor_id is null or public.current_app_role()<>'teacher' then raise exception 'teacher access required' using errcode='42501'; end if;
  if p_expected_status not in ('completed','no_show') or p_reason is null
    or char_length(btrim(p_reason)) not between 1 and 160 then
    raise exception 'explicit correction confirmation required' using errcode='22023'; end if;
  select status into request_status from public.peer_support_requests where id=p_request_id for update;
  if request_status::text<>p_expected_status then return false; end if;
  update public.peer_sessions set status='confirmed',completed_at=null,no_show_at=null
    where request_id=p_request_id and status::text=p_expected_status;
  if not found then return false; end if;
  update public.peer_support_requests set status='scheduled',completed_at=null where id=p_request_id;
  insert into public.peer_support_actions(request_id,actor_id,action,details)
    values(p_request_id,actor_id,'status_corrected',jsonb_build_object('from',p_expected_status,'reason',btrim(p_reason)));
  return true;
end;
$$;

create or replace function public.get_teacher_peer_support_counts()
returns table(open_count bigint,active_count bigint,scheduled_count bigint,
  escalated_count bigint,today_count bigint,completed_count bigint,email_attention_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or public.current_app_role()<>'teacher' then
    raise exception 'teacher access required' using errcode='42501'; end if;
  return query select
    count(*) filter(where status='open'),
    count(*) filter(where status='accepted'),
    count(*) filter(where status='scheduled'),
    count(*) filter(where status='escalated'),
    (select count(*) from public.peer_sessions where status='confirmed'
      and (scheduled_start at time zone 'Asia/Seoul')::date=(now() at time zone 'Asia/Seoul')::date),
    count(*) filter(where status='completed'),
    (select count(*) from public.peer_confirmation_email_outbox where status in ('failed','uncertain'))
  from public.peer_support_requests;
end;
$$;

create or replace function public.retry_confirmation_email(p_outbox_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid();actor_role public.app_role:=public.current_app_role();job_row public.peer_confirmation_email_outbox%rowtype;
begin
  if actor_id is null or actor_role not in ('peer_mentor','swag_member','teacher') then raise exception 'email retry capability required' using errcode='42501'; end if;
  select * into job_row from public.peer_confirmation_email_outbox where id=p_outbox_id for update;
  if not found or job_row.status not in ('failed','uncertain') then return false; end if;
  if not exists(select 1 from public.peer_support_requests request join public.peer_sessions session on session.request_id=request.id
    where request.id=job_row.request_id and request.status='scheduled' and session.id=job_row.session_id
      and session.status='confirmed' and session.scheduled_end>now()
      and (actor_role='teacher' or request.assigned_mentor_id=actor_id
        or (actor_role='swag_member' and exists(select 1 from public.peer_escalation_access access where access.request_id=request.id and access.profile_id=actor_id))))
  then return false; end if;
  update public.peer_confirmation_email_outbox set status='retrying',available_at=now(),last_error_code=null,failed_at=null where id=p_outbox_id;
  insert into public.peer_support_actions(request_id,actor_id,action) values(job_row.request_id,actor_id,'email_retry_requested');
  return true;
end;
$$;

create or replace function public.get_peer_request_management_internal(
  p_dispatch_secret text,p_request_id uuid,p_session_id uuid,p_schedule_version uuid
)
returns table(request_id uuid,status public.peer_request_status,preferred_date date,
  preferred_periods text[],assigned_mentor_name text,session_id uuid,
  session_start timestamptz,session_end timestamptz,session_label text,
  session_location text,session_status public.peer_session_status)
language plpgsql stable security definer set search_path='' as $$
begin
  if p_dispatch_secret is null or extensions.digest(p_dispatch_secret,'sha256')
    <>decode('362b81c16c8f0c831b5ed94530bb81d2edba81f86640bc4cea5e3aa3e2a6793d','hex')
  then raise exception 'management gateway authorization failed' using errcode='42501'; end if;
  return query select request.id,request.status,request.preferred_date,request.preferred_periods,
    mentor.full_name,session.id,session.scheduled_start,session.scheduled_end,
    session.time_label,session.location,session.status
  from public.peer_support_requests request join public.peer_sessions session on session.request_id=request.id
    join public.profiles mentor on mentor.id=request.assigned_mentor_id
  where request.id=p_request_id and session.id=p_session_id and session.schedule_version=p_schedule_version
    and session.status<>'cancelled' and request.status<>'cancelled';
end;
$$;

create or replace function public.cancel_peer_request_internal(
  p_dispatch_secret text,p_request_id uuid,p_session_id uuid,p_schedule_version uuid
)
returns table(success boolean,outcome text)
language plpgsql security definer set search_path='' as $$
declare request_status public.peer_request_status;
begin
  if p_dispatch_secret is null or extensions.digest(p_dispatch_secret,'sha256')
    <>decode('362b81c16c8f0c831b5ed94530bb81d2edba81f86640bc4cea5e3aa3e2a6793d','hex')
  then raise exception 'management gateway authorization failed' using errcode='42501'; end if;
  select request.status into request_status from public.peer_support_requests request
    join public.peer_sessions session on session.request_id=request.id
    where request.id=p_request_id and session.id=p_session_id and session.schedule_version=p_schedule_version
    for update of request;
  if not found then return query select false,'invalid_link'::text; return; end if;
  if request_status='cancelled' then return query select true,'already_cancelled'::text; return; end if;
  if request_status in ('completed','no_show','escalated') then return query select false,'closed'::text; return; end if;
  update public.peer_sessions set status='cancelled',cancelled_at=now() where id=p_session_id and status='confirmed';
  update public.peer_support_requests set status='cancelled',cancelled_at=now() where id=p_request_id;
  perform public.phase5_suppress_request_email(p_request_id,'appointment_cancelled');
  update public.peer_request_access_tokens set revoked_at=now() where request_id=p_request_id;
  insert into public.peer_support_actions(request_id,action) values(p_request_id,'request_cancelled');
  return query select true,'cancelled'::text;
end;
$$;

create or replace function public.finish_confirmation_email_job(
  p_dispatch_secret text,p_job_id uuid,p_worker_id uuid,p_outcome text,
  p_provider_message_id text default null,p_error_code text default null,
  p_retry_after_seconds integer default null
)
returns boolean language plpgsql security definer set search_path='' as $$
declare attempts integer;delay_seconds integer;
begin
  if p_dispatch_secret is null or extensions.digest(p_dispatch_secret,'sha256')
    <>decode('362b81c16c8f0c831b5ed94530bb81d2edba81f86640bc4cea5e3aa3e2a6793d','hex')
  then raise exception 'email dispatcher authorization failed' using errcode='42501'; end if;
  select attempt_count into attempts from public.peer_confirmation_email_outbox
    where id=p_job_id and status='processing' and lease_owner=p_worker_id for update;
  if not found then return false; end if;
  if p_outcome='submitted' and p_provider_message_id is not null and char_length(p_provider_message_id)<=200 then
    update public.peer_confirmation_email_outbox set status='submitted',provider_message_id=p_provider_message_id,
      submitted_at=now(),lease_owner=null,lease_expires_at=null where id=p_job_id;
  elsif p_outcome='temporary' and attempts<5 then
    delay_seconds:=greatest(coalesce(p_retry_after_seconds,0),least(3600,(power(2,attempts)::integer*30)+floor(random()*31)::integer));
    update public.peer_confirmation_email_outbox set status='retrying',
      available_at=now()+make_interval(secs=>delay_seconds),last_error_code=left(coalesce(p_error_code,'temporary_error'),80),
      lease_owner=null,lease_expires_at=null where id=p_job_id;
  elsif p_outcome='uncertain' then
    update public.peer_confirmation_email_outbox set status='uncertain',
      last_error_code=left(coalesce(p_error_code,'delivery_uncertain'),80),lease_owner=null,lease_expires_at=null where id=p_job_id;
  else
    update public.peer_confirmation_email_outbox set status='failed',failed_at=now(),
      last_error_code=left(coalesce(p_error_code,'permanent_error'),80),lease_owner=null,lease_expires_at=null where id=p_job_id;
  end if;
  return true;
end;
$$;

create or replace function public.record_confirmation_email_webhook(
  p_dispatch_secret text,p_provider_event_id text,p_provider_message_id text,
  p_event_type text,p_event_created_at timestamptz
)
returns boolean language plpgsql security definer set search_path='' as $$
declare job_row public.peer_confirmation_email_outbox%rowtype;
begin
  if p_dispatch_secret is null or extensions.digest(p_dispatch_secret,'sha256')
    <>decode('362b81c16c8f0c831b5ed94530bb81d2edba81f86640bc4cea5e3aa3e2a6793d','hex')
  then raise exception 'email dispatcher authorization failed' using errcode='42501'; end if;
  if p_provider_event_id is null or char_length(p_provider_event_id) not between 1 and 200
    or p_provider_message_id is null or char_length(p_provider_message_id) not between 1 and 200
    or p_event_type not in ('email.sent','email.delivered','email.delivery_delayed','email.failed','email.bounced','email.complained','email.suppressed')
    or p_event_created_at is null or p_event_created_at<now()-interval '7 days' or p_event_created_at>now()+interval '5 minutes'
  then raise exception 'invalid provider event' using errcode='22023'; end if;
  select * into job_row from public.peer_confirmation_email_outbox where provider_message_id=p_provider_message_id for update;
  if not found then return false; end if;
  insert into public.peer_confirmation_webhook_events values(p_provider_event_id,p_provider_message_id,p_event_type,p_event_created_at,now())
    on conflict(provider_event_id) do nothing;
  if not found then return true; end if;
  if job_row.provider_event_at is not null and p_event_created_at<job_row.provider_event_at then return true; end if;
  if p_event_type='email.delivered' and job_row.status<>'suppressed' then
    update public.peer_confirmation_email_outbox set status='delivered',delivered_at=p_event_created_at,
      provider_event_at=p_event_created_at,last_error_code=null where id=job_row.id;
  elsif p_event_type in ('email.bounced','email.complained','email.suppressed') then
    update public.peer_confirmation_email_outbox set status='suppressed',suppressed_at=now(),
      provider_event_at=p_event_created_at,last_error_code=replace(p_event_type,'email.','provider_') where id=job_row.id;
  elsif p_event_type='email.failed' and job_row.status not in ('delivered','suppressed') then
    update public.peer_confirmation_email_outbox set status='failed',failed_at=now(),
      provider_event_at=p_event_created_at,last_error_code='provider_failed' where id=job_row.id;
  elsif p_event_type='email.delivery_delayed' and job_row.status not in ('delivered','failed','suppressed') then
    update public.peer_confirmation_email_outbox set status='submitted',provider_event_at=p_event_created_at,
      last_error_code='provider_delivery_delayed' where id=job_row.id;
  elsif p_event_type='email.sent' and job_row.status in ('processing','submitted') then
    update public.peer_confirmation_email_outbox set status='submitted',provider_event_at=p_event_created_at where id=job_row.id;
  end if;
  return true;
end;
$$;

-- Keep the existing dispatcher contract, but only send for the final scheduled state.
create or replace function public.claim_confirmation_email_jobs(
  p_dispatch_secret text,p_worker_id uuid,p_limit integer default 10,p_lease_seconds integer default 120
)
returns table(
  job_id uuid,recipient_kind text,recipient_address text,idempotency_key text,
  request_id uuid,session_id uuid,schedule_version uuid,student_name text,mentor_name text,
  mentor_role public.app_role,scheduled_start timestamptz,scheduled_end timestamptz,
  period_label text,location text,display_timezone text
)
language plpgsql security definer set search_path='' as $$
begin
  if p_dispatch_secret is null or extensions.digest(p_dispatch_secret,'sha256')
    <>decode('362b81c16c8f0c831b5ed94530bb81d2edba81f86640bc4cea5e3aa3e2a6793d','hex')
  then raise exception 'email dispatcher authorization failed' using errcode='42501'; end if;
  if p_worker_id is null or p_limit not between 1 and 25 or p_lease_seconds not between 30 and 600 then
    raise exception 'invalid email claim parameters' using errcode='22023'; end if;
  update public.peer_confirmation_email_outbox set status='uncertain',lease_owner=null,lease_expires_at=null,last_error_code='lease_expired_after_idempotency_window'
    where status='processing' and lease_expires_at<=now() and last_attempt_started_at<=now()-interval '23 hours';
  update public.peer_confirmation_email_outbox set status='retrying',available_at=now(),lease_owner=null,lease_expires_at=null,last_error_code='worker_recovery'
    where status='processing' and lease_expires_at<=now() and last_attempt_started_at>now()-interval '23 hours';
  update public.peer_confirmation_email_outbox job set status='suppressed',suppressed_at=now(),last_error_code='confirmation_no_longer_sendable',lease_owner=null,lease_expires_at=null
  from public.peer_confirmation_events event,public.peer_support_requests request,public.peer_sessions session
  where job.confirmation_event_id=event.id and request.id=event.request_id and session.id=event.session_id
    and job.status in ('queued','retrying') and (
      event.event_type<>'PEER_SESSION_CONFIRMED' or job.notification_kind<>'PEER_SESSION_CONFIRMED'
      or request.status<>'scheduled' or request.assigned_mentor_id<>event.mentor_id
      or session.status<>'confirmed' or session.schedule_version<>event.schedule_version
      or session.mentor_id<>event.mentor_id or session.supervisor_teacher_id<>event.supervisor_teacher_id
      or session.scheduled_end<=now()
      or (job.recipient_kind='student' and lower(job.recipient_address)<>lower(request.contact_email))
      or (job.recipient_kind='mentor' and not exists(select 1 from public.profiles profile where profile.id=event.mentor_id and profile.role in ('peer_mentor','swag_member') and lower(profile.email)=lower(job.recipient_address)))
      or (job.recipient_kind='teacher' and not exists(select 1 from public.profiles profile where profile.id=event.supervisor_teacher_id and profile.role='teacher' and lower(profile.email)=lower(job.recipient_address)))
    );
  return query with selected as(
    select job.id from public.peer_confirmation_email_outbox job
    where job.status in ('queued','retrying') and job.available_at<=now() and job.attempt_count<5
    order by job.available_at,job.created_at for update skip locked limit p_limit
  ),claimed as(
    update public.peer_confirmation_email_outbox job set status='processing',attempt_count=job.attempt_count+1,
      lease_owner=p_worker_id,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),last_attempt_started_at=now(),last_error_code=null
    from selected where job.id=selected.id returning job.*
  ) select claimed.id,claimed.recipient_kind,claimed.recipient_address,claimed.idempotency_key,
    request.id,session.id,session.schedule_version,request.student_name,mentor.full_name,mentor.role,
    session.scheduled_start,session.scheduled_end,session.time_label,session.location,session.display_timezone
  from claimed join public.peer_confirmation_events event on event.id=claimed.confirmation_event_id
    join public.peer_support_requests request on request.id=event.request_id
    join public.peer_sessions session on session.id=event.session_id
    join public.profiles mentor on mentor.id=event.mentor_id;
end;
$$;

revoke all on function public.list_peer_supporter_candidates(uuid) from public,anon,authenticated;
revoke all on function public.teacher_assign_peer_request(uuid,uuid) from public,anon,authenticated;
revoke all on function public.teacher_reassign_peer_request(uuid,uuid) from public,anon,authenticated;
revoke all on function public.confirm_peer_meeting(uuid,text) from public,anon,authenticated;
revoke all on function public.get_peer_assignment_policy() from public,anon,authenticated;
revoke all on function public.set_peer_assignment_policy(integer) from public,anon,authenticated;

grant execute on function public.list_peer_supporter_candidates(uuid) to authenticated;
grant execute on function public.teacher_assign_peer_request(uuid,uuid) to authenticated;
grant execute on function public.teacher_reassign_peer_request(uuid,uuid) to authenticated;
grant execute on function public.confirm_peer_meeting(uuid,text) to authenticated;
grant execute on function public.get_peer_assignment_policy() to authenticated;
grant execute on function public.set_peer_assignment_policy(integer) to authenticated;

comment on function public.claim_peer_request(uuid) is
  'Atomically assigns an open request to the active Peer Mentor or SWAG Member. It never confirms a meeting or creates email.';
comment on function public.teacher_assign_peer_request(uuid,uuid) is
  'Teacher-only atomic assignment. It never confirms a meeting or creates email.';
comment on function public.confirm_peer_meeting(uuid,text) is
  'Assigned supporter-only transaction that creates the meeting, confirmation event and exactly three recipient deliveries.';
