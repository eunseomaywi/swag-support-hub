import { Link } from "@tanstack/react-router";
import {
  CalendarClock,
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
type QueueRow = Database["public"]["Functions"]["list_available_peer_requests"]["Returns"][number];
type CaseRow = Database["public"]["Functions"]["list_my_peer_cases"]["Returns"][number];
type SlotRow = Database["public"]["Functions"]["list_my_peer_availability"]["Returns"][number];
type SessionRow = Database["public"]["Functions"]["list_my_peer_sessions"]["Returns"][number];
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
          icon={CalendarClock}
          label="Available slots"
          value={value("my_available_slot_count")}
          note="Your published availability"
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
    } else setRows(data ?? []);
    setLoading(false);
  }, [includePassed]);
  useFocusRefresh(load);
  async function claim(id: string) {
    setBusy(id);
    setError(null);
    const { data, error: rpcError } = await getSupabaseClient().rpc("claim_peer_request", {
      p_request_id: id,
    });
    if (rpcError) setError("This request could not be accepted.");
    else if (!data?.[0]?.success)
      setError("Another mentor has already accepted this request. The list has been refreshed.");
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
        description="Open requests show timing and category only. Student identity and private explanations stay hidden until you accept."
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
                    {seoulDate.format(new Date(`${row.preferred_date}T00:00:00+09:00`))} ·{" "}
                    {row.preferred_time}
                  </h2>
                </div>
                {row.dismissed && (
                  <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                    Passed
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Submitted {format(row.submitted_at)}
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  disabled={busy === row.request_id}
                  onClick={() => void claim(row.request_id)}
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
                    {row.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{row.category}</span>
                </div>
                <h2 className="mt-2 font-bold text-swag-navy">
                  {row.status === "escalated" ? "Escalated handover" : row.student_name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.status === "scheduled"
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
  async function action(kind: "complete" | "cancel") {
    setBusy(true);
    const result =
      kind === "complete"
        ? await getSupabaseClient().rpc("complete_my_peer_case", { p_request_id: requestId })
        : await getSupabaseClient().rpc("cancel_my_peer_session", { p_request_id: requestId });
    if (result.error || !result.data)
      setError(`The case could not be ${kind === "complete" ? "completed" : "updated"}.`);
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
          title={privateVisible ? row.student_name : "Teacher handover complete"}
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
            <h2 className="text-lg font-bold text-swag-navy">Request details</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Contact email</dt>
                <dd className="break-all font-semibold text-swag-navy">{row.contact_email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Preferred time</dt>
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
          </section>
          <aside className="paper-card border-swag-green/35 p-5">
            <h2 className="text-lg font-bold text-swag-navy">Next actions</h2>
            <div className="mt-4 grid gap-3">
              {row.status === "scheduled" && (
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
                    onClick={() => void action("cancel")}
                    className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-swag-navy"
                  >
                    Cancel session
                  </button>
                </>
              )}{" "}
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

export function MySessions() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await getSupabaseClient().rpc("list_my_peer_sessions");
    setRows(data ?? []);
    setLoading(false);
  }, []);
  useFocusRefresh(load);
  return (
    <>
      <DashboardPageHeading
        eyebrow="Peer Support"
        title="My Sessions"
        description="Confirmed and completed sessions are shown in Asia/Seoul."
      />
      {loading ? (
        <PageState>Loading sessions…</PageState>
      ) : rows.length === 0 ? (
        <PageState tone="green">
          No sessions yet. A student can select a time after you accept their request.
        </PageState>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <article
              key={row.session_id}
              className="paper-card flex flex-col gap-3 border-swag-pink/30 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <span className="rounded-full bg-swag-pink/10 px-2 py-1 text-xs font-semibold capitalize text-swag-pink">
                  {row.status}
                </span>
                <h2 className="mt-2 font-bold text-swag-navy">{row.category}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {format(row.scheduled_start)}
                  {row.time_label ? ` · ${row.time_label}` : ""}
                </p>
              </div>
              {row.location && (
                <p className="text-sm font-semibold text-swag-navy">{row.location}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function asSeoulInstant(value: string) {
  return new Date(`${value}:00+09:00`).toISOString();
}

export function MyAvailability() {
  const [rows, setRows] = useState<SlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ start: "", end: "", label: "", location: "" });
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await getSupabaseClient().rpc("list_my_peer_availability");
    setRows(data ?? []);
    setError(rpcError ? "Availability could not be loaded." : null);
    setLoading(false);
  }, []);
  useFocusRefresh(load);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.start || !form.end || form.start >= form.end) {
      setError("Choose a valid start and end time.");
      return;
    }
    setBusy(true);
    const { error: rpcError } = await getSupabaseClient().rpc("create_peer_availability", {
      p_start_at: asSeoulInstant(form.start),
      p_end_at: asSeoulInstant(form.end),
      p_time_label: form.label,
      p_location: form.location,
    });
    if (rpcError) setError("That slot is invalid, in the past, or overlaps an existing slot.");
    else setForm({ start: "", end: "", label: "", location: "" });
    await load();
    setBusy(false);
  }
  async function withdraw(id: string) {
    setBusy(true);
    const { error: rpcError } = await getSupabaseClient().rpc("withdraw_peer_availability", {
      p_slot_id: id,
    });
    if (rpcError) setError("Reserved or protected slots cannot be withdrawn.");
    await load();
    setBusy(false);
  }
  return (
    <>
      <DashboardPageHeading
        eyebrow="Your schedule"
        title="My Availability"
        description="Publish real dated slots for students matched with you. Times are entered and displayed in Asia/Seoul."
      />
      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <form onSubmit={create} className="paper-card border-swag-green/35 p-5">
          <h2 className="text-lg font-bold text-swag-navy">Add a slot</h2>
          <div className="mt-4 grid gap-4">
            <label className="text-sm font-semibold text-swag-navy">
              Start
              <input
                required
                type="datetime-local"
                value={form.start}
                onChange={(event) => setForm({ ...form, start: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-normal"
              />
            </label>
            <label className="text-sm font-semibold text-swag-navy">
              End
              <input
                required
                type="datetime-local"
                value={form.end}
                onChange={(event) => setForm({ ...form, end: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-normal"
              />
            </label>
            <label className="text-sm font-semibold text-swag-navy">
              School time label
              <select
                value={form.label}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-normal"
              >
                <option value="">No label</option>
                <option>Break</option>
                <option>1st Lunch</option>
                <option>2nd Lunch</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-swag-navy">
              Location (optional)
              <input
                maxLength={120}
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-normal"
              />
            </label>
            <button
              disabled={busy}
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Publish availability
            </button>
          </div>
        </form>
        <section>
          <h2 className="mb-4 text-lg font-bold text-swag-navy">Published slots</h2>
          {error && (
            <p role="alert" className="mb-3 rounded-lg border border-swag-orange/35 p-3 text-sm">
              {error}
            </p>
          )}
          {loading ? (
            <PageState>Loading availability…</PageState>
          ) : rows.length === 0 ? (
            <PageState tone="green">No upcoming availability has been published.</PageState>
          ) : (
            <div className="grid gap-3">
              {rows.map((row) => (
                <article
                  key={row.slot_id}
                  className="paper-card flex flex-col gap-3 border-swag-green/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <span className="text-xs font-semibold capitalize text-swag-green">
                      {row.status}
                    </span>
                    <h3 className="font-bold text-swag-navy">{format(row.start_at)}</h3>
                    <p className="text-xs text-muted-foreground">
                      {row.time_label || "No label"}
                      {row.location ? ` · ${row.location}` : ""}
                    </p>
                  </div>
                  {row.status === "available" && (
                    <button
                      disabled={busy}
                      onClick={() => void withdraw(row.slot_id)}
                      className="min-h-10 rounded-lg border border-border px-3 text-sm font-semibold text-swag-navy"
                    >
                      Withdraw
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
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
