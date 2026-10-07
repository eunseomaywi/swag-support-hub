import type { Accent } from "@/lib/accents";

export type PublicMember = {
  id: string;
  displayName: string;
  roleLabel: string;
  yearGroup: string;
  photo: string;
  photoAlt: string;
  sortOrder: number;
  accent: Accent;
};

/**
 * Public website content only. This list is deliberately independent from
 * Supabase Auth, profiles, and permission roles.
 */
export const publicMembers: readonly PublicMember[] = [
  {
    id: "jungseo",
    displayName: "Jungseo",
    roleLabel: "SWAG Chair",
    yearGroup: "Y13",
    photo: "/images/swagmember/junseo.png",
    photoAlt: "Jungseo",
    sortOrder: 1,
    accent: "blue",
  },
  {
    id: "minseok-andy-park",
    displayName: "Minseok (Andy) Park",
    roleLabel: "SWAG Member",
    yearGroup: "Y12",
    photo: "/images/swagmember/andy.png",
    photoAlt: "Minseok (Andy) Park",
    sortOrder: 2,
    accent: "green",
  },
  {
    id: "junhui-yang",
    displayName: "Junhui Yang",
    roleLabel: "SWAG Member",
    yearGroup: "Y12",
    photo: "/images/swagmember/junhui.png",
    photoAlt: "Junhui Yang",
    sortOrder: 3,
    accent: "pink",
  },
  {
    id: "eunseo-may-wi",
    displayName: "Eunseo (May) Wi",
    roleLabel: "SWAG Member",
    yearGroup: "Y11",
    photo: "/images/swagmember/May.png",
    photoAlt: "Eunseo (May) Wi",
    sortOrder: 4,
    accent: "orange",
  },
  {
    id: "yunseo-emily-cho",
    displayName: "Yunseo (Emily) Cho",
    roleLabel: "SWAG Member",
    yearGroup: "Y10",
    photo: "/images/swagmember/emily.png",
    photoAlt: "Yunseo (Emily) Cho",
    sortOrder: 5,
    accent: "purple",
  },
  {
    id: "sian-lee",
    displayName: "Sian Lee",
    roleLabel: "SWAG Member",
    yearGroup: "Y10",
    photo: "/images/swagmember/sian.png",
    photoAlt: "Sian Lee",
    sortOrder: 6,
    accent: "blue",
  },
  {
    id: "doyoon-damian-kim",
    displayName: "Doyoon (Damian) Kim",
    roleLabel: "SWAG Member",
    yearGroup: "Y9",
    photo: "/images/swagmember/damian.png",
    photoAlt: "Doyoon (Damian) Kim",
    sortOrder: 7,
    accent: "green",
  },
  {
    id: "junhee-nina-yang",
    displayName: "Junhee (Nina) Yang",
    roleLabel: "SWAG Member",
    yearGroup: "Y9",
    photo: "/images/swagmember/nina.png",
    photoAlt: "Junhee (Nina) Yang",
    sortOrder: 8,
    accent: "pink",
  },
];

export const sortedPublicMembers = [...publicMembers].sort(
  (left, right) => left.sortOrder - right.sortOrder,
);
