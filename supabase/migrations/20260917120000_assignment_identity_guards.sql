-- Tighten assignment identity checks without changing the already-applied workflow migration.

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
  if actor_email is null then
    raise exception 'supporter email required' using errcode = '42501';
  end if;
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

create or replace function public.teacher_assign_peer_request(p_request_id uuid, p_supporter_id uuid)
returns table (success boolean, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid(); request_row public.peer_support_requests%rowtype;
  supporter public.profiles%rowtype;
begin
  if actor_id is null or public.current_app_role() <> 'teacher' then
    raise exception 'teacher access required' using errcode = '42501'; end if;
  select * into supporter from public.profiles where id = p_supporter_id;
  if not found or supporter.role not in ('peer_mentor','swag_member') or supporter.email is null
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

create or replace function public.teacher_reassign_peer_request(p_request_id uuid, p_supporter_id uuid)
returns table (success boolean, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid:=auth.uid(); request_row public.peer_support_requests%rowtype;
  supporter public.profiles%rowtype; previous_id uuid;
begin
  if actor_id is null or public.current_app_role()<>'teacher' then
    raise exception 'teacher access required' using errcode='42501'; end if;
  select * into supporter from public.profiles where id=p_supporter_id;
  if not found or supporter.role not in ('peer_mentor','swag_member') or supporter.email is null
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

create or replace function public.get_peer_support_settings()
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
      and exists(select 1 from public.staff_members staff
        where staff.profile_id=teacher.id and staff.staff_type='teacher' and staff.booking_enabled)
      and cardinality(settings.active_weekdays) > 0
      and not exists (select 1 from public.peer_support_periods period
        where period.start_time is null or period.end_time is null)
  from public.peer_support_settings settings
  left join public.profiles teacher on teacher.id = settings.supervisor_teacher_id
  where settings.singleton;
end;
$$;

revoke all on function public.claim_peer_request(uuid) from public, anon, authenticated;
revoke all on function public.teacher_assign_peer_request(uuid,uuid) from public, anon, authenticated;
revoke all on function public.teacher_reassign_peer_request(uuid,uuid) from public, anon, authenticated;
revoke all on function public.get_peer_support_settings() from public, anon, authenticated;
grant execute on function public.claim_peer_request(uuid) to authenticated;
grant execute on function public.teacher_assign_peer_request(uuid,uuid) to authenticated;
grant execute on function public.teacher_reassign_peer_request(uuid,uuid) to authenticated;
grant execute on function public.get_peer_support_settings() to authenticated;
