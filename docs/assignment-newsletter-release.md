# Teacher assignment, requested-date countdown and web newsletter

Fixed targets: `eunseomaywi/swag-support-hub`, `main`, Worker `swag-support-hub`,
Supabase `ezjvfrdakzyoaijucqij`. This is an additive release; no historical assignment backfill.

## Email execution

Existing confirmation email continues through `dispatch-confirmation-email` using Gmail SMTP
(`EMAIL_PROVIDER=gmail`, `GMAIL_SMTP_USER`, `GMAIL_SMTP_APP_PASSWORD`). The existing student,
supporter and designated supervisor recipients and confirmation template output are preserved.

Teacher UI posts IDs to `/api/peer-support/teacher-assignment`. Worker verifies the session and
forwards only request/supporter IDs to the existing atomic assignment RPC. Its row lock still
serializes self-claim and Teacher assignment. A DB trigger checks the authenticated Teacher,
active staff registration and the assigned account, then inserts exactly one
`TEACHER_ASSIGNMENT` event in `peer_assignment_email_outbox` in the assignment transaction.
It does not backfill, send for self-claim/no-op, or contact the old assignee.

`dispatch-assignment-email` is a JWT-protected Supabase Edge Function that also requires the
existing dispatch secret. Its service-role-only RPCs lease a single job with `SKIP LOCKED`,
recheck the live request/assignee immediately before sending, and persist the entire Resend
payload before the API call. The key is `teacher-assignment/{event_id}/{recipient_id}`.
Retries reuse both payload and key. No provider call runs inside a database transaction.

States: `pending`, `processing`, `provider-accepted`, `failed`, `needs-review`, `superseded`.
Provider acceptance does not mean inbox delivery. HTTP 429/408/5xx and uncertain transport
failures use bounded backoff, at most five attempts. Permanent configuration/provider errors
stop automatically. After 23 hours from the first attempt (a margin within Resend's documented
24-hour window), uncertain/pending work becomes `needs-review`, never a fresh send.
An operator must investigate provider records before resolving review items; no blind resend UI
is provided. Teacher retry processes the existing eligible failed event, not a new assignment.

The deployed Nitro `cloudflare:scheduled` hook in `plugins/email-retry.ts` calls both dispatchers
every five minutes. Immediate post-commit dispatch uses the existing lifetime helper. Either
provider can fail independently. Old confirmation dispatchers cannot see assignment jobs.
There are no reminder, cancellation, intake or newsletter emails.

## Runtime prerequisites

Supabase Edge Functions Secrets (never browser/build variables):

- `RESEND_API_KEY`: already present; actual usability is not established by secret presence.
- `RESEND_FROM_EMAIL`: bare mailbox at a verified, authorized Resend sending domain; missing at inspection.
- `SWAG_PUBLIC_BASE_URL`: existing trusted origin, not the incoming Host header.
- `EMAIL_DISPATCH_SECRET`: existing value shared with Worker.

Do not substitute the Gmail confirmation sender, school domain, `workers.dev`, or
`onboarding@resend.dev` without legitimate domain authorization. A missing sender produces
`failed / configuration_missing`; assignment still succeeds. Once an approved sender is set,
retry eligible failed events through Teacher detail; older uncertain sends require review.
Never paste secrets into a chat or commit them. Configure via Supabase dashboard Secrets or
the CLI's supported secure input, without printing values. No Cloudflare secret changes are needed.

Resend reference: https://resend.com/docs/dashboard/emails/idempotency-keys

## D-day

`preferred_date` is interpreted as 00:00 Asia/Seoul. One shared 60-second browser clock refreshes
on focus/visibility, cleans up when unused, and has a stable null SSR snapshot. It does not query
the DB or expire requests. Both supporter queues and the Teacher list use the same badge,
absolute date and allowed periods. Current dashboards show counts/links, not duplicate request previews.

## Newsletter release gate

Original text is in `src/content/newsletters.ts`; existing ActivityArchive provides accessible
dialog navigation and a typed `newsletter` search parameter. Production displays the section
only when all three actual PNG files pass the build-time signature/dimension check:

- `public/images/activities/newsletter/peer-mentoring.png`
- `public/images/activities/newsletter/student-voice.png`
- `public/images/activities/newsletter/wellbeing-tips.png`

All three were supplied during implementation under `public/activities/newsletter/` and copied
without modification to the required paths above. Dimensions: peer-mentoring 580×592,
student-voice 748×734, wellbeing-tips 542×512. They use object-contain and explicit intrinsic
dimensions. The source files remain untouched. The gate now enables production newsletter
publication. Development retains a safe fallback for future missing artwork. No AI artwork,
unrelated photos, PDF iframe or invented URLs are used. Tags are also rendered as HTML text,
including those already present within the supplied student-voice artwork.

## Validation and rollback

Run `npm run test:assignment`, `npm run test:email`, `npm run test:readiness`,
`node --import tsx --test tests/supporter-identity.test.ts`, `npx tsc --noEmit`, `npm run lint`,
`npm run build`, `node --test tests/worker-routes.test.mjs tests/worker-scheduler.test.mjs`.
DB tests must run on an isolated local Supabase stack; `scripts/test-assignment-concurrency.mjs`
explicitly targets `supabase_db_swag-assignment-isolated` and never a remote DSN.
Do not run the concurrency fixtures alongside pgTAP suites that assert whole-table counts.
`node --import tsx scripts/browser-newsletter.mjs` checks local public UI at port 8080;
`SWAG_BROWSER_ORIGIN` can point to production for public regression checks without test writes.
`node scripts/browser-assignment-roles.mjs` uses the isolated local project and synthetic
accounts to check all three roles, requested-date badges in America/Los_Angeles, Teacher
list privacy, Concern access and login return-to. It never sends provider email.

Validation completed before release: 184 pgTAP assertions across six suites; eight concurrent
assignment/self-claim races and concurrent dispatcher leasing; 11 assignment/date/newsletter
unit/Edge tests; 10 existing confirmation tests; six built Worker route/scheduler tests; five
readiness and two identity tests. TypeScript and production build passed. ESLint passed with
six pre-existing Fast Refresh warnings. Public newsletter navigation was tested at 375, 768
and 1440px (subsequently repeated with the supplied PNGs); authenticated local queues at
375 and 1440px. Provider tests are mocks, not real Resend acceptance or inbox delivery.

Pre-release source: `1445770f7d1a018356aea35b3022c60e12c804b8`.
Pre-release Worker version: `cc281ff3-c76d-45ef-9bfa-77ba432f1cae`.

Prepare backend before GitHub push (Workers Builds is connected): deploy additive migration,
then the assignment dispatcher, then push and deploy the verified Worker with `--keep-vars`.
If rollback is necessary, roll the Worker back to the recorded version and keep the additive
outbox/schema. Existing assignment RPC signatures and confirmation queue remain compatible.
Do not reset the production DB, delete events, or rewrite pushed Git history. If assignment
sending must stop, remove the assignment sender setting in Supabase; Gmail confirmation
settings must remain intact. Correct schema problems with a new forward migration.

## Actual release record — 26 September 2026

- Application source: local commit `4b82618c240c3d064e25c2615704ac1b58d7a1d7`
  (includes implementation commit `3d299b2`). Built in a clean, detached worktree so the
  untracked original artwork directory was not included in the deployed artifact.
- Applied remote migration: `20260926090000_teacher_assignment_email.sql`.
  Remote schema lint reported no errors. No historical assignment events were created
  (outbox count was zero at verification); anonymous/authenticated dispatcher RPC access
  remains denied.
- Supabase functions: `dispatch-assignment-email` ACTIVE version 1 and
  `dispatch-confirmation-email` ACTIVE version 11, both with JWT verification enabled.
- Existing Worker deployed with `--keep-vars`; version
  `496e786a-9751-4a62-85a8-fcfc2c7b1fa8`, tag `4b82618`, serving 100% of traffic.
  A real `*/5 * * * *` scheduled event was observed with outcome `ok`, no exceptions
  and no error logs. This proves scheduler execution, not email provider acceptance.
- Public production URL: https://swag-support-hub.mymaywi.workers.dev . HTTP checks passed
  for `/`, `/activities`, newsletter direct access, `/login` and `/form/booking`.
  All three specified image URLs returned actual PNG bytes and `image/png`, not an HTML fallback.
- `SWAG_BROWSER_ORIGIN=https://swag-support-hub.mymaywi.workers.dev node --import tsx scripts/browser-newsletter.mjs`
  passed at 375, 768 and 1440px: complete newsletter HTML text, decoded artwork, navigation,
  Escape/focus return, history/reload, existing activities and public routes. Runtime exceptions,
  console errors and hydration errors were all zero. Authenticated production screens were
  not tested; authenticated role checks used the isolated local fixtures described above.
- No real recipient received a test email. Resend API acceptance and inbox delivery remain
  unverified. `RESEND_API_KEY` exists, but its validity is unverified;
  `RESEND_FROM_EMAIL` is still missing from Supabase Edge Functions Secrets. An authorized
  verified-domain sender must be provided there before assignment email can send.
- GitHub push failed with HTTP 403 using both the existing credential helper and the GitHub
  CLI credential helper. The account's repository API reports push permission, so the exact
  credential restriction is not established. No SSH agent identity was available. Remote
  `main` remained `1445770f7d1a018356aea35b3022c60e12c804b8`; the deployed source is preserved
  in local commits. Restore an authorized GitHub credential with repository Contents write
  access, then use a normal `git push origin main` (no force push). Production is currently
  ahead of GitHub. Subsequent verification-only commits do not change the deployed application.
