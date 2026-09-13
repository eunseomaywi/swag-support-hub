# SWAG Support Hub deployment

## Fixed targets

- Supabase project ref: `ezjvfrdakzyoaijucqij`
- Supabase URL: `https://ezjvfrdakzyoaijucqij.supabase.co`
- Cloudflare Worker: `swag-support-hub`
- Live URL: `https://swag-support-hub.mymaywi.workers.dev`

Do not deploy this repository against another Supabase project. The browser uses only the Supabase publishable key. A Supabase secret or service-role key must never be placed in a `VITE_*` variable.

## Build configuration

The following build-time variables must be present before `npm run build`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_TURNSTILE_SITE_KEY`

Keep `.env.local` private. Cloudflare Workers Builds is connected, but its build environment did
not provide these variables during the Phase 4 release. Configure the same three names as **Build
variables** before relying on a Git-triggered release. Worker runtime variables are not a substitute
for Vite build-time injection. Until then, build from a verified local production environment and
deploy the resulting bundle manually.

The existing Worker also requires these encrypted runtime secrets:

- `PEER_INTAKE_GATEWAY_SECRET`
- `TURNSTILE_SECRET`
- `TURNSTILE_HOSTNAMES`
- `EMAIL_DISPATCH_SECRET`
- `STUDENT_LINK_SECRET`

Confirmation delivery additionally requires these server-only values before `EMAIL_MODE=live` is
safe:

- `EMAIL_FROM` — a sender already verified for SWAG use
- `EMAIL_REPLY_TO` — optional approved reply address
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET` — required to advance beyond `submitted` using verified delivery events

`EMAIL_MODE` is `disabled`, `test`, or `live` and defaults to `disabled`. Missing provider values
must never be treated as a successful delivery. Configure school period times, location guidance,
and exactly one designated Teacher from **Teacher → Peer Support Overview**. A mentor cannot confirm
an appointment until those school settings are complete.

Public Peer Support intake is closed by default. Set the Worker runtime value
`PEER_INTAKE_ENABLED=true` only after approved operational accounts and a monitoring/handover
process are ready. Local development sets this value in `scripts/dev-local.mjs`.

Never log their values. The gateway secret must match the SHA-256 verifier in the peer-support migration. Rotate it through a follow-up migration and Worker secret update together.

The five-minute Worker cron only retries pending or temporary-failure
`PEER_SESSION_CONFIRMED` outbox rows. It does not calculate appointment lead time and creates no
reminders. Automatic delivery retry is recipient-scoped and capped at five attempts. Resend's
documented idempotency-key retention is 24 hours; this implementation stops an expired processing
lease at 23 hours as `uncertain` instead of assuming indefinite provider deduplication.

## Local verification

1. Start Docker and run `npx supabase start`.
2. Replay locally with `npx supabase db reset --local`.
3. Run `npx supabase test db` and `npm run test:peer-support`.
4. Run `npm run dev:local` for local Supabase plus Cloudflare's documented Turnstile test credentials.
5. Run `npx tsc --noEmit`, `npm run lint`, and `npm run build`.

Local test accounts and synthetic fixtures must never be included in migrations, seeds, builds, or remote Auth.

## Release order

1. Confirm `supabase projects list` identifies only `ezjvfrdakzyoaijucqij` as linked.
2. Review `supabase migration list` and `supabase db push --dry-run`.
3. Apply the tested additive migrations with `supabase db push` without seed flags.
4. Verify remote migration history and database lint.
5. Confirm the three Vite build variables target the dedicated SWAG project without printing their values.
6. Delete ignored `.output`, run a fresh production build, and scan generated files for localhost, old project refs, credentials, and test accounts.
7. Run `wrangler deploy --keep-vars` against the existing Worker so an existing intake gate is not
   changed implicitly.
8. Verify the public site, login, nested protected routes, assets, and unauthorized responses at the live URL.

## Recovery

If public intake must stop, remove or rotate the Worker gateway secret so `/api/peer-support/submit` returns an unavailable response without changing stored data. If a frontend regression occurs, deploy a previously reviewed build only after confirming that its embedded Supabase target is the dedicated SWAG project. Never roll back to a historical Pulse-configured bundle.

The Phase 4 and Phase 5 schemas are additive. Once real requests exist, do not drop tables, reverse
enum values, or edit an applied migration to roll back. Keep intake/email disabled if needed, deploy
a previously reviewed application version only with the SWAG build variables, and use a forward
corrective migration so request, session, action, and delivery records remain intact.
