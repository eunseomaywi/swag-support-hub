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
  // EXECUTE. Identity is read from the immutable confirmation event, not live profiles.
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
