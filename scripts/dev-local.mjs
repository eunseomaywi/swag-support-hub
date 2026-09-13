import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readLocalSupabaseEnvironment() {
  let status;
  try {
    const cli = process.env.SUPABASE_CLI_PATH;
    status = execFileSync(
      cli || "npx",
      cli ? ["status", "-o", "env"] : ["--offline", "supabase", "status", "-o", "env"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch {
    throw new Error(
      "Local Supabase is not available. Start it with `npx supabase start`, then try again.",
    );
  }

  const value = (name) => {
    const match = status.match(new RegExp(`^${name}=(?:"([^"]*)"|'([^']*)'|([^\\n]*))$`, "m"));
    return match?.[1] ?? match?.[2] ?? match?.[3]?.trim() ?? null;
  };

  const url = value("API_URL");
  const publishableKey = value("ANON_KEY") ?? value("PUBLISHABLE_KEY");
  if (!url || !publishableKey) {
    throw new Error("The local Supabase URL or publishable key could not be read.");
  }

  return { url, publishableKey };
}

const { url, publishableKey } = readLocalSupabaseEnvironment();
let gatewaySecret;
try {
  gatewaySecret = readFileSync(resolve("supabase/.temp/peer-intake-gateway-secret"), "utf8").trim();
} catch {
  throw new Error(
    "The local Peer Support gateway secret is missing. Recreate the local-only secret first.",
  );
}
const child = spawn("npm", ["run", "dev", "--", ...process.argv.slice(2)], {
  env: {
    ...process.env,
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: publishableKey,
    VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
    TURNSTILE_HOSTNAMES: "localhost,127.0.0.1",
    PEER_INTAKE_ENABLED: "true",
    PEER_INTAKE_GATEWAY_SECRET: gatewaySecret,
    EMAIL_MODE: "disabled",
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
