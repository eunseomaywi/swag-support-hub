import assert from "node:assert/strict";
import test from "node:test";
import {
  renderAssignmentEmail,
  sendAssignment,
  dispatchAssignmentBatch,
  type AssignmentJob,
  type AssignmentPayload,
} from "../supabase/functions/_shared/assignment-email";
const job: AssignmentJob = {
  event_id: "event",
  request_id: "92000000-0000-4000-8000-000000000001",
  recipient_id: "supporter",
  recipient_address: "delivered@resend.dev",
  recipient_name: "Sam & Alex",
  recipient_role: "peer_mentor",
  preferred_date: "2026-09-29",
  preferred_periods: ["break", "lunch_1"],
  payload: null,
};
const origin = "https://swag-support-hub.mymaywi.workers.dev";
test("both roles: one recipient, private template, shared layout, escaping and real case links", () => {
  for (const role of ["peer_mentor", "swag_member"] as const) {
    const message = renderAssignmentEmail(
      { ...job, recipient_role: role },
      "notify@example.org",
      origin,
    );
    assert.deepEqual(message.to, [job.recipient_address]);
    assert.equal(message.subject, "A peer support request has been assigned to you | SWAG");
    assert.match(message.html, /Sam &amp; Alex/);
    assert.match(message.html, /Assigned by a teacher\/administrator/);
    assert.match(message.html, /background:#edf7ff/);
    assert.match(message.text, /Break \/ 1st Lunch/);
    assert.ok(
      message.text.includes(
        `${origin}/${role === "peer_mentor" ? "peer-mentor" : "swag"}/cases/${job.request_id}`,
      ),
    );
    assert.equal("reply_to" in message, false);
    assert.equal("cc" in message, false);
    assert.equal("bcc" in message, false);
    // Runtime objects may contain extra fields: none enter the render contract.
    const enriched = {
      ...job,
      teacher_name: "Private Teacher",
      student_name: "Private Student",
      contact_email: "private@example.org",
      private_explanation: "Secret concern",
    };
    assert.doesNotMatch(
      JSON.stringify(renderAssignmentEmail(enriched, "notify@example.org", origin)),
      /Private Teacher|Private Student|private@example.org|Secret concern/,
    );
  }
  for (const name of [null, "", "undefined", "null", job.request_id])
    assert.match(
      renderAssignmentEmail({ ...job, recipient_name: name }, "notify@example.org", origin).text,
      /Hi there,/,
    );
  assert.throws(() => renderAssignmentEmail(job, "onboarding@resend.dev", origin));
  assert.throws(() => renderAssignmentEmail(job, "notify@example.org", "https://evil.test/path"));
});
test("provider outcomes: accepted is not delivered, 429/5xx retry, auth fails, transport is uncertain", async () => {
  const payload = renderAssignmentEmail(job, "notify@example.org", origin);
  for (const [status, outcome] of [
    [200, "accepted"],
    [429, "temporary"],
    [503, "temporary"],
    [401, "permanent"],
    [403, "permanent"],
  ] as const) {
    const result = await sendAssignment(payload, "stable-key", "test", async (_url, options) => {
      assert.equal(new Headers(options?.headers).get("Idempotency-Key"), "stable-key");
      assert.deepEqual(JSON.parse(String(options?.body)).to, [job.recipient_address]);
      return Response.json({ id: "provider-id" }, { status });
    });
    assert.equal(result.outcome, outcome);
  }
  assert.equal(
    (
      await sendAssignment(payload, "key", "test", async () => {
        throw new Error("timeout");
      })
    ).outcome,
    "uncertain",
  );
});
test("dispatcher freezes payload, rechecks before send, uses same key and never mutates assignment", async () => {
  let offered = true,
    payload: AssignmentPayload | null = null;
  const calls: string[] = [],
    sent: string[] = [];
  async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    calls.push(name);
    let result: unknown = true;
    if (name === "claim_assignment_email_job") {
      result = offered ? [{ ...job, payload }] : [];
      offered = false;
    }
    if (name === "prepare_assignment_email") {
      payload ??= body["p_payload"] as AssignmentPayload;
      result = payload;
    }
    return result as T;
  }
  const fetcher: typeof fetch = async (_url, options) => {
    sent.push(
      JSON.stringify({
        body: options?.body,
        key: new Headers(options?.headers).get("Idempotency-Key"),
      }),
    );
    return Response.json({ id: "id" });
  };
  await dispatchAssignmentBatch({
    rpc,
    apiKey: "key",
    from: "notify@example.org",
    origin,
    fetcher,
  });
  offered = true;
  await dispatchAssignmentBatch({
    rpc,
    apiKey: "key",
    from: "changed@example.org",
    origin,
    fetcher,
  });
  assert.equal(sent.length, 2);
  assert.equal(sent[0], sent[1]);
  assert.deepEqual(
    new Set(calls),
    new Set(["claim_assignment_email_job", "prepare_assignment_email", "finish_assignment_email"]),
  );
  let providerCalls = 0;
  offered = true;
  const invalidatedRpc = async <T>(name: string, body: Record<string, unknown>): Promise<T> =>
    name === "prepare_assignment_email" ? (null as T) : rpc<T>(name, body);
  await dispatchAssignmentBatch({
    rpc: invalidatedRpc,
    apiKey: "key",
    from: "notify@example.org",
    origin,
    fetcher: async () => {
      providerCalls++;
      return Response.json({ id: "id" });
    },
  });
  assert.equal(providerCalls, 0);
});
