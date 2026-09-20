import { AlertTriangle, CheckCircle2, Inbox } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardPageHeading, PageState } from "./DashboardLayout";
import { SummaryCard } from "./DashboardPieces";
import { getSupabaseClient } from "@/lib/supabase";
import { savedReadiness } from "@/lib/peer-readiness";
import { Link } from "@tanstack/react-router";

type OverviewRow = {
  request_id: string;
  student_name: string;
  year_group: string;
  private_explanation: string | null;
  mentor_id: string | null;
  mentor_name: string | null;
  category: string;
  preferred_date: string;
  preferred_periods: string[];
  confirmed_period: string | null;
  session_start: string | null;
  session_end: string | null;
  location: string | null;
  status: string;
  assignment_method: string | null;
  assigned_at: string | null;
  submitted_at: string;
  student_email_job_id: string | null;
  mentor_email_job_id: string | null;
  teacher_email_job_id: string | null;
  student_email_status: string | null;
  mentor_email_status: string | null;
  teacher_email_status: string | null;
  stale: boolean;
  needs_attention: boolean;
  near_requested_date: boolean;
};
type Counts = {
  open_count: number;
  active_count: number;
  scheduled_count: number;
  escalated_count: number;
  today_count: number;
  completed_count: number;
  email_attention_count: number;
};
type PeriodSetting = {
  period: string;
  label: string;
  start_time: string | null;
  end_time: string | null;
};
type SettingsRow = {
  display_timezone: string;
  location_guidance: string | null;
  supervisor_teacher_id: string | null;
  supervisor_teacher_name: string | null;
  active_weekdays: number[];
  periods: PeriodSetting[];
  schedule_ready: boolean;
};
type Candidate = { profile_id: string; full_name: string | null };
type SupporterCandidate = Candidate & {
  supporter_role: "peer_mentor" | "swag_member";
  active_case_count: number;
  conflicting_periods: string[];
};
type Filter =
  | "all"
  | "open"
  | "needs_attention"
  | "assigned"
  | "scheduled"
  | "today"
  | "completed"
  | "cancelled"
  | "no_show"
  | "escalated"
  | "email";

const labels: Record<string, string> = {
  break: "Break",
  lunch_1: "1st Lunch",
  lunch_2: "2nd Lunch",
};
const seoulDateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});
const seoulTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", timeStyle: "short" });
const attention = (status: string | null) => status === "failed" || status === "uncertain";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const dateInSeoul = (value: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(value));
const periodFields = [
  ["Break", "breakStart", "breakEnd"],
  ["1st Lunch", "lunch1Start", "lunch1End"],
  ["2nd Lunch", "lunch2Start", "lunch2End"],
] as const;

function EmailStatus({
  label,
  status,
  jobId,
  retry,
}: {
  label: string;
  status: string | null;
  jobId: string | null;
  retry: (id: string) => void;
}) {
  return (
    <div className="min-w-24">
      <span className="block text-[11px] text-muted-foreground">{label}</span>
      <span className="block text-xs font-semibold capitalize text-swag-navy">
        {status?.replace("_", " ") || "not queued"}
      </span>
      {jobId && attention(status) && (
        <button
          type="button"
          onClick={() => retry(jobId)}
          className="text-xs font-semibold text-swag-blue underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function TeacherPeerSupport() {
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [supporters, setSupporters] = useState<SupporterCandidate[]>([]);
  const [selectedSupporter, setSelectedSupporter] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const client = getSupabaseClient();
    const [overview, countResult] = await Promise.all([
      client.rpc("list_teacher_peer_support_overview", { p_page_offset: 0, p_page_size: 100 }),
      client.rpc("get_teacher_peer_support_counts"),
    ]);
    if (overview.error || countResult.error) {
      setRows([]);
      setCounts(null);
      setError("Peer Support data could not be loaded. Counts are not shown as zero.");
    } else {
      setRows((overview.data ?? []) as OverviewRow[]);
      setCounts((countResult.data?.[0] ?? null) as Counts | null);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (filter === "all") return true;
        if (filter === "needs_attention")
          return row.needs_attention || row.near_requested_date || row.stale;
        if (filter === "assigned") return row.status === "accepted";
        if (filter === "scheduled") return row.status === "scheduled";
        if (filter === "today")
          return Boolean(row.session_start && dateInSeoul(row.session_start) === today());
        if (filter === "email")
          return [row.student_email_status, row.mentor_email_status, row.teacher_email_status].some(
            attention,
          );
        return row.status === filter;
      }),
    [filter, rows],
  );

  async function outcome(requestId: string, kind: "completed" | "no_show" | "cancelled") {
    const message =
      kind === "cancelled"
        ? "Cancel this appointment? No cancellation email will be sent."
        : `Mark this appointment ${kind.replace("_", " ")}?`;
    if (!window.confirm(message)) return;
    setBusy(requestId);
    const client = getSupabaseClient();
    const result =
      kind === "completed"
        ? await client.rpc("complete_my_peer_case", { p_request_id: requestId })
        : kind === "no_show"
          ? await client.rpc("mark_peer_case_no_show", { p_request_id: requestId })
          : await client.rpc("cancel_my_peer_session", { p_request_id: requestId });
    if (result.error || !result.data)
      setError(
        "That status change is not valid from the current state or before the appointment ends.",
      );
    await load();
    setBusy(null);
  }
  async function correct(row: OverviewRow) {
    const reason = window
      .prompt(`Correct ${row.status.replace("_", " ")} back to confirmed? Enter a short reason.`)
      ?.trim();
    if (!reason) return;
    setBusy(row.request_id);
    const { data, error: rpcError } = await getSupabaseClient().rpc(
      "teacher_correct_peer_outcome",
      { p_request_id: row.request_id, p_expected_status: row.status, p_reason: reason },
    );
    if (rpcError || !data) setError("The outcome could not be corrected.");
    await load();
    setBusy(null);
  }
  async function retry(id: string) {
    setBusy(id);
    const { data, error: rpcError } = await getSupabaseClient().rpc("retry_confirmation_email", {
      p_outbox_id: id,
    });
    if (rpcError || !data) setError("That recipient is not eligible for retry.");
    await load();
    setBusy(null);
  }
  async function openAssignment(row: OverviewRow) {
    setBusy(row.request_id);
    setError(null);
    const { data, error: rpcError } = await getSupabaseClient().rpc(
      "list_peer_supporter_candidates" as never,
      { p_request_id: row.request_id } as never,
    );
    if (rpcError) {
      setError("Active supporters could not be loaded.");
      setSupporters([]);
    } else {
      setSupporters((data ?? []) as SupporterCandidate[]);
      setSelectedSupporter(row.mentor_id || "");
      setAssigning(row.request_id);
    }
    setBusy(null);
  }
  async function saveAssignment(row: OverviewRow) {
    if (!selectedSupporter) return;
    setBusy(row.request_id);
    setError(null);
    const rpc =
      row.status === "open" ? "teacher_assign_peer_request" : "teacher_reassign_peer_request";
    const { data, error: rpcError } = await getSupabaseClient().rpc(
      rpc as never,
      {
        p_request_id: row.request_id,
        p_supporter_id: selectedSupporter,
      } as never,
    );
    const result = (data as Array<{ success: boolean; outcome: string }> | null)?.[0];
    if (rpcError || !result?.success) {
      setError(
        result?.outcome === "supporter_not_active"
          ? "That supporter is no longer active."
          : result?.outcome === "not_reassignable"
            ? "A confirmed or closed case cannot be silently reassigned."
            : "The request changed before assignment. The overview has been refreshed.",
      );
    } else {
      setAssigning(null);
      setSupporters([]);
      setSelectedSupporter("");
    }
    await load();
    setBusy(null);
  }

  return (
    <>
      <DashboardPageHeading
        eyebrow="Operational view"
        title="Peer Support Overview"
        description="Check waiting requests, today’s meetings, and anything needing attention."
      />
      <SchoolSettings />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          icon={Inbox}
          label="Unassigned"
          value={counts ? String(counts.open_count) : loading ? "…" : "—"}
          note="Open requests"
          accent="orange"
        />

        <SummaryCard
          icon={CheckCircle2}
          label="Today"
          value={counts ? String(counts.today_count) : loading ? "…" : "—"}
          note="Korea time"
          accent="green"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Escalated"
          value={counts ? String(counts.escalated_count) : loading ? "…" : "—"}
          note="Needs oversight"
          accent="pink"
        />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Confirmed meetings: {counts?.scheduled_count ?? "…"} · Email needs attention:{" "}
        {counts?.email_attention_count ?? "…"}
      </p>
      <section id="requests" className="mt-8">
        <h2 className="mb-3 text-xl font-bold text-swag-navy">Requests & meetings</h2>
        <div className="mb-4 flex flex-wrap gap-2" aria-label="Peer Support filters">
          {(
            [
              "all",
              "open",
              "needs_attention",
              "assigned",
              "scheduled",
              "today",
              "completed",
              "cancelled",
              "no_show",
              "escalated",
              "email",
            ] as Filter[]
          ).map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setFilter(item)}
              aria-pressed={filter === item}
              className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${filter === item ? "border-swag-blue bg-swag-blue/10 text-swag-blue" : "border-border text-muted-foreground"}`}
            >
              {item === "email" ? "Email needs attention" : item.replace("_", " ")}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-swag-orange/40 p-3 text-sm">
            {error}
          </p>
        )}
        {loading ? (
          <PageState>Loading Peer Support overview…</PageState>
        ) : filtered.length === 0 ? (
          <PageState tone="green">No requests match this filter.</PageState>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="border-b border-border bg-muted/35 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Student</th>
                  <th className="p-3">Mentor</th>
                  <th className="p-3">Requested / confirmed</th>
                  <th className="p-3">Actual time</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Confirmation email</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.request_id}
                    className="border-b border-border/70 align-top last:border-0"
                  >
                    <td className="max-w-44 break-words p-3 font-semibold text-swag-navy">
                      {row.student_name}
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {row.year_group} · {row.category}
                      </span>
                      {row.status === "open" && (
                        <details className="mt-2 text-xs font-normal">
                          <summary className="cursor-pointer font-semibold text-swag-blue">
                            Operational detail
                          </summary>
                          <p className="mt-2 max-w-64 whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
                            {row.private_explanation || "No additional details were provided."}
                          </p>
                        </details>
                      )}
                    </td>
                    <td className="max-w-44 break-words p-3">
                      {row.mentor_name || "Unassigned"}
                      {row.assignment_method && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {row.assignment_method.replace("_", " ")}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="block">{row.preferred_date}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.confirmed_period
                          ? labels[row.confirmed_period]
                          : row.preferred_periods.map((period) => labels[period]).join(", ")}
                      </span>
                      {row.stale && (
                        <span className="mt-1 block text-xs font-semibold text-swag-orange">
                          Requested date has passed
                        </span>
                      )}
                      {row.needs_attention && (
                        <span className="mt-1 block text-xs font-semibold text-swag-orange">
                          Waiting beyond attention threshold
                        </span>
                      )}
                      {row.near_requested_date && !row.stale && (
                        <span className="mt-1 block text-xs font-semibold text-swag-pink">
                          Requested date is near
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {row.session_start && row.session_end ? (
                        <>
                          <span className="block">
                            {seoulDateTime.format(new Date(row.session_start))}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            until {seoulTime.format(new Date(row.session_end))} · {row.location}
                          </span>
                        </>
                      ) : (
                        "Not confirmed"
                      )}
                    </td>
                    <td className="p-3 font-semibold capitalize">
                      {row.status === "accepted"
                        ? "assigned — awaiting confirmation"
                        : row.status.replace("_", " ")}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-3">
                        <EmailStatus
                          label="Student"
                          status={row.student_email_status}
                          jobId={row.student_email_job_id}
                          retry={retry}
                        />
                        <EmailStatus
                          label="Mentor"
                          status={row.mentor_email_status}
                          jobId={row.mentor_email_job_id}
                          retry={retry}
                        />
                        <EmailStatus
                          label="Teacher"
                          status={row.teacher_email_status}
                          jobId={row.teacher_email_job_id}
                          retry={retry}
                        />
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        {(row.status === "open" || row.status === "accepted") && (
                          <button
                            disabled={busy === row.request_id}
                            onClick={() => void openAssignment(row)}
                            className="text-left text-xs font-semibold text-swag-blue underline"
                          >
                            {row.status === "open" ? "Assign supporter" : "Reassign supporter"}
                          </button>
                        )}
                        {assigning === row.request_id && (
                          <div className="mt-2 min-w-64 rounded-lg border border-border bg-background p-2">
                            <label className="text-xs font-semibold text-swag-navy">
                              Active Peer Mentor or SWAG Member
                              <select
                                value={selectedSupporter}
                                onChange={(event) => setSelectedSupporter(event.target.value)}
                                className="mt-1 min-h-10 w-full rounded-md border border-border bg-background px-2 font-normal"
                              >
                                <option value="">Select supporter</option>
                                {supporters.map((candidate) => (
                                  <option key={candidate.profile_id} value={candidate.profile_id}>
                                    {candidate.full_name || "Supporter"} ·{" "}
                                    {candidate.supporter_role.replace("_", " ")} ·{" "}
                                    {candidate.active_case_count} active
                                    {candidate.conflicting_periods.length
                                      ? ` · conflicts: ${candidate.conflicting_periods.map((period) => labels[period] || period).join(", ")}`
                                      : ""}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                disabled={!selectedSupporter || busy === row.request_id}
                                onClick={() => void saveAssignment(row)}
                                className="min-h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                              >
                                {row.status === "open" ? "Assign" : "Reassign"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setAssigning(null)}
                                className="min-h-9 rounded-md border border-border px-3 text-xs font-semibold"
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        )}
                        {["accepted", "scheduled"].includes(row.status) && row.session_start && (
                          <>
                            <button
                              disabled={busy === row.request_id}
                              onClick={() => void outcome(row.request_id, "completed")}
                              className="text-left text-xs font-semibold text-swag-green underline"
                            >
                              Complete
                            </button>
                            <button
                              disabled={busy === row.request_id}
                              onClick={() => void outcome(row.request_id, "no_show")}
                              className="text-left text-xs font-semibold text-swag-orange underline"
                            >
                              No-show
                            </button>
                            <button
                              disabled={busy === row.request_id}
                              onClick={() => void outcome(row.request_id, "cancelled")}
                              className="text-left text-xs font-semibold text-destructive underline"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {["completed", "no_show"].includes(row.status) && (
                          <button
                            disabled={busy === row.request_id}
                            onClick={() => void correct(row)}
                            className="text-left text-xs font-semibold text-swag-blue underline"
                          >
                            Correct outcome
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function settingsForm(row: SettingsRow) {
  const byPeriod = Object.fromEntries(row.periods.map((p) => [p.period, p]));
  const time = (value: string | null | undefined) => value?.slice(0, 5) || "";
  return {
    location: row.location_guidance || "",
    teacher: row.supervisor_teacher_id || "",
    weekdays: [...row.active_weekdays].sort(),
    breakStart: time(byPeriod["break"]?.start_time),
    breakEnd: time(byPeriod["break"]?.end_time),
    lunch1Start: time(byPeriod["lunch_1"]?.start_time),
    lunch1End: time(byPeriod["lunch_1"]?.end_time),
    lunch2Start: time(byPeriod["lunch_2"]?.start_time),
    lunch2End: time(byPeriod["lunch_2"]?.end_time),
  };
}

function SchoolSettings() {
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [form, setForm] = useState<ReturnType<typeof settingsForm> | null>(null);
  const [attentionHours, setAttentionHours] = useState(24);
  const [savedAttentionHours, setSavedAttentionHours] = useState<number | null>(null);
  const [email, setEmail] = useState<{ configured: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const client = getSupabaseClient();
    const [settingResult, candidateResult, policyResult, emailResult] = await Promise.all([
      client.rpc("get_peer_support_settings"),
      client.rpc("list_teacher_candidates"),
      client.rpc("get_peer_assignment_policy" as never),
      fetch("/api/peer-support/status", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
    ]);
    const row = settingResult.data?.[0] as SettingsRow | undefined;
    if (settingResult.error || candidateResult.error || !row) {
      setError(
        "Saved settings could not be verified. Your edits have been kept. Reload to check readiness.",
      );
      return false;
    }
    setSettings(row);
    setCandidates((candidateResult.data ?? []) as Candidate[]);
    setForm(settingsForm(row));
    setEmail(emailResult?.email ?? null);
    const policy = (policyResult.data as Array<{ assignment_attention_hours: number }> | null)?.[0];
    if (policy) {
      setAttentionHours(policy.assignment_attention_hours);
      setSavedAttentionHours(policy.assignment_attention_hours);
    }
    setError(
      policyResult.error
        ? "The attention threshold could not be loaded. School settings are shown below."
        : null,
    );
    return true;
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const readiness = settings ? savedReadiness(settings, candidates) : null;
  const dirty = Boolean(
    form && settings && JSON.stringify(form) !== JSON.stringify(settingsForm(settings)),
  );
  const policyDirty = savedAttentionHours !== null && attentionHours !== savedAttentionHours;
  useEffect(() => {
    if (!dirty && !policyDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, policyDirty]);
  async function save() {
    if (!form) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const { data, error: rpcError } = await getSupabaseClient().rpc(
        "save_peer_support_settings",
        {
          p_location_guidance: form.location,
          p_supervisor_teacher_id: form.teacher,
          p_active_weekdays: form.weekdays,
          p_break_start: form.breakStart,
          p_break_end: form.breakEnd,
          p_lunch_1_start: form.lunch1Start,
          p_lunch_1_end: form.lunch1End,
          p_lunch_2_start: form.lunch2Start,
          p_lunch_2_end: form.lunch2End,
        },
      );
      if (rpcError || !data) {
        setError(
          "Settings were not saved. Choose an active teacher, a location, school days, and valid start/end times for all three periods. Your edits have been kept.",
        );
      } else {
        // Do not reset an independently edited attention threshold.
        const result = await getSupabaseClient().rpc("get_peer_support_settings");
        const candidatesResult = await getSupabaseClient().rpc("list_teacher_candidates");
        const row = result.data?.[0] as SettingsRow | undefined;
        if (result.error || candidatesResult.error || !row) {
          setError(
            "Save succeeded, but readiness could not be reloaded. Reload to verify the saved setup.",
          );
        } else {
          setSettings(row);
          setForm(settingsForm(row));
          setCandidates((candidatesResult.data ?? []) as Candidate[]);
          setMessage("School settings saved. Readiness below reflects the saved setup.");
        }
      }
    } catch {
      setError("Could not reach the server. Your edits have been kept; try saving again.");
    } finally {
      setBusy(false);
    }
  }
  async function saveAttentionPolicy() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const { data, error: rpcError } = await getSupabaseClient().rpc(
        "set_peer_assignment_policy" as never,
        { p_assignment_attention_hours: attentionHours } as never,
      );
      if (rpcError || !data)
        setError("Threshold was not saved. Use a whole number from 1 to 168 hours.");
      else {
        setSavedAttentionHours(attentionHours);
        setMessage("Attention threshold saved. Other edits are unchanged.");
      }
    } catch {
      setError("Could not save the attention threshold. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const inputClass =
    "mt-2 min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 font-normal";
  return (
    <section
      id="school-settings"
      className="paper-card mt-6 scroll-mt-6 border-swag-blue/35 p-5 sm:p-7"
      aria-label="Peer Support setup status"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-swag-navy">Peer Support setup status</h2>
          <p className="mt-1 text-sm text-muted-foreground">Saved school setup · Asia/Seoul</p>
        </div>
        <span
          role="status"
          className={`rounded-full px-3 py-1 text-sm font-semibold ${readiness?.ready ? "bg-swag-green/10 text-swag-green" : "bg-swag-orange/10 text-swag-orange"}`}
        >
          {readiness
            ? readiness.ready
              ? "Ready to run"
              : "Setup needs attention"
            : "Checking saved setup…"}
        </span>
      </div>
      {readiness && (
        <>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {readiness.checks.map((check) => (
              <li key={check.label} className="rounded-lg bg-muted/40 px-3 py-2">
                <span aria-hidden="true">{check.ready ? "✓" : "!"}</span> {check.label}:{" "}
                <strong>{check.ready ? "Ready" : "Missing"}</strong>
              </li>
            ))}
          </ul>
          {!readiness.ready && (
            <div
              className="mt-4 rounded-xl border border-swag-orange/40 bg-swag-orange/5 p-4 text-sm"
              role="status"
            >
              <p className="font-bold text-swag-navy">What needs attention</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {readiness.missing.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Confirmation email:{" "}
        {email ? (email.configured ? "ready" : "not configured") : "status unavailable"}. Sent only
        when a meeting is confirmed.
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-swag-orange/40 p-3 text-sm">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm font-semibold text-swag-green">
          {message}
        </p>
      )}
      {!form ? (
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 text-sm font-semibold text-swag-blue"
        >
          Reload settings
        </button>
      ) : (
        <details className="mt-5" open={!readiness?.ready || undefined}>
          <summary className="cursor-pointer text-sm font-semibold text-swag-blue">
            Edit school settings{dirty || policyDirty ? " · Unsaved changes" : ""}
          </summary>
          <fieldset disabled={busy} className="mt-5 min-w-0 disabled:opacity-60">
            <legend className="text-base font-bold text-swag-navy">General settings</legend>
            <label className="mt-3 block text-sm font-semibold text-swag-navy">
              Approved location or guidance
              <input
                value={form.location}
                maxLength={160}
                onChange={(e) => setForm((old) => old && { ...old, location: e.target.value })}
                className={inputClass}
              />
            </label>
            <h3 className="mt-5 font-bold text-swag-navy">Supervisor</h3>
            <label className="mt-2 block text-sm font-semibold text-swag-navy">
              Designated supervising teacher
              <select
                value={form.teacher}
                onChange={(e) => setForm((old) => old && { ...old, teacher: e.target.value })}
                className={inputClass}
              >
                <option value="">Select an approved Teacher</option>
                {form.teacher && !candidates.some((c) => c.profile_id === form.teacher) && (
                  <option value={form.teacher} disabled>
                    {settings?.supervisor_teacher_name || "Saved teacher"} — inactive / unavailable
                  </option>
                )}
                {candidates.map((c) => (
                  <option key={c.profile_id} value={c.profile_id}>
                    {c.full_name || "Approved teacher"}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              Only teachers with active staff registration can supervise. Missing teacher? Ask the
              administrator to check their registration.
            </p>
            <fieldset className="mt-5">
              <legend className="font-bold text-swag-navy">School days</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => (
                  <label
                    key={label}
                    className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.weekdays.includes(index + 1)}
                      onChange={(e) =>
                        setForm(
                          (old) =>
                            old && {
                              ...old,
                              weekdays: e.target.checked
                                ? [...old.weekdays, index + 1].sort()
                                : old.weekdays.filter((d) => d !== index + 1),
                            },
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <h3 className="mt-5 font-bold text-swag-navy">
              Period times{" "}
              <span className="text-sm font-normal text-muted-foreground">(Asia/Seoul)</span>
            </h3>
            <div className="mt-3 grid gap-3 xl:grid-cols-3">
              {periodFields.map(([label, start, end]) => (
                <fieldset key={label} className="min-w-0 rounded-xl border border-border p-3">
                  <legend className="px-1 text-sm font-semibold text-swag-navy">{label}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="min-w-0 text-xs text-muted-foreground">
                      Start
                      <input
                        type="time"
                        value={form[start]}
                        onChange={(e) =>
                          setForm((old) => old && { ...old, [start]: e.target.value })
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="min-w-0 text-xs text-muted-foreground">
                      End
                      <input
                        type="time"
                        value={form[end]}
                        onChange={(e) => setForm((old) => old && { ...old, [end]: e.target.value })}
                        className={inputClass}
                      />
                    </label>
                  </div>
                </fieldset>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void save()}
                className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                {busy ? "Saving…" : "Save school settings"}
              </button>
              <p role="status" className="text-sm text-muted-foreground">
                {dirty
                  ? "Unsaved school settings — save to apply."
                  : "School settings match the saved setup."}
              </p>
            </div>
          </fieldset>
          <fieldset
            disabled={busy || savedAttentionHours === null}
            className="mt-6 min-w-0 border-t border-border pt-5"
          >
            <legend className="text-base font-bold text-swag-navy">Attention threshold</legend>
            <p className="text-xs text-muted-foreground">
              Highlight requests waiting this long. This does not assign or block meetings.
            </p>
            <label className="mt-3 block max-w-xs text-sm font-semibold text-swag-navy">
              Hours
              <input
                type="number"
                min={1}
                max={168}
                step={1}
                value={attentionHours}
                onChange={(e) => setAttentionHours(Number(e.target.value))}
                className={inputClass}
              />
            </label>
            <button
              type="button"
              disabled={!policyDirty || busy}
              onClick={() => void saveAttentionPolicy()}
              className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-50"
            >
              Save attention threshold
            </button>
            {policyDirty && (
              <p className="mt-2 text-xs text-muted-foreground">
                Unsaved attention threshold (saved separately).
              </p>
            )}
          </fieldset>
        </details>
      )}
    </section>
  );
}

export function TeacherPeerHome() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    void getSupabaseClient()
      .rpc("get_teacher_peer_support_counts")
      .then(({ data, error: rpcError }) => {
        setCounts((data?.[0] ?? null) as Counts | null);
        setError(Boolean(rpcError));
      });
  }, []);
  const value = (key: keyof Counts) => (error ? "—" : counts ? String(counts[key]) : "…");
  return (
    <>
      <DashboardPageHeading
        eyebrow="Teacher workspace"
        title="Peer Support at a glance"
        description="Start with requests needing support and today’s meetings."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          icon={Inbox}
          label="Unassigned"
          value={value("open_count")}
          note="Open requests"
          accent="orange"
        />

        <SummaryCard
          icon={CheckCircle2}
          label="Today"
          value={value("today_count")}
          note="Korea time"
          accent="green"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Escalated"
          value={value("escalated_count")}
          note="Needs oversight"
          accent="pink"
        />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link to="/teacher/peer-support" className="paper-card border-swag-blue/35 p-5">
          <h2 className="font-bold text-swag-navy">Manage Peer Support →</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Assign requests, check meetings, and review school setup.
          </p>
        </Link>
        <Link to="/teacher/escalations" className="paper-card border-swag-pink/35 p-5">
          <h2 className="font-bold text-swag-navy">Review escalations →</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Follow up on cases that need Teacher support.
          </p>
        </Link>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Confirmed meetings: {value("scheduled_count")} · Email needs attention:{" "}
        {value("email_attention_count")}
      </p>
    </>
  );
}
