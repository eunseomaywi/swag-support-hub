import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const expectedSupabaseUrl = "https://ezjvfrdakzyoaijucqij.supabase.co";
const localPath = resolve(".env.local");
const local = {};

if (process.env.SWAG_SKIP_LOCAL_ENV !== "true" && existsSync(localPath)) {
  for (const rawLine of readFileSync(localPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    local[name] = value;
  }
}

const value = (name) => process.env[name]?.trim() || local[name]?.trim() || "";
const supabaseUrl = value("VITE_SUPABASE_URL");
const publishableKey = value("VITE_SUPABASE_ANON_KEY");
const turnstileSiteKey = value("VITE_TURNSTILE_SITE_KEY");
const missing = [
  ["VITE_SUPABASE_URL", supabaseUrl],
  ["VITE_SUPABASE_ANON_KEY", publishableKey],
  ["VITE_TURNSTILE_SITE_KEY", turnstileSiteKey],
]
  .filter(([, configured]) => !configured)
  .map(([name]) => name);

if (missing.length) {
  throw new Error(`Production build blocked: missing ${missing.join(", ")}`);
}
if (supabaseUrl !== expectedSupabaseUrl) {
  throw new Error("Production build blocked: VITE_SUPABASE_URL is not the dedicated SWAG project");
}
if (!publishableKey.startsWith("sb_publishable_")) {
  throw new Error("Production build blocked: VITE_SUPABASE_ANON_KEY must be a publishable key");
}
if (/service_role|sb_secret_/i.test(publishableKey)) {
  throw new Error("Production build blocked: a server-only Supabase key was supplied to Vite");
}
if (
  turnstileSiteKey.length > 100 ||
  /secret/i.test(turnstileSiteKey) ||
  /^[123]x0{10}/.test(turnstileSiteKey)
) {
  throw new Error("Production build blocked: VITE_TURNSTILE_SITE_KEY is invalid");
}

process.stdout.write("Production build environment validated for the SWAG project.\n");
