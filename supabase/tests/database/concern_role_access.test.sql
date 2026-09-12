begin;

select plan(34);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('61111111-1111-4111-8111-111111111111', 'phase-two-student@example.invalid', '{}'::jsonb),
  ('62222222-2222-4222-8222-222222222222', 'phase-two-peer@example.invalid', '{}'::jsonb),
  ('63333333-3333-4333-8333-333333333333', 'phase-two-swag@example.invalid', '{}'::jsonb),
  ('64444444-4444-4444-8444-444444444444', 'phase-two-teacher@example.invalid', '{}'::jsonb);

update public.profiles
set role = case id
  when '62222222-2222-4222-8222-222222222222' then 'peer_mentor'::public.app_role
  when '63333333-3333-4333-8333-333333333333' then 'swag_member'::public.app_role
  when '64444444-4444-4444-8444-444444444444' then 'teacher'::public.app_role
  else role
end
where id in (
  '62222222-2222-4222-8222-222222222222',
  '63333333-3333-4333-8333-333333333333',
  '64444444-4444-4444-8444-444444444444'
);

insert into public.concerns (
  id,
  is_anonymous,
  name,
  year_group,
  category,
  feeling,
  details
)
values
  (
    '71111111-1111-4111-8111-111111111111',
    true,
    null,
    'Year 9',
    'Fixture One',
    'Okay',
    'Local authorization fixture one.'
  ),
  (
    '72222222-2222-4222-8222-222222222222',
    true,
    null,
    'Year 10',
    'Fixture Two',
    'Okay',
    'Local authorization fixture two.'
  );

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select id from public.concerns $$,
  '42501',
  null,
  'anonymous Concern SELECT is denied'
);

select lives_ok(
  $$
    insert into public.concerns (
      is_anonymous,
      name,
      year_group,
      email,
      category,
      feeling,
      details
    )
    values (true, null, 'Year 8', null, 'Anonymous Raw', 'Okay', 'Local anonymous test.')
  $$,
  'the existing anonymous raw submission path still works'
);

select lives_ok(
  $$
    select public.submit_concern(
      true,
      null,
      'Year 8',
      null,
      'Anonymous RPC',
      'Okay',
      'Local anonymous RPC test.'
    )
  $$,
  'anonymous callers can use the narrow submit_concern RPC'
);

select throws_ok(
  $$ delete from public.concerns $$,
  '42501',
  null,
  'anonymous Concern DELETE is denied'
);

reset role;

select is(
  (
    select submitted_by
    from public.concerns
    where category = 'Anonymous Raw'
  ),
  null::uuid,
  'an anonymous raw submission stores no submitted_by identity'
);

select is(
  (
    select status
    from public.concerns
    where category = 'Anonymous Raw'
  ),
  'pending',
  'an anonymous raw submission receives the pending status'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"61111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select results_eq(
  $$ select count(*)::bigint from public.concerns $$,
  array[0::bigint],
  'student Concern SELECT returns no rows'
);

select lives_ok(
  $$
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
      false,
      'Phase Two Student',
      'Year 11',
      null,
      'Student Raw',
      'Okay',
      'Local authenticated test.'
    )
  $$,
  'the existing authenticated student raw submission path still works'
);

select lives_ok(
  $$
    select public.submit_concern(
      false,
      'Phase Two Student',
      'Year 11',
      null,
      'Student RPC',
      'Okay',
      'Local authenticated RPC test.'
    )
  $$,
  'authenticated students can use the narrow submit_concern RPC'
);

select throws_ok(
  $$
    insert into public.concerns (
      is_anonymous,
      name,
      year_group,
      category,
      feeling,
      details,
      status
    )
    values (true, null, 'Year 11', 'Malicious Status', 'Okay', 'Local test.', 'resolved')
  $$,
  '42501',
  null,
  'a browser submission cannot provide status'
);

select throws_ok(
  $$
    insert into public.concerns (
      is_anonymous,
      name,
      year_group,
      category,
      feeling,
      details,
      assigned_to
    )
    values (
      true,
      null,
      'Year 11',
      'Malicious Assignment',
      'Okay',
      'Local test.',
      '61111111-1111-4111-8111-111111111111'
    )
  $$,
  '42501',
  null,
  'a browser submission cannot provide assigned_to'
);

select results_eq(
  $$
    with changed as (
      update public.concerns
      set status = 'reviewing'
      where id = '71111111-1111-4111-8111-111111111111'
      returning id
    )
    select count(*)::bigint from changed
  $$,
  array[0::bigint],
  'a student cannot update Concern workflow state'
);

select results_eq(
  $$
    with changed as (
      update public.concerns
      set assigned_to = '61111111-1111-4111-8111-111111111111'
      where id = '71111111-1111-4111-8111-111111111111'
      returning id
    )
    select count(*)::bigint from changed
  $$,
  array[0::bigint],
  'a student cannot mutate assigned_to'
);

select throws_ok(
  $$ delete from public.concerns $$,
  '42501',
  null,
  'student Concern DELETE is denied'
);

reset role;

select is(
  (
    select submitted_by
    from public.concerns
    where category = 'Student Raw'
  ),
  '61111111-1111-4111-8111-111111111111'::uuid,
  'an authenticated named submission records auth.uid() as submitted_by'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"62222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

select results_eq(
  $$ select count(*)::bigint from public.concerns $$,
  array[0::bigint],
  'Peer Mentor Concern SELECT returns no rows'
);

select results_eq(
  $$
    with changed as (
      update public.concerns
      set status = 'reviewing'
      where id = '71111111-1111-4111-8111-111111111111'
      returning id
    )
    select count(*)::bigint from changed
  $$,
  array[0::bigint],
  'a Peer Mentor cannot update Concern workflow state'
);

select results_eq(
  $$
    with changed as (
      update public.concerns
      set assigned_to = '62222222-2222-4222-8222-222222222222'
      where id = '71111111-1111-4111-8111-111111111111'
      returning id
    )
    select count(*)::bigint from changed
  $$,
  array[0::bigint],
  'a Peer Mentor cannot mutate assigned_to'
);

select lives_ok(
  $$
    insert into public.concerns (
      is_anonymous,
      name,
      year_group,
      email,
      category,
      feeling,
      details
    )
    values (true, null, 'Year 12', null, 'Peer Submission', 'Okay', 'Local peer test.')
  $$,
  'a Peer Mentor can submit through the student-facing raw path'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);

select ok(
  (select count(*) > 0 from public.concerns),
  'a SWAG Member can read concerns'
);

select results_eq(
  $$
    update public.concerns
    set status = 'reviewing'
    where id = '71111111-1111-4111-8111-111111111111'
    returning status
  $$,
  array['reviewing'::text],
  'a SWAG Member can update Concern workflow state'
);

select ok(
  (
    select reviewed_at is not null
      and resolved_at is null
      and updated_at is not null
    from public.concerns
    where id = '71111111-1111-4111-8111-111111111111'
  ),
  'reviewing status maintains reviewed_at and updated_at'
);

select results_eq(
  $$
    update public.concerns
    set assigned_to = '63333333-3333-4333-8333-333333333333'
    where id = '71111111-1111-4111-8111-111111111111'
    returning assigned_to
  $$,
  array['63333333-3333-4333-8333-333333333333'::uuid],
  'a SWAG Member can assign a concern to a valid SWAG Member'
);

select throws_ok(
  $$
    update public.concerns
    set details = 'Rewritten by staff'
    where id = '71111111-1111-4111-8111-111111111111'
  $$,
  '42501',
  null,
  'a SWAG Member cannot rewrite original details'
);

select throws_ok(
  $$ delete from public.concerns $$,
  '42501',
  null,
  'SWAG Member Concern DELETE is denied'
);

select throws_ok(
  $$
    update public.concerns
    set assigned_to = '61111111-1111-4111-8111-111111111111'
    where id = '71111111-1111-4111-8111-111111111111'
  $$,
  '23514',
  null,
  'a concern cannot be assigned to a student profile'
);

select lives_ok(
  $$
    select public.submit_concern(
      true,
      null,
      'Year 12',
      null,
      'SWAG Submission',
      'Okay',
      'Local SWAG Member submission test.'
    )
  $$,
  'a SWAG Member can submit through the student-facing RPC'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"64444444-4444-4444-8444-444444444444","role":"authenticated"}',
  true
);

select ok(
  (select count(*) > 0 from public.concerns),
  'a Teacher can read concerns'
);

select results_eq(
  $$
    update public.concerns
    set status = 'resolved',
        assigned_to = '64444444-4444-4444-8444-444444444444'
    where id = '72222222-2222-4222-8222-222222222222'
    returning status, assigned_to
  $$,
  $$ values (
    'resolved'::text,
    '64444444-4444-4444-8444-444444444444'::uuid
  ) $$,
  'a Teacher can resolve and assign a concern to a valid Teacher'
);

select ok(
  (
    select reviewed_at is not null
      and resolved_at is not null
      and updated_at is not null
    from public.concerns
    where id = '72222222-2222-4222-8222-222222222222'
  ),
  'resolved status maintains reviewed_at, resolved_at, and updated_at'
);

select throws_ok(
  $$
    update public.concerns
    set name = 'Rewritten by teacher'
    where id = '72222222-2222-4222-8222-222222222222'
  $$,
  '42501',
  null,
  'a Teacher cannot rewrite original submitted content'
);

select throws_ok(
  $$ delete from public.concerns $$,
  '42501',
  null,
  'Teacher Concern DELETE is denied'
);

select lives_ok(
  $$
    select public.submit_concern(
      true,
      null,
      'Year 13',
      null,
      'Teacher Submission',
      'Okay',
      'Local Teacher submission test.'
    )
  $$,
  'a Teacher can submit through the student-facing RPC'
);

reset role;

select throws_ok(
  $$
    update public.profiles
    set role = 'student'
    where id = '63333333-3333-4333-8333-333333333333'
  $$,
  '23514',
  null,
  'an assigned staff profile cannot be changed to an ineligible role'
);

select * from finish();
rollback;
