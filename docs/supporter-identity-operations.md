# Supporter identity and booking operations

`profiles.role` remains authoritative. An approved booking supporter also needs a
matching `staff_members.staff_type` and `booking_enabled = true`. A profile name,
year group, Auth metadata or a visible dashboard menu does not confer approval.

Trusted administrators can use the **service-role-only**
`admin_set_staff_registration(profile UUID, role, booking_enabled)` RPC after
verifying approval. It updates the role and registration atomically. Direct trusted
role changes align existing staff types but disable booking until explicitly
reapproved; they never create or activate staff automatically. Never expose this
administrative credential to the browser.

## Identity

- Canonical fields: `profiles.full_name`, nullable `profiles.year_group` (Year 7–13).
- `/profile`: internal users edit their own name and, for supporters, school year.
- `/teacher/team`: Teachers can correct registered supporters' names and years.
- These forms cannot edit email, role, staff type or booking approval.
- Missing identity prompts completion; it does not hide assignments or block
  safety actions. UUIDs determine assignments, never names or email prefixes.
- No linkage to public Members cards is introduced.

## Teacher operations

`/teacher/peer-support` is the request list. Its filter/page query parameters are
preserved by detail/back links. `/teacher/peer-support/<request UUID>` provides the
request, wide supporter selection, conflicts and processing history.
`/teacher/bookings/<session UUID>` shows the exact meeting and recipient email
states. Details use permission-checked ID RPCs, independently of list pagination.
Assigning is not confirming and sends no email.

## Confirmation identity

New confirmation events contain an immutable, allowlisted identity snapshot.
The Gmail dispatcher uses `claim_confirmation_email_jobs_v2`, which delegates all
leasing and duplicate handling to the existing claim RPC. Profile changes do not
create events/jobs or alter retries. Legacy events are not backfilled with current
names; absent historical identity is explicitly unavailable. Submitted means SMTP
acceptance, not inbox delivery or reading. Gmail SMTP, secrets, cron and the
Worker execution-context fallback are retained.

## Targeted verification

- `supabase test db --local`: role/RLS, profile isolation, SWAG booking parity,
  Teacher assignment/detail, immutable snapshots, duplicate jobs, legitimate
  elapsed no-show and future no-show rejection (all rolled back).
- `npm run test:email`, `npm run test:worker-routes`, `npm run test:readiness`.
- `node --import tsx --test tests/supporter-identity.test.ts`.
- `npx tsc --noEmit`, targeted ESLint, `npm run build`, Wrangler dry run.

Production checks must use approved existing accounts and clearly marked new test
requests only. Do not invent real users' names/years. Retain accounts and audit/
email records; cancel only the test requests created by that run. Official
Turnstile test keys may be used on isolated loopback, never the production host.

### Verification run — 2026-09-20

- SQL suite: **150 assertions passed**, including existing auth/Concern tests.
- Email, generated Worker routes, readiness and identity unit tests: **21 passed**.
- Local normal-JWT HTTP tests: concurrent supporter claims and Teacher/self-claim
  races produced one winner; SWAG confirmation, overlap rejection and duplicate
  protection passed. No real SMTP was used for these local concurrency tests.
- Connected production DB with the updated local UI: SWAG self-claim, Teacher →
  SWAG assignment, and Peer Mentor regression all reached confirmation. Three new
  events produced nine separate, single-attempt Gmail SMTP acceptances. Repeating
  confirmation produced no additional jobs. Only these three test requests were
  cancelled; accounts and email/audit records were preserved.
- Browser checks: 390px/1440px layouts, profile save/new login, account switching,
  request/meeting detail refresh, new tab, list/back/filter restoration. Error,
  empty, registration-blocked and confirmation-blocked states were also tested
  with intercepted responses, without changing production configuration.
- The real SWAG account still needs its real name/year entered; no guessed values
  were saved. Dedicated temporary test accounts used clearly marked E2E names.
- The existing `/sessions` routes redirect to My Cases; an initial smoke harness
  expected a separate Sessions heading and was corrected without changing the app.
- TypeScript, targeted ESLint, production build, Wrangler dry run and secret scan
  passed. Inbox placement/read status was **not** verified.
