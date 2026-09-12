import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function localStatus() {
  const cli = process.env.SUPABASE_CLI_PATH;
  const raw = execFileSync(
    cli || "npx",
    cli ? ["status", "--output", "json"] : ["--offline", "supabase", "status", "--output", "json"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  const start = raw.indexOf("{");
  return JSON.parse(raw.slice(start));
}

const status = localStatus();
const api = status.API_URL;
const anon = status.ANON_KEY;
const service = status.SERVICE_ROLE_KEY;
const gateway = readFileSync(resolve("supabase/.temp/peer-intake-gateway-secret"), "utf8").trim();
if (!api || !anon || !service || !gateway)
  throw new Error("Local Supabase or gateway secret is unavailable");

async function request(path, { key = anon, token = key, body, method = "POST" } = {}) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
function email(prefix) {
  return `${prefix}.${randomUUID()}@swag.local`;
}
const password = `Local-${randomBytes(18).toString("base64url")}!`;

async function makeUser(prefix, role) {
  const account = email(prefix);
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
  return { id: created.data.id, token: signed.data.access_token };
}

async function rpc(name, body, token = anon) {
  return request(`/rest/v1/rpc/${name}`, { token, body });
}
async function submit(tag) {
  const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const result = await rpc("submit_peer_support_request", {
    p_gateway_secret: gateway,
    p_client_fingerprint: createHash("sha256").update(`${tag}-${randomUUID()}`).digest("hex"),
    p_student_name: `Synthetic ${tag}`,
    p_year_group: "Year 10",
    p_contact_email: email(`student-${tag}`),
    p_category: "Friendships",
    p_preferred_date: day,
    p_preferred_time: "Break",
    p_private_explanation: `Private synthetic story ${tag}`,
  });
  assert(
    result.ok && result.data?.[0]?.request_id && result.data?.[0]?.management_token,
    `Submission ${tag} failed`,
  );
  return result.data[0];
}

const mentorA = await makeUser("peer-a", "peer_mentor");
const mentorB = await makeUser("peer-b", "peer_mentor");
const swag = await makeUser("swag", "swag_member");
const teacher = await makeUser("teacher", "teacher");

const claimTarget = await submit("claim");
const queue = await rpc(
  "list_available_peer_requests",
  { p_page_size: 30, p_page_offset: 0, p_include_dismissed: false },
  mentorA.token,
);
assert(queue.ok, "Queue failed");
const queueKeys = Object.keys(
  queue.data.find((row) => row.request_id === claimTarget.request_id) ?? {},
).sort();
assert(
  JSON.stringify(queueKeys) ===
    JSON.stringify(
      [
        "category",
        "dismissed",
        "preferred_date",
        "preferred_time",
        "request_id",
        "submitted_at",
      ].sort(),
    ),
  "Queue leaked fields",
);

const dismissTarget = await submit("pass");
assert(
  (await rpc("dismiss_peer_request", { p_request_id: dismissTarget.request_id }, mentorA.token)).ok,
  "Pass failed",
);
const [passedA, visibleB] = await Promise.all([
  rpc(
    "list_available_peer_requests",
    { p_page_size: 30, p_page_offset: 0, p_include_dismissed: false },
    mentorA.token,
  ),
  rpc(
    "list_available_peer_requests",
    { p_page_size: 30, p_page_offset: 0, p_include_dismissed: false },
    mentorB.token,
  ),
]);
assert(
  !passedA.data.some((row) => row.request_id === dismissTarget.request_id),
  "Pass was not private to actor",
);
assert(
  visibleB.data.some((row) => row.request_id === dismissTarget.request_id),
  "Pass hid request globally",
);

const claims = await Promise.all([
  rpc("claim_peer_request", { p_request_id: claimTarget.request_id }, mentorA.token),
  rpc("claim_peer_request", { p_request_id: claimTarget.request_id }, mentorB.token),
]);
assert(
  claims.filter((item) => item.ok && item.data?.[0]?.success).length === 1,
  "Concurrent claim did not produce exactly one winner",
);
const winner = claims[0].data?.[0]?.success ? mentorA : mentorB;
const loser = winner.id === mentorA.id ? mentorB : mentorA;
assert(
  !(await rpc("get_my_peer_case", { p_request_id: claimTarget.request_id }, loser.token)).data
    ?.length,
  "Another mentor read assigned case",
);

const swagTarget = await submit("swag");
assert(
  (await rpc("claim_peer_request", { p_request_id: swagTarget.request_id }, swag.token)).data?.[0]
    ?.success,
  "SWAG Member could not use peer capability",
);
assert(
  !(await rpc("claim_peer_request", { p_request_id: dismissTarget.request_id }, teacher.token)).ok,
  "Teacher joined ordinary claim pool",
);

const scheduleTarget = await submit("schedule");
assert(
  (await rpc("claim_peer_request", { p_request_id: scheduleTarget.request_id }, winner.token))
    .data?.[0]?.success,
  "Winner could not claim schedule request",
);
const start = new Date(Date.now() + 5 * 86_400_000);
start.setUTCHours(3, 0, 0, 0);
const end = new Date(start.getTime() + 30 * 60_000);
const slot = await rpc(
  "create_peer_availability",
  {
    p_start_at: start.toISOString(),
    p_end_at: end.toISOString(),
    p_time_label: "Break",
    p_location: "",
  },
  winner.token,
);
assert(slot.ok && typeof slot.data === "string", "Slot creation failed");
const schedules = await Promise.all([
  rpc("schedule_peer_session", { p_token: claimTarget.management_token, p_slot_id: slot.data }),
  rpc("schedule_peer_session", { p_token: scheduleTarget.management_token, p_slot_id: slot.data }),
]);
assert(
  schedules.filter((item) => item.ok && item.data?.[0]?.success).length === 1,
  "Concurrent scheduling did not reserve exactly once",
);

const wrongToken = `${claimTarget.management_token.slice(0, -1)}${claimTarget.management_token.endsWith("a") ? "b" : "a"}`;
assert(
  !(await rpc("get_peer_request_management", { p_token: wrongToken })).data?.length,
  "Invalid token exposed request",
);

const revokedTarget = await submit("revocation");
assert(
  (await rpc("claim_peer_request", { p_request_id: revokedTarget.request_id }, mentorA.token))
    .data?.[0]?.success,
  "Revocation fixture claim failed",
);
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

process.stdout.write("Peer Support HTTP/concurrency checks: 12 passed\n");
