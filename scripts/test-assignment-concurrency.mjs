import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
// Deliberately fixed to the isolated local container. Never accepts a remote DSN.
const container = "supabase_db_swag-assignment-isolated";
const args = [
  "exec",
  "-i",
  container,
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
const parallelSql = async (query) =>
  (await run("docker", [...args, "-c", query], { encoding: "utf8" })).stdout.trim();
const peer = randomUUID(),
  teacher = randomUUID(),
  swag = randomUUID(),
  requests = Array.from({ length: 10 }, () => randomUUID());
const asUser = (id, query) =>
  `begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',true);${query};commit;`;
try {
  sql(`insert into auth.users(id,email) values ('${peer}','race-peer@example.invalid'),('${teacher}','race-teacher@example.invalid'),('${swag}','race-swag@example.invalid');
    select public.admin_set_staff_registration('${peer}','peer_mentor',true);
    select public.admin_set_staff_registration('${swag}','swag_member',true);
    select public.admin_set_staff_registration('${teacher}','teacher',true);
    insert into public.peer_support_requests(id,student_name,year_group,contact_email,category,preferred_date,preferred_time,preferred_periods,private_explanation) values
    ${requests.map((id) => `('${id}','ISOLATED FIXTURE','Year 9','fixture@example.invalid','Friendships',current_date+8,'Break',array['break'],'ISOLATED FIXTURE')`).join(",")};`);
  for (const id of requests.slice(0, 8)) {
    const results = await Promise.all([
      parallelSql(asUser(peer, `select success from public.claim_peer_request('${id}')`)),
      parallelSql(
        asUser(
          teacher,
          `select success from public.teacher_assign_peer_request('${id}','${swag}')`,
        ),
      ),
    ]);
    assert.equal(
      results.filter((r) => r.split("\n").at(-1) === "t").length,
      1,
      "exactly one winning assignment",
    );
    const row = JSON.parse(
      sql(
        `select json_build_object('method',assignment_method,'supporter',assigned_mentor_id,'events',(select count(*) from public.peer_assignment_email_outbox where request_id=r.id),'recipient',(select recipient_id from public.peer_assignment_email_outbox where request_id=r.id)) from public.peer_support_requests r where id='${id}';`,
      ),
    );
    assert.equal(row.events, row.method === "teacher_assignment" ? 1 : 0);
    assert.equal(row.supporter, row.method === "teacher_assignment" ? swag : peer);
    if (row.events) assert.equal(row.recipient, swag);
  }
  for (const id of requests.slice(8))
    sql(
      asUser(teacher, `select success from public.teacher_assign_peer_request('${id}','${peer}')`),
    );
  const leased = await Promise.all([
    parallelSql(`select event_id from public.claim_assignment_email_job('${randomUUID()}');`),
    parallelSql(`select event_id from public.claim_assignment_email_job('${randomUUID()}');`),
  ]);
  assert.ok(leased[0] && leased[1]);
  assert.notEqual(leased[0], leased[1], "concurrent dispatchers lease different events");
  assert.equal(
    sql(
      `select count(*) from public.peer_confirmation_email_outbox where request_id in (${requests.map((id) => `'${id}'`).join(",")});`,
    ),
    "0",
  );
  console.log(
    "Isolated PostgreSQL concurrency: 8 Teacher/self-claim races + concurrent dispatcher leases passed; no provider calls.",
  );
} finally {
  const ids = requests.map((id) => `'${id}'`).join(",");
  sql(
    `delete from public.peer_assignment_email_outbox where request_id in (${ids});delete from public.peer_support_actions where request_id in (${ids});delete from public.peer_support_requests where id in (${ids});delete from auth.users where id in ('${peer}','${teacher}','${swag}');`,
  );
}
