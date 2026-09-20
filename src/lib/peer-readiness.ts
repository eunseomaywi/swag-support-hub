export const periodLabels = { break: "Break", lunch_1: "1st Lunch", lunch_2: "2nd Lunch" } as const;

type SavedSettings = {
  location_guidance: string | null;
  supervisor_teacher_id: string | null;
  active_weekdays: number[];
  periods: { period: string; start_time: string | null; end_time: string | null }[];
  schedule_ready: boolean;
};

// The legacy RPC's schedule_ready means OVERALL readiness, not just period times.
export function savedReadiness(settings: SavedSettings, candidates: { profile_id: string }[]) {
  const checks = [
    {
      label: "Approved location",
      ready: Boolean(settings.location_guidance?.trim()),
      missing: "No approved location saved.",
    },
    {
      label: "Supervising teacher",
      ready: candidates.some((c) => c.profile_id === settings.supervisor_teacher_id),
      missing: settings.supervisor_teacher_id
        ? "The saved supervising teacher is not active. Select an approved teacher, or ask the administrator to check their staff registration."
        : "No supervising teacher selected.",
    },
    {
      label: "School days",
      ready: settings.active_weekdays.length > 0,
      missing: "No active school days saved.",
    },
    ...Object.entries(periodLabels).map(([id, label]) => {
      const period = settings.periods.find((p) => p.period === id);
      return {
        label,
        ready: Boolean(
          period?.start_time && period.end_time && period.start_time < period.end_time,
        ),
        missing: `${label} needs saved start and end times (end after start).`,
      };
    }),
  ];
  const missing = checks.filter((c) => !c.ready).map((c) => c.missing);
  if (!missing.length && !settings.schedule_ready)
    missing.push(
      "School setup has not passed the server readiness check. Reload settings and try saving again.",
    );
  return { checks, missing, ready: settings.schedule_ready && !missing.length };
}

const issues: Record<string, string> = {
  not_assigned_to_you: "This request is no longer assigned to you. Return to My Cases and refresh.",
  supervisor_teacher_missing:
    "No supervising teacher is configured. Ask a Teacher to select and save one in Peer Support settings.",
  supervisor_teacher_invalid:
    "The saved supervisor is not a valid teacher. Ask a Teacher to select an approved supervisor in Peer Support settings.",
  supervisor_teacher_inactive:
    "No active supervising teacher is configured. Ask a Teacher to check the supervisor in Peer Support settings; an administrator may need to activate their staff registration.",
  location_missing:
    "No approved meeting location is saved. Ask a Teacher to add it in Peer Support settings.",
  period_time_missing:
    "This period has no saved start and end times. Ask a Teacher to save the period times in Peer Support settings.",
  date_not_active:
    "The requested date is not an active school day. Ask a Teacher to review the request and school days.",
  appointment_in_past:
    "This meeting time has already passed. A future request is needed before confirmation.",
};
export function confirmationBlocker(issue: string | null | undefined) {
  return (
    issues[issue || ""] ||
    "Readiness could not be verified. Refresh the school check before confirming."
  );
}

export type ConfirmationOption = {
  period: string;
  ready: boolean;
  readiness_issue: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  location_guidance: string | null;
};
export function confirmationChecklist(
  option: ConfirmationOption | undefined,
  selectedPeriod: string,
) {
  const issue = option?.readiness_issue;
  const supervisorBlocked = issue?.startsWith("supervisor_teacher_") ?? false;
  const supervisorKnown = Boolean(
    option && (option.ready || (issue && issues[issue] && issue !== "not_assigned_to_you")),
  );
  return [
    {
      label: "School schedule",
      ready: !option
        ? null
        : !option.scheduled_start ||
            !option.scheduled_end ||
            issue === "date_not_active" ||
            issue === "appointment_in_past"
          ? false
          : option.ready
            ? true
            : null,
    },
    { label: "Supervisor teacher", ready: supervisorKnown ? !supervisorBlocked : null },
    {
      label: "Location configured",
      ready: option ? Boolean(option.location_guidance?.trim()) : null,
    },
    {
      label: "Allowed period selected",
      ready: Boolean(selectedPeriod && option?.period === selectedPeriod),
    },
  ];
}
