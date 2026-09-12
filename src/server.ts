import "./lib/error-capture";

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
};

type PeerIntakeBody = {
  turnstileToken?: unknown;
  studentName?: unknown;
  yearGroup?: unknown;
  contactEmail?: unknown;
  category?: unknown;
  preferredDate?: unknown;
  preferredTime?: unknown;
  privateExplanation?: unknown;
};

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
};

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

async function readJsonBody(request: Request): Promise<PeerIntakeBody> {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 16_384) throw new Error("body_too_large");
  const raw = await request.text();
  if (raw.length > 16_384) throw new Error("body_too_large");
  return JSON.parse(raw) as PeerIntakeBody;
}

function textField(value: unknown, maximum: number): string | null {
  if (typeof value !== "string" || value.length > maximum) return null;
  return value;
}

function allowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
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
  // Cloudflare's documented local test credential returns a synthetic hostname/action.
  // This branch cannot activate with a production widget secret.
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

async function handlePeerIntake(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, Allow: "POST" } });
  }
  if (envValue(env, "PEER_INTAKE_ENABLED") !== "true") {
    return jsonPrivate(
      { error: "Peer Support requests are not open while staff monitoring is being prepared." },
      503,
    );
  }
  if (!allowedOrigin(request))
    return jsonPrivate({ error: "Request origin was not accepted." }, 403);

  const gatewaySecret = envValue(env, "PEER_INTAKE_GATEWAY_SECRET");
  const turnstileSecret = envValue(env, "TURNSTILE_SECRET");
  const allowedHostnames = envValue(env, "TURNSTILE_HOSTNAMES");
  const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
  const publishableKey = import.meta.env["VITE_SUPABASE_ANON_KEY"];
  if (!gatewaySecret || !turnstileSecret || !allowedHostnames || !supabaseUrl || !publishableKey) {
    return jsonPrivate({ error: "Peer Support intake is not available yet." }, 503);
  }

  let body: PeerIntakeBody;
  try {
    body = await readJsonBody(request);
  } catch {
    return jsonPrivate({ error: "Please check the form and try again." }, 400);
  }

  const turnstileToken = textField(body.turnstileToken, 4096);
  if (!turnstileToken) return jsonPrivate({ error: "Please complete the security check." }, 400);
  let verified = false;
  try {
    verified = await verifyTurnstile(turnstileToken, request, turnstileSecret, allowedHostnames);
  } catch {
    return jsonPrivate(
      { error: "The security check could not be verified. Please try again." },
      502,
    );
  }
  if (!verified)
    return jsonPrivate({ error: "The security check expired. Please try again." }, 403);

  const fields = {
    studentName: textField(body.studentName, 100),
    yearGroup: textField(body.yearGroup, 20),
    contactEmail: textField(body.contactEmail, 254),
    category: textField(body.category, 80),
    preferredDate: textField(body.preferredDate, 10),
    preferredTime: textField(body.preferredTime, 20),
    privateExplanation: textField(body.privateExplanation, 2000),
  };
  if (Object.values(fields).some((value) => value === null)) {
    return jsonPrivate({ error: "Please check the form and try again." }, 400);
  }

  const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/submit_peer_support_request`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({
      p_gateway_secret: gatewaySecret,
      p_client_fingerprint: await fingerprint(request, gatewaySecret),
      p_student_name: fields.studentName,
      p_year_group: fields.yearGroup,
      p_contact_email: fields.contactEmail,
      p_category: fields.category,
      p_preferred_date: fields.preferredDate,
      p_preferred_time: fields.preferredTime,
      p_private_explanation: fields.privateExplanation || null,
    }),
  });
  if (!rpcResponse.ok) {
    return jsonPrivate(
      {
        error:
          rpcResponse.status === 429
            ? "Please wait before trying again."
            : "Your request could not be submitted. Please try again.",
      },
      rpcResponse.status === 429 ? 429 : 400,
    );
  }
  const rows = (await rpcResponse.json()) as Array<{
    request_id: string;
    management_token: string;
    expires_at: string;
  }>;
  const result = rows[0];
  if (!result) return jsonPrivate({ error: "Your request could not be submitted." }, 502);
  return jsonPrivate(
    {
      requestId: result.request_id,
      managementToken: result.management_token,
      expiresAt: result.expires_at,
    },
    201,
  );
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/peer-support/status") {
        if (request.method !== "GET") {
          return new Response(null, {
            status: 405,
            headers: { ...PRIVATE_HEADERS, Allow: "GET" },
          });
        }
        return jsonPrivate({
          enabled: envValue((env ?? {}) as WorkerEnv, "PEER_INTAKE_ENABLED") === "true",
        });
      }
      if (url.pathname === "/api/peer-support/submit") {
        return await handlePeerIntake(request, (env ?? {}) as WorkerEnv);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
