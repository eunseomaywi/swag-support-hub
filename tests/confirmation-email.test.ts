import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIRMATION_SUBJECT,
  createStudentManagementToken,
  renderConfirmationEmail,
  sendWithResend,
  verifyStudentManagementToken,
  type ConfirmationJob,
} from "../src/lib/confirmation-email";

const base: ConfirmationJob = {
  job_id: "10000000-0000-4000-8000-000000000001",
  recipient_kind: "student",
  recipient_address: "student@example.invalid",
  idempotency_key: "peer-confirmed/event/student",
  request_id: "20000000-0000-4000-8000-000000000002",
  session_id: "30000000-0000-4000-8000-000000000003",
  schedule_version: "40000000-0000-4000-8000-000000000004",
  student_name: "Student <script>alert(1)</script>",
  mentor_name: "Mentor & Guide",
  mentor_role: "peer_mentor",
  scheduled_start: "2099-06-12T03:00:00.000Z",
  scheduled_end: "2099-06-12T03:30:00.000Z",
  period_label: "Break",
  location: "Approved <Room>",
  display_timezone: "Asia/Seoul",
};
const links = {
  student: "https://example.test/manage#student-secret",
  mentor: "https://example.test/mentor",
  teacher: "https://example.test/teacher",
};

test("renders three separate confirmation-only templates with no CC/BCC", () => {
  for (const recipient_kind of ["student", "mentor", "teacher"] as const) {
    const rendered = renderConfirmationEmail({ ...base, recipient_kind }, links);
    assert.equal(rendered.to, base.recipient_address);
    assert.equal(rendered.subject, CONFIRMATION_SUBJECT);
    assert.equal("cc" in rendered, false);
    assert.equal("bcc" in rendered, false);
    assert.match(rendered.text, /Korea time/);
    assert.match(rendered.html, /Approved &lt;Room&gt;/);
    assert.doesNotMatch(rendered.html, /<script>alert/);
    assert.doesNotMatch(rendered.text, /category|private story|feeling/i);
  }
});

test("student bearer link appears only in the student template", () => {
  assert.match(renderConfirmationEmail(base, links).text, /student-secret/);
  assert.doesNotMatch(
    renderConfirmationEmail({ ...base, recipient_kind: "mentor" }, links).text,
    /student-secret/,
  );
  assert.doesNotMatch(
    renderConfirmationEmail({ ...base, recipient_kind: "teacher" }, links).text,
    /student-secret/,
  );
});

test("signed management credential is scoped, tamper-resistant and expiring", async () => {
  const secret = "local-test-secret-with-sufficient-entropy";
  const token = await createStudentManagementToken(base, secret);
  assert.deepEqual(await verifyStudentManagementToken(token, secret), {
    requestId: base.request_id,
    sessionId: base.session_id,
    scheduleVersion: base.schedule_version,
  });
  assert.equal(await verifyStudentManagementToken(`${token.slice(0, -1)}x`, secret), null);
  const expired = await createStudentManagementToken(
    { ...base, scheduled_end: "2000-01-01T00:00:00.000Z" },
    secret,
  );
  assert.equal(await verifyStudentManagementToken(expired, secret), null);
});

test("provider success is submitted, never delivered", async () => {
  let sentBody = "";
  const result = await sendWithResend(renderConfirmationEmail(base, links), {
    apiKey: "test-key",
    from: "SWAG <swag@example.test>",
    idempotencyKey: base.idempotency_key,
    fetcher: async (_input, init) => {
      sentBody = String(init?.body);
      return new Response(JSON.stringify({ id: "provider-message-id" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.deepEqual(result, { outcome: "submitted", messageId: "provider-message-id" });
  const payload = JSON.parse(sentBody) as Record<string, unknown>;
  assert.deepEqual(payload["to"], [base.recipient_address]);
  assert.equal("cc" in payload, false);
  assert.equal("bcc" in payload, false);
});

test("provider errors distinguish retryable, permanent, and uncertain", async () => {
  const message = renderConfirmationEmail(base, links);
  const options = { apiKey: "test", from: "a@example.test", idempotencyKey: "id" };
  assert.deepEqual(
    await sendWithResend(message, {
      ...options,
      fetcher: async () => new Response("", { status: 429, headers: { "retry-after": "120" } }),
    }),
    { outcome: "temporary", errorCode: "provider_http_429", retryAfterSeconds: 120 },
  );
  assert.deepEqual(
    await sendWithResend(message, {
      ...options,
      fetcher: async () => new Response("", { status: 422 }),
    }),
    { outcome: "permanent", errorCode: "provider_http_422" },
  );
  assert.deepEqual(
    await sendWithResend(message, {
      ...options,
      fetcher: async () => {
        throw new DOMException("timeout", "AbortError");
      },
    }),
    { outcome: "uncertain", errorCode: "provider_timeout_uncertain" },
  );
});
