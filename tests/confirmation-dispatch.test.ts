import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchConfirmationBatch,
  type ConfirmationJob,
} from "../supabase/functions/_shared/confirmation-dispatch.ts";
import { dispatchWithLifetime } from "../src/lib/email-dispatch-runtime.ts";

test("Gmail dispatcher sends separate recipients and records each outcome; retry claims no sent jobs", async () => {
  const jobs: ConfirmationJob[] = (["student", "mentor", "teacher"] as const).map((kind) => ({
    job_id: kind,
    session_id: "confirmed-session",
    recipient_kind: kind,
    recipient_address: `${kind}@example.invalid`,
    student_name: "Student Test",
    mentor_name: "Mentor Test",
    scheduled_start: "2099-09-21T03:00:00Z",
    scheduled_end: "2099-09-21T03:30:00Z",
    period_label: "Lunch",
    location: "Room 1",
  }));
  let claimed = false;
  const sent: string[] = [];
  const finished: Record<string, unknown>[] = [];
  const deps = {
    secret: "test-only",
    rpc: async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
      if (name === "claim_confirmation_email_jobs") {
        const batch = claimed ? [] : jobs;
        claimed = true;
        return batch as T;
      }
      assert.equal(name, "finish_confirmation_email_job");
      finished.push(body);
      return true as T;
    },
    teacherName: async (id: string) => {
      assert.equal(id, "confirmed-session");
      return "Teacher Test";
    },
    send: async (message: { to: string; html: string; text: string }) => {
      assert.equal(typeof message.to, "string");
      assert.match(message.html, /SWAG PEER SUPPORT/);
      assert.ok(message.text);
      sent.push(message.to);
      if (message.to.startsWith("mentor")) throw new Error("SMTP rejected");
      return { accepted: true, messageId: `message-${sent.length}` };
    },
    failure: () => ({ outcome: "permanent", errorCode: "gmail_smtp_recipient_rejected" }),
  };
  assert.equal(await dispatchConfirmationBatch(deps), 3);
  assert.deepEqual(
    sent,
    jobs.map((job) => job.recipient_address),
  );
  assert.deepEqual(
    finished.map((body) => body["p_outcome"]),
    ["submitted", "permanent", "submitted"],
  );
  assert.equal(await dispatchConfirmationBatch(deps), 0);
  assert.equal(sent.length, 3);
});

test("waitUntil keeps its actual receiver, otherwise dispatch is awaited safely", async () => {
  let pending: Promise<unknown> | undefined;
  const context = {
    waitUntil(task: Promise<unknown>) {
      assert.equal(this, context);
      pending = task;
    },
  };
  let finish!: () => void;
  let completed = false;
  const dispatch = () =>
    new Promise<void>((resolve) => {
      finish = () => {
        completed = true;
        resolve();
      };
    });
  await dispatchWithLifetime(undefined, context, dispatch);
  assert.ok(pending);
  assert.equal(completed, false);
  finish();
  await pending;
  for (const missing of [undefined, null, {}, { waitUntil: true }]) {
    completed = false;
    const work = dispatchWithLifetime(undefined, missing, dispatch);
    await Promise.resolve();
    assert.equal(completed, false);
    finish();
    await work;
    assert.equal(completed, true);
  }
  await dispatchWithLifetime(undefined, undefined, async () => {
    throw new Error("network failure");
  });
});
