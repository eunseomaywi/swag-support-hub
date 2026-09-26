begin;
select no_plan();
-- Synthetic fixtures only; the whole test transaction rolls back.
insert into auth.users(id,email) values
 ('b1000000-0000-4000-8000-000000000001','delete-teacher@example.invalid'),
 ('b1000000-0000-4000-8000-000000000002','delete-mentor@example.invalid'),
 ('b1000000-0000-4000-8000-000000000003','delete-swag@example.invalid'),
 ('b1000000-0000-4000-8000-000000000004','delete-student@example.invalid'),
 ('b1000000-0000-4000-8000-000000000005','delete-inactive@example.invalid');
select public.admin_set_staff_registration('b1000000-0000-4000-8000-000000000001','teacher',true);
select public.admin_set_staff_registration('b1000000-0000-4000-8000-000000000002','peer_mentor',true);
select public.admin_set_staff_registration('b1000000-0000-4000-8000-000000000003','swag_member',true);
select public.admin_set_staff_registration('b1000000-0000-4000-8000-000000000005','teacher',false);
insert into public.peer_support_requests(id,student_name,year_group,contact_email,category,preferred_date,preferred_time,preferred_periods,private_explanation)
select ('b2000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'학생 입력 그대로','Year 9',
 case when i in (3,6) then 'shared-student@example.invalid' else 'delete-'||i||'@example.invalid' end,
 'Friendships',(now() at time zone 'Asia/Seoul')::date+8,'Break',array['break','lunch_1'],'상담 내용 보존'
 from generate_series(1,6) i;
insert into public.peer_request_access_tokens(request_id,token_hash,expires_at)
 values('b2000000-0000-4000-8000-000000000001',extensions.digest(repeat('a',64),'sha256'),now()+interval '30 days');

set local role anon;
select throws_ok($$select public.teacher_delete_peer_request('b2000000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous delete denied');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000004","role":"authenticated","teacher":true}',true);
select throws_ok($$select public.teacher_delete_peer_request('b2000000-0000-4000-8000-000000000001')$$,'42501',null,'student cannot spoof Teacher');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.teacher_delete_peer_request('b2000000-0000-4000-8000-000000000001')$$,'42501',null,'Peer Mentor delete denied');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.teacher_delete_peer_request('b2000000-0000-4000-8000-000000000001')$$,'42501',null,'SWAG delete denied');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select throws_ok($$select public.teacher_delete_peer_request('b2000000-0000-4000-8000-000000000001')$$,'42501',null,'inactive Teacher delete denied');
reset role;
select is((select count(*) from public.peer_support_requests where deleted_at is not null),0::bigint,'denied deletes have no effect');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok(public.save_peer_support_settings('Fixture room','b1000000-0000-4000-8000-000000000001',array[1,2,3,4,5,6,7]::smallint[],'10:00','10:20','12:00','12:30','13:00','13:30'),'fixture schedule ready');
select ok((select success from public.teacher_assign_peer_request('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000003')),'nondeleted Resend event generated normally');
select ok((select success from public.teacher_assign_peer_request('b2000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002')),'assign scheduled fixture');
select ok((select success from public.teacher_assign_peer_request('b2000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000003')),'assign sent history fixture');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok((select success from public.confirm_peer_meeting('b2000000-0000-4000-8000-000000000003','break')),'scheduled fixture confirmed');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select ok((select success from public.confirm_peer_meeting('b2000000-0000-4000-8000-000000000004','lunch_1')),'second confirmed fixture');
reset role;
update public.peer_confirmation_email_outbox set status='submitted',provider_message_id='fixture-provider-'||recipient_kind where request_id='b2000000-0000-4000-8000-000000000004';
-- Simulate a leased but not-yet-sent job, and an in-flight assignment send.
update public.peer_confirmation_email_outbox set status='processing',lease_owner='b3000000-0000-4000-8000-000000000001',lease_expires_at=now()+interval '1 minute',attempt_count=1
 where request_id='b2000000-0000-4000-8000-000000000003' and recipient_kind='mentor';
update public.peer_assignment_email_outbox set status='processing',lease_owner='b3000000-0000-4000-8000-000000000001',lease_expires_at=now()+interval '1 minute',first_attempt_at=now()
 where request_id='b2000000-0000-4000-8000-000000000002';
update public.peer_assignment_email_outbox set status='processing',lease_owner='b3000000-0000-4000-8000-000000000001',lease_expires_at=now()+interval '1 minute',first_attempt_at=now()
 where request_id='b2000000-0000-4000-8000-000000000004';
insert into public.peer_escalation_access(request_id,profile_id,granted_by)
 values('b2000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok(public.teacher_delete_peer_request('b2000000-0000-4000-8000-000000000001'),'valid Teacher deletes');
select ok(public.teacher_delete_peer_request('b2000000-0000-4000-8000-000000000001'),'repeat is idempotent');
select ok(public.teacher_delete_peer_request('b2000000-0000-4000-8000-000000000002'),'delete assigned fixture');
select ok(public.teacher_delete_peer_request('b2000000-0000-4000-8000-000000000003'),'delete scheduled fixture');
select ok(public.teacher_delete_peer_request('b2000000-0000-4000-8000-000000000004'),'delete fixture with sent history');
select is((public.list_teacher_peer_requests_v2('all',30,0)->>'total')::integer,2,'All requests total excludes deleted');
select is(jsonb_array_length(public.list_teacher_peer_requests_v2('all',30,0)->'rows'),2,'page rows exclude deleted before pagination');
select is(jsonb_array_length(public.list_teacher_peer_requests_v2('all',30,30)->'rows'),0,'last page can shrink safely');
select is((select open_count from public.get_teacher_peer_support_counts()),2::bigint,'Teacher counts exclude deleted');
select is((select count(*) from public.list_teacher_peer_support_overview()),2::bigint,'legacy Teacher overview excluded');
select ok(public.set_peer_assignment_policy(36),'school assignment settings remain usable after earliest request deletion');
select ok(public.get_teacher_peer_request('b2000000-0000-4000-8000-000000000003') is null,'stale Teacher request private');
reset role;
select is((select count(*) from public.peer_support_requests),6::bigint,'all records retained');
select is((select count(*) from public.peer_support_requests where deleted_by='b1000000-0000-4000-8000-000000000001'),4::bigint,'real authenticated Teacher recorded');
select is((select count(*) from public.peer_support_actions where action='request_deleted'),4::bigint,'one audit per delete, no duplicates');
select ok((select bool_and(private_explanation='상담 내용 보존') from public.peer_support_requests),'user Korean input preserved');
select is((select status::text from public.peer_support_requests where id='b2000000-0000-4000-8000-000000000003'),'scheduled','delete is not cancellation');
select is((select count(*) from public.peer_sessions),2::bigint,'session history retained');
select is((select count(*) from public.peer_sessions where status='confirmed' and request_deleted_at is not null),2::bigint,'session status preserved, active reservation retired');
select is((select count(*) from public.peer_confirmation_events),2::bigint,'confirmation events retained');
select is((select count(*) from public.peer_escalation_access),1::bigint,'protected escalation access history retained');
select is((select count(*) from public.peer_confirmation_email_outbox),6::bigint,'no deletion emails generated');
select is((select count(*) from public.peer_confirmation_email_outbox where status='submitted'),3::bigint,'real provider history unchanged');
select is((select count(*) from public.peer_confirmation_email_outbox where status='suppressed'),2::bigint,'unstarted confirmation jobs suppressed');
select is((select count(*) from public.peer_assignment_email_outbox),3::bigint,'delete adds no assignment events');
select throws_ok($$update public.peer_support_requests set category='Wellbeing' where id='b2000000-0000-4000-8000-000000000001'$$,'55000',null,'even privileged ordinary mutation blocked on deleted request');
select throws_ok($$update public.peer_sessions set status='cancelled' where request_id='b2000000-0000-4000-8000-000000000003'$$,'55000',null,'retired session mutation blocked');
select throws_ok($$insert into public.peer_request_dismissals(request_id,mentor_id) values('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002')$$,'55000',null,'stale child preference insertion blocked');
select ok(public.get_teacher_peer_meeting((select id from public.peer_sessions where request_id='b2000000-0000-4000-8000-000000000003')) is null,'stale meeting unavailable');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.list_available_peer_requests()),2::bigint,'mentor queue excludes deleted');
select is((select available_count from public.get_peer_dashboard_counts()),2::bigint,'mentor count excludes deleted');
select is((select my_upcoming_session_count from public.get_peer_dashboard_counts()),0::bigint,'upcoming count excludes retired');
select is((select count(*) from public.list_my_peer_sessions()),0::bigint,'active booking list excludes retired');
select is((select count(*) from public.list_my_peer_cases()),0::bigint,'my cases exclude deleted');
select ok(public.get_my_peer_case_detail('b2000000-0000-4000-8000-000000000003') is null,'stale supporter detail unavailable');
select is((select success from public.claim_peer_request('b2000000-0000-4000-8000-000000000001')),false,'claim deleted denied');
select is((select success from public.confirm_peer_meeting('b2000000-0000-4000-8000-000000000003','break')),false,'schedule deleted denied');
select is(public.cancel_my_peer_session('b2000000-0000-4000-8000-000000000003'),false,'ordinary cancellation deleted denied');
select is(public.dismiss_peer_request('b2000000-0000-4000-8000-000000000001'),false,'dismiss deleted denied');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.list_available_peer_requests()),2::bigint,'SWAG queue excludes deleted');
select is((select available_count from public.get_peer_dashboard_counts()),2::bigint,'SWAG counts exclude deleted');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select success from public.teacher_assign_peer_request('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002')),false,'assignment deleted denied');
select is((select success from public.teacher_reassign_peer_request('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002')),false,'reassignment deleted denied');
select ok((select success from public.teacher_assign_peer_request('b2000000-0000-4000-8000-000000000006','b1000000-0000-4000-8000-000000000002')),'nondeleted assignment still works');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok((select success from public.confirm_peer_meeting('b2000000-0000-4000-8000-000000000006','break')),'retired supporter/student reservations no longer block same slot');
reset role;
select is((select count(*) from public.peer_confirmation_email_outbox where request_id='b2000000-0000-4000-8000-000000000006'),3::bigint,'nondeleted confirmation still creates original three recipients');
set local role anon;
select is((select count(*) from public.get_peer_request_management_v2(repeat('a',64))),0::bigint,'student stale token reveals no content');
select is((select success from public.cancel_peer_request(repeat('a',64))),false,'student stale cancel blocked');
reset role;

-- Replace the stored dispatcher hash with a public fixture hash only inside this
-- rollback transaction; never read a runtime Secret or change remote configuration.
do $$ declare f record; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('prepare_confirmation_email_send','get_peer_request_management_internal') loop
  execute replace(pg_get_functiondef(f.oid),'362b81c16c8f0c831b5ed94530bb81d2edba81f86640bc4cea5e3aa3e2a6793d',encode(extensions.digest('isolated-delete-fixture','sha256'),'hex'));
 end loop;
end $$;
select is(public.prepare_confirmation_email_send('isolated-delete-fixture',
 (select id from public.peer_confirmation_email_outbox where request_id='b2000000-0000-4000-8000-000000000003' and recipient_kind='mentor'),
 'b3000000-0000-4000-8000-000000000001'),false,'leased job deletion rechecked immediately before send');
select is((select count(*) from public.peer_confirmation_email_outbox where request_id='b2000000-0000-4000-8000-000000000003' and status='suppressed'),3::bigint,'leased unsent confirmation suppressed');
select ok(public.prepare_assignment_email((select event_id from public.peer_assignment_email_outbox where request_id='b2000000-0000-4000-8000-000000000002'),
 'b3000000-0000-4000-8000-000000000001','{}') is null,'Resend prepare rejects deleted request');
select is((select status from public.peer_assignment_email_outbox where request_id='b2000000-0000-4000-8000-000000000002'),'superseded','leased unsent Resend superseded');
select ok(public.finish_assignment_email((select event_id from public.peer_assignment_email_outbox where request_id='b2000000-0000-4000-8000-000000000004'),
 'b3000000-0000-4000-8000-000000000001','accepted','fixture-in-flight-provider-id'),'already-started send can record actual provider result after deletion');
select is((select status from public.peer_assignment_email_outbox where request_id='b2000000-0000-4000-8000-000000000004'),'provider-accepted','in-flight acceptance history is not erased or falsely recalled');
select * from finish();
rollback;
