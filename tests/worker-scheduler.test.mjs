import assert from "node:assert/strict";
import test from "node:test";
import worker from "../.output/server/index.mjs";
test("actual deployed Nitro scheduled handler dispatches both queues without a browser", async (t) => {
  const urls = [],
    tasks = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(String(url));
    return Response.json({ processed: 0 });
  });
  worker.scheduled(
    { cron: "*/5 * * * *", scheduledTime: Date.now() },
    { EMAIL_MODE: "live", EMAIL_EDGE_FUNCTION_ENABLED: "true", EMAIL_DISPATCH_SECRET: "test-only" },
    {
      waitUntil(task) {
        tasks.push(task);
      },
    },
  );
  await Promise.all(tasks);
  assert.equal(urls.length, 2);
  assert.ok(
    urls.every((url) => url.startsWith("https://ezjvfrdakzyoaijucqij.supabase.co/functions/v1/")),
  );
  assert.ok(urls.some((url) => url.endsWith("/dispatch-confirmation-email")));
  assert.ok(urls.some((url) => url.endsWith("/dispatch-assignment-email")));
});
