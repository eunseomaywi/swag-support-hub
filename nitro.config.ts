import { defineConfig } from "nitro";

export default defineConfig({ plugins: ["./plugins/email-retry.ts"] });
