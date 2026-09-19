import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

test("real Edge handler uses existing secret-gated RPC grants and renders separate Gmail messages", async (t) => {
  let handler;
  const sent = [];
  const finished = [];
  const settings = {
    SUPABASE_URL: "https://database.example.invalid",
    SUPABASE_ANON_KEY: "anon-jwt",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    EMAIL_DISPATCH_SECRET: "test-dispatch-secret",
    EMAIL_PROVIDER: "gmail",
    GMAIL_SMTP_USER: "nlcsswag2025@gmail.com",
    GMAIL_SMTP_APP_PASSWORD: "test-only-password",
    SWAG_PUBLIC_BASE_URL: "https://swag.example.invalid",
  };
  const jobs = ["student", "mentor", "teacher"].map((kind) => ({
    job_id: kind,
    session_id: "session",
    recipient_kind: kind,
    recipient_address: `${kind}@example.invalid`,
    student_name: "Alex Student",
    mentor_name: "Jamie Mentor",
    scheduled_start: "2099-09-21T03:00:00Z",
    scheduled_end: "2099-09-21T03:30:00Z",
    period_label: "Lunch",
    location: "Room 1",
  }));
  const oldDeno = globalThis.Deno;
  globalThis.Deno = {
    env: { get: (name) => settings[name] },
    serve: (fn) => {
      handler = fn;
    },
  };
  globalThis.__testGmailSend = async (_config, message) => {
    sent.push(message);
    return { accepted: true, messageId: `message-${sent.length}` };
  };
  t.after(() => {
    if (oldDeno === undefined) delete globalThis.Deno;
    else globalThis.Deno = oldDeno;
    delete globalThis.__testGmailSend;
  });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.includes("/rpc/")) {
      assert.equal(options.headers.apikey, "anon-jwt");
      assert.equal(options.headers.authorization, "Bearer anon-jwt");
      const body = JSON.parse(options.body);
      assert.equal(body.p_dispatch_secret, settings.EMAIL_DISPATCH_SECRET);
      if (url.endsWith("claim_confirmation_email_jobs")) return Response.json(jobs);
      assert.ok(url.endsWith("finish_confirmation_email_job"));
      finished.push(body);
      return Response.json(true);
    }
    assert.equal(options.headers.authorization, "Bearer service-key");
    if (url.includes("/peer_sessions?"))
      return Response.json([{ supervisor_teacher_id: "teacher" }]);
    assert.ok(url.includes("/profiles?") && url.endsWith("select=full_name"));
    return Response.json([{ full_name: "Casey Teacher" }]);
  });
  const bundle = await build({
    entryPoints: ["supabase/functions/dispatch-confirmation-email/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    plugins: [
      {
        name: "isolated-smtp",
        setup(builder) {
          builder.onResolve({ filter: /gmail-smtp\.ts$/ }, () => ({
            path: "smtp",
            namespace: "test",
          }));
          builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
            contents:
              "export const sendWithGmail = (...args) => globalThis.__testGmailSend(...args); export const smtpFailure = () => ({outcome:'temporary',errorCode:'test_failure'});",
          }));
        },
      },
    ],
  });
  await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  );
  assert.equal(
    (await handler(new Request("https://edge.example.invalid", { method: "POST" }))).status,
    401,
  );
  assert.equal(sent.length, 0);
  const response = await handler(
    new Request("https://edge.example.invalid", {
      method: "POST",
      headers: { "x-swag-dispatch-secret": settings.EMAIL_DISPATCH_SECRET },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { processed: 3 });
  assert.deepEqual(
    sent.map((message) => message.to),
    jobs.map((job) => job.recipient_address),
  );
  assert.equal(finished.length, 3);
  assert.ok(finished.every((body) => body.p_outcome === "submitted"));
  assert.match(sent[1].text, /Casey Teacher/);
  assert.match(sent[2].text, /Hi Casey,/);
  assert.ok(sent.every((message) => message.html.includes("SWAG PEER SUPPORT") && message.text));
});
