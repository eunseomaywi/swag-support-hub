begin;

select plan(10);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a1111111-1111-4111-8111-111111111111', 'rpc-student@example.invalid', '{}'::jsonb),
  ('a2222222-2222-4222-8222-222222222222', 'rpc-peer@example.invalid', '{}'::jsonb),
  ('a3333333-3333-4333-8333-333333333333', 'rpc-swag@example.invalid', '{"full_name":"RPC SWAG"}'::jsonb),
  ('a4444444-4444-4444-8444-444444444444', 'rpc-teacher@example.invalid', '{"full_name":"RPC Teacher"}'::jsonb);

update public.profiles set role = 'peer_mentor'
where id = 'a2222222-2222-4222-8222-222222222222';
update public.profiles set role = 'swag_member'
where id = 'a3333333-3333-4333-8333-333333333333';
update public.profiles set role = 'teacher'
where id = 'a4444444-4444-4444-8444-444444444444';

insert into public.concerns (id, is_anonymous, name, year_group, category, feeling, details)
values (
  'b1111111-1111-4111-8111-111111111111', true, null,
  'Year 9', 'Wellbeing', 'Okay', 'Original immutable details.'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true
);
select throws_ok(
  $$ select * from public.take_concern('b1111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'a student cannot take a Concern'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true
);
select throws_ok(
  $$ select * from public.take_concern('b1111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'a Peer Mentor cannot take a Concern'
);
select results_eq(
  $$ select count(*)::bigint from public.concerns $$,
  array[0::bigint],
  'a Peer Mentor still cannot read Concerns'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated"}', true
);
select results_eq(
  $$ select success, outcome from public.take_concern('b1111111-1111-4111-8111-111111111111') $$,
  $$ values (true, 'assigned'::text) $$,
  'a SWAG Member can atomically take an unassigned Concern'
);
select ok(
  (select assigned_to = 'a3333333-3333-4333-8333-333333333333'
     and status = 'reviewing' and reviewed_at is not null
   from public.concerns where id = 'b1111111-1111-4111-8111-111111111111'),
  'taking a pending Concern assigns it and begins review'
);
select lives_ok(
  $$ select public.set_concern_status('b1111111-1111-4111-8111-111111111111', 'resolved') $$,
  'a SWAG Member can resolve a reviewing Concern'
);
select throws_ok(
  $$ update public.concerns set details = 'Changed' where id = 'b1111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'Concern RPC additions do not weaken original-content protection'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a4444444-4444-4444-8444-444444444444","role":"authenticated"}', true
);
select results_eq(
  $$ select full_name, role from public.list_concern_assignees() order by role $$,
  $$ values ('RPC SWAG'::text, 'swag_member'::public.app_role),
            ('RPC Teacher'::text, 'teacher'::public.app_role) $$,
  'the narrow assignee directory exposes only eligible staff display fields'
);
select throws_ok(
  $$ select public.set_concern_status('b1111111-1111-4111-8111-111111111111', 'pending') $$,
  '23514', null, 'invalid Concern status transitions are rejected'
);
select throws_ok(
  $$ delete from public.concerns where id = 'b1111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'Teacher browser access still cannot delete Concerns'
);

select * from finish();
rollback;
