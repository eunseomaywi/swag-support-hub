import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import app from "../.output/server/_ssr/ssr.mjs";

const origin = "https://swag-support-hub.mymaywi.workers.dev";
const env = {
  EMAIL_MODE: "live",
  EMAIL_EDGE_FUNCTION_ENABLED: "true",
  EMAIL_DISPATCH_SECRET: "test-dispatch",
  PEER_INTAKE_ENABLED: "true",
  PEER_INTAKE_GATEWAY_SECRET: "test-gateway",
  TURNSTILE_SECRET: "production-placeholder",
};
const requestAt = (base, path, body, headers = {}) =>
  new Request(`${base}${path}`, {
    method: "POST",
    headers: {
      origin: base,
      authorization: "Bearer test",
      "content-type": "application/json",
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const request = (path, body) => requestAt(origin, path, body);

test("Teacher assignment validates session, forwards only IDs, and survives provider failure", async (t) => {
  let role = "peer_mentor",
    allowed = true,
    dispatched = 0;
  const requestId = "92000000-0000-4000-8000-000000000001";
  const supporterId = "91000000-0000-4000-8000-000000000001";
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).endsWith("current_app_role")) return Response.json(role);
    if (String(url).endsWith("teacher_assign_peer_request")) {
      assert.deepEqual(JSON.parse(options.body), {
        p_request_id: requestId,
        p_supporter_id: supporterId,
      });
      return Response.json([
        { success: allowed, outcome: allowed ? "assigned" : "already_assigned" },
      ]);
    }
    assert.match(String(url), /dispatch-(confirmation|assignment)-email$/);
    dispatched++;
    return new Response("{}", { status: 503 });
  });
  const invoke = () =>
    app.fetch(
      request("/api/peer-support/teacher-assignment", {
        requestId,
        supporterId,
        actorRole: "teacher",
        recipientEmail: "attacker@example.invalid",
      }),
      env,
    );
  assert.equal((await invoke()).status, 403);
  assert.equal(dispatched, 0);
  role = "teacher";
  allowed = false;
  assert.equal((await invoke()).status, 200);
  assert.equal(dispatched, 0);
  allowed = true;
  const response = await invoke();
  assert.equal(response.status, 200);
  assert.equal((await response.json())[0].success, true);
  assert.equal(dispatched, 2);
});

test("generated Nitro app: actual request context, missing context, and dispatch failure never 500", async (t) => {
  let dispatches = 0;
  let fail = false;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).endsWith("current_app_role")) return Response.json("peer_mentor");
    assert.match(String(url), /functions\/v1\/dispatch-(confirmation|assignment)-email$/);
    dispatches++;
    return new Response("{}", { status: fail ? 503 : 200 });
  });
  const tasks = [];
  const context = {
    waitUntil(task) {
      assert.equal(this, context);
      tasks.push(task);
    },
  };
  const req = request("/api/peer-support/email/kick");
  req.runtime = { name: "cloudflare", cloudflare: { env, context } };
  assert.equal((await app.fetch(req)).status, 202);
  assert.equal(tasks.length, 1);
  await Promise.all(tasks);
  assert.equal((await app.fetch(request("/api/peer-support/email/kick"), env)).status, 202);
  fail = true;
  assert.equal((await app.fetch(request("/api/peer-support/email/kick"), env)).status, 202);
  assert.equal(dispatches, 6);
});

test("production intake verifies Turnstile hostnames and accepts both trusted production origins", async (t) => {
  let result = { success: false };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    calls++;
    if (String(url).endsWith("/siteverify")) {
      assert.equal(String(url), "https://challenges.cloudflare.com/turnstile/v0/siteverify");
      return Response.json(result);
    }
    assert.match(String(url), /\/rest\/v1\/rpc\/submit_peer_support_request$/);
    return Response.json([
      {
        request_id: "92000000-0000-4000-8000-000000000001",
        management_token: "synthetic-management-token",
        expires_at: "2026-12-24T00:00:00Z",
      },
    ]);
  });
  const fields = {
    submissionKey: "92000000-0000-4000-8000-000000000002",
    studentName: "Synthetic Test",
    yearGroup: "Year 9",
    contactEmail: "test@example.invalid",
    category: "Wellbeing",
    preferredDate: "2026-12-24",
    preferredPeriods: ["lunch_1"],
    privateExplanation: "Isolated automated fixture.",
  };
  const submit = (base, token) =>
    app.fetch(requestAt(base, "/api/peer-support/submit", { ...fields, turnstileToken: token }), env);
  const submitOnOldOrigin = (token) => submit(origin, token);
  assert.equal((await submitOnOldOrigin("")).status, 400);
  assert.equal(calls, 0);
  assert.equal((await submitOnOldOrigin("XXXX.DUMMY.TOKEN.XXXX")).status, 403);
  result = { success: true, action: "wrong", hostname: new URL(origin).hostname };
  assert.equal((await submitOnOldOrigin("bad-action")).status, 403);
  result = { success: true, action: "peer_support_intake", hostname: "localhost" };
  assert.equal((await submitOnOldOrigin("foreign-host")).status, 403);
  for (const base of ["https://nlcsswag.com", origin]) {
    result = { success: true, action: "peer_support_intake", hostname: new URL(base).hostname };
    const response = await submit(base, `fresh-token-${new URL(base).hostname}`);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).requestId, "92000000-0000-4000-8000-000000000001");
  }
  assert.equal(calls, 7);
});

test("booking intake rejects untrusted, mismatched, and missing browser origins before Siteverify", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({
      success: true,
      action: "peer_support_intake",
      hostname: "nlcsswag.com",
    });
  });
  const path = "/api/peer-support/submit";
  assert.equal(
    (
      await app.fetch(
        requestAt("https://nlcsswag.com", path, { turnstileToken: "x" }, {
          origin: "https://evil.example",
        }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (await app.fetch(new Request(`${origin}${path}`, { method: "POST", body: "{}" }), env)).status,
    403,
  );
  assert.equal(calls, 0);
  const refererOnly = requestAt(
    "https://nlcsswag.com",
    path,
    { turnstileToken: "x" },
    { origin: "", referer: "https://nlcsswag.com/form/booking" },
  );
  assert.equal((await app.fetch(refererOnly, env)).status, 400);
  const localDevelopment = requestAt("http://localhost:5173", path, { turnstileToken: "x" });
  assert.equal((await app.fetch(localDevelopment, env)).status, 400);
  assert.equal(calls, 2);
});

test("production build refuses official Turnstile dummy sitekeys", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-production-env.mjs"], {
    env: { ...process.env, VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /VITE_TURNSTILE_SITE_KEY is invalid/);
});

test("official test-secret mode cannot run on the public production hostname", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Must reject before Siteverify or database");
  });
  const response = await app.fetch(
    request("/api/peer-support/submit", { turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" }),
    { ...env, TURNSTILE_SECRET: "1x0000000000000000000000000000000AA" },
  );
  assert.equal(response.status, 403);
});
