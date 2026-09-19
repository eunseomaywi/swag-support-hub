import { sendWithGmail, smtpFailure } from "../_shared/gmail-smtp.ts";
import { dispatchConfirmationBatch } from "../_shared/confirmation-dispatch.ts";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function equalSecret(actual: string, expected: string) {
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(actualHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const url = env("SUPABASE_URL");
  // These existing security-definer RPCs grant EXECUTE to anon/authenticated
  // and independently require the dispatch secret. service_role is not granted
  // EXECUTE; reserve it for the narrow, server-only teacher-name reads below.
  const key = env("SUPABASE_ANON_KEY");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`rpc_${name}_${response.status}`);
  return (await response.json()) as T;
}

// Read only the confirmed session's supervising teacher, never request content.
async function teacherName(sessionId: string): Promise<string | null> {
  const headers = {
    apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
    authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
  };
  const sessionResponse = await fetch(
    `${env("SUPABASE_URL")}/rest/v1/peer_sessions?id=eq.${encodeURIComponent(sessionId)}&select=supervisor_teacher_id`,
    { headers },
  );
  if (!sessionResponse.ok) throw new Error("teacher_lookup_failed");
  const sessions = await sessionResponse.json();
  const teacherId = sessions[0]?.supervisor_teacher_id;
  if (!teacherId) return null;
  const profileResponse = await fetch(
    `${env("SUPABASE_URL")}/rest/v1/profiles?id=eq.${encodeURIComponent(teacherId)}&select=full_name`,
    { headers },
  );
  if (!profileResponse.ok) throw new Error("teacher_lookup_failed");
  const profiles = await profileResponse.json();
  return profiles[0]?.full_name || null;
}

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { ...jsonHeaders, allow: "POST" } });
  const dispatchSecret = env("EMAIL_DISPATCH_SECRET");
  if (
    !dispatchSecret ||
    !(await equalSecret(request.headers.get("x-swag-dispatch-secret") || "", dispatchSecret))
  ) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }
  const provider = env("EMAIL_PROVIDER");
  const smtpUser = env("GMAIL_SMTP_USER");
  const smtpPassword = env("GMAIL_SMTP_APP_PASSWORD").replace(/\s+/g, "");
  const replyTo = env("SWAG_EMAIL_REPLY_TO") || env("EMAIL_REPLY_TO");
  const baseUrl = (env("SWAG_PUBLIC_BASE_URL") || "").replace(/\/$/, "");
  if (
    provider !== "gmail" ||
    !smtpUser ||
    !validEmail(smtpUser) ||
    !smtpPassword ||
    (replyTo && !validEmail(replyTo)) ||
    !baseUrl
  ) {
    return new Response(JSON.stringify({ error: "email_configuration_incomplete" }), {
      status: 503,
      headers: jsonHeaders,
    });
  }

  const processed = await dispatchConfirmationBatch({
    secret: dispatchSecret,
    rpc,
    teacherName,
    send: (message) =>
      sendWithGmail(
        { user: smtpUser, password: smtpPassword, ...(replyTo ? { replyTo } : {}) },
        message,
      ),
    failure: smtpFailure,
  });
  return new Response(JSON.stringify({ processed }), {
    status: 200,
    headers: jsonHeaders,
  });
});
