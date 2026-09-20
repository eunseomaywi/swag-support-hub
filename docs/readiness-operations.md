# Peer Support readiness

## Diagnosed state

The saved supervising teacher had a trusted `profiles.role = teacher` and an email,
but no `staff_members` row. The approved-candidate query and confirmation RPC correctly
require a matching teacher staff row with `booking_enabled = true`. The selected teacher
therefore disappeared from the dropdown and confirmation reported `supervisor_teacher_inactive`.

The location, weekdays, and all three period times were already persisted. The legacy
`get_peer_support_settings.schedule_ready` field represents **overall setup readiness**,
including the supervisor. Labelling this value “Schedule: not configured” was misleading.

The existing designated teacher was registered through the service-role-only staff
provisioning mechanism. Their profile role, designated supervisor selection, location,
days and times were not changed. No schema migration or authorization exception was needed.

## Operational checks

- Keep `profiles.role` authoritative. A Teacher profile alone is not operational approval.
- Administrators provision approved staff in `staff_members`; matching `staff_type` and
  `booking_enabled` are required. Never expose service-role credentials in the browser.
- Teachers select from the existing approved-candidate RPC and save school settings.
- The setup checklist describes saved data, not unsaved form inputs. A saved teacher who
  becomes inactive remains visible as unavailable, with instructions to resolve it.
- Saving school settings and the attention threshold are separate operations. Failed saves
  retain edits; saving one does not discard changes in the other.
- Mentors see the existing server confirmation preview on opening/focusing a case and can
  refresh it after setup changes. Unknown checks remain unverified, not falsely marked ready:
  the existing preview RPC returns only the first blocking reason.
- The existing confirmation RPC remains the final authority, including conflicts, role checks,
  confirmation events, and recipient-specific duplicate protection. No email logic changed.

## Targeted regression checks

`npm run test:readiness`, `npm run test:email`, `npx tsc --noEmit`, `npm run build`,
then `npm run test:worker-routes`.

Browser verification covers saved settings load/save/reload, unavailable supervisor display,
unsaved edits surviving a failed save, blocked confirmation, allowed-period selection,
the single confirmation action, and 390px/1440px layouts. Incomplete-state UI fixtures
must be mocked locally; do not disable the live supervisor to test a warning.

For live email E2E use only approved test recipients, one synthetic request, and official
Turnstile test credentials on loopback. If temporarily selecting the approved test supervisor,
restore the existing operational supervisor immediately after the meeting snapshot is created.
Cancel only the new synthetic request/session and retain the existing test accounts and history.
