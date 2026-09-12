import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, UserRoundCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DashboardPageHeading, PageState } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { getSupabaseClient } from "@/lib/supabase";
import type { Tables } from "@/types/database";

type StaffRole = "swag_member" | "teacher";
type Concern = Tables<"concerns">;
type ConcernListItem = Pick<
  Concern,
  "id" | "is_anonymous" | "category" | "status" | "created_at" | "assigned_to"
>;
type Status = "pending" | "reviewing" | "resolved" | "cancelled";
const PAGE_SIZE = 20;
const labels: Record<Status, string> = {
  pending: "New",
  reviewing: "Reviewing",
  resolved: "Resolved",
  cancelled: "Cancelled",
};
const statusClasses: Record<Status, string> = {
  pending: "bg-swag-orange/10 text-swag-orange",
  reviewing: "bg-swag-blue/10 text-swag-blue",
  resolved: "bg-swag-green/10 text-swag-green",
  cancelled: "bg-muted text-muted-foreground",
};
const dateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});

function concernBase(role: StaffRole) {
  return role === "teacher" ? "/teacher/concerns" : "/swag/concerns";
}

export function ConcernListPage({ role }: { role: StaffRole }) {
  const [rows, setRows] = useState<ConcernListItem[]>([]);
  const [status, setStatus] = useState<"all" | Status>("all");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    let query = getSupabaseClient()
      .from("concerns")
      .select("id,is_anonymous,category,status,created_at,assigned_to")
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (status !== "all") query = query.eq("status", status);
    const { data, error: queryError } = await query;
    setRows(data ?? []);
    setError(Boolean(queryError));
    setLoading(false);
  }, [page, status]);
  useEffect(() => {
    void load();
  }, [load]);
  const base = concernBase(role);
  return (
    <>
      <DashboardPageHeading
        eyebrow="Private support"
        title="Concerns"
        description="Read and manage protected student submissions. Original submitted content cannot be edited."
      />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <label className="text-sm font-semibold text-swag-navy">
          Status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(0);
            }}
            className="ml-2 min-h-11 rounded-lg border border-border bg-card px-3 font-normal"
          >
            <option value="all">All</option>
            <option value="pending">New</option>
            <option value="reviewing">Reviewing</option>
            <option value="resolved">Resolved</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <button
          onClick={() => void load()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-swag-navy"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>
      {loading ? (
        <PageState>Loading concerns…</PageState>
      ) : error ? (
        <PageState tone="pink">
          Concerns could not be loaded. Your permissions remain unchanged.
        </PageState>
      ) : rows.length === 0 ? (
        <PageState tone="green">No concerns match this view.</PageState>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <Link
              key={row.id}
              to={`${base}/${row.id}` as never}
              className="paper-card grid gap-3 border-swag-blue/30 p-5 hover:-translate-y-0.5 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[row.status as Status]}`}
                  >
                    {labels[row.status as Status]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.is_anonymous ? "Anonymous" : "Named"} ·{" "}
                    {row.assigned_to ? "Assigned" : "Unassigned"}
                  </span>
                </div>
                <h2 className="mt-2 font-bold text-swag-navy">{row.category}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dateTime.format(new Date(row.created_at))}
                </p>
              </div>
              <span className="text-sm font-semibold text-swag-blue">Read concern →</span>
            </Link>
          ))}
        </div>
      )}
      <div className="mt-5 flex justify-between">
        <button
          disabled={page === 0}
          onClick={() => setPage((value) => value - 1)}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>
        <button
          disabled={rows.length < PAGE_SIZE}
          onClick={() => setPage((value) => value + 1)}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

export function ConcernDetailPage({ role, concernId }: { role: StaffRole; concernId: string }) {
  const { profile } = useAuth();
  const [row, setRow] = useState<Concern | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: queryError } = await getSupabaseClient()
      .from("concerns")
      .select(
        "id,is_anonymous,name,year_group,email,category,feeling,details,status,created_at,updated_at,submitted_by,assigned_to,reviewed_at,resolved_at",
      )
      .eq("id", concernId)
      .maybeSingle();
    setRow(data);
    setError(queryError || !data ? "This concern is unavailable or your access changed." : null);
    setLoading(false);
  }, [concernId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function take() {
    setBusy(true);
    setNotice(null);
    const { data, error: rpcError } = await getSupabaseClient().rpc("take_concern", {
      p_concern_id: concernId,
    });
    if (rpcError || !data?.[0]?.success)
      setError(
        data?.[0]?.outcome === "already_assigned"
          ? "This concern is already assigned to another person."
          : "The concern could not be assigned.",
      );
    else setNotice("Concern assigned to you.");
    await load();
    setBusy(false);
  }
  async function changeStatus(next: Status) {
    setBusy(true);
    setNotice(null);
    const { data, error: rpcError } = await getSupabaseClient().rpc("set_concern_status", {
      p_concern_id: concernId,
      p_status: next,
    });
    if (rpcError || !data) setError("That status change is not allowed from the current state.");
    else setNotice(`Status changed to ${labels[next]}.`);
    await load();
    setBusy(false);
  }
  const back = concernBase(role);
  if (loading) return <PageState>Loading concern…</PageState>;
  if (!row)
    return (
      <>
        <DashboardPageHeading
          eyebrow="Concerns"
          title="Concern unavailable"
          description={error || "This concern is unavailable."}
        />
        <Link to={back as never} className="text-sm font-semibold text-swag-blue">
          ← Back to Concerns
        </Link>
      </>
    );
  const current = row.status as Status;
  return (
    <>
      <Link to={back as never} className="text-sm font-semibold text-swag-blue">
        ← Back to Concerns
      </Link>
      <div className="mt-5">
        <DashboardPageHeading
          eyebrow={`${labels[current]} · ${row.is_anonymous ? "Anonymous" : "Named"}`}
          title={row.category}
          description={`Submitted ${dateTime.format(new Date(row.created_at))}`}
        />
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-swag-orange/35 p-3 text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-swag-green/35 p-3 text-sm text-swag-navy"
        >
          {notice}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[1fr_0.72fr]">
        <section className="paper-card border-swag-blue/35 p-5 sm:p-7">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Submitted as</dt>
              <dd className="font-semibold text-swag-navy">
                {row.is_anonymous ? "Anonymous" : row.name || "Named submission"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Year group</dt>
              <dd className="font-semibold text-swag-navy">{row.year_group}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Feeling</dt>
              <dd className="font-semibold text-swag-navy">{row.feeling}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Assignment</dt>
              <dd className="font-semibold text-swag-navy">
                {row.assigned_to
                  ? row.assigned_to === profile?.id
                    ? "Assigned to you"
                    : "Assigned"
                  : "Unassigned"}
              </dd>
            </div>
            {row.email && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Contact email</dt>
                <dd className="break-all font-semibold text-swag-navy">{row.email}</dd>
              </div>
            )}
          </dl>
          <h2 className="mt-6 font-bold text-swag-navy">What they shared</h2>
          <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-swag-pink/5 p-4 text-sm leading-relaxed">
            {row.details}
          </p>
        </section>
        <aside className="paper-card border-swag-green/35 p-5">
          <h2 className="text-lg font-bold text-swag-navy">Workflow</h2>
          {!row.assigned_to && (
            <button
              disabled={busy}
              onClick={() => void take()}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              <UserRoundCheck className="h-4 w-4" />
              Take this concern
            </button>
          )}
          <div className="mt-4 grid gap-2">
            {current === "pending" && (
              <button
                disabled={busy}
                onClick={() => void changeStatus("reviewing")}
                className="min-h-11 rounded-lg border border-swag-blue/35 px-4 text-sm font-semibold text-swag-blue"
              >
                Start reviewing
              </button>
            )}
            {current === "reviewing" && (
              <button
                disabled={busy}
                onClick={() => void changeStatus("resolved")}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-swag-green/35 px-4 text-sm font-semibold text-swag-green"
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark resolved
              </button>
            )}
            {["pending", "reviewing"].includes(current) && (
              <button
                disabled={busy}
                onClick={() => void changeStatus("cancelled")}
                className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-muted-foreground"
              >
                Cancel administratively
              </button>
            )}
          </div>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Identity, category, feeling, details, creation time and submitter fields are read-only.
          </p>
        </aside>
      </div>
    </>
  );
}
