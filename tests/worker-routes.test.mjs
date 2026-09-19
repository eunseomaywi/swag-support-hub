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
  TURNSTILE_HOSTNAMES: new URL(origin).hostname,
};
const request = (path, body) =>
  new Request(`${origin}${path}`, {
    method: "POST",
    headers: { origin, authorization: "Bearer test", "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

test("generated Nitro app: actual request context, missing context, and dispatch failure never 500", async (t) => {
  let dispatches = 0;
  let fail = false;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).endsWith("current_app_role")) return Response.json("peer_mentor");
    assert.match(String(url), /functions\/v1\/dispatch-confirmation-email$/);
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
  assert.equal(dispatches, 3);
});

test("production intake fails closed for missing, dummy, invalid action and foreign hostname", async (t) => {
  let result = { success: false };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(String(url), "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    calls++;
    return Response.json(result);
  });
  const submit = (token) =>
    app.fetch(request("/api/peer-support/submit", { turnstileToken: token }), env);
  assert.equal((await submit("")).status, 400);
  assert.equal(calls, 0);
  assert.equal((await submit("XXXX.DUMMY.TOKEN.XXXX")).status, 403);
  result = { success: true, action: "wrong", hostname: new URL(origin).hostname };
  assert.equal((await submit("bad-action")).status, 403);
  result = { success: true, action: "peer_support_intake", hostname: "localhost" };
  assert.equal((await submit("foreign-host")).status, 403);
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
