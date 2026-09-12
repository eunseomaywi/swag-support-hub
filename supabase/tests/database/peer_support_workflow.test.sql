begin;

select plan(52);

select has_table('public', 'peer_support_requests', 'Peer Support requests table exists');
select has_table('public', 'peer_request_dismissals', 'per-mentor dismissals table exists');
select has_table('public', 'peer_mentor_availability', 'mentor availability table exists');
select has_table('public', 'peer_sessions', 'Peer Support sessions table exists');
select has_table('public', 'peer_request_access_tokens', 'hashed management tokens table exists');
select has_table('public', 'peer_support_actions', 'workflow action history exists');

insert into auth.users (id, email, raw_user_meta_data)
values
  ('81111111-1111-4111-8111-111111111111', 'phase-four-peer-one@example.invalid', '{"full_name":"Peer One"}'::jsonb),
  ('82222222-2222-4222-8222-222222222222', 'phase-four-peer-two@example.invalid', '{"full_name":"Peer Two"}'::jsonb),
  ('83333333-3333-4333-8333-333333333333', 'phase-four-swag@example.invalid', '{"full_name":"SWAG Member"}'::jsonb),
  ('84444444-4444-4444-8444-444444444444', 'phase-four-teacher@example.invalid', '{"full_name":"Teacher One"}'::jsonb),
  ('85555555-5555-4555-8555-555555555555', 'phase-four-student@example.invalid', '{"full_name":"Student One"}'::jsonb);

update public.profiles set role = 'peer_mentor'
where id in ('81111111-1111-4111-8111-111111111111', '82222222-2222-4222-8222-222222222222');
update public.profiles set role = 'swag_member'
where id = '83333333-3333-4333-8333-333333333333';
update public.profiles set role = 'teacher'
where id = '84444444-4444-4444-8444-444444444444';

insert into public.peer_support_requests (
  id, student_name, year_group, contact_email, category,
  preferred_date, preferred_time, private_explanation,
  status, assigned_mentor_id, assigned_at,
  escalation_reason, escalated_at, escalated_by
)
values
  ('91111111-1111-4111-8111-111111111111', 'Student A', 'Year 9', 'a@example.invalid',
    'Friendships', current_date + 5, 'Break', 'Private story A.', 'open', null, null, null, null, null),
  ('92222222-2222-4222-8222-222222222222', 'Student B', 'Year 10', 'b@example.invalid',
    'Wellbeing', current_date + 6, '1st Lunch', 'Private story B.', 'open', null, null, null, null, null),
  ('93333333-3333-4333-8333-333333333333', 'Student C', 'Year 11', 'c@example.invalid',
    'Settling in', current_date + 7, '2nd Lunch', 'Private story C.', 'accepted',
    '81111111-1111-4111-8111-111111111111', now(), null, null, null),
  ('94444444-4444-4444-8444-444444444444', 'Student D', 'Year 12', 'd@example.invalid',
    'School work & stress', current_date + 8, 'Break', 'Private story D.', 'accepted',
    '81111111-1111-4111-8111-111111111111', now(), null, null, null),
  ('95555555-5555-4555-8555-555555555555', 'Student E', 'Year 13', 'e@example.invalid',
    'Something else', current_date + 9, '1st Lunch', 'Private story E.', 'escalated',
    '83333333-3333-4333-8333-333333333333', now(), 'Needs teacher review', now(),
    '83333333-3333-4333-8333-333333333333'),
  ('96666666-6666-4666-8666-666666666666', 'Student F', 'Year 8', 'f@example.invalid',
    'Friendships', current_date + 10, '2nd Lunch', null, 'open', null, null, null, null, null);

insert into public.peer_escalation_access (request_id, profile_id, granted_by)
values (
  '95555555-5555-4555-8555-555555555555',
  '83333333-3333-4333-8333-333333333333',
  '83333333-3333-4333-8333-333333333333'
);

insert into public.peer_request_access_tokens (request_id, token_hash, expires_at)
values
  ('94444444-4444-4444-8444-444444444444', extensions.digest(repeat('a', 64), 'sha256'), now() + interval '30 days'),
  ('92222222-2222-4222-8222-222222222222', extensions.digest(repeat('b', 64), 'sha256'), now() - interval '1 day');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select * from public.peer_support_requests $$,
  '42501', null, 'anonymous callers cannot read the base request table'
);
select throws_ok(
  $$ select * from public.list_available_peer_requests() $$,
  '42501', null, 'anonymous callers cannot list the mentor queue'
);
select throws_ok(
  $$ select * from public.submit_peer_support_request(
    'wrong-gateway-secret', repeat('1', 64), 'Student', 'Year 9', 'student@example.invalid',
    'Wellbeing', current_date + 2, 'Break', null
  ) $$,
  '42501', null, 'direct public intake without the Worker gateway secret is denied'
);
select is_empty(
  $$ select * from public.get_peer_request_management('not-a-token') $$,
  'an invalid management token returns no request data'
);
select is_empty(
  $$ select * from public.get_peer_request_management(repeat('b', 64)) $$,
  'an expired management token returns no request data'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"85555555-5555-4555-8555-555555555555","role":"authenticated"}', true
);
select throws_ok(
  $$ select * from public.list_available_peer_requests() $$,
  '42501', null, 'a student cannot list available Peer Support requests'
);
select throws_ok(
  $$ select * from public.claim_peer_request('91111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'a student cannot claim a Peer Support request'
);
select throws_ok(
  $$ select * from public.list_my_peer_cases() $$,
  '42501', null, 'a student cannot access mentor cases'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81111111-1111-4111-8111-111111111111","role":"authenticated"}', true
);

select results_eq(
  $$ select request_id from public.list_available_peer_requests() order by request_id $$,
  $$ values
    ('91111111-1111-4111-8111-111111111111'::uuid),
    ('92222222-2222-4222-8222-222222222222'::uuid),
    ('96666666-6666-4666-8666-666666666666'::uuid)
  $$,
  'a Peer Mentor sees the privacy-limited open pool'
);
select results_eq(
  $$
    select distinct field
    from public.list_available_peer_requests() queue
    cross join lateral jsonb_object_keys(to_jsonb(queue)) as field
    order by field
  $$,
  $$ values
    ('category'::text), ('dismissed'::text), ('preferred_date'::text),
    ('preferred_time'::text), ('request_id'::text), ('submitted_at'::text)
  $$,
  'the available queue response contains only approved minimal fields'
);
select ok(
  public.dismiss_peer_request('92222222-2222-4222-8222-222222222222'),
  'a Peer Mentor can pass a request for themselves'
);
select is_empty(
  $$ select request_id from public.list_available_peer_requests()
     where request_id = '92222222-2222-4222-8222-222222222222' $$,
  'a passed request is hidden only from the acting mentor'
);
select ok(
  public.dismiss_peer_request('92222222-2222-4222-8222-222222222222'),
  'repeating Pass is idempotent'
);
select ok(
  public.undo_dismiss_peer_request('92222222-2222-4222-8222-222222222222'),
  'a Peer Mentor can undo Pass'
);
select results_eq(
  $$ select success, outcome from public.claim_peer_request('91111111-1111-4111-8111-111111111111') $$,
  $$ values (true, 'accepted'::text) $$,
  'a Peer Mentor can atomically claim an open request'
);
select ok(
  (select student_name = 'Student A' and private_explanation = 'Private story A.'
   from public.get_my_peer_case('91111111-1111-4111-8111-111111111111')),
  'the assignee can read the private details of their case'
);

create temporary table phase_four_ids (name text primary key, id uuid not null);
insert into phase_four_ids values (
  'peer_slot',
  public.create_peer_availability(
    now() + interval '5 days', now() + interval '5 days 1 hour', 'Break', 'Approved room'
  )
);
select throws_ok(
  $$ select public.create_peer_availability(
    now() - interval '1 hour', now() + interval '1 hour', 'Break', null
  ) $$,
  '22023', null, 'past availability is rejected'
);
select throws_ok(
  $$ select public.create_peer_availability(
    now() + interval '5 days 30 minutes', now() + interval '5 days 2 hours', null, null
  ) $$,
  '23P01', null, 'overlapping mentor availability is rejected'
);
select is(
  (select count(*) from public.list_my_peer_availability()),
  1::bigint,
  'a Peer Mentor can list only their own availability'
);

select results_eq(
  $$ select success, outcome from public.schedule_peer_session(
    repeat('a', 64), (select id from phase_four_ids where name = 'peer_slot')
  ) $$,
  $$ values (true, 'confirmed'::text) $$,
  'the request token schedules the assigned mentor slot transactionally'
);
select ok(
  (select status = 'scheduled' and session_status = 'confirmed'
   from public.list_my_peer_cases()
   where request_id = '94444444-4444-4444-8444-444444444444')
  and (select status = 'reserved'
       from public.list_my_peer_availability()
       where slot_id = (select id from phase_four_ids where name = 'peer_slot')),
  'scheduling keeps request, session, and slot state consistent'
);
select throws_ok(
  $$ select public.withdraw_peer_availability((select id from phase_four_ids where name = 'peer_slot')) $$,
  '23514', null, 'a confirmed session protects its slot from withdrawal'
);
select ok(
  public.cancel_my_peer_session('94444444-4444-4444-8444-444444444444'),
  'the assigned mentor can cancel a session'
);
select ok(
  (select status = 'accepted'
   from public.list_my_peer_cases()
   where request_id = '94444444-4444-4444-8444-444444444444')
  and (select status = 'available'
       from public.list_my_peer_availability()
       where slot_id = (select id from phase_four_ids where name = 'peer_slot')),
  'mentor cancellation returns the request to waiting-for-time and releases a future slot'
);
select ok(
  (select success from public.schedule_peer_session(
    repeat('a', 64), (select id from phase_four_ids where name = 'peer_slot'))),
  'a released slot can be selected again for the same accepted request'
);
select ok(
  public.complete_my_peer_case('94444444-4444-4444-8444-444444444444'),
  'the assigned mentor can complete a scheduled case'
);
select ok(
  (select status = 'completed' and session_status = 'completed'
   from public.list_my_peer_cases()
   where request_id = '94444444-4444-4444-8444-444444444444')
  and (select status = 'withdrawn'
       from public.list_my_peer_availability()
       where slot_id = (select id from phase_four_ids where name = 'peer_slot')),
  'completion consumes the slot and closes request/session consistently'
);
select ok(
  public.escalate_my_peer_case('93333333-3333-4333-8333-333333333333', 'Teacher guidance needed'),
  'the assigned Peer Mentor can escalate their own case'
);
select ok(
  (select student_name is null and contact_email is null and private_explanation is null
   from public.list_my_peer_cases()
   where request_id = '93333333-3333-4333-8333-333333333333'),
  'the original mentor retains only redacted handover status after escalation'
);
select throws_ok(
  $$ select * from public.get_my_peer_case('93333333-3333-4333-8333-333333333333') $$,
  '42501', null, 'the original mentor cannot reopen escalated private details'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82222222-2222-4222-8222-222222222222","role":"authenticated"}', true
);
select ok(
  exists (select 1 from public.list_available_peer_requests()
    where request_id = '92222222-2222-4222-8222-222222222222'),
  'one mentor passing does not hide the request from another mentor'
);
select is_empty(
  $$ select * from public.get_my_peer_case('91111111-1111-4111-8111-111111111111') $$,
  'another mentor cannot read an assigned private case'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"83333333-3333-4333-8333-333333333333","role":"authenticated"}', true
);
select results_eq(
  $$ select success, outcome from public.claim_peer_request('96666666-6666-4666-8666-666666666666') $$,
  $$ values (true, 'accepted'::text) $$,
  'a SWAG Member has the same ordinary request-claim capability'
);
select ok(
  exists (select 1 from public.list_peer_escalations()
    where request_id = '95555555-5555-4555-8555-555555555555'),
  'a SWAG Member sees an escalation specifically authorized to them'
);
select is_empty(
  $$ select * from public.list_peer_escalations()
     where request_id = '93333333-3333-4333-8333-333333333333' $$,
  'a SWAG Member cannot see an unrelated mentor escalation'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"84444444-4444-4444-8444-444444444444","role":"authenticated"}', true
);
select throws_ok(
  $$ select * from public.claim_peer_request('92222222-2222-4222-8222-222222222222') $$,
  '42501', null, 'a Teacher is not in the ordinary request claim pool'
);
select ok(
  exists (select 1 from public.list_peer_escalations()
    where request_id = '93333333-3333-4333-8333-333333333333'),
  'an escalated case reaches Teacher oversight'
);
select ok(
  exists (select 1 from public.list_teacher_peer_support_overview()
    where request_id = '91111111-1111-4111-8111-111111111111'),
  'Teacher overview contains minimal operational request state'
);
select ok(
  public.authorize_swag_escalation(
    '93333333-3333-4333-8333-333333333333',
    '83333333-3333-4333-8333-333333333333'
  ),
  'a Teacher can explicitly authorize SWAG coordination on an escalation'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"83333333-3333-4333-8333-333333333333","role":"authenticated"}', true
);
select ok(
  exists (select 1 from public.get_peer_escalation('93333333-3333-4333-8333-333333333333')),
  'an explicitly authorized SWAG Member can read that escalated case'
);

reset role;
update public.profiles set role = 'student'
where id = '82222222-2222-4222-8222-222222222222';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82222222-2222-4222-8222-222222222222","role":"authenticated"}', true
);
select throws_ok(
  $$ select * from public.list_my_peer_cases() $$,
  '42501', null, 'role revocation immediately removes sensitive Peer Support capability'
);

reset role;
select is(
  (select count(*) from public.peer_request_dismissals
   where request_id = '92222222-2222-4222-8222-222222222222'
     and mentor_id = '81111111-1111-4111-8111-111111111111'),
  0::bigint,
  'undo Pass leaves no dismissal record'
);
select ok(
  (select count(*) >= 6 from public.peer_support_actions),
  'sensitive workflow actions are recorded'
);
select is(
  (select encode(token_hash, 'hex') = encode(extensions.digest(repeat('a', 64), 'sha256'), 'hex')
   from public.peer_request_access_tokens
   where request_id = '94444444-4444-4444-8444-444444444444'),
  true,
  'only the management-token hash is persisted'
);
select is_empty(
  $$ select * from public.get_peer_request_management(repeat('b', 64)) $$,
  'expired management credentials remain unable to expose data'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"85555555-5555-4555-8555-555555555555","role":"authenticated"}', true
);
select throws_ok(
  $$ delete from public.peer_support_requests $$,
  '42501', null, 'ordinary browser roles have no base-table DELETE permission'
);

select * from finish();
rollback;
