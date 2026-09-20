import { ROLE_LABELS, type AppRole } from "./auth";

export const YEAR_GROUPS = [
  "Year 7",
  "Year 8",
  "Year 9",
  "Year 10",
  "Year 11",
  "Year 12",
  "Year 13",
] as const;
export type SupporterIdentity = {
  supporter_id: string | null;
  supporter_name: string | null;
  supporter_year_group: string | null;
  supporter_role: AppRole | null;
  supporter_active: boolean;
  supporter_details_available: boolean;
};
export type ConfirmationIdentity = {
  version: number;
  student_name: string;
  student_year_group: string | null;
  supporter_name: string | null;
  supporter_year_group: string | null;
  supporter_role: AppRole | null;
  teacher_name: string | null;
};
export function missingProfileFields(
  name: string | null | undefined,
  year: string | null | undefined,
  role: AppRole | null | undefined,
) {
  return [
    ...(!name?.trim() ? ["name"] : []),
    ...((role === "peer_mentor" || role === "swag_member") && !year ? ["year group"] : []),
  ];
}
export function supporterDisplay(identity: SupporterIdentity) {
  if (!identity.supporter_id)
    return { name: "Unassigned", subtitle: "Choose a supporter", incomplete: false };
  if (!identity.supporter_details_available)
    return {
      name: "Assigned · Supporter details unavailable",
      subtitle: "Ask a Teacher to check the linked profile.",
      incomplete: false,
    };
  const missing = missingProfileFields(
    identity.supporter_name,
    identity.supporter_year_group,
    identity.supporter_role,
  );
  return {
    name: identity.supporter_name?.trim() || "Assigned · Profile incomplete",
    subtitle: [
      identity.supporter_role ? ROLE_LABELS[identity.supporter_role] : null,
      !identity.supporter_active ? "Inactive" : null,
    ]
      .filter(Boolean)
      .join(" · "),
    incomplete: missing.length > 0,
    missing: missing.join(" and "),
  };
}
export function queueErrorMessage(code?: string) {
  return code === "42501"
    ? "Your account is not registered for active peer support. Ask a Teacher or administrator to check your staff registration. Your role does not need to be changed."
    : "Requests could not be loaded. Check your connection and try Refresh.";
}
