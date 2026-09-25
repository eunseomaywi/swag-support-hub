import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
test("real assignment Edge entry is secret-gated, ignores supplied recipient and calls only Resend", async (t) => {
  const settings = {
    SUPABASE_URL: "https://database.example.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "test-service",
    EMAIL_DISPATCH_SECRET: "test-dispatch",
    RESEND_API_KEY: "test-resend",
    RESEND_FROM_EMAIL: "notify@example.org",
    SWAG_PUBLIC_BASE_URL: "https://swag-support-hub.mymaywi.workers.dev",
  };
  let handler,
    offered = true,
    sent = 0,
    finished;
  const prior = globalThis.Deno;
  globalThis.Deno = {
    env: { get: (name) => settings[name] },
    serve: (fn) => {
      handler = fn;
    },
  };
  t.after(() => {
    if (prior === undefined) delete globalThis.Deno;
    else globalThis.Deno = prior;
  });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const body = JSON.parse(options.body);
    if (String(url).includes("/rpc/")) {
      assert.equal(options.headers.apikey, "test-service");
      if (String(url).endsWith("claim_assignment_email_job")) {
        const jobs = offered
          ? [
              {
                event_id: "event",
                request_id: "92000000-0000-4000-8000-000000000001",
                recipient_id: "staff",
                recipient_address: "delivered@resend.dev",
                recipient_name: "Fixture",
                recipient_role: "swag_member",
                preferred_date: "2026-09-29",
                preferred_periods: ["break"],
                payload: null,
              },
            ]
          : [];
        offered = false;
        return Response.json(jobs);
      }
      if (String(url).endsWith("prepare_assignment_email")) return Response.json(body.p_payload);
      assert.ok(String(url).endsWith("finish_assignment_email"));
      finished = body;
      return Response.json(true);
    }
    assert.equal(url, "https://api.resend.com/emails");
    sent++;
    assert.deepEqual(body.to, ["delivered@resend.dev"]);
    assert.equal(body.cc, undefined);
    assert.equal(body.bcc, undefined);
    assert.equal(body.reply_to, undefined);
    assert.equal(options.headers["Idempotency-Key"], "teacher-assignment/event/staff");
    return Response.json({ id: "accepted-id" });
  });
  const bundle = await build({
    entryPoints: ["supabase/functions/dispatch-assignment-email/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  );
  const request = (secret) =>
    new Request("https://edge.example.invalid", {
      method: "POST",
      headers: { "x-swag-dispatch-secret": secret },
      body: JSON.stringify({ recipientEmail: "attacker@example.invalid", actorRole: "teacher" }),
    });
  assert.equal((await handler(request("wrong"))).status, 401);
  assert.equal(sent, 0);
  assert.equal((await handler(request("test-dispatch"))).status, 200);
  assert.equal(sent, 1);
  assert.equal(finished.p_outcome, "accepted");
  assert.equal((await handler(request("test-dispatch"))).status, 200);
  assert.equal(sent, 1);
});
