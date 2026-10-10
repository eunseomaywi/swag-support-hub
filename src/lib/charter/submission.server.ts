import { LIMITS, validateSubmission } from "./model";

type RpcResult = { ok: boolean; status: number; data: unknown };
export type CharterGateway = {
  secret: string | undefined;
  originAllowed: (request: Request) => boolean;
  verifyTurnstile: (token: string, request: Request) => Promise<boolean>;
  rpc: (name: string, body: Record<string, unknown>) => Promise<RpcResult>;
};
const HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};
const COOKIE = "swag_charter_session";
function response(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
}
async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const result = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(result), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function session(request: Request, secret: string): Promise<string | null> {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!value || !/^[0-9a-f-]{36}\.\d{10,13}\.[0-9a-f]{64}$/.test(value)) return null;
  const [id, expiry, signature] = value.split(".");
  if (Number(expiry) < Date.now() || Number(expiry) > Date.now() + 86_400_000) return null;
  const expected = await hmac(secret, `charter-cookie/${id}.${expiry}`);
  let difference = 0;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ signature!.charCodeAt(i);
  return difference === 0 ? id! : null;
}
export async function readBoundedJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > LIMITS.bytes)
    throw new Error("payload_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_json");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMITS.bytes) {
        await reader.cancel();
        throw new Error("payload_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export async function handleCharterRequest(
  request: Request,
  gateway: CharterGateway,
): Promise<Response> {
  const isSession = new URL(request.url).pathname === "/api/charter/session";
  if (request.method !== "POST")
    return response({ error: "Method not allowed." }, 405, { Allow: "POST" });
  if (!gateway.originAllowed(request))
    return response({ error: "Request origin was not accepted." }, 403);
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  )
    return response({ error: "Please send JSON." }, 415);
  if (!gateway.secret)
    return response({ error: "Signing is temporarily unavailable. Please try again later." }, 503);
  const existingSession = await session(request, gateway.secret);
  if (isSession) {
    if (existingSession) return response({ ready: true });
    const id = crypto.randomUUID(),
      expires = Date.now() + 86_400_000;
    const signature = await hmac(gateway.secret, `charter-cookie/${id}.${expires}`);
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return response({ ready: true }, 200, {
      "Set-Cookie": `${COOKIE}=${id}.${expires}.${signature}; Path=/api/charter; HttpOnly; SameSite=Strict; Max-Age=86400${secure}`,
    });
  }
  if (!existingSession)
    return response({ error: "Please reopen the signing window and try again." }, 403);
  let body: ReturnType<typeof validateSubmission>;
  let raw: unknown;
  try {
    raw = await readBoundedJson(request);
    body = validateSubmission(raw);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "payload_too_large";
    return response(
      {
        error: tooLarge
          ? "This drawing is too detailed. Please simplify it."
          : error instanceof SyntaxError
            ? "The submission could not be read. Please try again."
            : error instanceof Error
              ? error.message
              : "Invalid submission.",
      },
      tooLarge ? 413 : 400,
    );
  }
  const token = (raw as Record<string, unknown>)["turnstileToken"];
  if (typeof token !== "string" || token.length > 2048 || !token)
    return response({ error: "Please complete the security check." }, 400);
  try {
    if (!(await gateway.verifyTurnstile(token, request)))
      return response({ error: "The security check expired. Please retry." }, 403);
    const burstDay = new Date().toISOString().slice(0, 10);
    const result = await gateway.rpc("submit_charter_signature", {
      p_gateway_secret: gateway.secret,
      p_session_hash: await hmac(gateway.secret, `charter-session/${existingSession}`),
      p_burst_hash: await hmac(
        gateway.secret,
        `charter-burst/${burstDay}/${request.headers.get("cf-connecting-ip") || "local"}`,
      ),
      p_client_submission_id: body.client_submission_id,
      p_strokes: body.strokes,
      p_charter_version: body.charter_version,
    });
    if (!result.ok)
      return response(
        {
          error:
            "Your signature could not be added. Signing may be paused, or you may need to wait a few minutes before retrying.",
        },
        result.status === 429 ? 429 : 400,
      );
    const row = Array.isArray(result.data) ? result.data[0] : null;
    if (!row) return response({ error: "Please retry your submission." }, 502);
    return response({ id: row.id, region_id: row.region_id, created_at: row.created_at }, 201);
  } catch {
    return response(
      { error: "We could not connect. Your drawing is still here; please retry." },
      502,
    );
  }
}
