export const SITE_ORIGIN = "https://swag-support-hub.mymaywi.workers.dev";

export const publicNavigation = [
  { to: "/", label: "Home", exact: true },
  { to: "/what-is-swag", label: "About SWAG" },
  { to: "/members", label: "Members" },
  { to: "/activities", label: "Activities" },
  { to: "/charter", label: "Charter" },
  { to: "/peer-mentor", label: "Peer Support" },
  {
    href: "https://club.teentips.co.uk/home/pupils-home-universal/",
    label: "Wellbeing Hub",
    external: true,
  },
  { to: "/form", label: "Get Support", action: true },
] as const;

export function canonicalUrl(pathname: string) {
  return `${SITE_ORIGIN}${pathname}`;
}
