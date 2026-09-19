import { renderConfirmationEmail, type ConfirmationDetails } from "./confirmation-template.ts";

export type ConfirmationJob = ConfirmationDetails & { job_id: string; session_id: string };
type Rpc = <T>(name: string, body: Record<string, unknown>) => Promise<T>;

export async function dispatchConfirmationBatch(deps: {
  secret: string;
  rpc: Rpc;
  teacherName: (sessionId: string) => Promise<string | null>;
  send: (
    message: ReturnType<typeof renderConfirmationEmail>,
  ) => Promise<{ accepted: boolean; messageId: string }>;
  failure: (error: unknown) => { outcome: string; errorCode: string };
}) {
  const workerId = crypto.randomUUID();
  const jobs = await deps.rpc<ConfirmationJob[]>("claim_confirmation_email_jobs", {
    p_dispatch_secret: deps.secret,
    p_worker_id: workerId,
    p_limit: 10,
    p_lease_seconds: 120,
  });
  for (const job of jobs) {
    let outcome = "temporary";
    let providerMessageId: string | null = null;
    let errorCode: string | null = "provider_network_error";
    try {
      const teacher_name =
        job.recipient_kind === "student" ? null : await deps.teacherName(job.session_id);
      const result = await deps.send(renderConfirmationEmail({ ...job, teacher_name }));
      if (result.accepted && result.messageId.length <= 200) {
        outcome = "submitted";
        providerMessageId = result.messageId;
        errorCode = null;
      } else {
        outcome = "permanent";
        errorCode = "gmail_smtp_recipient_rejected";
      }
    } catch (error) {
      const failure = deps.failure(error);
      outcome = failure.outcome;
      errorCode = failure.errorCode;
    }
    await deps.rpc("finish_confirmation_email_job", {
      p_dispatch_secret: deps.secret,
      p_job_id: job.job_id,
      p_worker_id: workerId,
      p_outcome: outcome,
      p_provider_message_id: providerMessageId,
      p_error_code: errorCode,
      p_retry_after_seconds: null,
    });
  }
  return jobs.length;
}
