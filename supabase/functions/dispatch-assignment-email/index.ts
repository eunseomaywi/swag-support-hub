import { dispatchAssignmentBatch } from "../_shared/assignment-email.ts";
const headers = { "content-type": "application/json", "cache-control": "no-store" };
const env = (name: string) => Deno.env.get(name)?.trim() || "";
async function authorized(request: Request) {
  const expected = env("EMAIL_DISPATCH_SECRET");
  if (!expected) return false;
  const hash = (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [a, b] = await Promise.all([
    hash(expected),
    hash(request.headers.get("x-swag-dispatch-secret") || ""),
  ]);
  return (
    new Uint8Array(a).reduce(
      (difference, byte, i) => difference | (byte ^ new Uint8Array(b)[i]!),
      0,
    ) === 0
  );
}
async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("assignment_rpc_unavailable");
  return (await response.json()) as T;
}
Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405, headers });
  if (!(await authorized(request)))
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers });
  try {
    const processed = await dispatchAssignmentBatch({
      rpc,
      apiKey: env("RESEND_API_KEY"),
      from: env("RESEND_FROM_EMAIL"),
      origin: env("SWAG_PUBLIC_BASE_URL"),
    });
    return new Response(JSON.stringify({ processed }), { headers });
  } catch {
    return new Response(JSON.stringify({ error: "assignment_dispatch_unavailable" }), {
      status: 503,
      headers,
    });
  }
});
