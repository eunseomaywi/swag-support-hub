# Staff request list follow-up

Targets: existing `eunseomaywi/swag-support-hub` / `main`, Worker `swag-support-hub`,
Supabase `ezjvfrdakzyoaijucqij`. UI copy in this release is English; student input is unchanged.

## Behaviour and access

Teacher, Peer Mentor and SWAG Member lists share a responsive five-column layout. Mobile
stacks the same fields. Overview account IDs and repeated confirmation explanations are
removed; genuine email-attention messages remain. School settings/readiness are expandable.
Countdown still uses requested-date midnight in Asia/Seoul, not submission time or a meeting
time. The existing shared 60-second clock, focus refresh and SSR snapshot are retained.

`teacher_delete_peer_request(uuid)` is the only new user mutation. It checks `auth.uid()`, the
actual Teacher profile role and active `staff_members` registration, locks the request and
records `deleted_at`, `deleted_by` and one protected `request_deleted` audit action. A repeated
delete succeeds without another audit or event. No request is deleted by this migration.
Authenticated non-Teachers, inactive Teachers and anonymous callers cannot perform it.
No client actor/role/deleted-by fields are accepted. Ordinary table privileges remain revoked.

The additive migration `20260926120000_teacher_request_soft_delete.sql` creates private
`peer_active_requests` and `peer_active_sessions` views. Reviewed existing RPC bodies use
these views for reads/updates, including legacy APIs. Function signatures, original access
checks, grants and INSERT targets remain unchanged. Exclusion happens before pagination,
totals, dashboard counts, supporter candidate workloads/conflicts and booking checks.
Service-role dispatcher helpers also query active views; no application path reads raw
requests/sessions with service-role credentials. The views grant no extra API access.
Restrictive RLS policies provide an additional direct-access boundary.

Requests, assignment history, sessions, confirmation events, escalation access and audit
records are retained. The separate guarded session `request_deleted_at` marker retires
reservations without rewriting their recorded status. Mentor/student overlap constraints
and active request/slot unique indexes exclude retired reservations. Parent/child triggers
block stale mutations and newly created email events; all use the same parent row lock as
assignment and confirmation. Deleted detail URLs and student tokens return no private content.

Screens use local component state/RPCs, not router data loaders or a query cache. One mounted
request-screen refresh hook polls every 15 seconds only while visible, refreshes on focus and
coalesces overlapping refreshes and cleans up listeners/timers.
It does not broadcast request content or depend on RLS-hidden realtime UPDATE delivery.
Teacher deletion refreshes immediately; shrinking pagination clamps to a valid page. The
latest refresh supersedes older Teacher responses so a slow pre-deletion response cannot
restore a deleted row. Immediate deletion refresh does not also trigger a duplicate invalidation fetch.
60-second display clock does not fetch request data. Root Toaster is mounted so required
success/failure messages are actually visible.

## Email compatibility

Deletion sends no email. Unstarted confirmation jobs become `suppressed`, assignment jobs
become `superseded`, and accepted provider history is preserved. Processing leases remain
recorded because a provider request might already have started. Resend's existing prepare
check now excludes deleted parents. The Gmail dispatcher additionally calls
`prepare_confirmation_email_send` immediately before every recipient's SMTP send, so jobs
waiting within an already-claimed batch can be suppressed. Failed/retry writes after deletion
cannot reactivate a job. Already-started sends can still record real provider acceptance;
deletion cannot recall them.

Existing Gmail confirmation recipients and template are unchanged. Resend assignment
recipient/privacy/idempotency behaviour remains unchanged for active requests. No reminders,
cancellation notices or newsletter emails are added. Existing `RESEND_FROM_EMAIL` absence is
not fixed by inventing a sender; approved sender configuration remains an external prerequisite.

## Public content

The `/activities` programme overview section and its unused data are removed. Old `activity`
search parameters no longer select a programme modal. The first newsletter has no sourceLabel;
there is no fallback author label. All other original paragraphs, subtitles, contact, tags and
three PNGs are unchanged. Newsletter URLs/dialog navigation and shared archive remain in use.

## Verification and deployment order

Run DB suites separately from scripts that create committed local fixtures:

```sh
npx supabase test db --workdir /private/tmp/swag-assignment-isolated
npx supabase db lint --local --workdir /private/tmp/swag-assignment-isolated --level error
node scripts/test-request-delete-concurrency.mjs
node scripts/test-assignment-concurrency.mjs
node scripts/browser-assignment-roles.mjs
node --import tsx scripts/browser-newsletter.mjs
npm run test:assignment
npm run test:email
npm run test:readiness
node --import tsx --test tests/supporter-identity.test.ts
npx tsc --noEmit
npm run lint
npm run build
npm run test:worker-routes
```

DB tests use rollback fixtures. Browser/concurrency scripts are hard-bound to the isolated
local project/container and clean only their own fixture IDs. Production deletion, production
fixtures and real test emails are prohibited. Existing development DB data remains untouched.

After checks: commit related sources; apply the additive migration; deploy the existing
`dispatch-confirmation-email` Edge Function; push normally; deploy the verified commit in a
clean worktree using `wrangler deploy --keep-vars` to the existing Worker. GitHub push may
trigger Workers Builds, so backend compatibility must be ready first.

Pre-release source: `140c21cf2e0d6e2409a5947741d31854d0dce64f`.
Pre-release Worker version: `496e786a-9751-4a62-85a8-fcfc2c7b1fa8`.
If a Worker rollback is needed, keep the additive deletion schema, filtered RPCs and guarded
SMTP dispatcher deployed. Older frontends remain compatible and cannot reveal deleted
requests through those RPCs. Never reset the production DB or remove deletion/audit records.
Correct any schema problem with a new forward migration; do not rewrite published history.

Completed pre-release checks: 250 pgTAP assertions across seven suites; 8 delete/claim/assignment
races and 4 delete/confirmation races; the existing 8 claim/assignment races and concurrent
dispatcher leasing; 11 assignment/countdown/newsletter, 11 confirmation, 5 readiness, 2 identity
and 6 built Worker route/scheduler tests. SQL lint and TypeScript passed. ESLint has no errors
and six pre-existing Fast Refresh warnings. Production build passed.

Authenticated Chrome used only isolated fixtures at 375/768/1440px, with Los Angeles browser
timezone: English countdown, long names, all allowed periods, Cancel/default focus, actual
server rejection with no removal, successful soft delete, last-page clamping, cross-session
polling, stale detail, empty state/reload, retained Korean input, role access and login return.
Public Chrome verified the three original PNGs, exact remaining HTML text, contact/tags,
dialog focus/keyboard/history/reload and footer with zero runtime/hydration/console errors.
No real provider acceptance or delivery was tested.
