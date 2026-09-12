create function public.take_concern(p_concern_id uuid)
returns table (success boolean, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  concern_row public.concerns%rowtype;
begin
  if actor_id is null or actor_role not in ('swag_member', 'teacher') then
    raise exception 'Concern workflow access required' using errcode = '42501';
  end if;
  select concern.* into concern_row from public.concerns concern
  where concern.id = p_concern_id for update;
  if not found then return query select false, 'not_found'::text; return; end if;
  if concern_row.assigned_to is not null and concern_row.assigned_to <> actor_id then
    return query select false, 'already_assigned'::text; return;
  end if;
  update public.concerns
  set assigned_to = actor_id,
      status = case when status = 'pending' then 'reviewing' else status end
  where id = p_concern_id;
  return query select true, 'assigned'::text;
end;
$$;

create function public.set_concern_status(p_concern_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role := public.current_app_role();
  old_status text;
begin
  if auth.uid() is null or actor_role not in ('swag_member', 'teacher') then
    raise exception 'Concern workflow access required' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'reviewing', 'resolved', 'cancelled') then
    raise exception 'invalid Concern status' using errcode = '22023';
  end if;
  select status into old_status from public.concerns where id = p_concern_id for update;
  if not found then return false; end if;
  if not (
    old_status = p_status
    or (old_status = 'pending' and p_status in ('reviewing', 'cancelled'))
    or (old_status = 'reviewing' and p_status in ('resolved', 'cancelled'))
  ) then
    raise exception 'invalid Concern status transition' using errcode = '23514';
  end if;
  update public.concerns set status = p_status where id = p_concern_id;
  return true;
end;
$$;

create function public.list_concern_assignees()
returns table (profile_id uuid, full_name text, role public.app_role)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.current_app_role() not in ('swag_member', 'teacher') then
    raise exception 'Concern workflow access required' using errcode = '42501';
  end if;
  return query
  select profile.id, profile.full_name, profile.role from public.profiles profile
  where profile.role in ('swag_member', 'teacher')
  order by profile.full_name nulls last, profile.id;
end;
$$;

revoke all on function public.take_concern(uuid) from public, anon, authenticated;
revoke all on function public.set_concern_status(uuid, text) from public, anon, authenticated;
revoke all on function public.list_concern_assignees() from public, anon, authenticated;
grant execute on function public.take_concern(uuid) to authenticated;
grant execute on function public.set_concern_status(uuid, text) to authenticated;
grant execute on function public.list_concern_assignees() to authenticated;

comment on function public.take_concern(uuid) is
  'Atomically assigns an unassigned Concern to the current SWAG Member or Teacher.';
