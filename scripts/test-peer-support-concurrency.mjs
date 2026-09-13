import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";

function localStatus() {
  const cli = process.env.SUPABASE_CLI_PATH;
  let raw;
  try {
    raw = execFileSync(
      cli || "npx",
      cli
        ? ["status", "--output", "json"]
        : ["--offline", "supabase", "status", "--output", "json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch (error) {
    // `supabase status` can still return valid JSON with a non-zero exit when an
    // optional local service (for example imgproxy) is stopped.
    raw = typeof error?.stdout === "string" ? error.stdout : "";
  }
  if (!raw.includes("{")) throw new Error("Could not read local Supabase status");
  return JSON.parse(raw.slice(raw.indexOf("{")));
}

async function dispatchSecret() {
  if (process.env.PHASE5_DISPATCH_SECRET) return process.env.PHASE5_DISPATCH_SECRET;
  if (process.env.PHASE5_DISPATCH_SECRET_FILE) {
    return readFileSync(process.env.PHASE5_DISPATCH_SECRET_FILE, "utf8").trim();
  }
  if (!process.stdin.isTTY) return (await new Response(process.stdin).text()).trim();
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  const value = await prompt.question("Local Phase 5 dispatch secret: ");
  prompt.close();
  return value.trim();
}

const status = localStatus();
const api = status.API_URL;
const anon = status.ANON_KEY;
const service = status.SERVICE_ROLE_KEY;
const gateway = readFileSync(resolve("supabase/.temp/peer-intake-gateway-secret"), "utf8").trim();
const dispatcher = await dispatchSecret();
if (!api || !anon || !service || !gateway || !dispatcher) {
  throw new Error("Local Supabase or a local-only gateway secret is unavailable");
}

async function request(
  path,
  { key = anon, token = key, body, method = "POST", headers = {} } = {},
) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, data };
}

function assert(value, message) {
  if (!value) throw new Error(message);
}
function syntheticEmail(prefix) {
  return `${prefix}.${randomUUID()}@swag.local`;
}
const password = `Local-${randomBytes(18).toString("base64url")}!`;

async function makeUser(prefix, role, account = syntheticEmail(prefix)) {
  const created = await request("/auth/v1/admin/users", {
    key: service,
    token: service,
    body: {
      email: account,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Local ${prefix}` },
    },
  });
  assert(created.ok && created.data?.id, `Could not create ${prefix}`);
  const updated = await request(`/rest/v1/profiles?id=eq.${created.data.id}`, {
    key: service,
    token: service,
    method: "PATCH",
    body: { role },
  });
  assert(updated.ok, `Could not set ${prefix} role`);
  const signed = await request("/auth/v1/token?grant_type=password", {
    body: { email: account, password },
  });
  assert(signed.ok && signed.data?.access_token, `Could not sign in ${prefix}`);
  return { id: created.data.id, token: signed.data.access_token, email: account };
}

async function rpc(name, body, token = anon) {
  return request(`/rest/v1/rpc/${name}`, { token, body });
}

const futureDate = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function submit(tag, { day = futureDate(7), periods = ["break", "lunch_1"] } = {}) {
  const submissionKey = randomUUID();
  const managementToken = randomBytes(32).toString("hex");
  const payload = {
    p_gateway_secret: gateway,
    p_client_fingerprint: createHash("sha256").update(`${tag}-${randomUUID()}`).digest("hex"),
    p_submission_key: submissionKey,
    p_management_token: managementToken,
    p_student_name: `Synthetic ${tag}`,
    p_year_group: "Year 10",
    p_contact_email: syntheticEmail(`student-${tag}`),
    p_category: "Friendships",
    p_preferred_date: day,
    p_preferred_periods: periods,
    p_private_explanation: `Private synthetic story ${tag}`,
  };
  const result = await rpc("submit_peer_support_request", payload);
  assert(result.ok && result.data?.[0]?.request_id, `Submission ${tag} failed`);
  return { ...result.data[0], submissionKey, managementToken, payload };
}

async function rows(table, query) {
  const response = await request(`/rest/v1/${table}?${query}`, {
    key: service,
    token: service,
    method: "GET",
  });
  assert(response.ok && Array.isArray(response.data), `Could not inspect ${table}`);
  return response.data;
}

async function patchRows(table, query, body) {
  const response = await request(`/rest/v1/${table}?${query}`, {
    key: service,
    token: service,
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body,
  });
  assert(response.ok, `Could not update ${table}`);
  return response.data;
}

const mentorA = await makeUser("peer-a", "peer_mentor");
const mentorB = await makeUser("peer-b", "peer_mentor");
const swag = await makeUser("swag", "swag_member");
const teacher = await makeUser("teacher", "teacher");

const settings = await rpc(
  "save_peer_support_settings",
  {
    p_location_guidance: "Approved local test room",
    p_supervisor_teacher_id: teacher.id,
    p_active_weekdays: [1, 2, 3, 4, 5, 6, 7],
    p_break_start: "09:00",
    p_break_end: "09:20",
    p_lunch_1_start: "11:30",
    p_lunch_1_end: "12:00",
    p_lunch_2_start: "12:10",
    p_lunch_2_end: "12:40",
  },
  teacher.token,
);
assert(
  settings.ok && settings.data === true,
  `Teacher could not save local schedule settings (${settings.status}: ${JSON.stringify(settings.data)})`,
);
assert(
  !(
    await rpc(
      "save_peer_support_settings",
      {
        p_location_guidance: "Unauthorized",
        p_supervisor_teacher_id: teacher.id,
        p_active_weekdays: [1],
        p_break_start: "09:00",
        p_break_end: "09:20",
        p_lunch_1_start: "11:30",
        p_lunch_1_end: "12:00",
        p_lunch_2_start: "12:10",
        p_lunch_2_end: "12:40",
      },
      mentorA.token,
    )
  ).ok,
  "A mentor changed school settings",
);

const claimTarget = await submit("claim");
const queue = await rpc(
  "list_available_peer_requests",
  { p_page_size: 30, p_page_offset: 0, p_include_dismissed: false },
  mentorA.token,
);
assert(queue.ok, "Queue failed");
const queueRow = queue.data.find((row) => row.request_id === claimTarget.request_id);
assert(queueRow, "New request missing from queue");
assert(
  JSON.stringify(Object.keys(queueRow).sort()) ===
    JSON.stringify(
      [
        "category",
        "dismissed",
        "preferred_date",
        "preferred_periods",
        "preferred_time",
        "request_id",
        "stale",
        "submitted_at",
      ].sort(),
    ),
  "Pre-claim queue leaked identifying fields",
);

const claims = await Promise.all([
  rpc(
    "confirm_and_accept_peer_request",
    { p_request_id: claimTarget.request_id, p_period: "break" },
    mentorA.token,
  ),
  rpc(
    "confirm_and_accept_peer_request",
    { p_request_id: claimTarget.request_id, p_period: "break" },
    mentorB.token,
  ),
]);
assert(
  claims.filter((item) => item.ok && item.data?.[0]?.success).length === 1,
  "Concurrent confirmation did not produce exactly one winner",
);
const winner = claims[0].data?.[0]?.success ? mentorA : mentorB;
const loser = winner.id === mentorA.id ? mentorB : mentorA;
const confirmation = claims.find((item) => item.data?.[0]?.success).data[0];
assert(
  !(await rpc("get_my_peer_case", { p_request_id: claimTarget.request_id }, loser.token)).data
    ?.length,
  "Another mentor read the assigned case",
);

const persisted = await Promise.all([
  rows(
    "peer_support_requests",
    `select=id,status,assigned_mentor_id&id=eq.${claimTarget.request_id}`,
  ),
  rows(
    "peer_sessions",
    `select=id,period,slot_id,display_timezone,location,supervisor_teacher_id,schedule_version&request_id=eq.${claimTarget.request_id}`,
  ),
  rows("peer_confirmation_events", `select=id,event_type&request_id=eq.${claimTarget.request_id}`),
  rows(
    "peer_confirmation_email_outbox",
    `select=id,recipient_kind,recipient_address,status,notification_kind&request_id=eq.${claimTarget.request_id}&order=recipient_kind.asc`,
  ),
]);
assert(
  persisted[0].length === 1 && persisted[0][0].status === "accepted",
  "Request was not accepted",
);
assert(
  persisted[1].length === 1 && persisted[1][0].slot_id === null,
  "Session did not use the shared schedule snapshot",
);
assert(
  persisted[2].length === 1 && persisted[2][0].event_type === "PEER_SESSION_CONFIRMED",
  "Confirmation event missing",
);
assert(persisted[3].length === 3, "Confirmation did not create exactly three recipient jobs");
assert(
  persisted[3].every((job) => job.notification_kind === "PEER_SESSION_CONFIRMED"),
  "Outbox contains a forbidden notification kind",
);

const repeat = await rpc(
  "confirm_and_accept_peer_request",
  { p_request_id: claimTarget.request_id, p_period: "break" },
  winner.token,
);
assert(repeat.ok && repeat.data?.[0]?.outcome === "already_confirmed", "Retry was not idempotent");
assert(
  (await rows("peer_confirmation_events", `select=id&request_id=eq.${claimTarget.request_id}`))
    .length === 1,
  "Retry duplicated event",
);

const conflictTarget = await submit("conflict", {
  day: claimTarget.payload.p_preferred_date,
  periods: ["break"],
});
const conflict = await rpc(
  "confirm_and_accept_peer_request",
  { p_request_id: conflictTarget.request_id, p_period: "break" },
  winner.token,
);
assert(
  conflict.ok && conflict.data?.[0]?.outcome === "mentor_conflict",
  "Overlapping mentor appointment succeeded",
);
assert(
  (
    await rows(
      "peer_confirmation_email_outbox",
      `select=id&request_id=eq.${conflictTarget.request_id}`,
    )
  ).length === 0,
  "Failed transaction created outbox rows",
);

const swagTarget = await submit("swag", { day: futureDate(8), periods: ["lunch_1"] });
assert(
  (
    await rpc(
      "confirm_and_accept_peer_request",
      { p_request_id: swagTarget.request_id, p_period: "lunch_1" },
      swag.token,
    )
  ).data?.[0]?.success,
  "SWAG Member could not accept a case",
);
const teacherTarget = await submit("teacher", { day: futureDate(9), periods: ["lunch_2"] });
assert(
  !(
    await rpc(
      "confirm_and_accept_peer_request",
      { p_request_id: teacherTarget.request_id, p_period: "lunch_2" },
      teacher.token,
    )
  ).ok,
  "Teacher joined the claim pool",
);

const duplicate = await submit("duplicate", { day: futureDate(10), periods: ["break", "lunch_2"] });
const duplicateRetry = await rpc("submit_peer_support_request", duplicate.payload);
assert(
  duplicateRetry.ok && duplicateRetry.data?.[0]?.request_id === duplicate.request_id,
  "Submission retry created a duplicate request",
);

const badPeriodTarget = await submit("bad-period", { day: futureDate(11), periods: ["break"] });
assert(
  !(
    await rpc(
      "confirm_and_accept_peer_request",
      { p_request_id: badPeriodTarget.request_id, p_period: "lunch_2" },
      mentorB.token,
    )
  ).ok,
  "Unselected period was accepted",
);
assert(
  (
    await rows(
      "peer_confirmation_email_outbox",
      `select=id&request_id=eq.${badPeriodTarget.request_id}`,
    )
  ).length === 0,
  "Invalid period created an outbox row",
);

assert(
  !(await rpc("complete_my_peer_case", { p_request_id: claimTarget.request_id }, winner.token))
    .data,
  "Future appointment was completed",
);
assert(
  !(await rpc("mark_peer_case_no_show", { p_request_id: claimTarget.request_id }, winner.token))
    .data,
  "Future appointment became no-show",
);

const failedJob = persisted[3].find((job) => job.recipient_kind === "mentor");
await patchRows("peer_confirmation_email_outbox", `id=eq.${failedJob.id}`, {
  status: "failed",
  last_error_code: "local_test",
});
assert(
  !(await rpc("retry_confirmation_email", { p_outbox_id: failedJob.id }, loser.token)).data,
  "Unassigned mentor retried email",
);
assert(
  (await rpc("retry_confirmation_email", { p_outbox_id: failedJob.id }, winner.token)).data,
  "Assigned mentor could not retry email",
);

const worker = randomUUID();
const claimed = await rpc("claim_confirmation_email_jobs", {
  p_dispatch_secret: dispatcher,
  p_worker_id: worker,
  p_limit: 25,
  p_lease_seconds: 30,
});
assert(
  claimed.ok && claimed.data.length >= 3,
  `Dispatcher could not atomically claim jobs (${claimed.status}: ${JSON.stringify(claimed.data)})`,
);
const submittedJob = claimed.data[0];
assert(
  (
    await rpc("finish_confirmation_email_job", {
      p_dispatch_secret: dispatcher,
      p_job_id: submittedJob.job_id,
      p_worker_id: worker,
      p_outcome: "submitted",
      p_provider_message_id: `local-${randomUUID()}`,
      p_error_code: null,
      p_retry_after_seconds: null,
    })
  ).data,
  "Submitted result was not persisted",
);
const temporaryJob = claimed.data[1];
assert(
  (
    await rpc("finish_confirmation_email_job", {
      p_dispatch_secret: dispatcher,
      p_job_id: temporaryJob.job_id,
      p_worker_id: worker,
      p_outcome: "temporary",
      p_provider_message_id: null,
      p_error_code: "local_temporary",
      p_retry_after_seconds: 60,
    })
  ).data,
  "Temporary failure was not persisted",
);

const processing = claimed.data.slice(2, 4);
if (processing[0]) {
  await patchRows("peer_confirmation_email_outbox", `id=eq.${processing[0].job_id}`, {
    lease_expires_at: new Date(Date.now() - 60_000).toISOString(),
    last_attempt_started_at: new Date(Date.now() - 60_000).toISOString(),
  });
}
if (processing[1]) {
  await patchRows("peer_confirmation_email_outbox", `id=eq.${processing[1].job_id}`, {
    lease_expires_at: new Date(Date.now() - 60_000).toISOString(),
    last_attempt_started_at: new Date(Date.now() - 24 * 3_600_000).toISOString(),
  });
}
const recoveryWorker = randomUUID();
const recovery = await rpc("claim_confirmation_email_jobs", {
  p_dispatch_secret: dispatcher,
  p_worker_id: recoveryWorker,
  p_limit: 25,
  p_lease_seconds: 30,
});
assert(recovery.ok, "Dispatcher recovery failed");
if (processing[0])
  assert(
    recovery.data.some((job) => job.job_id === processing[0].job_id),
    "Recent expired lease was not recovered",
  );
if (processing[1]) {
  const oldLease = await rows(
    "peer_confirmation_email_outbox",
    `select=status&id=eq.${processing[1].job_id}`,
  );
  assert(
    oldLease[0]?.status === "uncertain",
    "Expired idempotency window was not marked uncertain",
  );
}

const submittedRow = (
  await rows(
    "peer_confirmation_email_outbox",
    `select=status,provider_message_id&id=eq.${submittedJob.job_id}`,
  )
)[0];
assert(
  submittedRow.status === "submitted",
  "Provider acceptance was incorrectly treated as delivery",
);
const deliveredAt = new Date().toISOString();
const providerEvent = randomUUID();
assert(
  (
    await rpc("record_confirmation_email_webhook", {
      p_dispatch_secret: dispatcher,
      p_provider_event_id: providerEvent,
      p_provider_message_id: submittedRow.provider_message_id,
      p_event_type: "email.delivered",
      p_event_created_at: deliveredAt,
    })
  ).data,
  "Delivery webhook failed",
);
assert(
  (
    await rpc("record_confirmation_email_webhook", {
      p_dispatch_secret: dispatcher,
      p_provider_event_id: providerEvent,
      p_provider_message_id: submittedRow.provider_message_id,
      p_event_type: "email.delivered",
      p_event_created_at: deliveredAt,
    })
  ).data,
  "Duplicate webhook was not idempotent",
);
await rpc("record_confirmation_email_webhook", {
  p_dispatch_secret: dispatcher,
  p_provider_event_id: randomUUID(),
  p_provider_message_id: submittedRow.provider_message_id,
  p_event_type: "email.delivery_delayed",
  p_event_created_at: new Date(Date.now() - 60_000).toISOString(),
});
assert(
  (await rows("peer_confirmation_email_outbox", `select=status&id=eq.${submittedJob.job_id}`))[0]
    ?.status === "delivered",
  "Older webhook regressed delivery state",
);

const cancelTarget = await submit("cancel", { day: futureDate(12), periods: ["lunch_2"] });
assert(
  (
    await rpc(
      "confirm_and_accept_peer_request",
      { p_request_id: cancelTarget.request_id, p_period: "lunch_2" },
      mentorB.token,
    )
  ).data?.[0]?.success,
  "Cancellation fixture could not be confirmed",
);
assert(
  (await rpc("cancel_peer_request", { p_token: cancelTarget.managementToken })).data?.[0]?.success,
  "Student cancellation failed",
);
const cancelledJobs = await rows(
  "peer_confirmation_email_outbox",
  `select=status&request_id=eq.${cancelTarget.request_id}`,
);
assert(
  cancelledJobs.length === 3 && cancelledJobs.every((job) => job.status === "suppressed"),
  "Cancellation did not suppress unsent confirmation jobs",
);

if (process.env.SWAG_BROWSER_FIXTURE_PATH) {
  writeFileSync(
    process.env.SWAG_BROWSER_FIXTURE_PATH,
    JSON.stringify([
      { role: "peer_mentor", email: mentorB.email, password },
      { role: "swag_member", email: swag.email, password },
      { role: "teacher", email: teacher.email, password },
    ]),
    { mode: 0o600 },
  );
}

await request(`/rest/v1/profiles?id=eq.${mentorA.id}`, {
  key: service,
  token: service,
  method: "PATCH",
  body: { role: "student" },
});
assert(
  !(await rpc("list_my_peer_cases", { p_page_size: 30, p_page_offset: 0 }, mentorA.token)).ok,
  "Role revocation retained sensitive access",
);
const peerConcern = await request("/rest/v1/concerns?select=id", {
  token: mentorB.token,
  method: "GET",
});
assert(
  peerConcern.ok && Array.isArray(peerConcern.data) && peerConcern.data.length === 0,
  "Peer Mentor read Concerns",
);

assert(
  confirmation.confirmation_event_id,
  "Winning confirmation response omitted its event identifier",
);
process.stdout.write("Peer Support HTTP/concurrency checks: 34 passed\n");
