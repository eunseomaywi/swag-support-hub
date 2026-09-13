import "./lib/error-capture";

import { Webhook } from "svix";
import {
  createStudentManagementToken,
  renderConfirmationEmail,
  sendWithResend,
  verifyStudentManagementToken,
  type ConfirmationJob,
  type ProviderResult,
} from "./lib/confirmation-email";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};
type WorkerEnv = {
  PEER_INTAKE_ENABLED?: string;
  PEER_INTAKE_GATEWAY_SECRET?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_HOSTNAMES?: string;
  EMAIL_MODE?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  EMAIL_DISPATCH_SECRET?: string;
  STUDENT_LINK_SECRET?: string;
  PUBLIC_SITE_URL?: string;
};
type WorkerContext = { waitUntil: (promise: Promise<unknown>) => void };
type PeerIntakeBody = {
  turnstileToken?: unknown;
  submissionKey?: unknown;
  studentName?: unknown;
  yearGroup?: unknown;
  contactEmail?: unknown;
  category?: unknown;
  preferredDate?: unknown;
  preferredPeriods?: unknown;
  privateExplanation?: unknown;
};

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const LIVE_URL = "https://swag-support-hub.mymaywi.workers.dev";
const PERIODS = new Set(["break", "lunch_1", "lunch_2"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function envValue(env: WorkerEnv, name: keyof WorkerEnv): string | undefined {
  const runtime = env[name];
  if (runtime) return runtime;
  const processLike = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return processLike.process?.env?.[name];
}
function jsonPrivate(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: PRIVATE_HEADERS });
}
async function readJsonBody(request: Request, maximum = 16_384): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > maximum) throw new Error("body_too_large");
  const raw = await request.text();
  if (raw.length > maximum) throw new Error("body_too_large");
  return JSON.parse(raw) as Record<string, unknown>;
}
function textField(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length <= maximum ? value : null;
}
function allowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
function supabaseConfig(): { url: string; key: string } | null {
  const url = import.meta.env["VITE_SUPABASE_URL"];
  const key = import.meta.env["VITE_SUPABASE_ANON_KEY"];
  return url && key ? { url, key } : null;
}
async function fingerprint(request: Request, secret: string): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") || "local-development";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function deriveManagementToken(submissionKey: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`peer-management/${submissionKey}`),
  );
  return Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T00:00:00+09:00`);
  return (
    !Number.isNaN(instant.getTime()) &&
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(instant) === value
  );
}
function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function verifyTurnstile(
  token: string,
  request: Request,
  secret: string,
  allowedHostnames: string,
): Promise<boolean> {
  const payload = new FormData();
  payload.set("secret", secret);
  payload.set("response", token);
  const remoteIp = request.headers.get("CF-Connecting-IP");
  if (remoteIp) payload.set("remoteip", remoteIp);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: payload,
  });
  if (!response.ok) return false;
  const result = (await response.json()) as {
    success?: boolean;
    action?: string;
    hostname?: string;
  };
  if (secret === "1x0000000000000000000000000000000AA") return result.success === true;
  const hosts = allowedHostnames
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return (
    result.success === true &&
    result.action === "peer_support_intake" &&
    typeof result.hostname === "string" &&
    hosts.includes(result.hostname)
  );
}

async function supabaseRpc<T>(
  name: string,
  body: Record<string, unknown>,
  bearer?: string,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const config = supabaseConfig();
  if (!config) return { ok: false, status: 503, data: null };
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${bearer || config.key}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  });
  let data: T | null = null;
  if (response.ok)
    try {
      data = (await response.json()) as T;
    } catch {
      data = null;
    }
  return { ok: response.ok, status: response.status, data };
}

function emailReadiness(env: WorkerEnv) {
  const rawMode = envValue(env, "EMAIL_MODE") || "disabled";
  const mode = rawMode === "live" || rawMode === "test" ? rawMode : "disabled";
  const from = envValue(env, "EMAIL_FROM");
  const replyTo = envValue(env, "EMAIL_REPLY_TO");
  const configured =
    mode === "live" &&
    Boolean(
      envValue(env, "RESEND_API_KEY") &&
      from &&
      validEmail(from.replace(/^.*<([^>]+)>$/, "$1")) &&
      (!replyTo || validEmail(replyTo)) &&
      envValue(env, "EMAIL_DISPATCH_SECRET") &&
      envValue(env, "STUDENT_LINK_SECRET"),
    );
  return {
    mode,
    configured,
    deliveryTracking: configured && Boolean(envValue(env, "RESEND_WEBHOOK_SECRET")),
  };
}

async function handlePeerIntake(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, Allow: "POST" } });
  if (envValue(env, "PEER_INTAKE_ENABLED") !== "true")
    return jsonPrivate(
      { error: "Peer Support requests are not open while staff monitoring is being prepared." },
      503,
    );
  if (!allowedOrigin(request))
    return jsonPrivate({ error: "Request origin was not accepted." }, 403);
  const gatewaySecret = envValue(env, "PEER_INTAKE_GATEWAY_SECRET");
  const turnstileSecret = envValue(env, "TURNSTILE_SECRET");
  const allowedHostnames = envValue(env, "TURNSTILE_HOSTNAMES");
  if (!gatewaySecret || !turnstileSecret || !allowedHostnames || !supabaseConfig())
    return jsonPrivate({ error: "Peer Support intake is not available yet." }, 503);
  let body: PeerIntakeBody;
  try {
    body = (await readJsonBody(request)) as PeerIntakeBody;
  } catch {
    return jsonPrivate({ error: "Please check the form and try again." }, 400);
  }
  const turnstileToken = textField(body.turnstileToken, 4096);
  if (!turnstileToken) return jsonPrivate({ error: "Please complete the security check." }, 400);
  try {
    if (!(await verifyTurnstile(turnstileToken, request, turnstileSecret, allowedHostnames)))
      return jsonPrivate({ error: "The security check expired. Please try again." }, 403);
  } catch {
    return jsonPrivate(
      { error: "The security check could not be verified. Please try again." },
      502,
    );
  }
  const studentName = textField(body.studentName, 100)?.trim();
  const yearGroup = textField(body.yearGroup, 20);
  const contactEmail = textField(body.contactEmail, 254)?.trim().toLowerCase();
  const category = textField(body.category, 80);
  const preferredDate = textField(body.preferredDate, 10);
  const privateExplanation =
    body.privateExplanation === undefined ? "" : textField(body.privateExplanation, 2000);
  const submissionKey = textField(body.submissionKey, 36);
  const preferredPeriods = Array.isArray(body.preferredPeriods)
    ? body.preferredPeriods.filter((period): period is string => typeof period === "string")
    : [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  if (
    !studentName ||
    !yearGroup ||
    !contactEmail ||
    !category ||
    !preferredDate ||
    privateExplanation === null ||
    !submissionKey ||
    !UUID.test(submissionKey) ||
    !validEmail(contactEmail) ||
    !validDate(preferredDate) ||
    preferredDate < today ||
    preferredPeriods.length < 1 ||
    preferredPeriods.length > 3 ||
    new Set(preferredPeriods).size !== preferredPeriods.length ||
    preferredPeriods.some((period) => !PERIODS.has(period))
  ) {
    return jsonPrivate({ error: "Please check the form and try again." }, 400);
  }
  const rpcResponse = await supabaseRpc<
    Array<{ request_id: string; management_token: string; expires_at: string }>
  >("submit_peer_support_request", {
    p_gateway_secret: gatewaySecret,
    p_client_fingerprint: await fingerprint(request, gatewaySecret),
    p_submission_key: submissionKey,
    p_management_token: await deriveManagementToken(submissionKey, gatewaySecret),
    p_student_name: studentName,
    p_year_group: yearGroup,
    p_contact_email: contactEmail,
    p_category: category,
    p_preferred_date: preferredDate,
    p_preferred_periods: preferredPeriods,
    p_private_explanation: privateExplanation.trim() || null,
  });
  if (!rpcResponse.ok)
    return jsonPrivate(
      {
        error:
          rpcResponse.status === 429
            ? "Please wait before trying again."
            : "Your request could not be submitted. Please try again.",
      },
      rpcResponse.status === 429 ? 429 : 400,
    );
  const result = rpcResponse.data?.[0];
  return result
    ? jsonPrivate(
        {
          requestId: result.request_id,
          managementToken: result.management_token,
          expiresAt: result.expires_at,
        },
        201,
      )
    : jsonPrivate({ error: "Your request could not be submitted." }, 502);
}

async function finishJob(
  env: WorkerEnv,
  job: ConfirmationJob,
  workerId: string,
  result: ProviderResult,
) {
  const secret = envValue(env, "EMAIL_DISPATCH_SECRET");
  if (!secret) return;
  await supabaseRpc("finish_confirmation_email_job", {
    p_dispatch_secret: secret,
    p_job_id: job.job_id,
    p_worker_id: workerId,
    p_outcome: result.outcome,
    p_provider_message_id: result.outcome === "submitted" ? result.messageId : null,
    p_error_code: "errorCode" in result ? result.errorCode : null,
    p_retry_after_seconds:
      result.outcome === "temporary" ? (result.retryAfterSeconds ?? null) : null,
  });
}
async function processEmailOutbox(env: WorkerEnv, siteUrl = LIVE_URL): Promise<void> {
  if (!emailReadiness(env).configured) return;
  const dispatchSecret = envValue(env, "EMAIL_DISPATCH_SECRET");
  const linkSecret = envValue(env, "STUDENT_LINK_SECRET");
  const apiKey = envValue(env, "RESEND_API_KEY");
  const from = envValue(env, "EMAIL_FROM");
  if (!dispatchSecret || !linkSecret || !apiKey || !from) return;
  const workerId = crypto.randomUUID();
  const claim = await supabaseRpc<ConfirmationJob[]>("claim_confirmation_email_jobs", {
    p_dispatch_secret: dispatchSecret,
    p_worker_id: workerId,
    p_limit: 10,
    p_lease_seconds: 120,
  });
  if (!claim.ok || !claim.data?.length) return;
  await Promise.all(
    claim.data.map(async (job) => {
      const studentToken = await createStudentManagementToken(job, linkSecret);
      const base = siteUrl.replace(/\/$/, "");
      const message = renderConfirmationEmail(job, {
        student: `${base}/peer-support/manage#confirmation=${studentToken}`,
        mentor: `${base}/${job.mentor_role === "swag_member" ? "swag" : "peer-mentor"}/cases/${job.request_id}`,
        teacher: `${base}/teacher/peer-support?request=${job.request_id}`,
      });
      const replyTo = envValue(env, "EMAIL_REPLY_TO");
      const result = await sendWithResend(message, {
        apiKey,
        from,
        idempotencyKey: job.idempotency_key,
        ...(replyTo ? { replyTo } : {}),
      });
      await finishJob(env, job, workerId, result);
    }),
  );
}

async function authenticatedRole(request: Request): Promise<string | null> {
  const authorization = request.headers.get("authorization");
  const config = supabaseConfig();
  if (!authorization?.startsWith("Bearer ") || !config) return null;
  const response = await fetch(`${config.url}/rest/v1/rpc/current_app_role`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) return null;
  const role = await response.json();
  return typeof role === "string" ? role : null;
}
async function handleDispatchKick(request: Request, env: WorkerEnv, ctx: WorkerContext) {
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, Allow: "POST" } });
  if (!allowedOrigin(request))
    return jsonPrivate({ error: "Request origin was not accepted." }, 403);
  const role = await authenticatedRole(request);
  if (!role || !["peer_mentor", "swag_member", "teacher"].includes(role))
    return jsonPrivate({ error: "Authentication required." }, 401);
  ctx.waitUntil(processEmailOutbox(env, new URL(request.url).origin));
  return jsonPrivate({ accepted: true }, 202);
}
async function handleSignedManagement(request: Request, env: WorkerEnv) {
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, Allow: "POST" } });
  if (!allowedOrigin(request))
    return jsonPrivate({ error: "Request origin was not accepted." }, 403);
  const dispatchSecret = envValue(env, "EMAIL_DISPATCH_SECRET");
  const linkSecret = envValue(env, "STUDENT_LINK_SECRET");
  if (!dispatchSecret || !linkSecret)
    return jsonPrivate({ error: "Management link service is not configured." }, 503);
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request, 4096);
  } catch {
    return jsonPrivate({ error: "Invalid request." }, 400);
  }
  const token = textField(body["token"], 1200);
  const action = body["action"];
  if (!token || (action !== "status" && action !== "cancel"))
    return jsonPrivate({ error: "Invalid request." }, 400);
  const verified = await verifyStudentManagementToken(token, linkSecret);
  if (!verified) return jsonPrivate({ error: "This private link is invalid or expired." }, 403);
  const rpc = await supabaseRpc<Array<Record<string, unknown>>>(
    action === "cancel" ? "cancel_peer_request_internal" : "get_peer_request_management_internal",
    {
      p_dispatch_secret: dispatchSecret,
      p_request_id: verified.requestId,
      p_session_id: verified.sessionId,
      p_schedule_version: verified.scheduleVersion,
    },
  );
  return rpc.ok && rpc.data?.[0]
    ? jsonPrivate(rpc.data[0])
    : jsonPrivate({ error: "This private link is no longer active." }, 403);
}
async function handleResendWebhook(request: Request, env: WorkerEnv) {
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, Allow: "POST" } });
  const webhookSecret = envValue(env, "RESEND_WEBHOOK_SECRET");
  const dispatchSecret = envValue(env, "EMAIL_DISPATCH_SECRET");
  if (!webhookSecret || !dispatchSecret)
    return jsonPrivate({ error: "Webhook is not configured." }, 503);
  if (Number(request.headers.get("content-length") || "0") > 65_536)
    return jsonPrivate({ error: "Payload too large." }, 413);
  const payload = await request.text();
  if (payload.length > 65_536) return jsonPrivate({ error: "Payload too large." }, 413);
  let event: unknown;
  try {
    event = new Webhook(webhookSecret).verify(payload, {
      "svix-id": request.headers.get("svix-id") || "",
      "svix-timestamp": request.headers.get("svix-timestamp") || "",
      "svix-signature": request.headers.get("svix-signature") || "",
    });
  } catch {
    return jsonPrivate({ error: "Invalid webhook signature." }, 400);
  }
  if (!event || typeof event !== "object")
    return jsonPrivate({ error: "Invalid webhook event." }, 400);
  const item = event as Record<string, unknown>;
  const data = item["data"] as Record<string, unknown> | undefined;
  const eventId = request.headers.get("svix-id");
  const eventType = item["type"];
  const createdAt = item["created_at"];
  const messageId = data?.["email_id"];
  if (
    !eventId ||
    typeof eventType !== "string" ||
    typeof createdAt !== "string" ||
    typeof messageId !== "string"
  )
    return jsonPrivate({ error: "Invalid webhook event." }, 400);
  const recorded = await supabaseRpc<boolean>("record_confirmation_email_webhook", {
    p_dispatch_secret: dispatchSecret,
    p_provider_event_id: eventId,
    p_provider_message_id: messageId,
    p_event_type: eventType,
    p_event_created_at: createdAt,
  });
  return recorded.ok
    ? jsonPrivate({ accepted: true }, 202)
    : jsonPrivate({ error: "Webhook event was rejected." }, 400);
}

let serverEntryPromise: Promise<ServerEntry> | undefined;
async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise)
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (module) => (module.default ?? module) as ServerEntry,
    );
  return serverEntryPromise;
}
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (
    response.status < 500 ||
    !(response.headers.get("content-type") ?? "").includes("application/json")
  )
    return response;
  const body = await response.clone().text();
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    if (payload.unhandled !== true || payload.message !== "HTTPError") return response;
  } catch {
    return response;
  }
  console.error(consumeLastCapturedError() ?? new Error("SSR request failed"));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, rawEnv: unknown, rawCtx: unknown) {
    const env = (rawEnv ?? {}) as WorkerEnv;
    const ctx = rawCtx as WorkerContext;
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/peer-support/status") {
        if (request.method !== "GET")
          return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, Allow: "GET" } });
        return jsonPrivate({
          enabled: envValue(env, "PEER_INTAKE_ENABLED") === "true",
          email: emailReadiness(env),
        });
      }
      if (url.pathname === "/api/peer-support/submit") return await handlePeerIntake(request, env);
      if (url.pathname === "/api/peer-support/email/kick")
        return await handleDispatchKick(request, env, ctx);
      if (url.pathname === "/api/peer-support/manage")
        return await handleSignedManagement(request, env);
      if (url.pathname === "/api/email/resend-webhook")
        return await handleResendWebhook(request, env);
      const handler = await getServerEntry();
      const response = await normalizeCatastrophicSsrResponse(
        await handler.fetch(request, rawEnv, rawCtx),
      );
      if (url.pathname === "/peer-support/manage") {
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "private, no-store, max-age=0");
        headers.set("Referrer-Policy", "no-referrer");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
      return response;
    } catch (error) {
      console.error(
        error instanceof Error ? { name: error.name, message: error.message } : "request_failed",
      );
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
  async scheduled(_controller: unknown, rawEnv: unknown, rawCtx: unknown) {
    (rawCtx as WorkerContext).waitUntil(processEmailOutbox((rawEnv ?? {}) as WorkerEnv));
  },
};
