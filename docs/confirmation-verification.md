# Confirmation email verification — 2026-09-20

Scope: execution-context handling, controlled Turnstile testing, confirmation templates, and the Gmail dispatch blocker. No website UI, migrations, role grants, or booking workflow implementation changed.

## Causes and fixes

- The generated Nitro 3 Cloudflare entry augments `request.runtime.cloudflare` and calls the application with `fetch(request)`. The application incorrectly expected a positional third argument. Both production and the generated application reproduced HTTP 500 with `Cannot read properties of undefined (reading 'waitUntil')`. Dispatch now uses the actual request context (or bound request `waitUntil`) and awaits the same task when neither is available. Failures are caught and logged with safe codes without changing bookings.
- Once dispatch was reachable, the Gmail Edge Function encountered `permission denied for function claim_confirmation_email_jobs`. The existing secret-protected outbox RPCs grant execution to `anon/authenticated`, not `service_role`. Only the Edge Function's RPC caller was corrected to its existing anon credential; the dispatch-secret check and all grants remain unchanged. Narrow teacher-name reads continue to use server-only service credentials.
- Gmail now uses one shared, escaped HTML/text renderer with recipient-specific headings, subjects, greetings, and scheduling details. No request descriptions, private notes, management tokens, other recipients, tracking, attachments, or external images appear in the templates.

## Verification

- `npm run test:email`: 10 passing tests, including the actual Edge handler with isolated SMTP, correct RPC credentials, separate messages, escaping, delivery failures, and lifetime fallback.
- `npm run test:worker-routes` after build: 4 passing generated-runtime tests, including valid and missing contexts, dispatch failure, production Turnstile rejection, and build rejection of dummy sitekeys.
- TypeScript and production build passed. Targeted credential scanning of repository text and public build output found no exposed server credentials.
- Shared HTML rendered at 390 CSS pixels without horizontal overflow; plain-text alternatives checked for every recipient.

One fresh synthetic request was created. After the newly exposed RPC authorization failure, the **same** request, confirmation event, session, and three never-attempted outbox entries were resumed. No second request or confirmation event was created.

| Check | Result |
| --- | --- |
| Automated submission | Official Turnstile test widget and real Siteverify, with the built server handler bound only to loopback; protected production submission RPC succeeded |
| Human production submission | Not exercised; production form, real-key configuration, missing-token rejection and dummy-token rejection verified separately |
| Mentor accept / Teacher visibility / Confirm Meeting | Verified through production browser screens and database state |
| Gmail SMTP | Exactly three distinct recipient messages accepted, each with one attempt and its own message ID |
| Confirm retry / dispatch retry | Same event and three outbox rows; no additional sends |
| Submission / Accept / Teacher assignment | No outbox email |
| Completed / Escalated / Cancelled | No additional email |
| No-show | Successful transition not verified: existing `peer_support_assignment_state_check` rejects `no_show` with SQLSTATE `23514`; unchanged because outside this fix's scope |
| Authorization | Anonymous internal access, missing gateway credentials, unauthorized dispatch and cross-role actions rejected |
| Production smoke | Homepage, booking form, login, anonymous protected-dashboard guard and authenticated Mentor/Teacher pages passed; dispatch returned 202 without Worker exceptions |
| Cleanup | This run's synthetic case/session cancelled; temporary supervisor selection restored; both approved test accounts retained |

Only the synthetic fixture was reset between terminal-state checks. No real requests or user roles were modified. SMTP acceptance is not proof of inbox placement; Gmail delivery and spam-folder placement cannot be guaranteed.
