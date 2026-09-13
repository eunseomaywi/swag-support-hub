import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  HandHeart,
  Inbox,
  MessageCircleHeart,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ComingSoonCard, SummaryCard } from "@/components/dashboard/DashboardPieces";
import { DashboardPageHeading, PageState } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type TeacherCounts =
  Database["public"]["Functions"]["get_teacher_peer_support_counts"]["Returns"][number];
type Overview =
  Database["public"]["Functions"]["list_teacher_peer_support_overview"]["Returns"][number];

function name(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "there";
}

export function StaffHome({ role }: { role: "swag_member" | "teacher" }) {
  const { profile } = useAuth();
  const [concerns, setConcerns] = useState({ pending: 0, reviewing: 0 });
  const [peer, setPeer] = useState<TeacherCounts | null>(null);
  const [peerMember, setPeerMember] = useState<{
    available_count: number;
    my_active_case_count: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const client = getSupabaseClient();
    const [pending, reviewing, peerResult] = await Promise.all([
      client.from("concerns").select("id", { count: "exact", head: true }).eq("status", "pending"),
      client
        .from("concerns")
        .select("id", { count: "exact", head: true })
        .eq("status", "reviewing"),
      role === "teacher"
        ? client.rpc("get_teacher_peer_support_counts")
        : client.rpc("get_peer_dashboard_counts"),
    ]);
    setConcerns({ pending: pending.count ?? 0, reviewing: reviewing.count ?? 0 });
    const first = peerResult.data?.[0];
    if (role === "teacher") setPeer((first ?? null) as TeacherCounts | null);
    else
      setPeerMember(
        (first ?? null) as { available_count: number; my_active_case_count: number } | null,
      );
    setLoading(false);
  }, [role]);
  useEffect(() => {
    void load();
  }, [load]);
  const base = role === "teacher" ? "/teacher" : "/swag";
  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-swag-blue/30 bg-card px-5 py-7 sm:px-8 sm:py-9">
        <p className="text-sm font-semibold text-swag-blue">
          {role === "teacher" ? "Teacher workspace" : "SWAG Member workspace"}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-swag-navy sm:text-4xl">
          Welcome back, {name(profile?.full_name)}.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Supporting students, one clear next step at a time.
        </p>
        <span
          aria-hidden="true"
          className="absolute -right-6 -top-8 h-32 w-32 rounded-full border-[18px] border-swag-blue/8"
        />
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={MessageCircleHeart}
          label="New concerns"
          value={loading ? "…" : String(concerns.pending)}
          note="Awaiting review"
          accent="orange"
        />
        <SummaryCard
          icon={Clock3}
          label="Reviewing"
          value={loading ? "…" : String(concerns.reviewing)}
          note="Concern workflow"
          accent="blue"
        />
        <SummaryCard
          icon={role === "teacher" ? AlertTriangle : Inbox}
          label={role === "teacher" ? "Escalations" : "Available requests"}
          value={
            loading
              ? "…"
              : String(
                  role === "teacher"
                    ? (peer?.escalated_count ?? 0)
                    : (peerMember?.available_count ?? 0),
                )
          }
          note={role === "teacher" ? "Teacher oversight" : "Privacy-limited peer queue"}
          accent="pink"
        />
        <SummaryCard
          icon={HandHeart}
          label={role === "teacher" ? "Active peer cases" : "My peer cases"}
          value={
            loading
              ? "…"
              : String(
                  role === "teacher"
                    ? (peer?.active_count ?? 0)
                    : (peerMember?.my_active_case_count ?? 0),
                )
          }
          note="Real Peer Support state"
          accent="green"
        />
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        <Link
          to={`${base}/concerns` as never}
          className="paper-card border-swag-pink/30 p-5 hover:-translate-y-0.5"
        >
          <h2 className="font-bold text-swag-navy">Concerns</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Open the protected Concern list and workflow.
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-swag-blue">
            Open Concerns →
          </span>
        </Link>
        <Link
          to={`${base}/escalations` as never}
          className="paper-card border-swag-orange/30 p-5 hover:-translate-y-0.5"
        >
          <h2 className="font-bold text-swag-navy">Escalations</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Review Peer Support cases handed over for oversight.
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-swag-blue">
            Open Escalations →
          </span>
        </Link>
      </div>
    </>
  );
}

export function TeacherPeerOverview() {
  const [rows, setRows] = useState<Overview[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void getSupabaseClient()
      .rpc("list_teacher_peer_support_overview", { p_page_offset: 0, p_page_size: 40 })
      .then(({ data }) => {
        setRows(data ?? []);
        setLoading(false);
      });
  }, []);
  return (
    <>
      <DashboardPageHeading
        eyebrow="Operational view"
        title="Peer Support Overview"
        description="A minimal status view for oversight. Student identity and private explanations are excluded unless a case is formally escalated."
      />
      {loading ? (
        <PageState>Loading Peer Support overview…</PageState>
      ) : rows.length === 0 ? (
        <PageState tone="green">There are no Peer Support requests to summarize.</PageState>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <article
              key={row.request_id}
              className="paper-card flex flex-col gap-3 border-swag-blue/30 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <span className="rounded-full bg-swag-blue/10 px-2 py-1 text-xs font-semibold capitalize text-swag-blue">
                  {row.status}
                </span>
                <h2 className="mt-2 font-bold text-swag-navy">{row.category}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.mentor_name ? "Assigned" : "Unassigned"}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {row.session_start
                  ? new Intl.DateTimeFormat("en-GB", {
                      timeZone: "Asia/Seoul",
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(row.session_start))
                  : "No confirmed session"}
              </p>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export function TeacherBookingsPlaceholder() {
  return (
    <>
      <DashboardPageHeading
        eyebrow="Future workflow"
        title="Bookings"
        description="The separate teacher appointment system has not been built yet."
      />
      <ComingSoonCard
        icon={CalendarDays}
        title="Teacher booking management"
        description="This page is reserved for the future canonical teacher booking workflow. Legacy Peer Mentor booking rows are not shown as teacher appointments."
        accent="orange"
      />
    </>
  );
}
