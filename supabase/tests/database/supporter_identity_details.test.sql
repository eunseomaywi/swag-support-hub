begin;
select no_plan();
insert into auth.users(id,email) values
 ('91000000-0000-4000-8000-000000000001','identity-swag@example.invalid'),
 ('91000000-0000-4000-8000-000000000002','identity-mentor@example.invalid'),
 ('91000000-0000-4000-8000-000000000003','identity-teacher@example.invalid'),
 ('91000000-0000-4000-8000-000000000004','identity-student@example.invalid');
select public.admin_set_staff_registration('91000000-0000-4000-8000-000000000001','swag_member',true);
select public.admin_set_staff_registration('91000000-0000-4000-8000-000000000002','peer_mentor',true);
select public.admin_set_staff_registration('91000000-0000-4000-8000-000000000003','teacher',true);
insert into public.peer_support_requests(id,student_name,year_group,contact_email,category,preferred_date,preferred_time,preferred_periods,private_explanation) values
 ('92000000-0000-4000-8000-000000000001','TEST Student','Year 9','identity-child@example.invalid','Friendships',current_date+8,'Break',array['break','lunch_1'],'TEST only'),
 ('92000000-0000-4000-8000-000000000002','TEST Assigned','Year 10','identity-child2@example.invalid','Friendships',current_date+9,'Break',array['break'],'TEST only');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.save_my_staff_profile('  TEST Shared Name  ','Year 12')->>'full_name','TEST Shared Name','own profile is trimmed and persisted');
select throws_ok($$select public.save_my_staff_profile('<b>name</b>','Year 12')$$,'22023',null,'HTML name rejected');
select throws_ok($$update public.profiles set full_name='<b>x</b>' where id=auth.uid()$$,'22023',null,'legacy name update is also validated');
select throws_ok($$select public.save_my_staff_profile('Name','Year 99')$$,'22023',null,'invalid year rejected');
select throws_ok($$select public.save_my_staff_profile('Name',null)$$,'22023',null,'supporter year required for profile save');
select throws_ok($$update public.profiles set role='teacher' where id=auth.uid()$$,'42501',null,'profile cannot elevate role');
select throws_ok($$update public.profiles set year_group='Year 13' where id=auth.uid()$$,'42501',null,'year write requires validated RPC');
select throws_ok($$select public.admin_set_staff_registration(auth.uid(),'teacher',true)$$,'42501',null,'user cannot approve own registration');
select throws_ok($$select public.teacher_save_supporter_profile('91000000-0000-4000-8000-000000000002','Attacker','Year 12')$$,'42501',null,'non Teacher cannot edit another identity');
select throws_ok($$select public.get_teacher_peer_request('92000000-0000-4000-8000-000000000001')$$,'42501',null,'SWAG cannot access Teacher detail');
select throws_ok($$select public.list_support_team()$$,'42501',null,'SWAG cannot list staff directory');
select is((select count(*) from public.list_available_peer_requests()),2::bigint,'SWAG available requests works');
select ok(public.dismiss_peer_request('92000000-0000-4000-8000-000000000001'),'SWAG pass');
select ok(public.undo_dismiss_peer_request('92000000-0000-4000-8000-000000000001'),'SWAG undo');
select ok((select success from public.claim_peer_request('92000000-0000-4000-8000-000000000001')),'SWAG self-claim');
select is(public.get_my_peer_case_detail('92000000-0000-4000-8000-000000000001')->>'supporter_role','swag_member','own case has actual role');
select is(public.get_my_peer_case_detail('92000000-0000-4000-8000-000000000001')->>'supporter_year_group','Year 12','own case has year');
select is(public.get_my_peer_case_detail('92000000-0000-4000-8000-000000000002'),null::jsonb,'unassigned private case inaccessible');
reset role;
select is((select count(*) from public.peer_confirmation_email_outbox),0::bigint,'claim/profile changes send no emails');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.save_my_staff_profile('TEST Teacher')->>'full_name','TEST Teacher','Teacher saves without year');
select ok(public.teacher_save_supporter_profile('91000000-0000-4000-8000-000000000002','TEST Shared Name','Year 11'),'Teacher corrects registered supporter');
select is((select count(*) from public.list_support_team() t where t->>'supporter_name'='TEST Shared Name'),2::bigint,'same names keep separate UUID identities');
select ok(public.save_peer_support_settings('TEST Room','91000000-0000-4000-8000-000000000003',array[1,2,3,4,5,6,7]::smallint[],'10:00','10:20','12:00','12:30','13:00','13:30'),'school setup ready');
select is((select count(*) from public.list_peer_supporter_candidates_v2('92000000-0000-4000-8000-000000000002')),2::bigint,'candidate v2 includes both supporter roles');
select is(public.list_teacher_peer_requests_v2('all',1,1)->>'total','2','Teacher list paginates after filtering');
select is(public.get_teacher_peer_request('92000000-0000-4000-8000-000000000001')->>'supporter_name','TEST Shared Name','ID detail works independently of list page');
select ok((select success from public.teacher_assign_peer_request('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001')),'Teacher assigns SWAG');
reset role;
select is((select count(*) from public.peer_confirmation_email_outbox),0::bigint,'Teacher assign sends no email');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok((select ready from public.preview_peer_request_confirmation('92000000-0000-4000-8000-000000000001') where period='break'),'SWAG confirmation preview ready');
select ok((select success from public.confirm_peer_meeting('92000000-0000-4000-8000-000000000001','break')),'SWAG meeting confirms');
select ok((select success from public.confirm_peer_meeting('92000000-0000-4000-8000-000000000001','break')),'confirm retry is idempotent');
select ok(public.save_my_staff_profile('TEST Changed Name','Year 13') is not null,'later identity changes allowed');
select ok(not public.mark_peer_case_no_show('92000000-0000-4000-8000-000000000001'),'future no-show blocked');
reset role;
select is((select count(*) from public.peer_confirmation_email_outbox),3::bigint,'confirm retry and profile edits still exactly 3 jobs');
select is((select identity_snapshot->>'supporter_name' from public.peer_confirmation_events),'TEST Shared Name','confirmation name immutable across later profile edit');
select is((select identity_snapshot->>'supporter_year_group' from public.peer_confirmation_events),'Year 12','confirmation year immutable');
select is((select identity_snapshot->>'supporter_role' from public.peer_confirmation_events),'swag_member','confirmation actual role saved');
select throws_ok($$update public.peer_confirmation_events set identity_snapshot='{}'$$,'22023',null,'snapshot cannot be silently overwritten');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_teacher_peer_request('92000000-0000-4000-8000-000000000001')->'confirmation_identity'->>'supporter_name','TEST Shared Name','Teacher detail preserves confirmation snapshot');
reset role;
-- Isolated elapsed session, no production clock/state edits.
update public.peer_sessions set scheduled_start=now()-interval '2 hours',scheduled_end=now()-interval '1 hour';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok(public.mark_peer_case_no_show('92000000-0000-4000-8000-000000000001'),'legitimate elapsed no-show no longer raises 23514');
reset role;
select is((select count(*) from public.peer_confirmation_email_outbox),3::bigint,'no-show creates no email');
update public.profiles set role='peer_mentor' where id='91000000-0000-4000-8000-000000000001';
select ok((select staff_type='peer_mentor' and not booking_enabled from public.staff_members where profile_id='91000000-0000-4000-8000-000000000001'),'trusted role change aligns type but requires explicit reapproval');
set local role anon;
select throws_ok($$select public.get_teacher_peer_request('92000000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous cannot access internal detail');
select throws_ok($$select public.claim_confirmation_email_jobs_v2('wrong',gen_random_uuid())$$,'42501',null,'v2 dispatcher still secret-gated');
reset role;
select * from finish();
rollback;
