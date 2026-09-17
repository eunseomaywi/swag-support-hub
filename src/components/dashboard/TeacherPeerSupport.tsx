import { AlertTriangle, CalendarCheck, CheckCircle2, Inbox, MailWarning } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardPageHeading, PageState } from "./DashboardLayout";
import { SummaryCard } from "./DashboardPieces";
import { getSupabaseClient } from "@/lib/supabase";

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
        description="Appointment status, recipient-level confirmation delivery, and the small set of school-wide settings. Private explanations are not shown in this table."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          icon={Inbox}
          label="Unassigned"
          value={counts ? String(counts.open_count) : loading ? "…" : "—"}
          note="Open requests"
          accent="orange"
        />
        <SummaryCard
          icon={CalendarCheck}
          label="Confirmed"
          value={counts ? String(counts.scheduled_count) : loading ? "…" : "—"}
          note="Accepted appointments"
          accent="blue"
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
        <SummaryCard
          icon={MailWarning}
          label="Email attention"
          value={counts ? String(counts.email_attention_count) : loading ? "…" : "—"}
          note="Failed or uncertain"
          accent="orange"
        />
      </div>
      <SchoolSettings />
      <section className="mt-8">
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

function SchoolSettings() {
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [email, setEmail] = useState<{
    configured: boolean;
    deliveryTracking: boolean;
    mode: string;
  } | null>(null);
  const [form, setForm] = useState({
    location: "",
    teacher: "",
    weekdays: [] as number[],
    breakStart: "",
    breakEnd: "",
    lunch1Start: "",
    lunch1End: "",
    lunch2Start: "",
    lunch2End: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [attentionHours, setAttentionHours] = useState(24);
  const load = useCallback(async () => {
    const client = getSupabaseClient();
    const [settingResult, candidateResult, policyResult, emailResult] = await Promise.all([
      client.rpc("get_peer_support_settings"),
      client.rpc("list_teacher_candidates"),
      client.rpc("get_peer_assignment_policy" as never),
      fetch("/api/peer-support/status", { cache: "no-store" })
        .then((response) => response.json())
        .catch(() => null),
    ]);
    const row = settingResult.data?.[0] as SettingsRow | undefined;
    if (row) {
      setSettings(row);
      setCandidates((candidateResult.data ?? []) as Candidate[]);
      const policy = (
        policyResult.data as Array<{ assignment_attention_hours: number }> | null
      )?.[0];
      if (policy) setAttentionHours(policy.assignment_attention_hours);
      setEmail(emailResult?.email ?? null);
      const byPeriod = Object.fromEntries(
        (row.periods ?? []).map((period) => [period.period, period]),
      );
      const time = (value: string | null | undefined) => value?.slice(0, 5) || "";
      setForm({
        location: row.location_guidance || "",
        teacher: row.supervisor_teacher_id || "",
        weekdays: row.active_weekdays || [],
        breakStart: time(byPeriod["break"]?.start_time),
        breakEnd: time(byPeriod["break"]?.end_time),
        lunch1Start: time(byPeriod["lunch_1"]?.start_time),
        lunch1End: time(byPeriod["lunch_1"]?.end_time),
        lunch2Start: time(byPeriod["lunch_2"]?.start_time),
        lunch2End: time(byPeriod["lunch_2"]?.end_time),
      });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function save() {
    setMessage(null);
    const { data, error } = await getSupabaseClient().rpc("save_peer_support_settings", {
      p_location_guidance: form.location,
      p_supervisor_teacher_id: form.teacher,
      p_active_weekdays: form.weekdays,
      p_break_start: form.breakStart,
      p_break_end: form.breakEnd,
      p_lunch_1_start: form.lunch1Start,
      p_lunch_1_end: form.lunch1End,
      p_lunch_2_start: form.lunch2Start,
      p_lunch_2_end: form.lunch2End,
    });
    setMessage(
      error || !data
        ? "Enter a valid location, Teacher, active days, and start/end time for all three periods."
        : "School appointment settings saved.",
    );
    await load();
  }
  async function saveAttentionPolicy() {
    setMessage(null);
    const { data, error } = await getSupabaseClient().rpc(
      "set_peer_assignment_policy" as never,
      { p_assignment_attention_hours: attentionHours } as never,
    );
    setMessage(
      error || !data
        ? "Use an attention threshold from 1 to 168 hours."
        : "Assignment attention threshold saved.",
    );
    await load();
  }
  return (
    <section className="paper-card mt-8 border-swag-blue/35 p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-swag-navy">School appointment settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Times are interpreted only in Asia/Seoul and snapshotted when a mentor confirms.
          </p>
        </div>
        <div className="text-xs">
          <p className={settings?.schedule_ready ? "text-swag-green" : "text-swag-orange"}>
            Schedule: {settings?.schedule_ready ? "ready" : "not configured"}
          </p>
          <p className={email?.configured ? "text-swag-green" : "text-swag-orange"}>
            Email: {email?.configured ? "live" : `not configured (${email?.mode || "disabled"})`}
          </p>
          <p className={email?.deliveryTracking ? "text-swag-green" : "text-muted-foreground"}>
            Delivery events:{" "}
            {email?.deliveryTracking ? "verified webhook ready" : "submitted status only"}
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold text-swag-navy">
          Approved location or guidance
          <input
            value={form.location}
            maxLength={160}
            onChange={(event) => setForm((old) => ({ ...old, location: event.target.value }))}
            className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-normal"
          />
        </label>
        <label className="text-sm font-semibold text-swag-navy">
          Designated supervisor Teacher
          <select
            value={form.teacher}
            onChange={(event) => setForm((old) => ({ ...old, teacher: event.target.value }))}
            className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-normal"
          >
            <option value="">Select an approved Teacher</option>
            {candidates.map((candidate) => (
              <option key={candidate.profile_id} value={candidate.profile_id}>
                {candidate.full_name || "Teacher profile"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 max-w-sm rounded-xl border border-border p-3">
        <label className="text-sm font-semibold text-swag-navy">
          Assignment attention threshold (hours)
          <input
            type="number"
            min={1}
            max={168}
            value={attentionHours}
            onChange={(event) => setAttentionHours(Number(event.target.value))}
            className="mt-2 min-h-10 w-full rounded-lg border border-border bg-background px-3 font-normal"
          />
        </label>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          This only highlights waiting requests. It does not block self-claiming or assign anyone
          automatically.
        </p>
        <button
          type="button"
          onClick={() => void saveAttentionPolicy()}
          className="mt-3 min-h-10 rounded-lg border border-border px-4 text-xs font-semibold text-swag-navy"
        >
          Save attention threshold
        </button>
      </div>
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-swag-navy">Active school days</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => {
            const day = index + 1;
            return (
              <label
                key={label}
                className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={form.weekdays.includes(day)}
                  onChange={(event) =>
                    setForm((old) => ({
                      ...old,
                      weekdays: event.target.checked
                        ? [...old.weekdays, day].sort()
                        : old.weekdays.filter((value) => value !== day),
                    }))
                  }
                />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {periodFields.map(([label, start, end]) => (
          <fieldset key={label} className="rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-semibold text-swag-navy">{label}</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">
                Start
                <input
                  type="time"
                  value={form[start]}
                  onChange={(event) => setForm((old) => ({ ...old, [start]: event.target.value }))}
                  className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-2 text-swag-navy"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                End
                <input
                  type="time"
                  value={form[end]}
                  onChange={(event) => setForm((old) => ({ ...old, [end]: event.target.value }))}
                  className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-2 text-swag-navy"
                />
              </label>
            </div>
          </fieldset>
        ))}
      </div>
      {message && (
        <p role="status" className="mt-4 text-sm text-swag-navy">
          {message}
        </p>
      )}
      <button
        type="button"
        onClick={() => void save()}
        className="mt-4 min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
      >
        Save settings
      </button>
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
        description="Live operational counts. Open the overview for schedules, recipient-level email state, and school settings."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          icon={Inbox}
          label="Unassigned"
          value={value("open_count")}
          note="Open requests"
          accent="orange"
        />
        <SummaryCard
          icon={CalendarCheck}
          label="Confirmed"
          value={value("scheduled_count")}
          note="Active appointments"
          accent="blue"
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
        <SummaryCard
          icon={MailWarning}
          label="Email attention"
          value={value("email_attention_count")}
          note="Failed or uncertain"
          accent="orange"
        />
      </div>
    </>
  );
}
