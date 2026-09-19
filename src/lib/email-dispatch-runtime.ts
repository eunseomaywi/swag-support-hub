import type { ServerRequest } from "srvx";

type WaitUntilContext = { waitUntil(promise: Promise<unknown>): void | Promise<void> };

function hasWaitUntil(value: unknown): value is WaitUntilContext {
  return (
    value !== null &&
    typeof value === "object" &&
    "waitUntil" in value &&
    typeof value.waitUntil === "function"
  );
}

// Nitro 3's Cloudflare adapter augments the request, then calls app.fetch(req).
// It does not forward the Worker's positional env/context arguments to the app.
export async function dispatchWithLifetime(
  request: ServerRequest | undefined,
  rawContext: unknown,
  dispatch: () => Promise<void>,
): Promise<void> {
  const task = Promise.resolve()
    .then(dispatch)
    .catch(() => {
      // Recipient failures are recorded by the dispatcher. A transport/dispatcher
      // failure leaves the existing outbox available for retry, never alters booking.
      console.error({ event: "confirmation_email_dispatch_failed" });
    });
  const context = request?.runtime?.cloudflare?.context ?? rawContext;
  try {
    if (hasWaitUntil(context)) {
      await context.waitUntil(task);
      return;
    }
    if (typeof request?.waitUntil === "function") {
      await request.waitUntil(task);
      return;
    }
  } catch {
    console.error({ event: "confirmation_email_lifetime_unavailable" });
  }
  await task;
}
