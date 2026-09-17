# Phase 6 public content guide

Public member and activity content is deliberately separate from Auth, role, Concern, and Peer
Support records.

- Edit `src/content/members.ts` to publish approved names, public roles, year groups, and portraits.
  Keep an entry as `placeholder` until every public field and image has publication approval.
- Edit `src/content/activities.ts` to add approved programme or event records. Do not invent dates,
  outcomes, or photography; the interface supplies an accessible fallback when no image is present.
- Edit `src/content/public-copy.ts` for shared public navigation labels and the canonical site origin.
- Keep member and activity IDs/slugs stable after publication so saved links continue to work.

These files must not import Supabase Auth profiles or private support records.
