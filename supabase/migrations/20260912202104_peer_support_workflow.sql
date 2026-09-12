create extension if not exists btree_gist with schema extensions;

create type public.peer_request_status as enum (
  'open',
  'accepted',
  'scheduled',
  'completed',
  'cancelled',
  'escalated'
);

create type public.peer_slot_status as enum (
  'available',
  'reserved',
  'withdrawn'
);

create type public.peer_session_status as enum (
  'confirmed',
  'completed',
  'cancelled'
);

create table public.peer_support_requests (
  id uuid primary key default gen_random_uuid(),
  student_name text not null check (
    char_length(btrim(student_name)) between 1 and 100
  ),
  year_group text not null check (
    year_group in ('Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Year 13')
  ),
  contact_email text not null check (
    char_length(contact_email) between 3 and 254
    and contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  category text not null check (
    category in (
      'Settling in',
      'Friendships',
      'School work & stress',
      'Wellbeing',
      'Something else'
    )
  ),
  preferred_date date not null,
  preferred_time text not null check (
    preferred_time in ('Break', '1st Lunch', '2nd Lunch')
  ),
  private_explanation text check (
    private_explanation is null
    or char_length(private_explanation) <= 2000
  ),
  status public.peer_request_status not null default 'open',
  assigned_mentor_id uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz,
  escalation_reason text check (
    escalation_reason is null
    or char_length(btrim(escalation_reason)) between 1 and 500
  ),
  escalated_at timestamptz,
  escalated_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint peer_support_assignment_state_check check (
    (status = 'open' and assigned_mentor_id is null and assigned_at is null)
    or (status = 'cancelled')
    or (status in ('accepted', 'scheduled', 'completed', 'escalated')
      and assigned_mentor_id is not null and assigned_at is not null)
  ),
  constraint peer_support_escalation_state_check check (
    (status = 'escalated' and escalation_reason is not null
      and escalated_at is not null and escalated_by is not null)
    or (status <> 'escalated')
  )
);

create index peer_support_requests_open_idx
on public.peer_support_requests (created_at, id)
where status = 'open' and assigned_mentor_id is null;

create index peer_support_requests_assignee_idx
on public.peer_support_requests (assigned_mentor_id, updated_at desc)
where assigned_mentor_id is not null;

create index peer_support_requests_escalated_idx
on public.peer_support_requests (escalated_at desc)
where status = 'escalated';

create table public.peer_request_access_tokens (
  request_id uuid primary key references public.peer_support_requests (id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.peer_request_dismissals (
  request_id uuid not null references public.peer_support_requests (id) on delete cascade,
  mentor_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, mentor_id)
);

create table public.peer_mentor_availability (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  time_label text check (
    time_label is null or time_label in ('Break', '1st Lunch', '2nd Lunch')
  ),
  location text check (
    location is null or char_length(btrim(location)) between 1 and 120
  ),
  status public.peer_slot_status not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint peer_availability_time_order check (start_at < end_at),
  constraint peer_availability_reasonable_length check (end_at <= start_at + interval '8 hours'),
  constraint peer_availability_no_overlap exclude using gist (
    mentor_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('available', 'reserved'))
);

create index peer_mentor_availability_upcoming_idx
on public.peer_mentor_availability (mentor_id, start_at)
where status in ('available', 'reserved');

create table public.peer_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.peer_support_requests (id) on delete restrict,
  slot_id uuid not null references public.peer_mentor_availability (id) on delete restrict,
  mentor_id uuid not null references public.profiles (id) on delete restrict,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  time_label text,
  location text,
  status public.peer_session_status not null default 'confirmed',
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint peer_session_time_order check (scheduled_start < scheduled_end),
  constraint peer_session_no_overlap exclude using gist (
    mentor_id with =,
    tstzrange(scheduled_start, scheduled_end, '[)') with &&
  ) where (status = 'confirmed')
);

create unique index peer_sessions_one_active_request_idx
on public.peer_sessions (request_id)
where status = 'confirmed';

create unique index peer_sessions_one_active_slot_idx
on public.peer_sessions (slot_id)
where status = 'confirmed';

create table public.peer_escalation_access (
  request_id uuid not null references public.peer_support_requests (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  granted_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (request_id, profile_id)
);

create table public.peer_support_actions (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.peer_support_requests (id) on delete restrict,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (
    action in (
      'submitted',
      'claimed',
      'dismissed',
      'dismissal_undone',
      'scheduled',
      'session_cancelled',
      'request_cancelled',
      'completed',
      'escalated',
      'escalation_access_granted'
    )
  ),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index peer_support_actions_request_idx
on public.peer_support_actions (request_id, created_at);

create table public.peer_submission_rate_limits (
  fingerprint_hash bytea primary key,
  window_started_at timestamptz not null,
  submission_count integer not null check (submission_count between 1 and 5)
);

create trigger peer_support_requests_set_updated_at
before update on public.peer_support_requests
for each row execute function public.set_updated_at();

create trigger peer_mentor_availability_set_updated_at
before update on public.peer_mentor_availability
for each row execute function public.set_updated_at();

create trigger peer_sessions_set_updated_at
before update on public.peer_sessions
for each row execute function public.set_updated_at();

create function public.peer_request_id_for_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select access.request_id
  from public.peer_request_access_tokens as access
  where p_token ~ '^[0-9a-f]{64}$'
    and access.token_hash = extensions.digest(p_token, 'sha256')
    and access.revoked_at is null
    and access.expires_at > now()
$$;

create function public.submit_peer_support_request(
  p_gateway_secret text,
  p_client_fingerprint text,
  p_student_name text,
  p_year_group text,
  p_contact_email text,
  p_category text,
  p_preferred_date date,
  p_preferred_time text,
  p_private_explanation text
)
returns table (
  request_id uuid,
  management_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_request_id uuid;
  new_token text;
  new_expiry timestamptz := now() + interval '90 days';
  fingerprint bytea;
  rate_row public.peer_submission_rate_limits%rowtype;
begin
  if p_gateway_secret is null
    or extensions.digest(p_gateway_secret, 'sha256')
      <> decode('a035c2562f47d5a1d12a04a8dc7ed76f1d516da2ba2e8634ca0981a8bfdb8bbb', 'hex')
  then
    raise exception 'submission gateway authorization failed' using errcode = '42501';
  end if;

  if p_client_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid submission fingerprint' using errcode = '22023';
  end if;
  fingerprint := decode(p_client_fingerprint, 'hex');

  select limits.* into rate_row
  from public.peer_submission_rate_limits as limits
  where limits.fingerprint_hash = fingerprint
  for update;

  if not found then
    insert into public.peer_submission_rate_limits (
      fingerprint_hash,
      window_started_at,
      submission_count
    ) values (fingerprint, now(), 1);
  elsif rate_row.window_started_at <= now() - interval '1 hour' then
    update public.peer_submission_rate_limits
    set window_started_at = now(), submission_count = 1
    where fingerprint_hash = fingerprint;
  elsif rate_row.submission_count >= 5 then
    raise exception 'submission rate limit reached' using errcode = 'P0001';
  else
    update public.peer_submission_rate_limits
    set submission_count = submission_count + 1
    where fingerprint_hash = fingerprint;
  end if;

  if p_student_name is null
    or char_length(btrim(p_student_name)) not between 1 and 100
    or p_year_group not in (
      'Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Year 13'
    )
    or p_contact_email is null
    or char_length(btrim(p_contact_email)) not between 3 and 254
    or btrim(p_contact_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_category not in (
      'Settling in', 'Friendships', 'School work & stress', 'Wellbeing', 'Something else'
    )
    or p_preferred_time not in ('Break', '1st Lunch', '2nd Lunch')
    or p_preferred_date < (now() at time zone 'Asia/Seoul')::date
    or p_preferred_date > (now() at time zone 'Asia/Seoul')::date + 180
    or char_length(coalesce(p_private_explanation, '')) > 2000
  then
    raise exception 'invalid peer support request' using errcode = '22023';
  end if;

  insert into public.peer_support_requests (
    student_name,
    year_group,
    contact_email,
    category,
    preferred_date,
    preferred_time,
    private_explanation
  ) values (
    btrim(p_student_name),
    p_year_group,
    lower(btrim(p_contact_email)),
    p_category,
    p_preferred_date,
    p_preferred_time,
    nullif(btrim(p_private_explanation), '')
  ) returning id into new_request_id;

  new_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.peer_request_access_tokens (request_id, token_hash, expires_at)
  values (new_request_id, extensions.digest(new_token, 'sha256'), new_expiry);

  insert into public.peer_support_actions (request_id, action)
  values (new_request_id, 'submitted');

  return query select new_request_id, new_token, new_expiry;
end;
$$;

create function public.list_available_peer_requests(
  p_include_dismissed boolean default false,
  p_page_size integer default 20,
  p_page_offset integer default 0
)
returns table (
  request_id uuid,
  category text,
  preferred_date date,
  preferred_time text,
  submitted_at timestamptz,
  dismissed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;

  return query
  select
    request.id,
    request.category,
    request.preferred_date,
    request.preferred_time,
    request.created_at,
    dismissal.request_id is not null
  from public.peer_support_requests as request
  left join public.peer_request_dismissals as dismissal
    on dismissal.request_id = request.id
   and dismissal.mentor_id = actor_id
  where request.status = 'open'
    and request.assigned_mentor_id is null
    and (p_include_dismissed or dismissal.request_id is null)
  order by request.created_at, request.id
  limit least(greatest(coalesce(p_page_size, 20), 1), 50)
  offset greatest(coalesce(p_page_offset, 0), 0);
end;
$$;

create function public.claim_peer_request(p_request_id uuid)
returns table (success boolean, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  request_row public.peer_support_requests%rowtype;
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;

  select request.* into request_row
  from public.peer_support_requests as request
  where request.id = p_request_id
  for update;

  if not found or request_row.status <> 'open' or request_row.assigned_mentor_id is not null then
    return query select false, 'already_accepted'::text;
    return;
  end if;

  update public.peer_support_requests
  set status = 'accepted', assigned_mentor_id = actor_id, assigned_at = now()
  where id = p_request_id;

  delete from public.peer_request_dismissals where request_id = p_request_id;
  insert into public.peer_support_actions (request_id, actor_id, action)
  values (p_request_id, actor_id, 'claimed');

  return query select true, 'accepted'::text;
end;
$$;

create function public.dismiss_peer_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.peer_support_requests
    where id = p_request_id and status = 'open' and assigned_mentor_id is null
  ) then
    return false;
  end if;

  insert into public.peer_request_dismissals (request_id, mentor_id)
  values (p_request_id, actor_id)
  on conflict do nothing;

  if found then
    insert into public.peer_support_actions (request_id, actor_id, action)
    values (p_request_id, actor_id, 'dismissed');
  end if;
  return true;
end;
$$;

create function public.undo_dismiss_peer_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  removed boolean;
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;

  delete from public.peer_request_dismissals
  where request_id = p_request_id and mentor_id = actor_id;
  removed := found;
  if removed then
    insert into public.peer_support_actions (request_id, actor_id, action)
    values (p_request_id, actor_id, 'dismissal_undone');
  end if;
  return removed;
end;
$$;

create function public.list_my_peer_cases(
  p_page_size integer default 20,
  p_page_offset integer default 0
)
returns table (
  request_id uuid,
  status public.peer_request_status,
  category text,
  preferred_date date,
  preferred_time text,
  submitted_at timestamptz,
  student_name text,
  year_group text,
  contact_email text,
  private_explanation text,
  escalation_reason text,
  escalated_at timestamptz,
  session_id uuid,
  session_start timestamptz,
  session_end timestamptz,
  session_label text,
  session_location text,
  session_status public.peer_session_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;

  return query
  select
    request.id,
    request.status,
    request.category,
    request.preferred_date,
    request.preferred_time,
    request.created_at,
    case when request.status = 'escalated' then null else request.student_name end,
    case when request.status = 'escalated' then null else request.year_group end,
    case when request.status = 'escalated' then null else request.contact_email end,
    case when request.status = 'escalated' then null else request.private_explanation end,
    case when request.status = 'escalated' then 'Handed to Teacher oversight' else null end,
    request.escalated_at,
    session.id,
    session.scheduled_start,
    session.scheduled_end,
    session.time_label,
    session.location,
    session.status
  from public.peer_support_requests as request
  left join lateral (
    select current_session.*
    from public.peer_sessions as current_session
    where current_session.request_id = request.id
    order by
      case current_session.status
        when 'confirmed' then 0
        when 'completed' then 1
        else 2
      end,
      current_session.created_at desc,
      current_session.id desc
    limit 1
  ) as session on true
  where request.assigned_mentor_id = actor_id
    and request.status in ('accepted', 'scheduled', 'completed', 'escalated')
  order by request.updated_at desc, request.id
  limit least(greatest(coalesce(p_page_size, 20), 1), 50)
  offset greatest(coalesce(p_page_offset, 0), 0);
end;
$$;

create function public.get_my_peer_case(p_request_id uuid)
returns setof public.peer_support_requests
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.peer_support_requests
    where id = p_request_id and assigned_mentor_id = actor_id and status = 'escalated'
  ) then
    raise exception 'case has been handed to Teacher oversight' using errcode = '42501';
  end if;

  return query
  select request.* from public.peer_support_requests as request
  where request.id = p_request_id
    and request.assigned_mentor_id = actor_id
    and request.status in ('accepted', 'scheduled', 'completed');
end;
$$;

create function public.create_peer_availability(
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_time_label text,
  p_location text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  slot_id uuid;
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;
  if p_start_at is null or p_end_at is null or p_start_at <= now()
    or p_start_at >= p_end_at or p_end_at > p_start_at + interval '8 hours'
    or (coalesce(p_time_label, '') <> '' and p_time_label not in ('Break', '1st Lunch', '2nd Lunch'))
    or char_length(coalesce(p_location, '')) > 120
  then
    raise exception 'invalid availability slot' using errcode = '22023';
  end if;

  insert into public.peer_mentor_availability (
    mentor_id, start_at, end_at, time_label, location
  ) values (
    actor_id, p_start_at, p_end_at, nullif(p_time_label, ''), nullif(btrim(p_location), '')
  ) returning id into slot_id;
  return slot_id;
end;
$$;

create function public.list_my_peer_availability()
returns table (
  slot_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  time_label text,
  location text,
  status public.peer_slot_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;
  return query
  select slot.id, slot.start_at, slot.end_at, slot.time_label, slot.location, slot.status
  from public.peer_mentor_availability as slot
  where slot.mentor_id = actor_id
  order by slot.start_at desc
  limit 100;
end;
$$;

create function public.withdraw_peer_availability(p_slot_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  slot_row public.peer_mentor_availability%rowtype;
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;
  select slot.* into slot_row
  from public.peer_mentor_availability as slot
  where slot.id = p_slot_id and slot.mentor_id = actor_id
  for update;
  if not found then return false; end if;
  if slot_row.status = 'reserved' or exists (
    select 1 from public.peer_sessions
    where slot_id = p_slot_id and status = 'confirmed'
  ) then
    raise exception 'a confirmed session protects this slot' using errcode = '23514';
  end if;
  update public.peer_mentor_availability set status = 'withdrawn' where id = p_slot_id;
  return true;
end;
$$;

create function public.get_peer_request_management(p_token text)
returns table (
  request_id uuid,
  status public.peer_request_status,
  category text,
  preferred_date date,
  preferred_time text,
  submitted_at timestamptz,
  assigned_mentor_name text,
  session_id uuid,
  session_start timestamptz,
  session_end timestamptz,
  session_label text,
  session_location text,
  session_status public.peer_session_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  managed_request_id uuid := public.peer_request_id_for_token(p_token);
begin
  if managed_request_id is null then return; end if;
  return query
  select
    request.id,
    request.status,
    request.category,
    request.preferred_date,
    request.preferred_time,
    request.created_at,
    case
      when request.status in ('accepted', 'scheduled', 'completed') then mentor.full_name
      else null
    end,
    session.id,
    session.scheduled_start,
    session.scheduled_end,
    session.time_label,
    session.location,
    session.status
  from public.peer_support_requests as request
  left join public.profiles as mentor on mentor.id = request.assigned_mentor_id
  left join lateral (
    select current_session.* from public.peer_sessions as current_session
    where current_session.request_id = request.id
    order by
      case current_session.status
        when 'confirmed' then 0
        when 'completed' then 1
        else 2
      end,
      current_session.created_at desc,
      current_session.id desc
    limit 1
  ) as session on true
  where request.id = managed_request_id;
end;
$$;

create function public.list_peer_request_slots(p_token text)
returns table (
  slot_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  time_label text,
  location text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  managed_request_id uuid := public.peer_request_id_for_token(p_token);
begin
  if managed_request_id is null then return; end if;
  return query
  select slot.id, slot.start_at, slot.end_at, slot.time_label, slot.location
  from public.peer_support_requests as request
  join public.peer_mentor_availability as slot
    on slot.mentor_id = request.assigned_mentor_id
  where request.id = managed_request_id
    and request.status = 'accepted'
    and slot.status = 'available'
    and slot.start_at > now()
  order by slot.start_at
  limit 50;
end;
$$;

create function public.schedule_peer_session(p_token text, p_slot_id uuid)
returns table (success boolean, outcome text, session_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  managed_request_id uuid := public.peer_request_id_for_token(p_token);
  request_row public.peer_support_requests%rowtype;
  slot_row public.peer_mentor_availability%rowtype;
  new_session_id uuid;
begin
  if managed_request_id is null then
    raise exception 'invalid or expired management token' using errcode = '42501';
  end if;
  select request.* into request_row from public.peer_support_requests as request
  where request.id = managed_request_id for update;
  if request_row.status <> 'accepted' or request_row.assigned_mentor_id is null then
    return query select false, 'not_ready'::text, null::uuid;
    return;
  end if;
  select slot.* into slot_row from public.peer_mentor_availability as slot
  where slot.id = p_slot_id for update;
  if not found or slot_row.mentor_id <> request_row.assigned_mentor_id
    or slot_row.status <> 'available' or slot_row.start_at <= now()
  then
    return query select false, 'slot_unavailable'::text, null::uuid;
    return;
  end if;

  insert into public.peer_sessions (
    request_id, slot_id, mentor_id, scheduled_start, scheduled_end, time_label, location
  ) values (
    request_row.id, slot_row.id, slot_row.mentor_id,
    slot_row.start_at, slot_row.end_at, slot_row.time_label, slot_row.location
  ) returning id into new_session_id;
  update public.peer_mentor_availability set status = 'reserved' where id = slot_row.id;
  update public.peer_support_requests set status = 'scheduled' where id = request_row.id;
  insert into public.peer_support_actions (request_id, action, details)
  values (request_row.id, 'scheduled', jsonb_build_object('session_id', new_session_id));
  return query select true, 'confirmed'::text, new_session_id;
end;
$$;

create function public.cancel_peer_request(p_token text)
returns table (success boolean, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  managed_request_id uuid := public.peer_request_id_for_token(p_token);
  request_row public.peer_support_requests%rowtype;
  session_row public.peer_sessions%rowtype;
begin
  if managed_request_id is null then
    raise exception 'invalid or expired management token' using errcode = '42501';
  end if;
  select request.* into request_row from public.peer_support_requests as request
  where request.id = managed_request_id for update;
  if request_row.status not in ('open', 'accepted', 'scheduled') then
    return query select false, 'not_cancellable'::text;
    return;
  end if;

  if request_row.status = 'scheduled' then
    select session.* into session_row from public.peer_sessions as session
    where session.request_id = request_row.id and session.status = 'confirmed'
    for update;
    if found then
      update public.peer_sessions
      set status = 'cancelled', cancelled_at = now()
      where id = session_row.id;
      update public.peer_mentor_availability
      set status = case when start_at > now() then 'available'::public.peer_slot_status
                        else 'withdrawn'::public.peer_slot_status end
      where id = session_row.slot_id;
    end if;
  end if;

  update public.peer_support_requests
  set status = 'cancelled', cancelled_at = now()
  where id = request_row.id;
  insert into public.peer_support_actions (request_id, action)
  values (request_row.id, 'request_cancelled');
  return query select true, 'cancelled'::text;
end;
$$;

create function public.cancel_my_peer_session(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  session_row public.peer_sessions%rowtype;
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.peer_support_requests
    where id = p_request_id and assigned_mentor_id = actor_id and status = 'scheduled'
    for update
  ) then return false; end if;
  select session.* into session_row from public.peer_sessions as session
  where session.request_id = p_request_id and session.mentor_id = actor_id
    and session.status = 'confirmed' for update;
  if not found then return false; end if;
  update public.peer_sessions set status = 'cancelled', cancelled_at = now()
  where id = session_row.id;
  update public.peer_mentor_availability
  set status = case when start_at > now() then 'available'::public.peer_slot_status
                    else 'withdrawn'::public.peer_slot_status end
  where id = session_row.slot_id;
  update public.peer_support_requests set status = 'accepted' where id = p_request_id;
  insert into public.peer_support_actions (request_id, actor_id, action)
  values (p_request_id, actor_id, 'session_cancelled');
  return true;
end;
$$;

create function public.complete_my_peer_case(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  session_row public.peer_sessions%rowtype;
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.peer_support_requests
    where id = p_request_id and assigned_mentor_id = actor_id and status = 'scheduled'
    for update
  ) then return false; end if;
  select session.* into session_row from public.peer_sessions as session
  where session.request_id = p_request_id and session.mentor_id = actor_id
    and session.status = 'confirmed' for update;
  if not found then return false; end if;
  update public.peer_sessions set status = 'completed', completed_at = now()
  where id = session_row.id;
  update public.peer_mentor_availability set status = 'withdrawn'
  where id = session_row.slot_id;
  update public.peer_support_requests
  set status = 'completed', completed_at = now()
  where id = p_request_id;
  insert into public.peer_support_actions (request_id, actor_id, action)
  values (p_request_id, actor_id, 'completed');
  return true;
end;
$$;

create function public.escalate_my_peer_case(p_request_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  request_row public.peer_support_requests%rowtype;
  session_row public.peer_sessions%rowtype;
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'a short escalation reason is required' using errcode = '22023';
  end if;
  select request.* into request_row from public.peer_support_requests as request
  where request.id = p_request_id for update;
  if not found or request_row.assigned_mentor_id <> actor_id
    or request_row.status not in ('accepted', 'scheduled')
  then return false; end if;

  if request_row.status = 'scheduled' then
    select session.* into session_row from public.peer_sessions as session
    where session.request_id = request_row.id and session.status = 'confirmed'
    for update;
    if found then
      update public.peer_sessions set status = 'cancelled', cancelled_at = now()
      where id = session_row.id;
      update public.peer_mentor_availability
      set status = case when start_at > now() then 'available'::public.peer_slot_status
                        else 'withdrawn'::public.peer_slot_status end
      where id = session_row.slot_id;
    end if;
  end if;

  update public.peer_support_requests
  set status = 'escalated', escalation_reason = btrim(p_reason),
      escalated_at = now(), escalated_by = actor_id
  where id = request_row.id;
  if actor_role = 'swag_member' then
    insert into public.peer_escalation_access (request_id, profile_id, granted_by)
    values (request_row.id, actor_id, actor_id)
    on conflict do nothing;
  end if;
  insert into public.peer_support_actions (request_id, actor_id, action)
  values (request_row.id, actor_id, 'escalated');
  return true;
end;
$$;

create function public.list_my_peer_sessions()
returns table (
  session_id uuid,
  request_id uuid,
  category text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  time_label text,
  location text,
  status public.peer_session_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;
  return query
  select session.id, session.request_id, request.category,
    session.scheduled_start, session.scheduled_end,
    session.time_label, session.location, session.status
  from public.peer_sessions as session
  join public.peer_support_requests as request on request.id = session.request_id
  where session.mentor_id = actor_id
  order by session.scheduled_start desc
  limit 100;
end;
$$;

create function public.get_peer_dashboard_counts()
returns table (
  available_count bigint,
  my_active_case_count bigint,
  my_upcoming_session_count bigint,
  my_available_slot_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
begin
  if actor_id is null or actor_role not in ('peer_mentor', 'swag_member') then
    raise exception 'peer support capability required' using errcode = '42501';
  end if;
  return query select
    (select count(*) from public.peer_support_requests request
      where request.status = 'open' and request.assigned_mentor_id is null
        and not exists (select 1 from public.peer_request_dismissals dismissal
          where dismissal.request_id = request.id and dismissal.mentor_id = actor_id)),
    (select count(*) from public.peer_support_requests request
      where request.assigned_mentor_id = actor_id and request.status in ('accepted', 'scheduled')),
    (select count(*) from public.peer_sessions session
      where session.mentor_id = actor_id and session.status = 'confirmed'
        and session.scheduled_start > now()),
    (select count(*) from public.peer_mentor_availability slot
      where slot.mentor_id = actor_id and slot.status = 'available' and slot.start_at > now());
end;
$$;

create function public.list_peer_escalations(
  p_page_size integer default 20,
  p_page_offset integer default 0
)
returns table (
  request_id uuid,
  category text,
  escalated_at timestamptz,
  escalation_reason text,
  assigned_mentor_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid(); actor_role public.app_role := public.current_app_role();
begin
  if actor_id is null or actor_role not in ('swag_member', 'teacher') then
    raise exception 'escalation access required' using errcode = '42501';
  end if;
  return query
  select request.id, request.category, request.escalated_at,
    request.escalation_reason, mentor.full_name
  from public.peer_support_requests request
  left join public.profiles mentor on mentor.id = request.assigned_mentor_id
  where request.status = 'escalated'
    and (actor_role = 'teacher' or exists (
      select 1 from public.peer_escalation_access access
      where access.request_id = request.id and access.profile_id = actor_id
    ))
  order by request.escalated_at desc
  limit least(greatest(coalesce(p_page_size, 20), 1), 50)
  offset greatest(coalesce(p_page_offset, 0), 0);
end;
$$;

create function public.get_peer_escalation(p_request_id uuid)
returns setof public.peer_support_requests
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid(); actor_role public.app_role := public.current_app_role();
begin
  if actor_id is null or actor_role not in ('swag_member', 'teacher') then
    raise exception 'escalation access required' using errcode = '42501';
  end if;
  return query select request.* from public.peer_support_requests request
  where request.id = p_request_id and request.status = 'escalated'
    and (actor_role = 'teacher' or exists (
      select 1 from public.peer_escalation_access access
      where access.request_id = request.id and access.profile_id = actor_id
    ));
end;
$$;

create function public.list_teacher_peer_support_overview(
  p_page_size integer default 20,
  p_page_offset integer default 0
)
returns table (
  request_id uuid,
  category text,
  status public.peer_request_status,
  submitted_at timestamptz,
  assigned boolean,
  session_start timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.current_app_role() <> 'teacher' then
    raise exception 'teacher access required' using errcode = '42501';
  end if;
  return query
  select request.id, request.category, request.status, request.created_at,
    request.assigned_mentor_id is not null, session.scheduled_start
  from public.peer_support_requests request
  left join lateral (
    select current_session.scheduled_start from public.peer_sessions current_session
    where current_session.request_id = request.id and current_session.status = 'confirmed'
    limit 1
  ) session on true
  order by request.created_at desc
  limit least(greatest(coalesce(p_page_size, 20), 1), 50)
  offset greatest(coalesce(p_page_offset, 0), 0);
end;
$$;

create function public.get_teacher_peer_support_counts()
returns table (
  open_count bigint,
  active_count bigint,
  scheduled_count bigint,
  escalated_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.current_app_role() <> 'teacher' then
    raise exception 'teacher access required' using errcode = '42501';
  end if;
  return query select
    count(*) filter (where status = 'open'),
    count(*) filter (where status = 'accepted'),
    count(*) filter (where status = 'scheduled'),
    count(*) filter (where status = 'escalated')
  from public.peer_support_requests;
end;
$$;

create function public.list_swag_escalation_assignees()
returns table (profile_id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.current_app_role() <> 'teacher' then
    raise exception 'teacher access required' using errcode = '42501';
  end if;
  return query select profile.id, profile.full_name from public.profiles profile
  where profile.role = 'swag_member' order by profile.full_name nulls last, profile.id;
end;
$$;

create function public.authorize_swag_escalation(p_request_id uuid, p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null or public.current_app_role() <> 'teacher' then
    raise exception 'teacher access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.peer_support_requests
    where id = p_request_id and status = 'escalated')
    or not exists (select 1 from public.profiles
      where id = p_profile_id and role = 'swag_member')
  then return false; end if;
  insert into public.peer_escalation_access (request_id, profile_id, granted_by)
  values (p_request_id, p_profile_id, actor_id) on conflict do nothing;
  if found then
    insert into public.peer_support_actions (request_id, actor_id, action, details)
    values (p_request_id, actor_id, 'escalation_access_granted',
      jsonb_build_object('profile_id', p_profile_id));
  end if;
  return true;
end;
$$;

alter table public.peer_support_requests enable row level security;
alter table public.peer_request_access_tokens enable row level security;
alter table public.peer_request_dismissals enable row level security;
alter table public.peer_mentor_availability enable row level security;
alter table public.peer_sessions enable row level security;
alter table public.peer_escalation_access enable row level security;
alter table public.peer_support_actions enable row level security;
alter table public.peer_submission_rate_limits enable row level security;

revoke all on table public.peer_support_requests from public, anon, authenticated;
revoke all on table public.peer_request_access_tokens from public, anon, authenticated;
revoke all on table public.peer_request_dismissals from public, anon, authenticated;
revoke all on table public.peer_mentor_availability from public, anon, authenticated;
revoke all on table public.peer_sessions from public, anon, authenticated;
revoke all on table public.peer_escalation_access from public, anon, authenticated;
revoke all on table public.peer_support_actions from public, anon, authenticated;
revoke all on table public.peer_submission_rate_limits from public, anon, authenticated;

grant all on table public.peer_support_requests to service_role;
grant all on table public.peer_request_access_tokens to service_role;
grant all on table public.peer_request_dismissals to service_role;
grant all on table public.peer_mentor_availability to service_role;
grant all on table public.peer_sessions to service_role;
grant all on table public.peer_escalation_access to service_role;
grant all on table public.peer_support_actions to service_role;
grant all on table public.peer_submission_rate_limits to service_role;
grant usage, select on sequence public.peer_support_actions_id_seq to service_role;

revoke all on function public.peer_request_id_for_token(text) from public, anon, authenticated;
revoke all on function public.submit_peer_support_request(text, text, text, text, text, text, date, text, text) from public, anon, authenticated;
revoke all on function public.list_available_peer_requests(boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.claim_peer_request(uuid) from public, anon, authenticated;
revoke all on function public.dismiss_peer_request(uuid) from public, anon, authenticated;
revoke all on function public.undo_dismiss_peer_request(uuid) from public, anon, authenticated;
revoke all on function public.list_my_peer_cases(integer, integer) from public, anon, authenticated;
revoke all on function public.get_my_peer_case(uuid) from public, anon, authenticated;
revoke all on function public.create_peer_availability(timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.list_my_peer_availability() from public, anon, authenticated;
revoke all on function public.withdraw_peer_availability(uuid) from public, anon, authenticated;
revoke all on function public.get_peer_request_management(text) from public, anon, authenticated;
revoke all on function public.list_peer_request_slots(text) from public, anon, authenticated;
revoke all on function public.schedule_peer_session(text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_peer_request(text) from public, anon, authenticated;
revoke all on function public.cancel_my_peer_session(uuid) from public, anon, authenticated;
revoke all on function public.complete_my_peer_case(uuid) from public, anon, authenticated;
revoke all on function public.escalate_my_peer_case(uuid, text) from public, anon, authenticated;
revoke all on function public.list_my_peer_sessions() from public, anon, authenticated;
revoke all on function public.get_peer_dashboard_counts() from public, anon, authenticated;
revoke all on function public.list_peer_escalations(integer, integer) from public, anon, authenticated;
revoke all on function public.get_peer_escalation(uuid) from public, anon, authenticated;
revoke all on function public.list_teacher_peer_support_overview(integer, integer) from public, anon, authenticated;
revoke all on function public.get_teacher_peer_support_counts() from public, anon, authenticated;
revoke all on function public.list_swag_escalation_assignees() from public, anon, authenticated;
revoke all on function public.authorize_swag_escalation(uuid, uuid) from public, anon, authenticated;

grant execute on function public.submit_peer_support_request(text, text, text, text, text, text, date, text, text) to anon, authenticated;
grant execute on function public.get_peer_request_management(text) to anon, authenticated;
grant execute on function public.list_peer_request_slots(text) to anon, authenticated;
grant execute on function public.schedule_peer_session(text, uuid) to anon, authenticated;
grant execute on function public.cancel_peer_request(text) to anon, authenticated;

grant execute on function public.list_available_peer_requests(boolean, integer, integer) to authenticated;
grant execute on function public.claim_peer_request(uuid) to authenticated;
grant execute on function public.dismiss_peer_request(uuid) to authenticated;
grant execute on function public.undo_dismiss_peer_request(uuid) to authenticated;
grant execute on function public.list_my_peer_cases(integer, integer) to authenticated;
grant execute on function public.get_my_peer_case(uuid) to authenticated;
grant execute on function public.create_peer_availability(timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.list_my_peer_availability() to authenticated;
grant execute on function public.withdraw_peer_availability(uuid) to authenticated;
grant execute on function public.cancel_my_peer_session(uuid) to authenticated;
grant execute on function public.complete_my_peer_case(uuid) to authenticated;
grant execute on function public.escalate_my_peer_case(uuid, text) to authenticated;
grant execute on function public.list_my_peer_sessions() to authenticated;
grant execute on function public.get_peer_dashboard_counts() to authenticated;
grant execute on function public.list_peer_escalations(integer, integer) to authenticated;
grant execute on function public.get_peer_escalation(uuid) to authenticated;
grant execute on function public.list_teacher_peer_support_overview(integer, integer) to authenticated;
grant execute on function public.get_teacher_peer_support_counts() to authenticated;
grant execute on function public.list_swag_escalation_assignees() to authenticated;
grant execute on function public.authorize_swag_escalation(uuid, uuid) to authenticated;

comment on table public.peer_support_requests is
  'Private Peer Support intake. Browser access is only through narrow role/token-scoped RPCs.';
comment on table public.peer_request_access_tokens is
  'Stores SHA-256 hashes of per-request student management tokens; plaintext tokens are never persisted.';
comment on function public.list_available_peer_requests(boolean, integer, integer) is
  'Privacy-limited open queue; never returns student identity or private free text.';
