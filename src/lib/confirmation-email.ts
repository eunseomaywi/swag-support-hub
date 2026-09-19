export const CONFIRMATION_EVENT = "PEER_SESSION_CONFIRMED" as const;
import { renderConfirmationEmail as renderTemplate } from "../../supabase/functions/_shared/confirmation-template";
export { CONFIRMATION_SUBJECTS } from "../../supabase/functions/_shared/confirmation-template";

export type ConfirmationRecipient = "student" | "mentor" | "teacher";

export type ConfirmationJob = {
  job_id: string;
  recipient_kind: ConfirmationRecipient;
  recipient_address: string;
  idempotency_key: string;
  request_id: string;
  session_id: string;
  schedule_version: string;
  student_name: string;
  mentor_name: string | null;
  teacher_name?: string | null;
  mentor_role: "peer_mentor" | "swag_member";
  scheduled_start: string;
  scheduled_end: string;
  period_label: string;
  location: string;
  display_timezone: "Asia/Seoul";
};

export type RenderedConfirmation = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type ProviderResult =
  | { outcome: "submitted"; messageId: string }
  | { outcome: "temporary"; errorCode: string; retryAfterSeconds?: number }
  | { outcome: "permanent"; errorCode: string }
  | { outcome: "uncertain"; errorCode: string };

export function renderConfirmationEmail(
  job: ConfirmationJob,
  _links?: { mentor: string; teacher: string },
): RenderedConfirmation {
  return renderTemplate(job);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.ceil(seconds), 3600);
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return undefined;
  return Math.min(Math.max(Math.ceil((instant - Date.now()) / 1000), 0), 3600);
}

export async function sendWithResend(
  message: RenderedConfirmation,
  options: {
    apiKey: string;
    from: string;
    replyTo?: string;
    idempotencyKey: string;
    fetcher?: typeof fetch;
  },
): Promise<ProviderResult> {
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": options.idempotencyKey,
      },
      body: JSON.stringify({
        from: options.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      }),
    });
    if (response.ok) {
      const result = (await response.json()) as { id?: unknown };
      return typeof result.id === "string" && result.id.length <= 200
        ? { outcome: "submitted", messageId: result.id }
        : { outcome: "uncertain", errorCode: "provider_response_missing_id" };
    }
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
      return {
        outcome: "temporary",
        errorCode: `provider_http_${response.status}`,
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      };
    }
    return { outcome: "permanent", errorCode: `provider_http_${response.status}` };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { outcome: "uncertain", errorCode: "provider_timeout_uncertain" };
    }
    return { outcome: "temporary", errorCode: "provider_network_error" };
  } finally {
    clearTimeout(timeout);
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function textToBase64Url(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToBase64Url(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))),
  );
}

export async function createStudentManagementToken(
  job: Pick<ConfirmationJob, "request_id" | "session_id" | "schedule_version" | "scheduled_end">,
  secret: string,
): Promise<string> {
  const payload = textToBase64Url(
    JSON.stringify({
      v: 1,
      requestId: job.request_id,
      sessionId: job.session_id,
      scheduleVersion: job.schedule_version,
      exp: Math.floor(new Date(job.scheduled_end).getTime() / 1000) + 86_400,
    }),
  );
  return `v1.${payload}.${await hmac(payload, secret)}`;
}

function equalConstantTime(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let different = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    different |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return different === 0;
}

export async function verifyStudentManagementToken(
  token: string,
  secret: string,
): Promise<{
  requestId: string;
  sessionId: string;
  scheduleVersion: string;
} | null> {
  const [version, payload, signature, extra] = token.split(".");
  if (version !== "v1" || !payload || !signature || extra || token.length > 1200) return null;
  if (!equalConstantTime(await hmac(payload, secret), signature)) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)),
      ),
    ) as Record<string, unknown>;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (
      decoded["v"] !== 1 ||
      typeof decoded["requestId"] !== "string" ||
      typeof decoded["sessionId"] !== "string" ||
      typeof decoded["scheduleVersion"] !== "string" ||
      !uuid.test(decoded["requestId"]) ||
      !uuid.test(decoded["sessionId"]) ||
      !uuid.test(decoded["scheduleVersion"]) ||
      typeof decoded["exp"] !== "number" ||
      decoded["exp"] < Math.floor(Date.now() / 1000)
    )
      return null;
    return {
      requestId: decoded["requestId"],
      sessionId: decoded["sessionId"],
      scheduleVersion: decoded["scheduleVersion"],
    };
  } catch {
    return null;
  }
}
