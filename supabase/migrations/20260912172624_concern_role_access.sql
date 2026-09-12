alter table public.concerns
  add column submitted_by uuid references auth.users (id) on delete set null,
  add column assigned_to uuid references public.profiles (id) on delete set null,
  add column updated_at timestamptz not null default now(),
  add column reviewed_at timestamptz,
  add column resolved_at timestamptz;

create index concerns_assigned_to_idx
on public.concerns (assigned_to)
where assigned_to is not null;

create function public.apply_concern_workflow_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignee_role public.app_role;
begin
  if tg_op = 'INSERT' then
    new.status = 'pending';
    new.submitted_by = case
      when new.is_anonymous then null
      else (select auth.uid())
    end;
    new.assigned_to = null;
    new.updated_at = now();
    new.reviewed_at = null;
    new.resolved_at = null;
  else
    new.updated_at = now();
    new.reviewed_at = old.reviewed_at;
    new.resolved_at = old.resolved_at;

    if new.status is distinct from old.status then
      case new.status
        when 'pending' then
          new.reviewed_at = null;
          new.resolved_at = null;
        when 'reviewing' then
          new.reviewed_at = coalesce(old.reviewed_at, now());
          new.resolved_at = null;
        when 'resolved' then
          new.reviewed_at = coalesce(old.reviewed_at, now());
          new.resolved_at = coalesce(old.resolved_at, now());
        when 'cancelled' then
          new.resolved_at = null;
      end case;
    end if;
  end if;

  if new.assigned_to is not null then
    select profile.role
    into assignee_role
    from public.profiles as profile
    where profile.id = new.assigned_to;

    if assignee_role is null
      or assignee_role not in ('swag_member'::public.app_role, 'teacher'::public.app_role)
    then
      raise exception 'concerns may only be assigned to a SWAG Member or Teacher'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger concerns_apply_workflow_rules
before insert or update on public.concerns
for each row
execute function public.apply_concern_workflow_rules();

create function public.prevent_invalid_concern_assignee_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role not in ('swag_member'::public.app_role, 'teacher'::public.app_role)
    and exists (
      select 1
      from public.concerns as concern
      where concern.assigned_to = new.id
    )
  then
    raise exception 'a profile with assigned concerns must remain a SWAG Member or Teacher'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger profiles_preserve_valid_concern_assignee_role
before update of role on public.profiles
for each row
when (old.role is distinct from new.role)
execute function public.prevent_invalid_concern_assignee_role();

create function public.submit_concern(
  p_is_anonymous boolean,
  p_name text,
  p_year_group text,
  p_email text,
  p_category text,
  p_feeling text,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  concern_id uuid;
begin
  insert into public.concerns (
    is_anonymous,
    name,
    year_group,
    email,
    category,
    feeling,
    details
  )
  values (
    p_is_anonymous,
    case when p_is_anonymous then null else nullif(btrim(p_name), '') end,
    btrim(p_year_group),
    nullif(btrim(p_email), ''),
    btrim(p_category),
    btrim(p_feeling),
    btrim(p_details)
  )
  returning id into concern_id;

  return concern_id;
end;
$$;

drop policy "Public can submit concerns" on public.concerns;

create policy "Public can submit concerns"
on public.concerns
for insert
to anon, authenticated
with check (
  status = 'pending'
  and assigned_to is null
  and reviewed_at is null
  and resolved_at is null
  and submitted_by is not distinct from (
    case
      when is_anonymous then null::uuid
      else (select auth.uid())
    end
  )
);

create policy "SWAG Members and Teachers can read concerns"
on public.concerns
for select
to authenticated
using (
  (select public.current_app_role())
    in ('swag_member'::public.app_role, 'teacher'::public.app_role)
);

create policy "SWAG Members and Teachers can update concern workflow"
on public.concerns
for update
to authenticated
using (
  (select public.current_app_role())
    in ('swag_member'::public.app_role, 'teacher'::public.app_role)
)
with check (
  (select public.current_app_role())
    in ('swag_member'::public.app_role, 'teacher'::public.app_role)
);

revoke all on table public.concerns from public, anon, authenticated;

grant insert (
  is_anonymous,
  name,
  year_group,
  email,
  category,
  feeling,
  details
) on public.concerns to anon, authenticated;

grant select on table public.concerns to authenticated;
grant update (status, assigned_to) on public.concerns to authenticated;

revoke all on function public.apply_concern_workflow_rules()
from public, anon, authenticated;

revoke all on function public.prevent_invalid_concern_assignee_role()
from public, anon, authenticated;

revoke all on function public.submit_concern(boolean, text, text, text, text, text, text)
from public, anon, authenticated;

grant execute on function public.submit_concern(boolean, text, text, text, text, text, text)
to anon, authenticated;

comment on function public.submit_concern(boolean, text, text, text, text, text, text) is
  'Narrow public Concern submission API. Workflow and ownership fields are always database-controlled.';

