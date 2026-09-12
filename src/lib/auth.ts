export const APP_ROLES = ["student", "peer_mentor", "swag_member", "teacher"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  created_at: string;
  updated_at: string;
};

export const DASHBOARD_ROUTES = {
  peer_mentor: "/peer-mentor/dashboard",
  swag_member: "/swag/dashboard",
  teacher: "/teacher/dashboard",
} as const;

export type PrivilegedRole = keyof typeof DASHBOARD_ROUTES;

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function dashboardRouteFor(
  role: AppRole | null,
): (typeof DASHBOARD_ROUTES)[PrivilegedRole] | null {
  if (!role || role === "student") return null;
  return DASHBOARD_ROUTES[role];
}

export const ROLE_LABELS: Record<AppRole, string> = {
  student: "Student",
  peer_mentor: "Peer Mentor",
  swag_member: "SWAG Member",
  teacher: "Teacher",
};
