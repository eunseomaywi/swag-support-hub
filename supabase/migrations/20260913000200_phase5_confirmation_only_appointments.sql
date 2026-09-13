-- Phase 5: mentor-confirmed appointments and confirmation-only email outbox.
-- This migration is additive. Legacy availability, sessions and status values remain intact.

alter table public.peer_support_requests
  add column if not exists preferred_periods text[] not null default '{}'::text[],
  add column if not exists submission_key uuid;

update public.peer_support_requests
set preferred_periods = array[
  case preferred_time
    when 'Break' then 'break'
    when '1st Lunch' then 'lunch_1'
    when '2nd Lunch' then 'lunch_2'
  end
]
where cardinality(preferred_periods) = 0
  and preferred_time in ('Break', '1st Lunch', '2nd Lunch');

alter table public.peer_support_requests
  drop constraint if exists peer_support_preferred_periods_check;
alter table public.peer_support_requests
  add constraint peer_support_preferred_periods_check check (
    cardinality(preferred_periods) between 1 and 3
    and preferred_periods <@ array['break', 'lunch_1', 'lunch_2']::text[]
    and not (
      preferred_periods[1] = any(preferred_periods[2:3])
      or (cardinality(preferred_periods) = 3 and preferred_periods[2] = preferred_periods[3])
    )
  ) not valid;
alter table public.peer_support_requests
  validate constraint peer_support_preferred_periods_check;

create unique index if not exists peer_support_requests_submission_key_idx
on public.peer_support_requests (submission_key)
where submission_key is not null;

alter table public.peer_sessions alter column slot_id drop not null;
alter table public.peer_sessions
  add column if not exists period text,
  add column if not exists display_timezone text not null default 'Asia/Seoul',
  add column if not exists supervisor_teacher_id uuid references public.profiles (id) on delete restrict,
  add column if not exists schedule_version uuid not null default gen_random_uuid(),
  add column if not exists no_show_at timestamptz;

update public.peer_sessions
set period = case time_label
  when 'Break' then 'break'
  when '1st Lunch' then 'lunch_1'
  when '2nd Lunch' then 'lunch_2'
end
where period is null and time_label in ('Break', '1st Lunch', '2nd Lunch');

alter table public.peer_sessions
  drop constraint if exists peer_sessions_period_check;
alter table public.peer_sessions
  add constraint peer_sessions_period_check check (
    period is null or period in ('break', 'lunch_1', 'lunch_2')
  );

alter table public.peer_support_actions
  drop constraint if exists peer_support_actions_action_check;
alter table public.peer_support_actions
  add constraint peer_support_actions_action_check check (
    action in (
      'submitted', 'claimed', 'dismissed', 'dismissal_undone', 'scheduled',
      'confirmed', 'session_cancelled', 'request_cancelled', 'completed',
      'no_show', 'status_corrected', 'escalated', 'escalation_access_granted',
      'email_retry_requested', 'settings_updated'
    )
  );

create table public.peer_support_settings (
  singleton boolean primary key default true check (singleton),
  display_timezone text not null default 'Asia/Seoul' check (display_timezone = 'Asia/Seoul'),
  location_guidance text check (
    location_guidance is null or char_length(btrim(location_guidance)) between 1 and 160
  ),
  supervisor_teacher_id uuid references public.profiles (id) on delete set null,
  active_weekdays smallint[] not null default '{}'::smallint[] check (
    active_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
    and cardinality(active_weekdays) <= 7
  ),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.peer_support_settings (singleton) values (true)
on conflict (singleton) do nothing;

create table public.peer_support_periods (
  period text primary key check (period in ('break', 'lunch_1', 'lunch_2')),
  label text not null check (label in ('Break', '1st Lunch', '2nd Lunch')),
  start_time time without time zone,
  end_time time without time zone,
  updated_at timestamptz not null default now(),
  constraint peer_support_period_time_pair check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and start_time < end_time)
  )
);

insert into public.peer_support_periods (period, label) values
  ('break', 'Break'), ('lunch_1', '1st Lunch'), ('lunch_2', '2nd Lunch')
on conflict (period) do nothing;

create table public.peer_confirmation_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.peer_support_requests (id) on delete restrict,
  session_id uuid not null references public.peer_sessions (id) on delete restrict,
  mentor_id uuid not null references public.profiles (id) on delete restrict,
  supervisor_teacher_id uuid not null references public.profiles (id) on delete restrict,
  schedule_version uuid not null,
  event_type text not null default 'PEER_SESSION_CONFIRMED'
    check (event_type = 'PEER_SESSION_CONFIRMED'),
  created_at timestamptz not null default now(),
  unique (request_id),
  unique (session_id),
  unique (id, request_id, session_id)
);

create table public.peer_confirmation_email_outbox (
  id uuid primary key default gen_random_uuid(),
  confirmation_event_id uuid not null references public.peer_confirmation_events (id) on delete restrict,
  request_id uuid not null references public.peer_support_requests (id) on delete restrict,
  session_id uuid not null references public.peer_sessions (id) on delete restrict,
  recipient_kind text not null check (recipient_kind in ('student', 'mentor', 'teacher')),
  recipient_profile_id uuid references public.profiles (id) on delete restrict,
  recipient_address text not null check (
    char_length(recipient_address) between 3 and 254
    and recipient_address ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  notification_kind text not null default 'PEER_SESSION_CONFIRMED'
    check (notification_kind = 'PEER_SESSION_CONFIRMED'),
  status text not null default 'queued' check (
    status in ('queued', 'processing', 'submitted', 'delivered', 'retrying', 'failed',
      'suppressed', 'cancelled', 'uncertain')
  ),
  idempotency_key text not null unique check (char_length(idempotency_key) <= 256),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  available_at timestamptz not null default now(),
  lease_owner uuid,
  lease_expires_at timestamptz,
  last_attempt_started_at timestamptz,
  provider_message_id text unique,
  provider_event_at timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  submitted_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  suppressed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (confirmation_event_id, recipient_kind),
  unique (confirmation_event_id, recipient_address)
);

create index peer_confirmation_email_ready_idx
on public.peer_confirmation_email_outbox (available_at, created_at)
where status in ('queued', 'retrying');

create table public.peer_confirmation_webhook_events (
  provider_event_id text primary key check (char_length(provider_event_id) between 1 and 200),
  provider_message_id text not null,
  event_type text not null check (event_type in (
    'email.sent', 'email.delivered', 'email.delivery_delayed', 'email.failed',
    'email.bounced', 'email.complained', 'email.suppressed'
  )),
  event_created_at timestamptz not null,
  received_at timestamptz not null default now()
);

create trigger peer_support_settings_set_updated_at before update on public.peer_support_settings
for each row execute function public.set_updated_at();
create trigger peer_support_periods_set_updated_at before update on public.peer_support_periods
for each row execute function public.set_updated_at();
create trigger peer_confirmation_email_outbox_set_updated_at
before update on public.peer_confirmation_email_outbox
for each row execute function public.set_updated_at();

create function public.phase5_period_label(p_period text)
returns text language sql immutable set search_path = '' as $$
  select case p_period when 'break' then 'Break' when 'lunch_1' then '1st Lunch'
    when 'lunch_2' then '2nd Lunch' end
$$;

create function public.list_teacher_candidates()
returns table (profile_id uuid, full_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.current_app_role() <> 'teacher' then
    raise exception 'teacher access required' using errcode = '42501';
  end if;
  return query select profile.id, profile.full_name
  from public.profiles profile where profile.role = 'teacher'
  order by profile.full_name nulls last, profile.id;
end;
$$;

create function public.get_peer_support_settings()
returns table (
  display_timezone text, location_guidance text, supervisor_teacher_id uuid,
  supervisor_teacher_name text, active_weekdays smallint[], periods jsonb,
  schedule_ready boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.current_app_role() <> 'teacher' then
    raise exception 'teacher access required' using errcode = '42501';
  end if;
  return query
  select settings.display_timezone, settings.location_guidance,
    settings.supervisor_teacher_id, teacher.full_name, settings.active_weekdays,
    (select jsonb_agg(jsonb_build_object(
      'period', period.period, 'label', period.label,
      'start_time', period.start_time, 'end_time', period.end_time
    ) order by case period.period when 'break' then 1 when 'lunch_1' then 2 else 3 end)
     from public.peer_support_periods period),
    settings.location_guidance is not null
      and settings.supervisor_teacher_id is not null
      and teacher.role = 'teacher' and teacher.email is not null
      and cardinality(settings.active_weekdays) > 0
      and not exists (select 1 from public.peer_support_periods period
        where period.start_time is null or period.end_time is null)
  from public.peer_support_settings settings
  left join public.profiles teacher on teacher.id = settings.supervisor_teacher_id
  where settings.singleton;
end;
$$;

create function public.save_peer_support_settings(
  p_location_guidance text,
  p_supervisor_teacher_id uuid,
  p_active_weekdays smallint[],
  p_break_start time without time zone,
  p_break_end time without time zone,
  p_lunch_1_start time without time zone,
  p_lunch_1_end time without time zone,
  p_lunch_2_start time without time zone,
  p_lunch_2_end time without time zone
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null or public.current_app_role() <> 'teacher' then
    raise exception 'teacher access required' using errcode = '42501';
  end if;
  if p_location_guidance is null or char_length(btrim(p_location_guidance)) not between 1 and 160
    or p_active_weekdays is null or cardinality(p_active_weekdays) = 0
    or not (p_active_weekdays <@ array[1,2,3,4,5,6,7]::smallint[])
    or cardinality(p_active_weekdays) <> cardinality(array(select distinct value from unnest(p_active_weekdays) value))
    or p_break_start is null or p_break_end is null or p_break_start >= p_break_end
    or p_lunch_1_start is null or p_lunch_1_end is null or p_lunch_1_start >= p_lunch_1_end
    or p_lunch_2_start is null or p_lunch_2_end is null or p_lunch_2_start >= p_lunch_2_end
  then raise exception 'complete valid school schedule required' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_supervisor_teacher_id
    and role = 'teacher' and email is not null)
  then raise exception 'valid supervisor teacher required' using errcode = '22023'; end if;

  update public.peer_support_settings set
    location_guidance = btrim(p_location_guidance),
    supervisor_teacher_id = p_supervisor_teacher_id,
    active_weekdays = p_active_weekdays,
    updated_by = actor_id
  where singleton;
  update public.peer_support_periods set start_time = case period
      when 'break' then p_break_start when 'lunch_1' then p_lunch_1_start else p_lunch_2_start end,
    end_time = case period
      when 'break' then p_break_end when 'lunch_1' then p_lunch_1_end else p_lunch_2_end end
  where period in ('break', 'lunch_1', 'lunch_2');
  return true;
end;
$$;

drop function if exists public.list_available_peer_requests(boolean, integer, integer);
create function public.list_available_peer_requests(
  p_include_dismissed boolean default false,
  p_page_size integer default 20,
  p_page_offset integer default 0
)
returns table (
  request_id uuid, category text, preferred_date date, preferred_time text,
  preferred_periods text[], submitted_at timestamptz, dismissed boolean, stale boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); actor_role public.app_role := public.current_app_role();
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;
  return query select request.id, request.category, request.preferred_date,
    array_to_string(array(select public.phase5_period_label(value)
      from unnest(request.preferred_periods) value), ', '),
    request.preferred_periods, request.created_at,
    dismissal.request_id is not null,
    request.preferred_date < (now() at time zone 'Asia/Seoul')::date
  from public.peer_support_requests request
  left join public.peer_request_dismissals dismissal
    on dismissal.request_id = request.id and dismissal.mentor_id = actor_id
  where request.status = 'open' and request.assigned_mentor_id is null
    and (p_include_dismissed or dismissal.request_id is null)
  order by request.created_at, request.id
  limit least(greatest(coalesce(p_page_size, 20), 1), 50)
  offset greatest(coalesce(p_page_offset, 0), 0);
end;
$$;

create function public.preview_peer_request_confirmation(p_request_id uuid)
returns table (
  request_id uuid, preferred_date date, period text, period_label text,
  scheduled_start timestamptz, scheduled_end timestamptz,
  display_timezone text, location_guidance text, ready boolean, readiness_issue text
)
language plpgsql stable security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); actor_role public.app_role := public.current_app_role();
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;
  return query
  select request.id, request.preferred_date, requested.period, period.label,
    case when period.start_time is null then null else
      (request.preferred_date + period.start_time) at time zone settings.display_timezone end,
    case when period.end_time is null then null else
      (request.preferred_date + period.end_time) at time zone settings.display_timezone end,
    settings.display_timezone, settings.location_guidance,
    request.status = 'open' and request.assigned_mentor_id is null
      and settings.location_guidance is not null
      and settings.supervisor_teacher_id is not null
      and teacher.role = 'teacher' and teacher.email is not null
      and period.start_time is not null and period.end_time is not null
      and extract(isodow from request.preferred_date)::smallint = any(settings.active_weekdays)
      and ((request.preferred_date + period.start_time) at time zone settings.display_timezone) > now(),
    case
      when request.status <> 'open' or request.assigned_mentor_id is not null then 'already_processed'
      when settings.supervisor_teacher_id is null then 'supervisor_teacher_missing'
      when teacher.role is distinct from 'teacher' or teacher.email is null then 'supervisor_teacher_invalid'
      when settings.location_guidance is null then 'location_missing'
      when period.start_time is null or period.end_time is null then 'period_time_missing'
      when not (extract(isodow from request.preferred_date)::smallint = any(settings.active_weekdays)) then 'date_not_active'
      when ((request.preferred_date + period.start_time) at time zone settings.display_timezone) <= now() then 'appointment_in_past'
      else null end
  from public.peer_support_requests request
  cross join public.peer_support_settings settings
  cross join lateral unnest(request.preferred_periods) requested(period)
  join public.peer_support_periods period on period.period = requested.period
  left join public.profiles teacher on teacher.id = settings.supervisor_teacher_id
  where request.id = p_request_id and settings.singleton
  order by case requested.period when 'break' then 1 when 'lunch_1' then 2 else 3 end;
end;
$$;

create or replace function public.claim_peer_request(p_request_id uuid)
returns table (success boolean, outcome text)
language plpgsql security definer set search_path = '' as $$
begin
  perform p_request_id;
  if auth.uid() is null or public.current_app_role() not in ('peer_mentor','swag_member') then
    raise exception 'peer support capability required' using errcode='42501';
  end if;
  return query select false, 'mentor_confirmation_required'::text;
end;
$$;

create function public.confirm_and_accept_peer_request(p_request_id uuid, p_period text)
returns table (success boolean, outcome text, session_id uuid, confirmation_event_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid(); actor_role public.app_role := public.current_app_role();
  request_row public.peer_support_requests%rowtype;
  settings_row public.peer_support_settings%rowtype;
  period_row public.peer_support_periods%rowtype;
  mentor_row public.profiles%rowtype; teacher_row public.profiles%rowtype;
  new_session_id uuid; new_event_id uuid; start_at timestamptz; end_at timestamptz;
  schedule_token uuid := gen_random_uuid();
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;
  if p_period not in ('break', 'lunch_1', 'lunch_2') then
    raise exception 'invalid period' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text, 0));
  select request.* into request_row from public.peer_support_requests request
  where request.id = p_request_id for update;
  if not found then return query select false, 'not_found'::text, null::uuid, null::uuid; return; end if;
  if request_row.assigned_mentor_id = actor_id then
    select event.session_id, event.id into new_session_id, new_event_id
    from public.peer_confirmation_events event where event.request_id = request_row.id;
    if found then return query select true, 'already_confirmed'::text, new_session_id, new_event_id; return; end if;
  end if;
  if request_row.status <> 'open' or request_row.assigned_mentor_id is not null then
    return query select false, 'already_processed'::text, null::uuid, null::uuid; return;
  end if;
  if not (p_period = any(request_row.preferred_periods)) then
    raise exception 'period was not selected by student' using errcode = '22023';
  end if;
  select * into settings_row from public.peer_support_settings where singleton for share;
  select * into period_row from public.peer_support_periods where period = p_period for share;
  select * into mentor_row from public.profiles where id = actor_id;
  select * into teacher_row from public.profiles where id = settings_row.supervisor_teacher_id;
  if settings_row.location_guidance is null or cardinality(settings_row.active_weekdays) = 0
    or period_row.start_time is null or period_row.end_time is null
    or teacher_row.id is null or teacher_row.role <> 'teacher' or teacher_row.email is null
    or mentor_row.role not in ('peer_mentor', 'swag_member') or mentor_row.email is null
  then return query select false, 'configuration_not_ready'::text, null::uuid, null::uuid; return; end if;
  if not (extract(isodow from request_row.preferred_date)::smallint = any(settings_row.active_weekdays)) then
    return query select false, 'date_not_active'::text, null::uuid, null::uuid; return;
  end if;
  start_at := (request_row.preferred_date + period_row.start_time) at time zone settings_row.display_timezone;
  end_at := (request_row.preferred_date + period_row.end_time) at time zone settings_row.display_timezone;
  if start_at <= now() or end_at <= start_at then
    return query select false, 'appointment_in_past'::text, null::uuid, null::uuid; return;
  end if;
  if exists (select 1 from public.peer_sessions session
    where session.mentor_id = actor_id and session.status = 'confirmed'
      and tstzrange(session.scheduled_start, session.scheduled_end, '[)') && tstzrange(start_at, end_at, '[)'))
  then return query select false, 'mentor_conflict'::text, null::uuid, null::uuid; return; end if;

  insert into public.peer_sessions (
    request_id, slot_id, mentor_id, scheduled_start, scheduled_end,
    time_label, location, period, display_timezone, supervisor_teacher_id, schedule_version, status
  ) values (
    request_row.id, null, actor_id, start_at, end_at,
    period_row.label, settings_row.location_guidance, p_period,
    settings_row.display_timezone, teacher_row.id, schedule_token, 'confirmed'
  ) returning id into new_session_id;
  update public.peer_support_requests set status = 'accepted', assigned_mentor_id = actor_id,
    assigned_at = now() where id = request_row.id;
  insert into public.peer_confirmation_events (
    request_id, session_id, mentor_id, supervisor_teacher_id, schedule_version
  ) values (request_row.id, new_session_id, actor_id, teacher_row.id, schedule_token)
  returning id into new_event_id;

  insert into public.peer_confirmation_email_outbox (
    confirmation_event_id, request_id, session_id, recipient_kind,
    recipient_profile_id, recipient_address, idempotency_key
  ) values (
    new_event_id, request_row.id, new_session_id, 'student', null,
    lower(request_row.contact_email), 'peer-confirmed/' || new_event_id || '/student'
  );
  insert into public.peer_confirmation_email_outbox (
    confirmation_event_id, request_id, session_id, recipient_kind,
    recipient_profile_id, recipient_address, idempotency_key
  ) values (
    new_event_id, request_row.id, new_session_id, 'mentor', actor_id,
    lower(mentor_row.email), 'peer-confirmed/' || new_event_id || '/mentor'
  ) on conflict do nothing;
  insert into public.peer_confirmation_email_outbox (
    confirmation_event_id, request_id, session_id, recipient_kind,
    recipient_profile_id, recipient_address, idempotency_key
  ) values (
    new_event_id, request_row.id, new_session_id, 'teacher', teacher_row.id,
    lower(teacher_row.email), 'peer-confirmed/' || new_event_id || '/teacher'
  ) on conflict do nothing;
  insert into public.peer_support_actions (request_id, actor_id, action, details)
  values (request_row.id, actor_id, 'confirmed',
    jsonb_build_object('session_id', new_session_id, 'period', p_period));
  return query select true, 'confirmed'::text, new_session_id, new_event_id;
exception when exclusion_violation or unique_violation then
  return query select false, 'mentor_conflict'::text, null::uuid, null::uuid;
end;
$$;

-- New idempotent intake overload. The Worker generates both high-entropy values.
create function public.submit_peer_support_request(
  p_gateway_secret text, p_client_fingerprint text, p_submission_key uuid,
  p_management_token text, p_student_name text, p_year_group text,
  p_contact_email text, p_category text, p_preferred_date date,
  p_preferred_periods text[], p_private_explanation text
)
returns table (request_id uuid, management_token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare new_request_id uuid; new_expiry timestamptz := now() + interval '90 days';
  fingerprint bytea; existing_request_id uuid; existing_expiry timestamptz;
  rate_row public.peer_submission_rate_limits%rowtype;
begin
  if p_gateway_secret is null or extensions.digest(p_gateway_secret, 'sha256')
    <> decode('a035c2562f47d5a1d12a04a8dc7ed76f1d516da2ba2e8634ca0981a8bfdb8bbb', 'hex')
  then raise exception 'submission gateway authorization failed' using errcode = '42501'; end if;
  if p_client_fingerprint !~ '^[0-9a-f]{64}$' or p_management_token !~ '^[0-9a-f]{64}$'
    or p_submission_key is null then raise exception 'invalid submission credential' using errcode = '22023'; end if;
  select request.id, access.expires_at into existing_request_id, existing_expiry
  from public.peer_support_requests request join public.peer_request_access_tokens access on access.request_id = request.id
  where request.submission_key = p_submission_key
    and access.token_hash = extensions.digest(p_management_token, 'sha256');
  if found then return query select existing_request_id, p_management_token, existing_expiry; return; end if;
  if exists (select 1 from public.peer_support_requests where submission_key = p_submission_key) then
    raise exception 'submission key collision' using errcode = '22023';
  end if;
  if p_student_name is null or char_length(btrim(p_student_name)) not between 1 and 100
    or p_year_group not in ('Year 7','Year 8','Year 9','Year 10','Year 11','Year 12','Year 13')
    or p_contact_email is null or char_length(p_contact_email) not between 3 and 254
    or p_contact_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_category not in ('Settling in','Friendships','School work & stress','Wellbeing','Something else')
    or p_preferred_date is null or p_preferred_date < (now() at time zone 'Asia/Seoul')::date
    or p_preferred_periods is null or cardinality(p_preferred_periods) not between 1 and 3
    or not (p_preferred_periods <@ array['break','lunch_1','lunch_2']::text[])
    or cardinality(p_preferred_periods) <> (select count(distinct value) from unnest(p_preferred_periods) value)
    or (p_private_explanation is not null and char_length(p_private_explanation) > 2000)
  then raise exception 'invalid peer support request' using errcode = '22023'; end if;
  fingerprint := decode(p_client_fingerprint, 'hex');
  select limits.* into rate_row from public.peer_submission_rate_limits limits
    where limits.fingerprint_hash = fingerprint for update;
  if not found then insert into public.peer_submission_rate_limits values (fingerprint, now(), 1);
  elsif rate_row.window_started_at <= now() - interval '1 hour' then
    update public.peer_submission_rate_limits set window_started_at = now(), submission_count = 1
      where fingerprint_hash = fingerprint;
  elsif rate_row.submission_count >= 5 then raise exception 'submission rate limit reached' using errcode = 'P0001';
  else update public.peer_submission_rate_limits set submission_count = submission_count + 1
    where fingerprint_hash = fingerprint; end if;
  insert into public.peer_support_requests (
    student_name, year_group, contact_email, category, preferred_date,
    preferred_time, preferred_periods, private_explanation, submission_key
  ) values (
    btrim(p_student_name), p_year_group, lower(btrim(p_contact_email)), p_category,
    p_preferred_date, public.phase5_period_label(p_preferred_periods[1]), p_preferred_periods,
    nullif(btrim(p_private_explanation), ''), p_submission_key
  ) returning id into new_request_id;
  insert into public.peer_request_access_tokens (request_id, token_hash, expires_at)
    values (new_request_id, extensions.digest(p_management_token, 'sha256'), new_expiry);
  insert into public.peer_support_actions (request_id, action) values (new_request_id, 'submitted');
  return query select new_request_id, p_management_token, new_expiry;
end;
$$;

create function public.phase5_suppress_request_email(p_request_id uuid, p_reason text)
returns void language sql security definer set search_path = '' as $$
  update public.peer_confirmation_email_outbox set status = 'suppressed',
    suppressed_at = now(), lease_owner = null, lease_expires_at = null,
    last_error_code = left(p_reason, 80)
  where request_id = p_request_id and status in ('queued','retrying','processing')
$$;

create or replace function public.cancel_peer_request(p_token text)
returns table (success boolean, outcome text)
language plpgsql security definer set search_path = '' as $$
declare request_row public.peer_support_requests%rowtype;
begin
  select request.* into request_row from public.peer_support_requests request
  where request.id = public.peer_request_id_for_token(p_token) for update;
  if not found then return query select false, 'invalid_token'::text; return; end if;
  if request_row.status = 'cancelled' then return query select true, 'already_cancelled'::text; return; end if;
  if request_row.status in ('completed','no_show','escalated') then
    return query select false, 'closed'::text; return; end if;
  update public.peer_sessions set status = 'cancelled', cancelled_at = now()
    where request_id = request_row.id and status = 'confirmed';
  update public.peer_support_requests set status = 'cancelled', cancelled_at = now()
    where id = request_row.id;
  perform public.phase5_suppress_request_email(request_row.id, 'appointment_cancelled');
  update public.peer_request_access_tokens set revoked_at = now() where request_id = request_row.id;
  insert into public.peer_support_actions (request_id, action) values (request_row.id, 'request_cancelled');
  return query select true, 'cancelled'::text;
end;
$$;

create or replace function public.cancel_my_peer_session(p_request_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); actor_role public.app_role := public.current_app_role();
begin
  if actor_id is null or actor_role not in ('peer_mentor','swag_member','teacher') then
    raise exception 'peer support capability required' using errcode = '42501'; end if;
  if not exists (select 1 from public.peer_support_requests where id = p_request_id
    and (assigned_mentor_id = actor_id or actor_role='teacher')
    and status in ('accepted','scheduled') for update)
  then return false; end if;
  update public.peer_sessions set status = 'cancelled', cancelled_at = now()
    where request_id = p_request_id and status = 'confirmed';
  update public.peer_support_requests set status = 'cancelled', cancelled_at = now() where id = p_request_id;
  perform public.phase5_suppress_request_email(p_request_id, 'appointment_cancelled');
  update public.peer_request_access_tokens set revoked_at = now() where request_id = p_request_id;
  insert into public.peer_support_actions (request_id, actor_id, action)
    values (p_request_id, actor_id, 'session_cancelled');
  return true;
end;
$$;

create or replace function public.complete_my_peer_case(p_request_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); actor_role public.app_role := public.current_app_role();
  session_row public.peer_sessions%rowtype;
begin
  if actor_id is null or actor_role not in ('peer_mentor','swag_member','teacher') then
    raise exception 'case outcome capability required' using errcode = '42501'; end if;
  select session.* into session_row from public.peer_sessions session
    join public.peer_support_requests request on request.id = session.request_id
    where request.id = p_request_id and request.status in ('accepted','scheduled')
      and session.status = 'confirmed'
      and (actor_role = 'teacher' or request.assigned_mentor_id = actor_id)
    for update of session;
  if not found or session_row.scheduled_end > now() then return false; end if;
  update public.peer_sessions set status = 'completed', completed_at = now() where id = session_row.id;
  update public.peer_support_requests set status = 'completed', completed_at = now() where id = p_request_id;
  perform public.phase5_suppress_request_email(p_request_id, 'appointment_completed');
  insert into public.peer_support_actions (request_id, actor_id, action) values (p_request_id, actor_id, 'completed');
  return true;
end;
$$;

create function public.mark_peer_case_no_show(p_request_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); actor_role public.app_role := public.current_app_role();
  session_row public.peer_sessions%rowtype;
begin
  if actor_id is null or actor_role not in ('peer_mentor','swag_member','teacher') then
    raise exception 'case outcome capability required' using errcode = '42501'; end if;
  select session.* into session_row from public.peer_sessions session
    join public.peer_support_requests request on request.id = session.request_id
    where request.id = p_request_id and request.status in ('accepted','scheduled')
      and session.status = 'confirmed'
      and (actor_role = 'teacher' or request.assigned_mentor_id = actor_id)
    for update of session;
  if not found or session_row.scheduled_end > now() then return false; end if;
  update public.peer_sessions set status = 'no_show', no_show_at = now() where id = session_row.id;
  update public.peer_support_requests set status = 'no_show' where id = p_request_id;
  perform public.phase5_suppress_request_email(p_request_id, 'appointment_no_show');
  insert into public.peer_support_actions (request_id, actor_id, action) values (p_request_id, actor_id, 'no_show');
  return true;
end;
$$;

create function public.teacher_correct_peer_outcome(p_request_id uuid, p_expected_status text, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); request_status public.peer_request_status;
begin
  if actor_id is null or public.current_app_role() <> 'teacher' then
    raise exception 'teacher access required' using errcode = '42501'; end if;
  if p_expected_status not in ('completed','no_show') or p_reason is null
    or char_length(btrim(p_reason)) not between 1 and 160
  then raise exception 'explicit correction confirmation required' using errcode = '22023'; end if;
  select status into request_status from public.peer_support_requests where id = p_request_id for update;
  if request_status::text <> p_expected_status then return false; end if;
  update public.peer_sessions set status = 'confirmed', completed_at = null, no_show_at = null
    where request_id = p_request_id and status::text = p_expected_status;
  if not found then return false; end if;
  update public.peer_support_requests set status = 'accepted', completed_at = null where id = p_request_id;
  insert into public.peer_support_actions (request_id, actor_id, action, details)
    values (p_request_id, actor_id, 'status_corrected',
      jsonb_build_object('from', p_expected_status, 'reason', btrim(p_reason)));
  return true;
end;
$$;

-- Disable the legacy student-selected slot path. It remains callable only to return a transition result.
create or replace function public.list_peer_request_slots(p_token text)
returns table (slot_id uuid, start_at timestamptz, end_at timestamptz, time_label text, location text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.peer_request_id_for_token(p_token) is null then return; end if;
  return query select null::uuid, null::timestamptz, null::timestamptz,
    null::text, null::text where false;
end;
$$;

create or replace function public.schedule_peer_session(p_token text, p_slot_id uuid)
returns table (success boolean, outcome text, session_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  perform p_slot_id;
  if public.peer_request_id_for_token(p_token) is null then
    return query select false, 'invalid_token'::text, null::uuid;
  else
    return query select false, 'mentor_confirmation_required'::text, null::uuid;
  end if;
end;
$$;

-- Old mentor availability writers are intentionally disabled without deleting historical rows.
create or replace function public.create_peer_availability(
  p_start_at timestamptz, p_end_at timestamptz, p_time_label text, p_location text
)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform p_start_at, p_end_at, p_time_label, p_location;
  raise exception 'individual availability has been retired' using errcode = '0A000';
end;
$$;
create or replace function public.withdraw_peer_availability(p_slot_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform p_slot_id;
  raise exception 'individual availability has been retired' using errcode = '0A000';
end;
$$;
create or replace function public.list_my_peer_availability()
returns table (slot_id uuid, start_at timestamptz, end_at timestamptz,
  time_label text, location text, status public.peer_slot_status)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query select null::uuid, null::timestamptz, null::timestamptz,
    null::text, null::text, null::public.peer_slot_status where false;
end;
$$;

drop function if exists public.list_my_peer_cases(integer, integer);
create function public.list_my_peer_cases(p_page_size integer default 20, p_page_offset integer default 0)
returns table (
  request_id uuid, student_name text, year_group text, contact_email text, category text,
  preferred_date date, preferred_time text, preferred_periods text[], private_explanation text,
  status public.peer_request_status, submitted_at timestamptz, session_id uuid,
  session_start timestamptz, session_end timestamptz, session_label text,
  session_period text, session_location text, session_status public.peer_session_status,
  student_email_job_id uuid, mentor_email_job_id uuid, teacher_email_job_id uuid,
  student_email_status text, mentor_email_status text, teacher_email_status text,
  escalation_reason text, escalated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); actor_role public.app_role := public.current_app_role();
begin
  if actor_id is null or actor_role not in ('peer_mentor','swag_member') then
    raise exception 'peer support capability required' using errcode = '42501'; end if;
  return query select request.id,
    case when request.status = 'escalated' then null else request.student_name end,
    case when request.status = 'escalated' then null else request.year_group end,
    case when request.status = 'escalated' then null else request.contact_email end,
    request.category, request.preferred_date, request.preferred_time, request.preferred_periods,
    case when request.status = 'escalated' then null else request.private_explanation end,
    request.status, request.created_at, session.id, session.scheduled_start, session.scheduled_end,
    session.time_label, session.period, session.location, session.status,
    student_job.id, mentor_job.id, teacher_job.id,
    student_job.status, mentor_job.status, teacher_job.status,
    case when request.status = 'escalated' then request.escalation_reason else null end,
    request.escalated_at
  from public.peer_support_requests request
  left join lateral (select current_session.* from public.peer_sessions current_session
    where current_session.request_id = request.id order by current_session.created_at desc limit 1) session on true
  left join public.peer_confirmation_events event on event.request_id = request.id
  left join public.peer_confirmation_email_outbox student_job on student_job.confirmation_event_id = event.id and student_job.recipient_kind = 'student'
  left join public.peer_confirmation_email_outbox mentor_job on mentor_job.confirmation_event_id = event.id and mentor_job.recipient_kind = 'mentor'
  left join public.peer_confirmation_email_outbox teacher_job on teacher_job.confirmation_event_id = event.id and teacher_job.recipient_kind = 'teacher'
  where request.assigned_mentor_id = actor_id
  order by request.updated_at desc
  limit least(greatest(coalesce(p_page_size,20),1),100)
  offset greatest(coalesce(p_page_offset,0),0);
end;
$$;

drop function if exists public.get_peer_dashboard_counts();
create function public.get_peer_dashboard_counts()
returns table (available_count bigint, my_active_case_count bigint,
  my_upcoming_session_count bigint, my_available_slot_count bigint, email_attention_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); actor_role public.app_role := public.current_app_role();
begin
  if actor_id is null or actor_role not in ('peer_mentor','swag_member') then
    raise exception 'peer support capability required' using errcode = '42501'; end if;
  return query select
    (select count(*) from public.peer_support_requests request where request.status='open' and request.assigned_mentor_id is null
      and not exists (select 1 from public.peer_request_dismissals dismissal where dismissal.request_id=request.id and dismissal.mentor_id=actor_id)),
    (select count(*) from public.peer_support_requests request where request.assigned_mentor_id=actor_id and request.status in ('accepted','scheduled')),
    (select count(*) from public.peer_sessions session where session.mentor_id=actor_id and session.status='confirmed' and session.scheduled_start>now()),
    0::bigint,
    (select count(*) from public.peer_confirmation_email_outbox job join public.peer_confirmation_events event on event.id=job.confirmation_event_id
      where event.mentor_id=actor_id and job.status in ('failed','uncertain'));
end;
$$;

drop function if exists public.list_teacher_peer_support_overview(integer, integer);
create function public.list_teacher_peer_support_overview(p_page_size integer default 40, p_page_offset integer default 0)
returns table (
  request_id uuid, student_name text, mentor_name text, category text,
  preferred_date date, preferred_periods text[], confirmed_period text,
  session_start timestamptz, session_end timestamptz, location text,
  status public.peer_request_status, submitted_at timestamptz,
  student_email_job_id uuid, mentor_email_job_id uuid, teacher_email_job_id uuid,
  student_email_status text, mentor_email_status text, teacher_email_status text,
  stale boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.current_app_role() <> 'teacher' then
    raise exception 'teacher access required' using errcode = '42501'; end if;
  return query select request.id, request.student_name, mentor.full_name, request.category,
    request.preferred_date, request.preferred_periods, session.period,
    session.scheduled_start, session.scheduled_end, session.location,
    request.status, request.created_at,
    student_job.id, mentor_job.id, teacher_job.id,
    student_job.status, mentor_job.status, teacher_job.status,
    request.status='open' and request.preferred_date < (now() at time zone 'Asia/Seoul')::date
  from public.peer_support_requests request
  left join public.profiles mentor on mentor.id=request.assigned_mentor_id
  left join lateral (select current_session.* from public.peer_sessions current_session
    where current_session.request_id=request.id order by current_session.created_at desc limit 1) session on true
  left join public.peer_confirmation_events event on event.request_id=request.id
  left join public.peer_confirmation_email_outbox student_job on student_job.confirmation_event_id=event.id and student_job.recipient_kind='student'
  left join public.peer_confirmation_email_outbox mentor_job on mentor_job.confirmation_event_id=event.id and mentor_job.recipient_kind='mentor'
  left join public.peer_confirmation_email_outbox teacher_job on teacher_job.confirmation_event_id=event.id and teacher_job.recipient_kind='teacher'
  order by coalesce(session.scheduled_start, request.preferred_date::timestamp at time zone 'Asia/Seoul') desc, request.id
  limit least(greatest(coalesce(p_page_size,40),1),100)
  offset greatest(coalesce(p_page_offset,0),0);
end;
$$;

drop function if exists public.get_teacher_peer_support_counts();
create function public.get_teacher_peer_support_counts()
returns table (open_count bigint, active_count bigint, scheduled_count bigint,
  escalated_count bigint, today_count bigint, completed_count bigint, email_attention_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.current_app_role() <> 'teacher' then
    raise exception 'teacher access required' using errcode = '42501'; end if;
  return query select
    count(*) filter(where status='open'),
    count(*) filter(where status='accepted'),
    count(*) filter(where status in ('accepted','scheduled')),
    count(*) filter(where status='escalated'),
    (select count(*) from public.peer_sessions where status='confirmed'
      and (scheduled_start at time zone 'Asia/Seoul')::date=(now() at time zone 'Asia/Seoul')::date),
    count(*) filter(where status='completed'),
    (select count(*) from public.peer_confirmation_email_outbox where status in ('failed','uncertain'))
  from public.peer_support_requests;
end;
$$;

create function public.claim_confirmation_email_jobs(
  p_dispatch_secret text, p_worker_id uuid, p_limit integer default 10, p_lease_seconds integer default 120
)
returns table (
  job_id uuid, recipient_kind text, recipient_address text, idempotency_key text,
  request_id uuid, session_id uuid, schedule_version uuid,
  student_name text, mentor_name text, mentor_role public.app_role,
  scheduled_start timestamptz, scheduled_end timestamptz,
  period_label text, location text, display_timezone text
)
language plpgsql security definer set search_path = '' as $$
begin
  if p_dispatch_secret is null or extensions.digest(p_dispatch_secret,'sha256')
    <> decode('8a04383b9c803cfd5eeff4f3b44ce97bccc749c66d18fbfa49a694b862c1933c','hex')
  then raise exception 'email dispatcher authorization failed' using errcode='42501'; end if;
  if p_worker_id is null or p_limit not between 1 and 25 or p_lease_seconds not between 30 and 600
  then raise exception 'invalid email claim parameters' using errcode='22023'; end if;
  update public.peer_confirmation_email_outbox set status='uncertain', lease_owner=null, lease_expires_at=null,
    last_error_code='lease_expired_after_idempotency_window'
  where status='processing' and lease_expires_at<=now()
    and last_attempt_started_at<=now()-interval '23 hours';
  update public.peer_confirmation_email_outbox set status='retrying', available_at=now(),
    lease_owner=null, lease_expires_at=null, last_error_code='worker_recovery'
  where status='processing' and lease_expires_at<=now()
    and last_attempt_started_at>now()-interval '23 hours';
  update public.peer_confirmation_email_outbox job set status='suppressed', suppressed_at=now(),
    last_error_code='confirmation_no_longer_sendable', lease_owner=null, lease_expires_at=null
  from public.peer_confirmation_events event, public.peer_support_requests request, public.peer_sessions session
  where job.confirmation_event_id=event.id and request.id=event.request_id and session.id=event.session_id
    and job.status in ('queued','retrying') and (
      event.event_type<>'PEER_SESSION_CONFIRMED' or job.notification_kind<>'PEER_SESSION_CONFIRMED'
      or request.status<>'accepted' or request.assigned_mentor_id<>event.mentor_id
      or session.status<>'confirmed' or session.schedule_version<>event.schedule_version
      or session.mentor_id<>event.mentor_id or session.supervisor_teacher_id<>event.supervisor_teacher_id
      or session.scheduled_end<=now()
      or (job.recipient_kind='student' and lower(job.recipient_address)<>lower(request.contact_email))
      or (job.recipient_kind='mentor' and not exists(select 1 from public.profiles profile where profile.id=event.mentor_id
        and profile.role in ('peer_mentor','swag_member') and lower(profile.email)=lower(job.recipient_address)))
      or (job.recipient_kind='teacher' and not exists(select 1 from public.profiles profile where profile.id=event.supervisor_teacher_id
        and profile.role='teacher' and lower(profile.email)=lower(job.recipient_address)))
    );
  return query
  with selected as (
    select job.id from public.peer_confirmation_email_outbox job
    where job.status in ('queued','retrying') and job.available_at<=now() and job.attempt_count<5
    order by job.available_at, job.created_at for update skip locked limit p_limit
  ), claimed as (
    update public.peer_confirmation_email_outbox job set status='processing', attempt_count=job.attempt_count+1,
      lease_owner=p_worker_id, lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
      last_attempt_started_at=now(), last_error_code=null
    from selected where job.id=selected.id returning job.*
  )
  select claimed.id, claimed.recipient_kind, claimed.recipient_address, claimed.idempotency_key,
    request.id, session.id, session.schedule_version, request.student_name, mentor.full_name, mentor.role,
    session.scheduled_start, session.scheduled_end, session.time_label, session.location, session.display_timezone
  from claimed join public.peer_confirmation_events event on event.id=claimed.confirmation_event_id
    join public.peer_support_requests request on request.id=event.request_id
    join public.peer_sessions session on session.id=event.session_id
    join public.profiles mentor on mentor.id=event.mentor_id;
end;
$$;

create function public.get_peer_request_management_internal(
  p_dispatch_secret text, p_request_id uuid, p_session_id uuid, p_schedule_version uuid
)
returns table (
  request_id uuid, status public.peer_request_status, preferred_date date,
  preferred_periods text[], assigned_mentor_name text, session_id uuid,
  session_start timestamptz, session_end timestamptz, session_label text,
  session_location text, session_status public.peer_session_status
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_dispatch_secret is null or extensions.digest(p_dispatch_secret,'sha256')
    <> decode('8a04383b9c803cfd5eeff4f3b44ce97bccc749c66d18fbfa49a694b862c1933c','hex')
  then raise exception 'management gateway authorization failed' using errcode='42501'; end if;
  return query select request.id, request.status, request.preferred_date, request.preferred_periods,
    mentor.full_name, session.id, session.scheduled_start, session.scheduled_end,
    session.time_label, session.location, session.status
  from public.peer_support_requests request
  join public.peer_sessions session on session.request_id=request.id
  join public.profiles mentor on mentor.id=request.assigned_mentor_id
  where request.id=p_request_id and session.id=p_session_id
    and session.schedule_version=p_schedule_version
    and session.status<>'cancelled' and request.status<>'cancelled';
end;
$$;

create function public.cancel_peer_request_internal(
  p_dispatch_secret text, p_request_id uuid, p_session_id uuid, p_schedule_version uuid
)
returns table (success boolean, outcome text)
language plpgsql security definer set search_path = '' as $$
declare request_status public.peer_request_status;
begin
  if p_dispatch_secret is null or extensions.digest(p_dispatch_secret,'sha256')
    <> decode('8a04383b9c803cfd5eeff4f3b44ce97bccc749c66d18fbfa49a694b862c1933c','hex')
  then raise exception 'management gateway authorization failed' using errcode='42501'; end if;
  select request.status into request_status from public.peer_support_requests request
    join public.peer_sessions session on session.request_id=request.id
    where request.id=p_request_id and session.id=p_session_id
      and session.schedule_version=p_schedule_version for update of request;
  if not found then return query select false,'invalid_link'::text; return; end if;
  if request_status='cancelled' then return query select true,'already_cancelled'::text; return; end if;
  if request_status in ('completed','no_show','escalated') then return query select false,'closed'::text; return; end if;
  update public.peer_sessions set status='cancelled',cancelled_at=now()
    where id=p_session_id and status='confirmed';
  update public.peer_support_requests set status='cancelled',cancelled_at=now() where id=p_request_id;
  perform public.phase5_suppress_request_email(p_request_id,'appointment_cancelled');
  update public.peer_request_access_tokens set revoked_at=now() where request_id=p_request_id;
  insert into public.peer_support_actions(request_id,action) values(p_request_id,'request_cancelled');
  return query select true,'cancelled'::text;
end;
$$;

create function public.finish_confirmation_email_job(
  p_dispatch_secret text, p_job_id uuid, p_worker_id uuid, p_outcome text,
  p_provider_message_id text default null, p_error_code text default null,
  p_retry_after_seconds integer default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare attempts integer; delay_seconds integer;
begin
  if p_dispatch_secret is null or extensions.digest(p_dispatch_secret,'sha256')
    <> decode('8a04383b9c803cfd5eeff4f3b44ce97bccc749c66d18fbfa49a694b862c1933c','hex')
  then raise exception 'email dispatcher authorization failed' using errcode='42501'; end if;
  select attempt_count into attempts from public.peer_confirmation_email_outbox
    where id=p_job_id and status='processing' and lease_owner=p_worker_id for update;
  if not found then return false; end if;
  if p_outcome='submitted' and p_provider_message_id is not null and char_length(p_provider_message_id)<=200 then
    update public.peer_confirmation_email_outbox set status='submitted', provider_message_id=p_provider_message_id,
      submitted_at=now(), lease_owner=null, lease_expires_at=null where id=p_job_id;
  elsif p_outcome='temporary' and attempts<5 then
    delay_seconds := greatest(coalesce(p_retry_after_seconds,0), least(3600, (power(2,attempts)::integer*30)+floor(random()*31)::integer));
    update public.peer_confirmation_email_outbox set status='retrying',
      available_at=now()+make_interval(secs=>delay_seconds), last_error_code=left(coalesce(p_error_code,'temporary_error'),80),
      lease_owner=null, lease_expires_at=null where id=p_job_id;
  elsif p_outcome='uncertain' then
    update public.peer_confirmation_email_outbox set status='uncertain',
      last_error_code=left(coalesce(p_error_code,'delivery_uncertain'),80), lease_owner=null, lease_expires_at=null where id=p_job_id;
  else
    update public.peer_confirmation_email_outbox set status='failed', failed_at=now(),
      last_error_code=left(coalesce(p_error_code,'permanent_error'),80), lease_owner=null, lease_expires_at=null where id=p_job_id;
  end if;
  return true;
end;
$$;

create function public.record_confirmation_email_webhook(
  p_dispatch_secret text, p_provider_event_id text, p_provider_message_id text,
  p_event_type text, p_event_created_at timestamptz
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job_row public.peer_confirmation_email_outbox%rowtype;
begin
  if p_dispatch_secret is null or extensions.digest(p_dispatch_secret,'sha256')
    <> decode('8a04383b9c803cfd5eeff4f3b44ce97bccc749c66d18fbfa49a694b862c1933c','hex')
  then raise exception 'email dispatcher authorization failed' using errcode='42501'; end if;
  if p_provider_event_id is null or char_length(p_provider_event_id) not between 1 and 200
    or p_provider_message_id is null or char_length(p_provider_message_id) not between 1 and 200
    or p_event_type not in ('email.sent','email.delivered','email.delivery_delayed','email.failed','email.bounced','email.complained','email.suppressed')
    or p_event_created_at is null or p_event_created_at < now()-interval '7 days' or p_event_created_at > now()+interval '5 minutes'
  then raise exception 'invalid provider event' using errcode='22023'; end if;
  select * into job_row from public.peer_confirmation_email_outbox
    where provider_message_id=p_provider_message_id for update;
  if not found then return false; end if;
  insert into public.peer_confirmation_webhook_events values (
    p_provider_event_id,p_provider_message_id,p_event_type,p_event_created_at,now()
  ) on conflict (provider_event_id) do nothing;
  if not found then return true; end if;
  if job_row.provider_event_at is not null and p_event_created_at < job_row.provider_event_at then return true; end if;
  if p_event_type='email.delivered' and job_row.status<>'suppressed' then
    update public.peer_confirmation_email_outbox set status='delivered', delivered_at=p_event_created_at,
      provider_event_at=p_event_created_at, last_error_code=null where id=job_row.id;
  elsif p_event_type in ('email.bounced','email.complained','email.suppressed') then
    update public.peer_confirmation_email_outbox set status='suppressed', suppressed_at=now(),
      provider_event_at=p_event_created_at, last_error_code=replace(p_event_type,'email.','provider_') where id=job_row.id;
  elsif p_event_type='email.failed' and job_row.status not in ('delivered','suppressed') then
    update public.peer_confirmation_email_outbox set status='failed', failed_at=now(),
      provider_event_at=p_event_created_at, last_error_code='provider_failed' where id=job_row.id;
  elsif p_event_type='email.delivery_delayed' and job_row.status not in ('delivered','failed','suppressed') then
    update public.peer_confirmation_email_outbox set status='submitted', provider_event_at=p_event_created_at,
      last_error_code='provider_delivery_delayed' where id=job_row.id;
  elsif p_event_type='email.sent' and job_row.status in ('processing','submitted') then
    update public.peer_confirmation_email_outbox set status='submitted', provider_event_at=p_event_created_at where id=job_row.id;
  end if;
  return true;
end;
$$;

create function public.retry_confirmation_email(p_outbox_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=auth.uid(); actor_role public.app_role:=public.current_app_role(); job_row public.peer_confirmation_email_outbox%rowtype;
begin
  if actor_id is null or actor_role not in ('peer_mentor','swag_member','teacher') then
    raise exception 'email retry capability required' using errcode='42501'; end if;
  select * into job_row from public.peer_confirmation_email_outbox where id=p_outbox_id for update;
  if not found or job_row.status not in ('failed','uncertain') then return false; end if;
  if not exists (select 1 from public.peer_support_requests request join public.peer_sessions session on session.request_id=request.id
    where request.id=job_row.request_id and request.status='accepted' and session.id=job_row.session_id
      and session.status='confirmed' and session.scheduled_end>now()
      and (actor_role='teacher' or request.assigned_mentor_id=actor_id
        or (actor_role='swag_member' and exists(select 1 from public.peer_escalation_access access where access.request_id=request.id and access.profile_id=actor_id))))
  then return false; end if;
  update public.peer_confirmation_email_outbox set status='retrying', available_at=now(),
    last_error_code=null, failed_at=null where id=p_outbox_id;
  insert into public.peer_support_actions(request_id,actor_id,action) values(job_row.request_id,actor_id,'email_retry_requested');
  return true;
end;
$$;

-- Existing escalation never creates email and now suppresses unsent confirmation jobs.
create or replace function public.escalate_my_peer_case(p_request_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=auth.uid(); actor_role public.app_role:=public.current_app_role(); request_row public.peer_support_requests%rowtype;
begin
  if actor_id is null or actor_role not in ('peer_mentor','swag_member') then raise exception 'peer support capability required' using errcode='42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'a short escalation reason is required' using errcode='22023'; end if;
  select * into request_row from public.peer_support_requests where id=p_request_id for update;
  if not found or request_row.assigned_mentor_id<>actor_id or request_row.status not in ('accepted','scheduled') then return false; end if;
  update public.peer_sessions set status='cancelled', cancelled_at=now() where request_id=p_request_id and status='confirmed';
  update public.peer_support_requests set status='escalated', escalation_reason=btrim(p_reason), escalated_at=now(), escalated_by=actor_id where id=p_request_id;
  perform public.phase5_suppress_request_email(p_request_id,'appointment_escalated');
  if actor_role='swag_member' then insert into public.peer_escalation_access(request_id,profile_id,granted_by)
    values(p_request_id,actor_id,actor_id) on conflict do nothing; end if;
  insert into public.peer_support_actions(request_id,actor_id,action) values(p_request_id,actor_id,'escalated');
  return true;
end;
$$;

alter table public.peer_support_settings enable row level security;
alter table public.peer_support_periods enable row level security;
alter table public.peer_confirmation_events enable row level security;
alter table public.peer_confirmation_email_outbox enable row level security;
alter table public.peer_confirmation_webhook_events enable row level security;

revoke all on table public.peer_support_settings, public.peer_support_periods,
  public.peer_confirmation_events, public.peer_confirmation_email_outbox,
  public.peer_confirmation_webhook_events from public, anon, authenticated;
grant all on table public.peer_support_settings, public.peer_support_periods,
  public.peer_confirmation_events, public.peer_confirmation_email_outbox,
  public.peer_confirmation_webhook_events to service_role;

revoke all on function public.phase5_period_label(text) from public,anon,authenticated;
revoke all on function public.list_teacher_candidates() from public,anon,authenticated;
revoke all on function public.get_peer_support_settings() from public,anon,authenticated;
revoke all on function public.save_peer_support_settings(text,uuid,smallint[],time,time,time,time,time,time) from public,anon,authenticated;
revoke all on function public.preview_peer_request_confirmation(uuid) from public,anon,authenticated;
revoke all on function public.confirm_and_accept_peer_request(uuid,text) from public,anon,authenticated;
revoke all on function public.submit_peer_support_request(text,text,uuid,text,text,text,text,text,date,text[],text) from public,anon,authenticated;
revoke all on function public.phase5_suppress_request_email(uuid,text) from public,anon,authenticated;
revoke all on function public.mark_peer_case_no_show(uuid) from public,anon,authenticated;
revoke all on function public.teacher_correct_peer_outcome(uuid,text,text) from public,anon,authenticated;
revoke all on function public.claim_confirmation_email_jobs(text,uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.finish_confirmation_email_job(text,uuid,uuid,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.record_confirmation_email_webhook(text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.retry_confirmation_email(uuid) from public,anon,authenticated;
revoke all on function public.get_peer_request_management_internal(text,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.cancel_peer_request_internal(text,uuid,uuid,uuid) from public,anon,authenticated;

grant execute on function public.list_teacher_candidates() to authenticated;
grant execute on function public.get_peer_support_settings() to authenticated;
grant execute on function public.save_peer_support_settings(text,uuid,smallint[],time,time,time,time,time,time) to authenticated;
grant execute on function public.preview_peer_request_confirmation(uuid) to authenticated;
grant execute on function public.confirm_and_accept_peer_request(uuid,text) to authenticated;
grant execute on function public.submit_peer_support_request(text,text,uuid,text,text,text,text,text,date,text[],text) to anon,authenticated;
grant execute on function public.mark_peer_case_no_show(uuid) to authenticated;
grant execute on function public.retry_confirmation_email(uuid) to authenticated;

grant execute on function public.claim_confirmation_email_jobs(text,uuid,integer,integer) to anon,authenticated;
grant execute on function public.finish_confirmation_email_job(text,uuid,uuid,text,text,text,integer) to anon,authenticated;
grant execute on function public.record_confirmation_email_webhook(text,text,text,text,timestamptz) to anon,authenticated;
grant execute on function public.get_peer_request_management_internal(text,uuid,uuid,uuid) to anon,authenticated;
grant execute on function public.cancel_peer_request_internal(text,uuid,uuid,uuid) to anon,authenticated;

comment on table public.peer_confirmation_email_outbox is
  'Recipient-scoped outbox. Only PEER_SESSION_CONFIRMED is permitted; provider acceptance is submitted, not delivered.';
comment on function public.confirm_and_accept_peer_request(uuid,text) is
  'Atomic mentor claim, school-time snapshot, confirmation event and three-recipient outbox creation.';
