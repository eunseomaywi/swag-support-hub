begin;
select no_plan();

select has_table('public','peer_support_requests','requests table remains');
select has_table('public','peer_sessions','legacy sessions table remains');
select has_table('public','peer_mentor_availability','legacy availability rows remain preserved');
select has_table('public','peer_support_settings','school settings exist');
select has_table('public','peer_confirmation_events','confirmation events exist');
select has_table('public','peer_confirmation_email_outbox','recipient outbox exists');
select has_table('public','peer_confirmation_webhook_events','verified webhook replay ledger exists');
select has_column('public','peer_support_requests','preferred_periods','multiple periods are stored');
select has_column('public','peer_sessions','schedule_version','session snapshot version exists');
select hasnt_column('public','peer_confirmation_email_outbox','cc','outbox has no cc relay field');
select hasnt_column('public','peer_confirmation_email_outbox','bcc','outbox has no bcc relay field');

insert into auth.users(id,email,raw_user_meta_data) values
 ('71111111-1111-4111-8111-111111111111','p5-peer-one@example.invalid','{"full_name":"Peer One"}'),
 ('72222222-2222-4222-8222-222222222222','p5-peer-two@example.invalid','{"full_name":"Peer Two"}'),
 ('73333333-3333-4333-8333-333333333333','p5-swag@example.invalid','{"full_name":"SWAG One"}'),
 ('74444444-4444-4444-8444-444444444444','p5-teacher@example.invalid','{"full_name":"Teacher One"}'),
 ('75555555-5555-4555-8555-555555555555','p5-student@example.invalid','{"full_name":"Student"}');
update public.profiles set role='peer_mentor' where id in ('71111111-1111-4111-8111-111111111111','72222222-2222-4222-8222-222222222222');
update public.profiles set role='swag_member' where id='73333333-3333-4333-8333-333333333333';
update public.profiles set role='teacher' where id='74444444-4444-4444-8444-444444444444';

insert into public.peer_support_requests(id,student_name,year_group,contact_email,category,preferred_date,preferred_time,preferred_periods,private_explanation) values
 ('81111111-1111-4111-8111-111111111111','Student A','Year 9','student-a@example.invalid','Friendships',current_date+5,'Break',array['break','lunch_1'],'Private A'),
 ('82222222-2222-4222-8222-222222222222','Student B','Year 10','student-b@example.invalid','Wellbeing',current_date+5,'Break',array['break'],'Private B'),
 ('83333333-3333-4333-8333-333333333333','Student C','Year 11','student-c@example.invalid','Settling in',current_date+6,'2nd Lunch',array['lunch_2'],'Private C'),
 ('84444444-4444-4444-8444-444444444444','Student D','Year 12','p5-peer-two@example.invalid','Something else',current_date+7,'Break',array['break'],'Private D');
insert into public.peer_request_access_tokens(request_id,token_hash,expires_at) values
 ('81111111-1111-4111-8111-111111111111',extensions.digest(repeat('a',64),'sha256'),now()+interval '30 days');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select * from public.peer_support_requests$$,'42501',null,'base requests stay private');
select throws_ok($$select * from public.peer_confirmation_email_outbox$$,'42501',null,'outbox stays private');
select throws_ok($$select * from public.claim_confirmation_email_jobs('wrong',gen_random_uuid(),10,120)$$,'42501',null,'dispatcher secret is required');
select throws_ok($$select * from public.record_confirmation_email_webhook('wrong','event','message','email.delivered',now())$$,'42501',null,'webhook database write requires internal credential');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"75555555-5555-4555-8555-555555555555","role":"authenticated"}',true);
select throws_ok($$select * from public.list_available_peer_requests()$$,'42501',null,'student cannot read mentor queue');
select throws_ok($$select * from public.confirm_and_accept_peer_request('81111111-1111-4111-8111-111111111111','break')$$,'42501',null,'student cannot confirm');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select is(
 (select array_agg(field order by field) from (select distinct jsonb_object_keys(to_jsonb(queue)) field from public.list_available_peer_requests() queue) fields),
 array['category','dismissed','preferred_date','preferred_periods','preferred_time','request_id','stale','submitted_at']::text[],
 'open queue returns only approved non-identifying fields');
select ok((select not ready and readiness_issue='supervisor_teacher_missing' from public.preview_peer_request_confirmation('81111111-1111-4111-8111-111111111111') where period='break'),'missing school settings are explicit');
select is((select outcome || ':' || success from public.claim_peer_request('81111111-1111-4111-8111-111111111111')),'mentor_confirmation_required:false','legacy claim cannot create time-less acceptance');
select throws_ok($$select public.create_peer_availability(now()+interval '1 day',now()+interval '2 days','Break','Room')$$,'0A000',null,'individual availability creation is retired');
select is_empty($$select * from public.list_peer_request_slots(repeat('a',64))$$,'student slot selection returns no slots');
select is((select outcome || ':' || success from public.schedule_peer_session(repeat('a',64),gen_random_uuid())),'mentor_confirmation_required:false','legacy slot scheduling cannot overwrite new flow');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"74444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
select throws_ok($$select * from public.confirm_and_accept_peer_request('81111111-1111-4111-8111-111111111111','break')$$,'42501',null,'Teacher cannot join the mentor claim pool');
select ok(public.save_peer_support_settings('Approved test location','74444444-4444-4444-8444-444444444444',array[1,2,3,4,5,6,7]::smallint[],'10:00','10:20','12:00','12:30','13:00','13:30'),'Teacher can configure test schedule');
select ok((select schedule_ready from public.get_peer_support_settings()),'complete schedule is ready');
select is((select count(*) from public.list_teacher_candidates()),1::bigint,'only approved Teacher profiles are candidates');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select throws_ok($$select * from public.confirm_and_accept_peer_request('81111111-1111-4111-8111-111111111111','lunch_2')$$,'22023',null,'mentor cannot choose an unselected period');
select is((select outcome || ':' || success from public.confirm_and_accept_peer_request('81111111-1111-4111-8111-111111111111','break')),'confirmed:true','Peer Mentor confirms and accepts atomically');
reset role;
select ok((select status='accepted' and assigned_mentor_id='71111111-1111-4111-8111-111111111111' from public.peer_support_requests where id='81111111-1111-4111-8111-111111111111'),'new accepted means assigned with exact time');
select ok((select slot_id is null and period='break' and time_label='Break' and location='Approved test location' and display_timezone='Asia/Seoul' and supervisor_teacher_id='74444444-4444-4444-8444-444444444444' from public.peer_sessions where request_id='81111111-1111-4111-8111-111111111111'),'session snapshots school schedule and location without availability slot');
select is((select count(*) from public.peer_confirmation_events where request_id='81111111-1111-4111-8111-111111111111' and event_type='PEER_SESSION_CONFIRMED'),1::bigint,'exactly one confirmation event exists');
select is((select count(*) from public.peer_confirmation_email_outbox where request_id='81111111-1111-4111-8111-111111111111'),3::bigint,'exactly three recipient jobs exist');
select is((select array_agg(recipient_kind order by recipient_kind) from public.peer_confirmation_email_outbox where request_id='81111111-1111-4111-8111-111111111111'),array['mentor','student','teacher']::text[],'student, assigned mentor, designated Teacher are the only recipients');
select is((select count(*) from public.peer_confirmation_email_outbox where recipient_address in ('p5-peer-one@example.invalid','p5-teacher@example.invalid','student-a@example.invalid')),3::bigint,'trusted stored addresses determine recipients');
select is((select count(*) from public.peer_confirmation_email_outbox where recipient_address in ('p5-peer-two@example.invalid','p5-swag@example.invalid')),0::bigint,'other mentors and SWAG Members receive nothing');
select is((select count(*) from public.peer_confirmation_email_outbox where notification_kind<>'PEER_SESSION_CONFIRMED'),0::bigint,'no reminder or other email kind exists');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select is((select outcome || ':' || success from public.confirm_and_accept_peer_request('81111111-1111-4111-8111-111111111111','break')),'already_confirmed:true','retry returns the existing event');
reset role;
select is((select count(*) from public.peer_confirmation_events where request_id='81111111-1111-4111-8111-111111111111'),1::bigint,'retry creates no duplicate event');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select is((select outcome || ':' || success from public.confirm_and_accept_peer_request('82222222-2222-4222-8222-222222222222','break')),'mentor_conflict:false','same mentor cannot accept an overlapping appointment');
reset role;
select is((select count(*) from public.peer_confirmation_email_outbox where request_id='82222222-2222-4222-8222-222222222222'),0::bigint,'failed transaction creates no outbox');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"73333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select is((select outcome || ':' || success from public.confirm_and_accept_peer_request('83333333-3333-4333-8333-333333333333','lunch_2')),'confirmed:true','SWAG Member has full peer confirmation capability');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"72222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select is((select outcome || ':' || success from public.confirm_and_accept_peer_request('84444444-4444-4444-8444-444444444444','break')),'confirmed:true','second Peer Mentor confirms another date');
reset role;
select is((select count(*) from public.peer_confirmation_email_outbox where request_id='84444444-4444-4444-8444-444444444444'),2::bigint,'duplicate real address is sent once without creating three copies');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"72222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select ok(not public.complete_my_peer_case('84444444-4444-4444-8444-444444444444'),'future appointment cannot be completed');
select ok(not public.mark_peer_case_no_show('84444444-4444-4444-8444-444444444444'),'future appointment cannot be marked no-show');
select ok(public.cancel_my_peer_session('84444444-4444-4444-8444-444444444444'),'assigned mentor can cancel');

reset role;
select is((select count(*) from public.peer_confirmation_email_outbox where request_id='84444444-4444-4444-8444-444444444444' and status='suppressed'),2::bigint,'cancellation suppresses only unsent confirmation jobs');
select is((select count(*) from public.peer_confirmation_email_outbox),8::bigint,'cancellation and other status changes generate no additional email jobs');
select ok((select revoked_at is not null from public.peer_request_access_tokens where request_id='81111111-1111-4111-8111-111111111111') is false,'unrelated student token remains active');
select is((select count(*) from public.peer_confirmation_events where request_id='82222222-2222-4222-8222-222222222222'),0::bigint,'legacy data and failed confirmations are never backfilled as email events');

select * from finish();
rollback;
