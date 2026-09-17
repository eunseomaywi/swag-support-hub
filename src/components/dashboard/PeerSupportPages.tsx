import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock3,
  EyeOff,
  HandHeart,
  Inbox,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardPageHeading, PageState } from "@/components/dashboard/DashboardLayout";
import { SummaryCard } from "@/components/dashboard/DashboardPieces";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type PeerRole = "peer_mentor" | "swag_member";
type QueueRow = {
  request_id: string;
  student_name: string;
  year_group: string;
  category: string;
  private_explanation: string | null;
  preferred_date: string;
  preferred_time: string;
  preferred_periods: string[];
  submitted_at: string;
  dismissed: boolean;
  stale: boolean;
};
type PreviewRow = {
  request_id: string;
  preferred_date: string;
  period: string;
  period_label: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  display_timezone: string;
  location_guidance: string | null;
  ready: boolean;
  readiness_issue: string | null;
};
type CaseRow = {
  request_id: string;
  student_name: string | null;
  year_group: string | null;
  contact_email: string | null;
  category: string;
  preferred_date: string;
  preferred_time: string;
  preferred_periods: string[];
  private_explanation: string | null;
  status: string;
  submitted_at: string;
  session_id: string | null;
  session_start: string | null;
  session_end: string | null;
  session_label: string | null;
  session_period: string | null;
  session_location: string | null;
  session_status: string | null;
  student_email_job_id: string | null;
  mentor_email_job_id: string | null;
  teacher_email_job_id: string | null;
  student_email_status: string | null;
  mentor_email_status: string | null;
  teacher_email_status: string | null;
  escalation_reason: string | null;
  escalated_at: string | null;
};
type CountRow = Database["public"]["Functions"]["get_peer_dashboard_counts"]["Returns"][number];
type EscalationRow = Database["public"]["Functions"]["list_peer_escalations"]["Returns"][number];
type EscalationDetail = Database["public"]["Functions"]["get_peer_escalation"]["Returns"][number];

const seoulDateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});
const seoulDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", dateStyle: "medium" });

function baseFor(role: PeerRole) {
  return role === "peer_mentor" ? "/peer-mentor" : "/swag";
}
function format(value: string | null) {
  return value ? seoulDateTime.format(new Date(value)) : "Not scheduled";
}

function useFocusRefresh(load: () => Promise<void>) {
  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
}

export function PeerHome({ role }: { role: PeerRole }) {
  const [counts, setCounts] = useState<CountRow | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    const { data, error: rpcError } = await getSupabaseClient().rpc("get_peer_dashboard_counts");
    setCounts(data?.[0] ?? null);
    setError(Boolean(rpcError));
  }, []);
  useFocusRefresh(load);
  const base = baseFor(role);
  const value = (field: keyof CountRow) => (error ? "—" : counts ? String(counts[field]) : "…");
  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-swag-green/30 bg-card px-5 py-7 sm:px-8 sm:py-9">
        <p className="text-sm font-semibold text-swag-green">
          {role === "swag_member" ? "SWAG Member workspace" : "Peer Mentor workspace"}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-swag-navy sm:text-4xl">
          Support, clearly organised.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          See what needs attention, then open a focused page for each task.
        </p>
        <span
          aria-hidden="true"
          className="absolute -right-6 -top-8 h-32 w-32 rounded-full border-[18px] border-swag-green/8"
        />
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={Inbox}
          label="Available requests"
          value={value("available_count")}
          note="Privacy-limited open requests"
          accent="orange"
        />
        <SummaryCard
          icon={HandHeart}
          label="My active cases"
          value={value("my_active_case_count")}
          note="Requests assigned to you"
          accent="blue"
        />
        <SummaryCard
          icon={Clock3}
          label="Upcoming sessions"
          value={value("my_upcoming_session_count")}
          note="Confirmed session times"
          accent="pink"
        />
        <SummaryCard
          icon={ShieldAlert}
          label="Email attention"
          value={value("email_attention_count" as keyof CountRow)}
          note="Failed or uncertain confirmation emails"
          accent="green"
        />
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        <Link
          to={`${base}/requests` as never}
          className="paper-card group border-swag-orange/35 p-5 hover:-translate-y-0.5"
        >
          <h2 className="text-lg font-bold text-swag-navy">Available Requests</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Review only the minimum queue information before choosing Accept or Pass.
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-swag-blue">
            Open requests →
          </span>
        </Link>
        <Link
          to={`${base}/cases` as never}
          className="paper-card group border-swag-blue/35 p-5 hover:-translate-y-0.5"
        >
          <h2 className="text-lg font-bold text-swag-navy">My Cases</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Continue only the support requests currently entrusted to you.
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-swag-blue">
            Open my cases →
          </span>
        </Link>
      </div>
    </>
  );
}

export function AvailableRequests({ role }: { role: PeerRole }) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includePassed, setIncludePassed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await getSupabaseClient().rpc(
      "list_available_peer_requests",
      { p_include_dismissed: includePassed, p_page_offset: 0, p_page_size: 30 },
    );
    if (rpcError) {
      setRows([]);
      setError("Requests could not be loaded. Please try again.");
    } else setRows((data ?? []) as QueueRow[]);
    setLoading(false);
  }, [includePassed]);
  useFocusRefresh(load);
  async function accept(id: string) {
    setBusy(id);
    setError(null);
    const { data, error: rpcError } = await getSupabaseClient().rpc("claim_peer_request", {
      p_request_id: id,
    });
    const result = data?.[0];
    if (rpcError || !result?.success) {
      setError(
        result?.outcome === "self_assignment_blocked"
          ? "You cannot accept your own support request."
          : "Another supporter or a Teacher may already have assigned this request. The list has been refreshed.",
      );
    }
    await load();
    setBusy(null);
  }
  async function toggle(row: QueueRow) {
    setBusy(row.request_id);
    const rpc = row.dismissed ? "undo_dismiss_peer_request" : "dismiss_peer_request";
    const { error: rpcError } = await getSupabaseClient().rpc(rpc, {
      p_request_id: row.request_id,
    });
    if (rpcError) setError("That preference could not be saved.");
    await load();
    setBusy(null);
  }
  return (
    <>
      <DashboardPageHeading
        eyebrow={role === "swag_member" ? "Shared peer capability" : "Peer Support"}
        title="Available Requests"
        description="Approved Peer Mentors and SWAG Members can review the student's request and accept one they can support. Email addresses are not shown here."
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-swag-navy">
          <input
            type="checkbox"
            checked={includePassed}
            onChange={(event) => setIncludePassed(event.target.checked)}
            className="h-4 w-4"
          />
          Show requests I passed
        </label>
        <button
          onClick={() => void load()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-swag-navy"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>
      {error && (
        <p
          className="mb-4 rounded-lg border border-swag-orange/35 bg-swag-orange/5 p-3 text-sm text-swag-navy"
          role="alert"
        >
          {error}
        </p>
      )}
      {loading ? (
        <PageState>Loading available requests…</PageState>
      ) : rows.length === 0 ? (
        <PageState tone="green">There are no available requests right now.</PageState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => (
            <article key={row.request_id} className="paper-card border-swag-orange/30 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-swag-orange">
                    {row.category}
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-swag-navy">
                    {row.student_name} · {row.year_group}
                  </h2>
                </div>
                {row.dismissed && (
                  <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                    Passed
                  </span>
                )}
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-swag-navy">
                {row.private_explanation || "No additional details were provided."}
              </p>
              <p className="mt-3 text-sm font-semibold text-swag-navy">
                {seoulDate.format(new Date(`${row.preferred_date}T00:00:00+09:00`))} ·{" "}
                {row.preferred_time}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Submitted {format(row.submitted_at)}
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  disabled={busy === row.request_id}
                  onClick={() => void accept(row.request_id)}
                  className="min-h-11 flex-1 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  Accept
                </button>
                <button
                  disabled={busy === row.request_id}
                  onClick={() => void toggle(row)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-swag-navy disabled:opacity-60"
                >
                  {row.dismissed ? (
                    <RotateCcw className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                  {row.dismissed ? "Undo" : "Pass"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export function MyCases({ role }: { role: PeerRole }) {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await getSupabaseClient().rpc("list_my_peer_cases", {
      p_page_offset: 0,
      p_page_size: 40,
    });
    setRows(data ?? []);
    setError(Boolean(rpcError));
    setLoading(false);
  }, []);
  useFocusRefresh(load);
  const base = baseFor(role);
  return (
    <>
      <DashboardPageHeading
        eyebrow="Private workspace"
        title="My Cases"
        description="Only requests assigned to you appear here. Escalated cases retain a minimal handover status."
      />
      {loading ? (
        <PageState>Loading your cases…</PageState>
      ) : error ? (
        <PageState tone="pink">Your cases could not be loaded.</PageState>
      ) : rows.length === 0 ? (
        <PageState tone="green">You do not have any assigned cases yet.</PageState>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <Link
              key={row.request_id}
              to={`${base}/cases/${row.request_id}` as never}
              className="paper-card grid gap-3 border-swag-blue/30 p-5 hover:-translate-y-0.5 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-swag-blue/10 px-2.5 py-1 text-xs font-semibold capitalize text-swag-blue">
                    {row.status === "accepted" && row.session_id
                      ? "confirmed"
                      : row.status.replace("_", " ")}
                  </span>
                  <span className="text-xs text-muted-foreground">{row.category}</span>
                </div>
                <h2 className="mt-2 font-bold text-swag-navy">
                  {row.status === "escalated" ? "Escalated handover" : row.student_name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.session_start
                    ? format(row.session_start)
                    : `${row.preferred_date} · ${row.preferred_time}`}
                </p>
              </div>
              <span className="text-sm font-semibold text-swag-blue">Open case →</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function CaseDetail({ role, requestId }: { role: PeerRole; requestId: string }) {
  const [row, setRow] = useState<CaseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmationOptions, setConfirmationOptions] = useState<PreviewRow[] | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await getSupabaseClient().rpc("list_my_peer_cases", {
      p_page_offset: 0,
      p_page_size: 100,
    });
    const found = data?.find((item) => item.request_id === requestId) ?? null;
    setRow(found);
    setError(
      rpcError
        ? "This case could not be loaded."
        : found
          ? null
          : "This case is no longer available to your account.",
    );
    setLoading(false);
  }, [requestId]);
  useFocusRefresh(load);
  async function loadConfirmationOptions() {
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await getSupabaseClient().rpc(
      "preview_peer_request_confirmation",
      { p_request_id: requestId },
    );
    if (rpcError || !data?.length) {
      setConfirmationOptions(null);
      setError("Meeting options could not be loaded.");
    } else setConfirmationOptions(data as PreviewRow[]);
    setBusy(false);
  }
  async function confirmMeeting(period: string) {
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await getSupabaseClient().rpc(
      "confirm_peer_meeting" as never,
      { p_request_id: requestId, p_period: period } as never,
    );
    const result = (
      data as Array<{ success: boolean; outcome: string; session_id: string | null }> | null
    )?.[0];
    if (rpcError || !result?.success) {
      const outcome = result?.outcome;
      setError(
        outcome === "supporter_conflict"
          ? "You already have another meeting at that time."
          : outcome === "student_conflict"
            ? "The student already has another meeting at that time."
            : outcome === "configuration_not_ready"
              ? "The school schedule, location, or supervising Teacher is not ready."
              : "The meeting could not be confirmed. Refresh and check the latest case status.",
      );
    } else {
      const { data: auth } = await getSupabaseClient().auth.getSession();
      if (auth.session?.access_token) {
        void fetch("/api/peer-support/email/kick", {
          method: "POST",
          headers: { Authorization: `Bearer ${auth.session.access_token}` },
        });
      }
      setConfirmationOptions(null);
      await load();
    }
    setBusy(false);
  }
  async function action(kind: "complete" | "cancel" | "no_show") {
    setBusy(true);
    const result =
      kind === "complete"
        ? await getSupabaseClient().rpc("complete_my_peer_case", { p_request_id: requestId })
        : kind === "no_show"
          ? await getSupabaseClient().rpc("mark_peer_case_no_show", { p_request_id: requestId })
          : await getSupabaseClient().rpc("cancel_my_peer_session", { p_request_id: requestId });
    if (result.error || !result.data)
      setError(
        kind === "cancel"
          ? "The appointment could not be cancelled."
          : "That outcome can only be recorded after the appointment ends and from an active confirmed state.",
      );
    await load();
    setBusy(false);
  }
  async function escalate() {
    if (!reason.trim()) {
      setError("Add a short reason for the Teacher handover.");
      return;
    }
    setBusy(true);
    const { data, error: rpcError } = await getSupabaseClient().rpc("escalate_my_peer_case", {
      p_request_id: requestId,
      p_reason: reason,
    });
    if (rpcError || !data) setError("This case could not be escalated.");
    await load();
    setBusy(false);
  }
  async function retry(jobId: string) {
    setBusy(true);
    const { data, error: rpcError } = await getSupabaseClient().rpc("retry_confirmation_email", {
      p_outbox_id: jobId,
    });
    if (rpcError || !data)
      setError("That confirmation email cannot be retried from the current state.");
    await load();
    setBusy(false);
  }
  if (loading) return <PageState>Loading the case…</PageState>;
  if (!row)
    return (
      <>
        <DashboardPageHeading
          eyebrow="My Cases"
          title="Case unavailable"
          description={error || "This case is unavailable."}
        />
        <Link
          to={`${baseFor(role)}/cases` as never}
          className="text-sm font-semibold text-swag-blue"
        >
          ← Back to My Cases
        </Link>
      </>
    );
  const privateVisible = row.status !== "escalated";
  return (
    <>
      <Link to={`${baseFor(role)}/cases` as never} className="text-sm font-semibold text-swag-blue">
        ← Back to My Cases
      </Link>
      <div className="mt-5">
        <DashboardPageHeading
          eyebrow={`Status · ${row.status}`}
          title={
            privateVisible ? row.student_name || "Assigned student" : "Teacher handover complete"
          }
          description={
            privateVisible
              ? `${row.category} · ${row.year_group}`
              : "Private case details are no longer available in the ordinary mentor workspace."
          }
        />
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-swag-orange/35 p-3 text-sm">
          {error}
        </p>
      )}
      {privateVisible && (
        <div className="grid gap-5 lg:grid-cols-[1fr_0.7fr]">
          <section className="paper-card border-swag-blue/35 p-5 sm:p-7">
            <h2 className="text-lg font-bold text-swag-navy">Case details</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Contact email</dt>
                <dd className="break-all font-semibold text-swag-navy">{row.contact_email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Requested availability</dt>
                <dd className="font-semibold text-swag-navy">
                  {row.preferred_date} · {row.preferred_time}
                </dd>
              </div>
            </dl>
            <h3 className="mt-6 font-bold text-swag-navy">What they shared</h3>
            <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-muted/45 p-4 text-sm leading-relaxed">
              {row.private_explanation || "No additional explanation was provided."}
            </p>
            {row.session_start && (
              <div className="mt-5 rounded-xl border border-swag-green/30 p-4 text-sm">
                <strong className="text-swag-navy">Confirmed session</strong>
                <p className="mt-1">
                  {format(row.session_start)}
                  {row.session_location ? ` · ${row.session_location}` : ""}
                </p>
              </div>
            )}
            {row.session_id && (
              <div className="mt-5 rounded-xl border border-swag-blue/30 p-4 text-sm">
                <strong className="text-swag-navy">Confirmation email status</strong>
                <dl className="mt-2 grid gap-2 sm:grid-cols-3">
                  {[
                    ["Student", row.student_email_status, row.student_email_job_id],
                    ["Mentor", row.mentor_email_status, row.mentor_email_job_id],
                    ["Teacher", row.teacher_email_status, row.teacher_email_job_id],
                  ].map(([label, status, job]) => (
                    <div key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-semibold capitalize text-swag-navy">
                        {status?.replace("_", " ") || "not queued"}
                      </dd>
                      {job && (status === "failed" || status === "uncertain") && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void retry(job)}
                          className="mt-1 text-xs font-semibold text-swag-blue underline"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  Submitted means the provider accepted the request. Delivered is only shown after a
                  verified provider event.
                </p>
              </div>
            )}
          </section>
          <aside className="paper-card border-swag-green/35 p-5">
            <h2 className="text-lg font-bold text-swag-navy">Next actions</h2>
            <div className="mt-4 grid gap-3">
              {row.status === "accepted" && !row.session_id && (
                <>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    This case is assigned to you, but no meeting is confirmed yet. Choose one of the
                    student's available periods.
                  </p>
                  {!confirmationOptions ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void loadConfirmationOptions()}
                      className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      Choose meeting time
                    </button>
                  ) : (
                    <div className="grid gap-2">
                      {confirmationOptions.map((option) => (
                        <div key={option.period} className="rounded-xl border border-border p-3">
                          <p className="text-sm font-bold text-swag-navy">
                            {option.preferred_date} · {option.period_label}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {option.scheduled_start && option.scheduled_end
                              ? `${format(option.scheduled_start)}–${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", timeStyle: "short" }).format(new Date(option.scheduled_end))} · ${option.location_guidance}`
                              : "School schedule or location is not configured."}
                          </p>
                          {!option.ready && (
                            <p className="mt-1 text-xs font-semibold text-swag-orange">
                              Not ready: {option.readiness_issue?.replaceAll("_", " ")}
                            </p>
                          )}
                          <button
                            type="button"
                            disabled={busy || !option.ready}
                            onClick={() => void confirmMeeting(option.period)}
                            className="mt-2 min-h-10 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                          >
                            Confirm Meeting
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Confirmation creates three separate email jobs: student, assigned supporter, and
                    supervising Teacher. Accepting the case did not send email.
                  </p>
                </>
              )}
              {["accepted", "scheduled"].includes(row.status) && row.session_id && (
                <>
                  <button
                    disabled={busy}
                    onClick={() => void action("complete")}
                    className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
                  >
                    Mark completed
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void action("no_show")}
                    className="min-h-11 rounded-lg border border-swag-orange/40 px-4 text-sm font-semibold text-swag-orange"
                  >
                    Mark no-show
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      window.confirm(
                        "Cancel this appointment? No cancellation email will be sent.",
                      ) && void action("cancel")
                    }
                    className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-swag-navy"
                  >
                    Cancel session
                  </button>
                </>
              )}
              {["accepted", "scheduled"].includes(row.status) && (
                <>
                  <label className="text-sm font-semibold text-swag-navy">
                    Escalation reason
                    <textarea
                      value={reason}
                      maxLength={500}
                      onChange={(event) => setReason(event.target.value)}
                      className="mt-2 min-h-24 w-full rounded-lg border border-border bg-background p-3 font-normal"
                    />
                  </label>
                  <button
                    disabled={busy || !reason.trim()}
                    onClick={() => void escalate()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-swag-pink/40 px-4 text-sm font-semibold text-swag-pink disabled:opacity-50"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Escalate to Teacher
                  </button>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export function EscalationsList({ role }: { role: "swag_member" | "teacher" }) {
  const [rows, setRows] = useState<EscalationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await getSupabaseClient().rpc("list_peer_escalations", {
      p_page_offset: 0,
      p_page_size: 40,
    });
    setRows(data ?? []);
    setLoading(false);
  }, []);
  useFocusRefresh(load);
  const base = role === "teacher" ? "/teacher/escalations" : "/swag/escalations";
  return (
    <>
      <DashboardPageHeading
        eyebrow="Teacher oversight"
        title="Escalations"
        description={
          role === "teacher"
            ? "Review Peer Support cases handed over for teacher oversight."
            : "Only escalated cases specifically shared with you appear here."
        }
      />
      {loading ? (
        <PageState>Loading escalations…</PageState>
      ) : rows.length === 0 ? (
        <PageState tone="green">No escalated cases are currently available to you.</PageState>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <Link
              key={row.request_id}
              to={`${base}/${row.request_id}` as never}
              className="paper-card border-swag-pink/35 p-5 hover:-translate-y-0.5"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-swag-pink">
                {row.category}
              </p>
              <h2 className="mt-1 font-bold text-swag-navy">
                Escalated {format(row.escalated_at)}
              </h2>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {row.escalation_reason}
              </p>
              <span className="mt-3 inline-block text-sm font-semibold text-swag-blue">
                Review handover →
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function EscalationDetailPage({
  role,
  requestId,
}: {
  role: "swag_member" | "teacher";
  requestId: string;
}) {
  const [row, setRow] = useState<EscalationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void getSupabaseClient()
      .rpc("get_peer_escalation", { p_request_id: requestId })
      .then(({ data }) => {
        setRow(data?.[0] ?? null);
        setLoading(false);
      });
  }, [requestId]);
  const back = role === "teacher" ? "/teacher/escalations" : "/swag/escalations";
  if (loading) return <PageState>Loading escalation…</PageState>;
  if (!row)
    return (
      <>
        <DashboardPageHeading
          eyebrow="Escalations"
          title="Escalation unavailable"
          description="This case is not authorized for your account."
        />
        <Link to={back as never} className="text-sm font-semibold text-swag-blue">
          ← Back
        </Link>
      </>
    );
  return (
    <>
      <Link to={back as never} className="text-sm font-semibold text-swag-blue">
        ← Back to Escalations
      </Link>
      <div className="mt-5">
        <DashboardPageHeading
          eyebrow="Escalated Peer Support"
          title={row.category}
          description={`Escalated ${format(row.escalated_at)}`}
        />
      </div>
      <section className="paper-card border-swag-pink/35 p-5 sm:p-7">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Student</dt>
            <dd className="font-semibold text-swag-navy">
              {row.student_name} · {row.year_group}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Contact</dt>
            <dd className="break-all font-semibold text-swag-navy">{row.contact_email}</dd>
          </div>
        </dl>
        <h2 className="mt-6 font-bold text-swag-navy">Original request</h2>
        <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-muted/45 p-4 text-sm">
          {row.private_explanation || "No private explanation was provided."}
        </p>
        <h2 className="mt-5 font-bold text-swag-navy">Escalation reason</h2>
        <p className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-swag-pink/30 p-4 text-sm">
          {row.escalation_reason}
        </p>
      </section>
    </>
  );
}
