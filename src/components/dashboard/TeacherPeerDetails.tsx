import { useSearch, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { YEAR_GROUPS, type SupporterIdentity as Identity } from "@/lib/supporter-identity";
import {
  appointmentTime,
  FILTERS,
  statusLabel,
  teacherListSearch,
  type PeerDetail,
  type PeerSummary,
  type SupporterCandidate,
} from "@/lib/peer-detail";
import { periodLabels } from "@/lib/peer-readiness";
import { DashboardPageHeading, PageState } from "./DashboardLayout";
import { SupporterIdentity } from "./SupporterIdentity";
import { RequestDateBadge } from "./RequestDateBadge";
import { AssignmentEmailStatus } from "./AssignmentEmailStatus";
import { DeleteRequestButton } from "./DeleteRequestButton";
import { RequestList, RequestListRow, RequestStatus } from "./RequestList";
import { useRequestRefresh } from "@/hooks/useRequestRefresh";
import { requestedDateLabel } from "@/lib/request-countdown";

const button =
  "min-h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-50";
const primary =
  "min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50";
const input = "min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm";
function periods(values: string[]) {
  return values.map((p) => periodLabels[p as keyof typeof periodLabels] || p).join(" · ");
}
function issue(row: PeerSummary) {
  return !row.supporter_id && ["accepted", "scheduled"].includes(row.status);
}

export function TeacherRequestsPage({
  children,
  meetings = false,
}: {
  children?: ReactNode;
  meetings?: boolean;
}) {
  const search = teacherListSearch(useSearch({ strict: false }) as Record<string, unknown>);
  const navigate = useNavigate();
  const [rows, setRows] = useState<PeerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setError(null);
    const { data, error: rpcError } = await getSupabaseClient().rpc(
      "list_teacher_peer_requests_v2",
      { p_filter: search.filter, p_page_size: 30, p_page_offset: search.page * 30 },
    );
    if (version !== loadVersion.current) return;
    if (rpcError) setError("Requests could not be loaded. Try again or check your Teacher access.");
    else {
      const result = data as unknown as { rows: PeerSummary[]; total: number };
      setRows(result.rows);
      setTotal(result.total);
      const lastPage = Math.max(0, Math.ceil(result.total / 30) - 1);
      if (search.page > lastPage) {
        await navigate({
          to: meetings ? "/teacher/bookings" : "/teacher/peer-support",
          search: {
            filter: search.filter,
            page: lastPage,
            from: meetings ? "meetings" : "requests",
          },
          replace: true,
        });
      }
    }
    setLoading(false);
  }, [search.filter, search.page, navigate, meetings]);
  useRequestRefresh(load);
  function change(filter: string, page: number) {
    void navigate({
      to: (meetings ? "/teacher/bookings" : "/teacher/peer-support") as never,
      search: { filter, page } as never,
    });
  }
  const query = new URLSearchParams({
    filter: search.filter,
    page: String(search.page),
    from: meetings ? "meetings" : "requests",
  }).toString();
  return (
    <>
      <DashboardPageHeading
        eyebrow="Teacher workspace"
        title={meetings ? "Peer Support meetings" : "Peer Support requests"}
        description="Find a request, then open its full detail page to assign a supporter or manage a meeting."
      />
      {children}
      <section className="mt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <label className="text-sm font-semibold text-swag-navy">
            Show
            <select
              value={search.filter}
              onChange={(e) => change(e.target.value, 0)}
              className={`${input} mt-2`}
            >
              {Object.entries(FILTERS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => void load()} disabled={loading} className={button}>
            Refresh
          </button>
        </div>
        {loading ? (
          <PageState>Loading requests…</PageState>
        ) : error ? (
          <PageState tone="orange">{error}</PageState>
        ) : rows.length === 0 ? (
          <PageState>No requests to show.</PageState>
        ) : (
          <RequestList>
            {rows.map((row) => {
              const detailPath =
                meetings && row.session_id
                  ? `/teacher/bookings/${row.session_id}`
                  : `/teacher/peer-support/${row.request_id}`;
              return (
                <RequestListRow
                  key={row.request_id}
                  student={
                    <div className="min-w-0">
                      <a
                        href={`${detailPath}?${query}`}
                        className="break-words text-lg font-bold text-swag-navy underline decoration-swag-blue/30 underline-offset-4"
                      >
                        {row.student_name}
                      </a>
                      <p className="mt-1 text-sm text-muted-foreground">{row.year_group}</p>
                    </div>
                  }
                  date={
                    <div className="min-w-0 text-sm">
                      {row.session_start ? (
                        appointmentTime(row.session_start, row.session_end)
                      ) : (
                        <RequestDateBadge
                          date={row.preferred_date}
                          periods={periods(row.preferred_periods)}
                        />
                      )}
                    </div>
                  }
                  supporter={
                    <div>
                      {issue(row) ? (
                        <p className="text-sm text-swag-orange">
                          Assignment data needs review — no linked supporter.
                        </p>
                      ) : (
                        <SupporterIdentity identity={row} compact />
                      )}
                    </div>
                  }
                  status={
                    <>
                      <RequestStatus>{statusLabel(row.status)}</RequestStatus>
                      {row.email_attention && (
                        <p className="mt-2 text-xs text-swag-orange">Email needs attention</p>
                      )}
                      {row.needs_attention && (
                        <p className="mt-2 text-xs text-swag-orange">Needs action</p>
                      )}
                    </>
                  }
                  actions={
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <a
                        href={`${detailPath}?${query}`}
                        className="inline-flex min-h-11 items-center font-semibold text-swag-blue underline"
                      >
                        View details
                      </a>
                      <DeleteRequestButton requestId={row.request_id} onDeleted={load} />
                    </div>
                  }
                />
              );
            })}
          </RequestList>
        )}
        {!loading && !error && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <button
              disabled={search.page === 0}
              onClick={() => change(search.filter, search.page - 1)}
              className={button}
            >
              Previous
            </button>
            <span>
              Page {search.page + 1} · {total} requests
            </span>
            <button
              disabled={(search.page + 1) * 30 >= total}
              onClick={() => change(search.filter, search.page + 1)}
              className={button}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function AssignmentPanel({ row, onSaved }: { row: PeerDetail; onSaved: () => Promise<void> }) {
  const [candidates, setCandidates] = useState<SupporterCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [role, setRole] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await getSupabaseClient().rpc(
      "list_peer_supporter_candidates_v2",
      { p_request_id: row.request_id },
    );
    if (rpcError) setError("Active supporters could not be loaded. Try again.");
    else setCandidates((data ?? []) as unknown as SupporterCandidate[]);
    setLoading(false);
  }, [row.request_id]);
  useEffect(() => {
    void load();
  }, [load]);
  const candidate = candidates.find((c) => c.supporter_id === selected);
  const allConflict = (c: SupporterCandidate) =>
    row.preferred_periods.length > 0 &&
    row.preferred_periods.every((p) => c.conflicting_periods.includes(p));
  const filtered = candidates.filter(
    (c) =>
      (!query ||
        (c.supporter_name || "").toLocaleLowerCase().includes(query.toLocaleLowerCase()) ||
        c.supporter_id?.startsWith(query)) &&
      (!year || c.supporter_year_group === year) &&
      (!role || c.supporter_role === role),
  );
  async function assign() {
    if (!candidate?.supporter_id) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { data: sessionData } = await getSupabaseClient().auth.getSession();
    let data: Array<{ success: boolean; outcome: string }> | null = null;
    let rpcError = false;
    try {
      const response = await fetch("/api/peer-support/teacher-assignment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
        },
        body: JSON.stringify({
          requestId: row.request_id,
          supporterId: candidate.supporter_id,
          reassign: row.status !== "open",
        }),
      });
      if (!response.ok) rpcError = true;
      else data = await response.json();
    } catch {
      rpcError = true;
    }
    const outcome = data?.[0];
    if (rpcError || !outcome?.success) {
      setError(
        outcome?.outcome === "supporter_not_active"
          ? "This supporter is no longer active. Refresh the candidates."
          : "The request changed before assignment. Refresh the page to check its current state.",
      );
    } else {
      await onSaved();
      setNotice(
        `Assigned to ${candidate.supporter_name || "the selected supporter"}. They can now choose a period and confirm the meeting. Assignment email processing is tracked below.`,
      );
    }
    setBusy(false);
  }
  return (
    <section className="paper-card border-swag-green/35 p-5 sm:p-7" aria-label="Assign supporter">
      <h2 className="text-xl font-bold text-swag-navy">
        {row.supporter_id ? "Reassign supporter" : "Assign a supporter"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose by name, year group and role. Only the assigned supporter receives an assignment
        notification. They still need to confirm a meeting.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          Search name or account ID
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${input} mt-1`}
          />
        </label>
        <label className="text-sm">
          Year group
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className={`${input} mt-1`}
          >
            <option value="">All years</option>
            {YEAR_GROUPS.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={`${input} mt-1`}
          >
            <option value="">All supporters</option>
            <option value="peer_mentor">Peer Mentor</option>
            <option value="swag_member">SWAG Member</option>
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-swag-orange">
          {error}{" "}
          <button onClick={() => void load()} className="underline">
            Refresh candidates
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 text-sm text-swag-green">
          {notice}
        </p>
      )}
      {loading ? (
        <p className="mt-5 text-sm">Loading approved supporters…</p>
      ) : !error && !filtered.length ? (
        <p className="mt-5 text-sm">No approved supporters match these filters.</p>
      ) : (
        <fieldset disabled={busy} className="mt-5 grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Choose one supporter</legend>
          {filtered.map((c) => (
            <label
              key={c.supporter_id}
              className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-4 focus-within:ring-2 focus-within:ring-swag-blue ${selected === c.supporter_id ? "border-swag-blue bg-swag-blue/5" : "border-border"}`}
            >
              <input
                type="radio"
                name="assigned-supporter"
                value={c.supporter_id || ""}
                checked={selected === c.supporter_id}
                onChange={() => setSelected(c.supporter_id || "")}
                className="mt-1"
              />
              <div className="min-w-0">
                <SupporterIdentity identity={c} />
                <p className="mt-3 text-xs">Active cases: {c.active_case_count} · Active staff</p>
                {c.conflicting_periods.length > 0 && (
                  <p className="mt-2 text-xs text-swag-orange">
                    {allConflict(c)
                      ? "All allowed periods conflict with existing meetings."
                      : `Unavailable: ${periods(c.conflicting_periods)}. Other allowed periods may be used.`}
                  </p>
                )}
              </div>
            </label>
          ))}
        </fieldset>
      )}
      {candidate && (
        <div className="mt-5 rounded-xl bg-muted/40 p-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Selected supporter</p>
          <SupporterIdentity identity={candidate} manage />
        </div>
      )}
      <button
        disabled={busy || !candidate || allConflict(candidate)}
        onClick={() => void assign()}
        className={`${primary} mt-5`}
      >
        {busy
          ? "Assigning…"
          : `Assign to ${candidate?.supporter_name || (candidate ? `account ${candidate.supporter_id?.slice(0, 8)}` : "selected supporter")}`}
      </button>
      <p className="mt-2 text-xs text-muted-foreground">
        Meeting availability is checked again when the supporter confirms.
      </p>
    </section>
  );
}

export function TeacherPeerDetail({
  requestId,
  sessionId,
}: {
  requestId?: string;
  sessionId?: string;
}) {
  const search = teacherListSearch(useSearch({ strict: false }) as Record<string, unknown>);
  const [row, setRow] = useState<PeerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [correction, setCorrection] = useState("");
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoadError(null);
    const response = sessionId
      ? await getSupabaseClient().rpc("get_teacher_peer_meeting", { p_session_id: sessionId })
      : await getSupabaseClient().rpc("get_teacher_peer_request", { p_request_id: requestId! });
    if (version !== loadVersion.current) return;
    if (response.error) {
      setLoadError(
        response.error.code === "42501"
          ? "Teacher access is required for this detail page."
          : "This detail could not be loaded. Try again.",
      );
      setRow(null);
    } else setRow(response.data as unknown as PeerDetail | null);
    setLoading(false);
  }, [requestId, sessionId]);
  useRequestRefresh(load);
  const backPath = search.from === "meetings" ? "/teacher/bookings" : "/teacher/peer-support";
  const query = new URLSearchParams({
    filter: search.filter,
    page: String(search.page),
    from: search.from,
  }).toString();
  async function outcome(kind: "complete" | "no_show" | "cancel" | "correct") {
    if (!row) return;
    if (
      kind === "cancel" &&
      !window.confirm("Cancel this meeting? No cancellation email will be sent.")
    )
      return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    const client = getSupabaseClient();
    const result =
      kind === "correct"
        ? await client.rpc("teacher_correct_peer_outcome", {
            p_request_id: row.request_id,
            p_expected_status: row.status,
            p_reason: correction,
          })
        : await client.rpc(
            kind === "complete"
              ? "complete_my_peer_case"
              : kind === "no_show"
                ? "mark_peer_case_no_show"
                : "cancel_my_peer_session",
            { p_request_id: row.request_id },
          );
    if (result.error || !result.data)
      setActionError(
        "The outcome was not changed. Check the latest meeting state and end time; corrections also need a reason.",
      );
    else {
      await load();
      setNotice("Meeting updated. No additional email was sent.");
    }
    setBusy(false);
  }
  async function retry(id: string) {
    setBusy(true);
    setActionError(null);
    const r = await getSupabaseClient().rpc("retry_confirmation_email", { p_outbox_id: id });
    if (r.error || !r.data) setActionError("This email cannot be retried in its current state.");
    else {
      await load();
      setNotice("Retry queued for this recipient only.");
    }
    setBusy(false);
  }
  if (loading) return <PageState>Loading {sessionId ? "meeting" : "request"}…</PageState>;
  if (!row)
    return (
      <>
        <PageState tone="orange">{loadError || "This request is no longer available."}</PageState>
        <button onClick={() => void load()} className={`${button} mt-4`}>
          Try again
        </button>
        <a href={`${backPath}?${query}`} className="ml-4 text-sm text-swag-blue underline">
          Back to requests
        </a>
      </>
    );
  const ended = Boolean(row.session_end && new Date(row.session_end).getTime() <= Date.now());
  const active = row.status === "scheduled" && row.session_status === "confirmed";
  const snapshot = row.confirmation_identity;
  const confirmedIdentity: Identity = {
    ...row,
    supporter_name: snapshot?.supporter_name || null,
    supporter_year_group: snapshot?.supporter_year_group || null,
    supporter_role: snapshot?.supporter_role || null,
    supporter_details_available: Boolean(snapshot),
  };
  return (
    <>
      <div className="mb-5 flex flex-wrap justify-between gap-3 text-sm font-semibold text-swag-blue">
        <a href={`${backPath}?${query}`}>
          ← Back to {search.from === "meetings" ? "meetings" : "requests"}
        </a>
        <a
          href={`${sessionId ? `/teacher/bookings/${sessionId}` : `/teacher/peer-support/${row.request_id}`}?${query}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open this detail in a new tab"
        >
          Open in new tab ↗
        </a>
      </div>
      <DashboardPageHeading
        eyebrow={sessionId ? "Meeting details" : "Request details"}
        title={`${row.student_name} · ${row.year_group}`}
        description={statusLabel(
          sessionId && row.session_status
            ? row.session_status === "confirmed"
              ? "scheduled"
              : row.session_status
            : row.status,
        )}
      />
      <div className="mb-5 flex justify-end">
        <DeleteRequestButton requestId={row.request_id} onDeleted={load} />
      </div>
      {loadError && (
        <p role="alert" className="mb-4 text-sm text-swag-orange">
          {loadError}
        </p>
      )}
      {actionError && (
        <p role="alert" className="mb-4 text-sm text-swag-orange">
          {actionError}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 text-sm text-swag-green">
          {notice}
        </p>
      )}
      <section className="paper-card mb-5 border-swag-blue/35 p-5 sm:p-7">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">
              {sessionId ? "Confirmed time" : "Requested availability"}
            </dt>
            <dd className="mt-1 font-semibold">
              {sessionId
                ? appointmentTime(row.session_start, row.session_end)
                : `${requestedDateLabel(row.preferred_date)} · ${periods(row.preferred_periods)}`}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-sm text-muted-foreground">
              {sessionId ? "Supporter at confirmation" : "Assigned supporter"}
            </dt>
            <dd>
              {issue(row) ? (
                <p className="text-swag-orange">
                  Assignment data needs review. No supporter ID is linked; do not assign over this
                  inconsistency.
                </p>
              ) : (
                <SupporterIdentity
                  identity={sessionId ? confirmedIdentity : row}
                  manage={!sessionId}
                />
              )}
            </dd>
          </div>
        </dl>
        <p className="mt-5 rounded-xl bg-swag-blue/5 p-3 text-sm">
          <strong>Next step:</strong>{" "}
          {issue(row)
            ? "Ask the administrator to review the assignment history."
            : row.status === "open"
              ? "Choose a supporter below."
              : row.status === "accepted"
                ? "The assigned supporter can choose an allowed period and confirm the meeting."
                : active
                  ? !ended
                    ? "Wait until the meeting ends before recording an outcome."
                    : "Record the meeting outcome."
                  : "Review the recorded outcome or follow up as needed."}
        </p>
      </section>
      {!sessionId && (
        <section className="paper-card mb-5 border-swag-blue/30 p-5 sm:p-7">
          <h2 className="text-xl font-bold text-swag-navy">What the student shared</h2>
          <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-muted/40 p-4 text-sm leading-relaxed">
            {row.private_explanation || "No additional details were provided."}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Requested {appointmentTime(row.submitted_at)}
            {row.assigned_at ? ` · Assigned ${appointmentTime(row.assigned_at)}` : ""}
          </p>
          {row.session_id && (
            <a
              href={`/teacher/bookings/${row.session_id}?${query}`}
              className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-swag-blue underline"
            >
              View confirmed meeting →
            </a>
          )}
        </section>
      )}
      {!sessionId && ["open", "accepted"].includes(row.status) && !issue(row) && (
        <AssignmentPanel row={row} onSaved={load} />
      )}
      <AssignmentEmailStatus
        key={`${row.request_id}/${row.supporter_id}`}
        requestId={row.request_id}
      />
      {sessionId && (
        <section className="paper-card border-swag-green/35 p-5 sm:p-7">
          <h2 className="text-xl font-bold text-swag-navy">Meeting record</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Location</dt>
              <dd className="font-semibold">{row.session_location || "Not recorded"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Supervising teacher at confirmation</dt>
              <dd className="font-semibold">
                {row.supervisor_teacher_name || "Name not recorded at confirmation"}
              </dd>
            </div>
          </dl>
          {!snapshot && (
            <p className="mt-4 text-xs text-muted-foreground">
              This legacy confirmation did not record name/year snapshots. Current profiles have not
              been substituted for historical identity.
            </p>
          )}
          <h3 className="mt-6 font-bold text-swag-navy">Confirmation emails</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              ["Student", row.student_email_status, row.student_email_job_id],
              ["Supporter", row.mentor_email_status, row.mentor_email_job_id],
              ["Teacher", row.teacher_email_status, row.teacher_email_job_id],
            ].map(([label, status, id]) => (
              <div key={label} className="rounded-xl border border-border p-3 text-sm">
                <p className="font-semibold">{label}</p>
                <p className="mt-1">
                  {status === "submitted"
                    ? "Accepted by mail server"
                    : status?.replaceAll("_", " ") || "Sent after confirmation"}
                </p>
                {id && ["failed", "uncertain"].includes(status || "") && (
                  <button
                    disabled={busy}
                    onClick={() => void retry(id)}
                    className="mt-2 min-h-10 text-swag-blue underline"
                  >
                    Retry this recipient
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Mail-server acceptance does not confirm inbox placement or reading.
          </p>
          {active && (
            <div className="mt-6 flex flex-wrap gap-3">
              {ended && (
                <>
                  <button
                    disabled={busy}
                    onClick={() => void outcome("complete")}
                    className={primary}
                  >
                    Mark completed
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void outcome("no_show")}
                    className={button}
                  >
                    Mark no-show
                  </button>
                </>
              )}
              <button disabled={busy} onClick={() => void outcome("cancel")} className={button}>
                Cancel meeting
              </button>
            </div>
          )}
          {["completed", "no_show"].includes(row.status) && (
            <details className="mt-5">
              <summary className="cursor-pointer text-sm font-semibold text-swag-blue">
                Correct recorded outcome
              </summary>
              <label className="mt-3 block text-sm">
                Reason
                <input
                  value={correction}
                  maxLength={160}
                  onChange={(e) => setCorrection(e.target.value)}
                  className={`${input} mt-2`}
                />
              </label>
              <button
                disabled={busy || !correction.trim()}
                onClick={() => void outcome("correct")}
                className={`${button} mt-3`}
              >
                Return to scheduled for correction
              </button>
            </details>
          )}
          <a
            href={`/teacher/peer-support/${row.request_id}?${query}`}
            className="mt-5 inline-block text-sm text-swag-blue underline"
          >
            View original request →
          </a>
        </section>
      )}
      {!sessionId && row.history && (
        <details className="paper-card mt-5 border-border p-5">
          <summary className="cursor-pointer font-semibold text-swag-navy">
            Processing history
          </summary>
          <ol className="mt-3 space-y-2 text-sm">
            {row.history.map((h, i) => (
              <li key={`${h.created_at}-${i}`}>
                <strong className="capitalize">{h.action.replaceAll("_", " ")}</strong> ·{" "}
                {appointmentTime(h.created_at)}
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
  );
}
