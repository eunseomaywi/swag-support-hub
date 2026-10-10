// Isolated development only. Production builds still require the normal validated environment.
import { execFileSync, spawn } from "node:child_process";
const workdir = process.env.SWAG_CHARTER_DB_DIR || "/private/tmp/swag-charter-validation";
const config = JSON.parse(
  execFileSync("npx", ["supabase", "status", "--workdir", workdir, "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
if (config.API_URL !== "http://127.0.0.1:56321")
  throw new Error("Charter E2E must use the isolated local database.");
execFileSync(
  "docker",
  [
    "exec",
    "supabase_db_swag-charter-validation",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-c",
    "update public.charter_settings set gateway_digest=extensions.digest('charter-local-fixture','sha256') where singleton",
  ],
  { stdio: "ignore" },
);
const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4175"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_SUPABASE_URL: config.API_URL,
    VITE_SUPABASE_ANON_KEY: config.ANON_KEY,
    VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
    PEER_INTAKE_GATEWAY_SECRET: "charter-local-fixture",
    EMAIL_MODE: "disabled",
  },
});
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code) => process.exit(code ?? 1));
