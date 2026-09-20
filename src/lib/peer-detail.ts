import type { SupporterIdentity, ConfirmationIdentity } from "./supporter-identity";
export type PeerSummary = SupporterIdentity & {
  request_id: string;
  student_name: string;
  year_group: string;
  status: string;
  preferred_date: string;
  preferred_periods: string[];
  submitted_at: string;
  session_id: string | null;
  session_start: string | null;
  session_end: string | null;
  email_attention: boolean;
  needs_attention: boolean;
};
export type PeerDetail = PeerSummary & {
  category: string;
  private_explanation: string | null;
  contact_email: string | null;
  preferred_time: string;
  assigned_at: string | null;
  assignment_method: string | null;
  session_label: string | null;
  session_period: string | null;
  session_location: string | null;
  session_status: string | null;
  supervisor_teacher_name: string | null;
  confirmation_identity: ConfirmationIdentity | null;
  student_email_job_id: string | null;
  mentor_email_job_id: string | null;
  teacher_email_job_id: string | null;
  student_email_status: string | null;
  mentor_email_status: string | null;
  teacher_email_status: string | null;
  escalation_reason: string | null;
  escalated_at: string | null;
  history?: { action: string; created_at: string }[];
};
export type SupporterCandidate = SupporterIdentity & {
  active_case_count: number;
  conflicting_periods: string[];
};
export const FILTERS = {
  needs_attention: "Needs action",
  open: "Unassigned",
  assigned: "Awaiting confirmation",
  scheduled: "Scheduled",
  today: "Today",
  closed: "Closed",
  all: "All requests",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
  escalated: "Escalated",
  email: "Email needs attention",
} as const;
export type RequestFilter = keyof typeof FILTERS;
export function teacherListSearch(search: Record<string, unknown>) {
  return {
    filter:
      typeof search["filter"] === "string" && search["filter"] in FILTERS
        ? (search["filter"] as RequestFilter)
        : ("all" as RequestFilter),
    page: Math.max(0, Math.min(10000, Math.floor(Number(search["page"]) || 0))),
    from: search["from"] === "meetings" ? "meetings" : "requests",
  };
}
export function statusLabel(status: string) {
  return (
    (
      {
        open: "Unassigned",
        accepted: "Assigned — Awaiting Confirmation",
        scheduled: "Scheduled",
        no_show: "No-show",
      } as Record<string, string>
    )[status] || status.charAt(0).toUpperCase() + status.slice(1)
  );
}
export function appointmentTime(start: string | null, end?: string | null) {
  if (!start) return "Not yet confirmed";
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", timeStyle: "short" });
  return (
    fmt.format(new Date(start)) + (end ? `–${time.format(new Date(end))}` : "") + " · Asia/Seoul"
  );
}
