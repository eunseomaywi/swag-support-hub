begin;
select no_plan();

select has_table('public','peer_support_requests','requests table remains');
select has_table('public','peer_sessions','sessions table remains');
select has_table('public','peer_mentor_availability','legacy availability data remains preserved');
select has_table('public','peer_confirmation_events','confirmation events exist');
select has_table('public','peer_confirmation_email_outbox','recipient outbox exists');
select has_column('public','peer_support_requests','assignment_method','assignment method is recorded');
select has_column('public','peer_support_requests','assigned_by','assigning actor is recorded');
select has_column('public','peer_sessions','student_email_snapshot','student overlap key is snapshotted');
select hasnt_column('public','peer_confirmation_email_outbox','cc','outbox has no cc field');
select hasnt_column('public','peer_confirmation_email_outbox','bcc','outbox has no bcc field');

insert into auth.users(id,email,raw_user_meta_data) values
 ('71111111-1111-4111-8111-111111111111','p5-peer-one@example.invalid','{"full_name":"Peer One"}'),
 ('72222222-2222-4222-8222-222222222222','p5-peer-two@example.invalid','{"full_name":"Peer Two"}'),
 ('73333333-3333-4333-8333-333333333333','p5-swag@example.invalid','{"full_name":"SWAG One"}'),
 ('74444444-4444-4444-8444-444444444444','p5-teacher@example.invalid','{"full_name":"Teacher One"}'),
 ('75555555-5555-4555-8555-555555555555','p5-student@example.invalid','{"full_name":"Student"}');
update public.profiles set role='peer_mentor' where id in ('71111111-1111-4111-8111-111111111111','72222222-2222-4222-8222-222222222222');
update public.profiles set role='swag_member' where id='73333333-3333-4333-8333-333333333333';
update public.profiles set role='teacher' where id='74444444-4444-4444-8444-444444444444';
insert into public.staff_members(profile_id,staff_type,booking_enabled) values
 ('71111111-1111-4111-8111-111111111111','peer_mentor',true),
 ('72222222-2222-4222-8222-222222222222','peer_mentor',true),
 ('73333333-3333-4333-8333-333333333333','swag_member',true),
 ('74444444-4444-4444-8444-444444444444','teacher',true);

insert into public.peer_support_requests(id,student_name,year_group,contact_email,category,preferred_date,preferred_time,preferred_periods,private_explanation) values
 ('81111111-1111-4111-8111-111111111111','Student A','Year 9','student-a@example.invalid','Friendships',current_date+5,'Break',array['break','lunch_1'],'Private A'),
 ('82222222-2222-4222-8222-222222222222','Student B','Year 10','student-b@example.invalid','Wellbeing',current_date+5,'Break',array['break'],'Private B'),
 ('83333333-3333-4333-8333-333333333333','Student C','Year 11','student-c@example.invalid','Settling in',current_date+6,'2nd Lunch',array['lunch_2'],'Private C'),
 ('84444444-4444-4444-8444-444444444444','Student D','Year 12','p5-peer-two@example.invalid','Something else',current_date+7,'Break',array['break'],'Private D');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select * from public.peer_support_requests$$,'42501',null,'requests stay private');
select throws_ok($$select * from public.peer_confirmation_email_outbox$$,'42501',null,'outbox stays private');
select throws_ok($$select * from public.claim_confirmation_email_jobs('wrong',gen_random_uuid(),10,120)$$,'42501',null,'dispatcher secret is required');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"75555555-5555-4555-8555-555555555555","role":"authenticated"}',true);
select throws_ok($$select * from public.list_available_peer_requests()$$,'42501',null,'student cannot read supporter queue');
select throws_ok($$select * from public.teacher_assign_peer_request('81111111-1111-4111-8111-111111111111','71111111-1111-4111-8111-111111111111')$$,'42501',null,'student cannot assign');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select is(
 (select array_agg(field order by field) from (select distinct jsonb_object_keys(to_jsonb(queue)) field from public.list_available_peer_requests() queue) fields),
 array['category','dismissed','preferred_date','preferred_periods','preferred_time','private_explanation','request_id','stale','student_name','submitted_at','year_group']::text[],
 'approved queue exposes required request detail but not email');
select ok(public.dismiss_peer_request('82222222-2222-4222-8222-222222222222'),'supporter can pass');
select ok((select dismissed from public.list_available_peer_requests(true) where request_id='82222222-2222-4222-8222-222222222222'),'pass is visible to that supporter');
select ok(public.undo_dismiss_peer_request('82222222-2222-4222-8222-222222222222'),'supporter can undo pass');
select is((select outcome||':'||success from public.claim_peer_request('81111111-1111-4111-8111-111111111111')),'accepted:true','self claim assigns without confirmation');

reset role;
select ok((select status='accepted' and assignment_method='self_claim' and assigned_by=assigned_mentor_id from public.peer_support_requests where id='81111111-1111-4111-8111-111111111111'),'claim records atomic assignment');
select is((select count(*) from public.peer_sessions where request_id='81111111-1111-4111-8111-111111111111'),0::bigint,'claim creates no meeting');
select is((select count(*) from public.peer_confirmation_email_outbox where request_id='81111111-1111-4111-8111-111111111111'),0::bigint,'claim creates no email');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"74444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
select ok(public.save_peer_support_settings('Approved test location','74444444-4444-4444-8444-444444444444',array[1,2,3,4,5,6,7]::smallint[],'10:00','10:20','12:00','12:30','13:00','13:30'),'Teacher configures approved schedule');
select is((select count(*) from public.list_teacher_candidates()),1::bigint,'only active Teacher is a supervisor candidate');
select is((select count(*) from public.list_peer_supporter_candidates('82222222-2222-4222-8222-222222222222')),3::bigint,'Teacher sees active supporters');
select is((select outcome||':'||success from public.teacher_assign_peer_request('82222222-2222-4222-8222-222222222222','73333333-3333-4333-8333-333333333333')),'assigned:true','Teacher assigns an open request');

reset role;
select ok((select status='accepted' and assignment_method='teacher_assignment' and assigned_by='74444444-4444-4444-8444-444444444444' from public.peer_support_requests where id='82222222-2222-4222-8222-222222222222'),'Teacher assignment audit fields persist');
select is((select count(*) from public.peer_confirmation_email_outbox where request_id='82222222-2222-4222-8222-222222222222'),0::bigint,'Teacher assignment creates no email');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select ok((select ready from public.preview_peer_request_confirmation('81111111-1111-4111-8111-111111111111') where period='break'),'assigned supporter can preview requested period');
select is((select outcome||':'||success from public.confirm_peer_meeting('81111111-1111-4111-8111-111111111111','lunch_2')),'period_not_requested:false','unrequested period is blocked');
select is((select outcome||':'||success from public.confirm_peer_meeting('81111111-1111-4111-8111-111111111111','break')),'confirmed:true','assigned supporter confirms meeting');

reset role;
select ok((select status='scheduled' from public.peer_support_requests where id='81111111-1111-4111-8111-111111111111'),'confirmed meeting becomes scheduled');
select ok((select period='break' and student_email_snapshot='student-a@example.invalid' and supervisor_teacher_id='74444444-4444-4444-8444-444444444444' from public.peer_sessions where request_id='81111111-1111-4111-8111-111111111111'),'meeting snapshots period, student and supervisor');
select is((select count(*) from public.peer_confirmation_events where request_id='81111111-1111-4111-8111-111111111111'),1::bigint,'one confirmation event exists');
select is((select count(*) from public.peer_confirmation_email_outbox where request_id='81111111-1111-4111-8111-111111111111'),3::bigint,'exactly three delivery rows exist');
select is((select array_agg(recipient_kind order by recipient_kind) from public.peer_confirmation_email_outbox where request_id='81111111-1111-4111-8111-111111111111'),array['mentor','student','teacher']::text[],'delivery roles are student, supporter and Teacher');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select is((select outcome||':'||success from public.confirm_peer_meeting('81111111-1111-4111-8111-111111111111','break')),'already_confirmed:true','repeat confirm is idempotent');
select is_empty($$select * from public.get_my_peer_case('82222222-2222-4222-8222-222222222222')$$,'other supporter case detail stays inaccessible');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"72222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select is((select outcome||':'||success from public.claim_peer_request('84444444-4444-4444-8444-444444444444')),'self_assignment_blocked:false','supporter cannot claim own request');

reset role;
select * from finish();
rollback;
