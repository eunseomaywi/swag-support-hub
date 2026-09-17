import type { Accent } from "@/lib/accents";

export type PublicMember = {
  id: string;
  displayName: string;
  roleLabel: string;
  yearGroup: string;
  photo: string | null;
  photoAlt: string;
  sortOrder: number;
  publicationStatus: "ready" | "placeholder";
  accent: Accent;
};

/**
 * Public website content only. This list is deliberately independent from
 * Supabase Auth, profiles, and permission roles.
 */
const publicMemberPlaceholders: readonly Pick<PublicMember, "id" | "accent" | "sortOrder">[] = [
  { id: "member-01", accent: "blue", sortOrder: 1 },
  { id: "member-02", accent: "green", sortOrder: 2 },
  { id: "member-03", accent: "pink", sortOrder: 3 },
  { id: "member-04", accent: "orange", sortOrder: 4 },
  { id: "member-05", accent: "purple", sortOrder: 5 },
  { id: "member-06", accent: "blue", sortOrder: 6 },
  { id: "member-07", accent: "green", sortOrder: 7 },
  { id: "member-08", accent: "pink", sortOrder: 8 },
];

export const publicMembers: readonly PublicMember[] = publicMemberPlaceholders.map(
  (member): PublicMember => ({
    ...member,
    displayName: "",
    roleLabel: "",
    yearGroup: "",
    photo: null,
    photoAlt: "",
    publicationStatus: "placeholder",
  }),
);

export const sortedPublicMembers = [...publicMembers].sort(
  (left, right) => left.sortOrder - right.sortOrder,
);
