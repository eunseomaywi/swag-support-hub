import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
// Fixed isolated container. This script cannot accept a production database URL.
const args = [
  "exec",
  "-i",
  "supabase_db_swag-assignment-isolated",
  "psql",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-Atq",
  "-v",
  "ON_ERROR_STOP=1",
];
const sql = (query) =>
  execFileSync("docker", args, {
    input: query,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const run = promisify(execFile);
const parallel = async (query) =>
  (await run("docker", [...args, "-c", query], { encoding: "utf8" })).stdout.trim();
const teacher = randomUUID(),
  peer = randomUUID(),
  swag = randomUUID();
const requests = Array.from({ length: 12 }, () => randomUUID());
const asUser = (id, query) =>
  `begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',true);${query};commit;`;
const initialSettings = sql("select to_jsonb(s) from public.peer_support_settings s;");
const initialPeriods = sql("select jsonb_agg(p) from public.peer_support_periods p;");
try {
  sql(`insert into auth.users(id,email) values ('${teacher}','delete-race-teacher@example.invalid'),('${peer}','delete-race-peer@example.invalid'),('${swag}','delete-race-swag@example.invalid');
 select public.admin_set_staff_registration('${teacher}','teacher',true);select public.admin_set_staff_registration('${peer}','peer_mentor',true);select public.admin_set_staff_registration('${swag}','swag_member',true);
 insert into public.peer_support_requests(id,student_name,year_group,contact_email,category,preferred_date,preferred_time,preferred_periods)
 values ${requests.map((id, i) => `('${id}','ISOLATED DELETE RACE','Year 9','fixture-${i}@example.invalid','Friendships',current_date+${i + 8},'Break',array['break'])`).join(",")};`);
  for (const id of requests.slice(0, 8)) {
    await Promise.all([
      parallel(asUser(teacher, `select public.teacher_delete_peer_request('${id}')`)),
      parallel(asUser(peer, `select success from public.claim_peer_request('${id}')`)),
      parallel(
        asUser(
          teacher,
          `select success from public.teacher_assign_peer_request('${id}','${swag}')`,
        ),
      ),
    ]);
    const row = JSON.parse(
      sql(
        `select jsonb_build_object('deleted',deleted_at is not null,'actor',deleted_by,'active',(select count(*) from public.peer_active_requests where id=r.id),'pending',(select count(*) from public.peer_assignment_email_outbox where request_id=r.id and status in ('pending','processing')),'audit',(select count(*) from public.peer_support_actions where request_id=r.id and action='request_deleted')) from public.peer_support_requests r where id='${id}';`,
      ),
    );
    assert.equal(row.deleted, true);
    assert.equal(row.actor, teacher);
    assert.equal(row.active, 0);
    assert.equal(row.pending, 0);
    assert.equal(row.audit, 1);
  }
  sql(
    asUser(
      teacher,
      `select public.save_peer_support_settings('Isolated fixture room','${teacher}',array[1,2,3,4,5,6,7]::smallint[],'10:00','10:20','12:00','12:30','13:00','13:30')`,
    ),
  );
  for (const id of requests.slice(8)) {
    sql(asUser(peer, `select success from public.claim_peer_request('${id}')`));
    await Promise.all([
      parallel(asUser(peer, `select success from public.confirm_peer_meeting('${id}','break')`)),
      parallel(asUser(teacher, `select public.teacher_delete_peer_request('${id}')`)),
    ]);
    const row = JSON.parse(
      sql(
        `select jsonb_build_object('deleted',deleted_at is not null,'active_sessions',(select count(*) from public.peer_active_sessions where request_id=r.id),'live_emails',(select count(*) from public.peer_confirmation_email_outbox where request_id=r.id and status in ('queued','processing','retrying')),'events',(select count(*) from public.peer_confirmation_events where request_id=r.id),'sessions',(select count(*) from public.peer_sessions where request_id=r.id),'retired',(select count(*) from public.peer_sessions where request_id=r.id and request_deleted_at is not null)) from public.peer_support_requests r where id='${id}';`,
      ),
    );
    assert.equal(row.deleted, true);
    assert.equal(row.active_sessions, 0);
    assert.equal(row.live_emails, 0);
    assert.equal(row.events, row.sessions);
    assert.equal(row.retired, row.sessions);
  }
  console.log(
    "Isolated PostgreSQL: 8 delete/claim/Teacher-assignment races + 4 delete/confirmation races passed; no active ghosts, duplicate deletion audits or sendable email jobs. No provider calls.",
  );
} finally {
  const ids = requests.map((id) => `'${id}'`).join(",");
  sql(`delete from public.peer_assignment_email_outbox where request_id in (${ids});delete from public.peer_confirmation_email_outbox where request_id in (${ids});delete from public.peer_confirmation_events where request_id in (${ids});delete from public.peer_support_actions where request_id in (${ids});delete from public.peer_sessions where request_id in (${ids});delete from public.peer_support_requests where id in (${ids});
 update public.peer_support_settings set (display_timezone,location_guidance,supervisor_teacher_id,active_weekdays,updated_by,updated_at,assignment_attention_hours)=(select display_timezone,location_guidance,supervisor_teacher_id,active_weekdays,updated_by,updated_at,assignment_attention_hours from jsonb_populate_record(null::public.peer_support_settings,'${initialSettings.replaceAll("'", "''")}'));
 update public.peer_support_periods p set start_time=old.start_time,end_time=old.end_time from jsonb_populate_recordset(null::public.peer_support_periods,'${initialPeriods.replaceAll("'", "''")}') old where p.period=old.period;
 delete from auth.users where id in ('${teacher}','${peer}','${swag}');`);
}
