import { renderEmailCard } from "./confirmation-template.ts";

export type AssignmentJob = {
  event_id: string;
  request_id: string;
  recipient_id: string;
  recipient_address: string;
  recipient_name: string | null;
  recipient_role: "peer_mentor" | "swag_member";
  preferred_date: string;
  preferred_periods: string[];
  payload: AssignmentPayload | null;
};
export type AssignmentPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
};
type Rpc = <T>(name: string, body: Record<string, unknown>) => Promise<T>;
export const ASSIGNMENT_SUBJECT = "A peer support request has been assigned to you | SWAG";
export const ASSIGNMENT_PREHEADER =
  "Assigned by a teacher/administrator. Please review it in your dashboard.";
const labels: Record<string, string> = {
  break: "Break",
  lunch_1: "1st Lunch",
  lunch_2: "2nd Lunch",
};

export function renderAssignmentEmail(
  job: AssignmentJob,
  from: string,
  origin: string,
): AssignmentPayload {
  const base = new URL(origin);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  )
    throw new Error("configuration_origin_invalid");
  if (
    !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from) ||
    /@(resend\.dev|.*workers\.dev)$/i.test(from)
  )
    throw new Error("configuration_sender_invalid");
  if (!/^[0-9a-f-]{36}$/i.test(job.request_id)) throw new Error("request_id_invalid");
  const name = job.recipient_name?.trim();
  const displayName = name && !/^(undefined|null|[0-9a-f-]{36})$/i.test(name) ? name : null;
  const url = `${base.origin}/${job.recipient_role === "peer_mentor" ? "peer-mentor" : "swag"}/cases/${job.request_id}`;
  const message = renderEmailCard(
    { recipient_address: job.recipient_address, subject: ASSIGNMENT_SUBJECT },
    "A new request has been assigned to you",
    displayName,
    "A teacher/administrator has assigned a peer support request to you.\n\nPlease sign in to your SWAG dashboard to review the request and confirm one of the student's available time slots.",
    [
      [
        "Student’s requested date",
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Seoul",
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(new Date(`${job.preferred_date}T00:00:00+09:00`)),
      ],
      [
        "Acceptable time slots",
        job.preferred_periods.map((period) => labels[period] || period).join(" / "),
      ],
      ["Assigned by", "teacher/administrator"],
    ],
    "This is an assignment notification, not an appointment confirmation. A confirmation email will be sent once the session is confirmed.",
    "",
    { preheader: ASSIGNMENT_PREHEADER, cta: { label: "View assigned request", url } },
  );
  return {
    from: `SWAG <${from}>`,
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
  };
}

export async function sendAssignment(
  payload: AssignmentPayload,
  key: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
) {
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      const result: { id?: unknown } = await response.json();
      if (typeof result.id === "string" && result.id.length > 0 && result.id.length <= 200)
        return { outcome: "accepted", messageId: result.id, errorCode: null, retrySeconds: 60 };
      return {
        outcome: "uncertain",
        messageId: null,
        errorCode: "provider_response_missing_id",
        retrySeconds: 60,
      };
    }
    const retry = Number(response.headers.get("retry-after"));
    return {
      outcome:
        response.status === 429 || response.status === 408 || response.status >= 500
          ? "temporary"
          : "permanent",
      messageId: null,
      errorCode: `provider_http_${response.status}`,
      retrySeconds: Number.isFinite(retry) ? Math.max(60, Math.min(3600, retry)) : 60,
    };
  } catch {
    // A network failure may follow acceptance. Always retain the key and frozen payload.
    return {
      outcome: "uncertain",
      messageId: null,
      errorCode: "provider_transport_uncertain",
      retrySeconds: 60,
    };
  }
}

export async function dispatchAssignmentBatch(deps: {
  rpc: Rpc;
  apiKey: string;
  from: string;
  origin: string;
  fetcher?: typeof fetch;
}) {
  const workerId = crypto.randomUUID();
  let processed = 0;
  for (let i = 0; i < 5; i++) {
    const [job] = await deps.rpc<AssignmentJob[]>("claim_assignment_email_job", {
      p_worker_id: workerId,
    });
    if (!job) break;
    let result;
    if (!deps.apiKey || !deps.from || !deps.origin) {
      result = {
        outcome: "permanent",
        messageId: null,
        errorCode: "configuration_missing",
        retrySeconds: 60,
      };
    } else {
      let payload: AssignmentPayload | null;
      try {
        payload = job.payload ?? renderAssignmentEmail(job, deps.from, deps.origin);
      } catch {
        payload = null;
      }
      if (!payload)
        result = {
          outcome: "permanent",
          messageId: null,
          errorCode: "configuration_invalid",
          retrySeconds: 60,
        };
      else {
        const prepared = await deps.rpc<AssignmentPayload | null>("prepare_assignment_email", {
          p_event_id: job.event_id,
          p_worker_id: workerId,
          p_payload: payload,
        });
        if (!prepared) continue;
        result = await sendAssignment(
          prepared,
          `teacher-assignment/${job.event_id}/${job.recipient_id}`,
          deps.apiKey,
          deps.fetcher,
        );
      }
    }
    await deps.rpc("finish_assignment_email", {
      p_event_id: job.event_id,
      p_worker_id: workerId,
      p_outcome: result.outcome,
      p_message_id: result.messageId,
      p_error_code: result.errorCode,
      p_retry_seconds: result.retrySeconds,
    });
    processed++;
  }
  return processed;
}
