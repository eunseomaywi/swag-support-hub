begin;

select plan(22);

select ok(
  (
    select array_agg(enum_value.enumlabel order by enum_value.enumsortorder)
    from pg_catalog.pg_enum as enum_value
    join pg_catalog.pg_type as enum_type on enum_type.oid = enum_value.enumtypid
    join pg_catalog.pg_namespace as enum_schema on enum_schema.oid = enum_type.typnamespace
    where enum_schema.nspname = 'public'
      and enum_type.typname = 'app_role'
  ) = array['student', 'peer_mentor', 'swag_member', 'teacher']::name[],
  'app_role contains exactly the four SWAG roles in the intended order'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'student-one@example.invalid',
    '{"full_name":"Student One"}'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'student-two@example.invalid',
    '{"full_name":"Student Two","role":"teacher"}'::jsonb
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'peer-mentor@example.invalid',
    '{}'::jsonb
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'swag-member@example.invalid',
    '{}'::jsonb
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'teacher@example.invalid',
    '{}'::jsonb
  );

select is(
  (select role::text from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'student',
  'a new Auth user automatically receives the student role'
);

select is(
  (select role::text from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  'student',
  'signup metadata cannot promote a new user to teacher'
);

select is(
  (select full_name from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  'Student Two',
  'safe full_name metadata is copied into the profile'
);

select ok(
  (
    select bool_and(has_column_privilege('anon', 'public.concerns', field.column_name, 'insert'))
    from (
      values
        ('is_anonymous'),
        ('name'),
        ('year_group'),
        ('email'),
        ('category'),
        ('feeling'),
        ('details')
    ) as field(column_name)
  ),
  'anonymous Concern insert privilege remains enabled'
);

select ok(
  (
    select bool_and(
      has_column_privilege('authenticated', 'public.concerns', field.column_name, 'insert')
    )
    from (
      values
        ('is_anonymous'),
        ('name'),
        ('year_group'),
        ('email'),
        ('category'),
        ('feeling'),
        ('details')
    ) as field(column_name)
  ),
  'authenticated Concern insert privilege remains enabled'
);

update public.profiles
set role = case id
  when '33333333-3333-4333-8333-333333333333' then 'peer_mentor'::public.app_role
  when '44444444-4444-4444-8444-444444444444' then 'swag_member'::public.app_role
  when '55555555-5555-4555-8555-555555555555' then 'teacher'::public.app_role
  else role
end
where id in (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select results_eq(
  $$ select id from public.profiles $$,
  array['11111111-1111-4111-8111-111111111111'::uuid],
  'a student can read only their own profile'
);

select is(
  public.current_app_role()::text,
  'student',
  'current_app_role derives the signed-in user role from auth.uid()'
);

select results_eq(
  $$
    update public.profiles
    set full_name = 'Updated Student'
    where id = '11111111-1111-4111-8111-111111111111'
    returning full_name
  $$,
  array['Updated Student'::text],
  'a student can update their own full_name'
);

select throws_ok(
  $$
    update public.profiles
    set role = 'teacher'
    where id = '11111111-1111-4111-8111-111111111111'
  $$,
  '42501',
  null,
  'a student cannot change their role'
);

select throws_ok(
  $$
    update public.profiles
    set email = 'changed@example.invalid'
    where id = '11111111-1111-4111-8111-111111111111'
  $$,
  '42501',
  null,
  'a student cannot change their profile email directly'
);

select results_eq(
  $$
    with changed as (
      update public.profiles
      set full_name = 'Not Allowed'
      where id = '22222222-2222-4222-8222-222222222222'
      returning id
    )
    select count(*)::bigint from changed
  $$,
  array[0::bigint],
  'a student cannot update another profile'
);

select throws_ok(
  $$
    insert into public.profiles (id, role)
    values ('66666666-6666-4666-8666-666666666666', 'teacher')
  $$,
  '42501',
  null,
  'an authenticated browser user cannot manually insert a privileged profile'
);

select throws_ok(
  $$
    delete from public.profiles
    where id = '22222222-2222-4222-8222-222222222222'
  $$,
  '42501',
  null,
  'a student cannot delete another profile'
);

select throws_ok(
  $$
    insert into public.staff_members (profile_id, staff_type, booking_enabled)
    values (
      '11111111-1111-4111-8111-111111111111',
      'teacher',
      true
    )
  $$,
  '42501',
  null,
  'a student cannot create a staff configuration row'
);

select throws_ok(
  $$ select * from public.staff_members $$,
  '42501',
  null,
  'a student cannot read private staff configuration'
);

select results_eq(
  $$ select count(*)::bigint from public.concerns $$,
  array[0::bigint],
  'an authenticated student still cannot read concerns'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select id from public.profiles $$,
  '42501',
  null,
  'an unauthenticated user cannot read profiles'
);

select throws_ok(
  $$ select id from public.concerns $$,
  '42501',
  null,
  'an anonymous user still cannot read concerns'
);

reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
select results_eq(
  $$ select count(*)::bigint from public.concerns $$,
  array[0::bigint],
  'a Peer Mentor cannot read concerns'
);

reset role;

select is(
  (select email from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'student-one@example.invalid',
  'profile email initially mirrors the Auth email'
);

update auth.users
set email = 'student-one-updated@example.invalid'
where id = '11111111-1111-4111-8111-111111111111';

select is(
  (select email from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'student-one-updated@example.invalid',
  'trusted Auth email changes are synchronized to the profile'
);

select * from finish();
rollback;
