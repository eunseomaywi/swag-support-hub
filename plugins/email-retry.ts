import { definePlugin } from "nitro";
import app from "../src/server";

// Nitro owns the deployed Worker's scheduled handler; the TanStack SSR entry's
// scheduled method alone is not called by Cloudflare.
export default definePlugin((nitro) => {
  nitro.hooks.hook("cloudflare:scheduled", async ({ controller, env, context }) => {
    await app.scheduled(controller, env, context);
  });
});
