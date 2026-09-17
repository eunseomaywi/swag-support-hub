# Peer Support booking operations

## Workflow and permissions

1. A student submits one requested date, one or more allowed periods, and a short explanation. Submission creates an `open` request and a 90-day management token; it does not create a meeting or email.
2. An active Peer Mentor or SWAG Member can `Accept` atomically (`self_claim`). A Teacher can assign an active supporter (`teacher_assignment`). Pass/Undo is private to each supporter. Assignment creates no meeting or email.
3. The assigned supporter opens **My Cases**, chooses one of the student's submitted periods, and selects **Confirm Meeting**. The database transaction snapshots the school period, location, supporter and supervising Teacher, creates one confirmation event, and creates one delivery row per recipient.
4. An active meeting is `scheduled`, then may become `completed`, `cancelled`, `no_show`, or `escalated`. Those outcome changes do not send email. A confirmed schedule is not silently edited; cancel it and use an explicit new request/confirmation process.

Anonymous users and students cannot read internal requests. Peer Mentors cannot read Concerns or another supporter's assigned case. SWAG Members retain their separate Concern/escalation permissions. Teacher assignment and settings RPCs always re-check the trusted `profiles.role` plus active `staff_members.booking_enabled` state. Browser metadata is never an authority.

## School settings

Teacher → Peer Support Overview configures:

- Break, 1st Lunch and 2nd Lunch start/end times (Asia/Seoul)
- active school weekdays
- approved location or location guidance
- one active supervising Teacher
- assignment attention threshold (default 24 hours; this is a highlight only, not automatic assignment)

Times and locations must come from the school. Do not invent them. The supervising Teacher is notified but is not automatically treated as an attendee, and their other meetings are not blocked solely because they supervise.

## Email delivery

Only `PEER_SESSION_CONFIRMED` email exists. Student, assigned supporter and supervising Teacher each receive a separate message. The student's request text, notes, risk labels and management token are not included.

Cloudflare's five-minute cron calls the JWT-protected Supabase Edge Function `dispatch-confirmation-email`. It also supplies `EMAIL_DISPATCH_SECRET`, so a public anon key alone cannot dispatch. The Edge Function claims recipient jobs with leases, sends through Resend with a stable recipient idempotency key, and finalises only that recipient's row. A browser is not required to remain open.

Statuses distinguish `queued`, `processing`, provider-accepted `submitted`, `delivered`, `retrying`, `failed`, `suppressed`, and `uncertain`. `delivered` means a verified provider delivery event, not that the person opened or personally confirmed the message. Timeouts outside the provider idempotency window become `uncertain` for review instead of blind resend.

Required Supabase Edge Function secrets:

- `RESEND_API_KEY`
- `EMAIL_DISPATCH_SECRET`
- `SWAG_EMAIL_FROM` (verified sender, for example `SWAG <address@verified-domain>`)
- `SWAG_PUBLIC_BASE_URL`
- optional `SWAG_EMAIL_REPLY_TO` only when it is monitored

Required Cloudflare Worker settings:

- encrypted `EMAIL_DISPATCH_SECRET` matching Supabase
- `EMAIL_EDGE_FUNCTION_ENABLED=true`
- `EMAIL_MODE=live` only after all checks pass
- `EMAIL_FROM` mirroring the approved sender so Teacher setup status can fail closed
- optional `EMAIL_REPLY_TO`
- `RESEND_WEBHOOK_SECRET` for the Worker webhook endpoint

The Resend key remains in Supabase only; do not copy it into Cloudflare, GitHub, `VITE_*`, or browser code.

Before enabling live delivery, verify the sender domain in the authorised Resend account, confirm the key can send from that domain, and validate all three stored recipient addresses. `onboarding@resend.dev`, a `workers.dev` hostname, or another project's domain is not a production sender.

## Webhook and retries

Register `https://swag-support-hub.mymaywi.workers.dev/api/email/resend-webhook` for the needed Resend events: sent, delivered, delivery delayed, failed, bounced, complained and suppressed. Store the signing secret only as Worker `RESEND_WEBHOOK_SECRET`. The endpoint verifies the raw Svix-signed body, deduplicates event IDs, maps provider message IDs, and ignores older state-regressing events.

Teacher can retry only `failed` or `uncertain` recipients while the meeting remains active. Successful recipients are not resent. Bounce, complaint and suppression are terminal. Cancelling, completing, marking no-show, or escalating suppresses any unsent confirmation jobs and never rolls back the meeting merely because email failed. Cancellation sends no automatic email; staff must use the school's direct-contact procedure when notice is needed.

## Test and release

```sh
npx supabase start
npx supabase db reset --local
npx supabase test db
PHASE5_DISPATCH_SECRET_FILE=/private/tmp/local-secret npm run test:peer-support
npm run test:email
npx tsc --noEmit
npm run lint
npm run build
npx wrangler deploy --dry-run --keep-vars
```

Release order:

1. Confirm the linked Supabase ref is `ezjvfrdakzyoaijucqij` and dry-run the single forward migration.
2. Apply the additive migration. Never reset production or edit applied migration files.
3. Rotate the shared dispatch secret in Supabase and the existing Worker together.
4. Deploy `dispatch-confirmation-email` with JWT verification enabled.
5. Deploy the verified commit to the existing `swag-support-hub` Worker with `--keep-vars`.
6. Smoke-test public pages, login, protected direct routes, form availability and unauthorised endpoints. Perform a real email E2E only with an approved sender, schedule, accounts and recipients.

If a release problem occurs, keep intake/email disabled, redeploy the last reviewed Worker build, and write a forward corrective migration. Do not delete request, session, action, outbox or provider-event history, and do not confuse application rollback with database rollback.
