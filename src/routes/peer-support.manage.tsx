import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2, Clock3, LockKeyhole, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageSection } from "@/components/PageSection";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/peer-support/manage")({
  head: () => ({
    meta: [
      { title: "Manage Peer Support Request — SWAG" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: PeerSupportManage,
});

type Management = {
  request_id: string;
  status: string;
  category: string;
  preferred_date: string;
  preferred_time: string;
  submitted_at: string;
  assigned_mentor_name: string | null;
  session_id: string | null;
  session_start: string | null;
  session_end: string | null;
  session_label: string | null;
  session_location: string | null;
  session_status: string | null;
};
type Slot = {
  slot_id: string;
  start_at: string;
  end_at: string;
  time_label: string | null;
  location: string | null;
};

const TOKEN_KEY = "swag_peer_request_token";
const seoul = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});

function PeerSupportManage() {
  const [token, setToken] = useState<string | null>(null);
  const [request, setRequest] = useState<Management | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const incoming = fragment.get("token");
    if (incoming && /^[0-9a-f]{64}$/.test(incoming)) sessionStorage.setItem(TOKEN_KEY, incoming);
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    setToken(
      incoming && /^[0-9a-f]{64}$/.test(incoming) ? incoming : sessionStorage.getItem(TOKEN_KEY),
    );
  }, []);

  const load = useCallback(async (credential: string) => {
    setLoading(true);
    setError(null);
    const client = getSupabaseClient();
    const [management, available] = await Promise.all([
      client.rpc("get_peer_request_management", { p_token: credential }),
      client.rpc("list_peer_request_slots", { p_token: credential }),
    ]);
    if (management.error || !management.data?.[0]) {
      setRequest(null);
      setSlots([]);
      setError("This private link is invalid, expired, or has been revoked.");
    } else {
      setRequest(management.data[0] as Management);
      setSlots((available.data ?? []) as Slot[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (token) void load(token);
    else {
      setLoading(false);
      setError("Open the private link you saved when submitting your request.");
    }
  }, [load, token]);

  async function schedule(slotId: string) {
    if (!token) return;
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await getSupabaseClient().rpc("schedule_peer_session", {
      p_token: token,
      p_slot_id: slotId,
    });
    if (rpcError || !data?.[0]?.success)
      setError("That time is no longer available. Please choose another.");
    await load(token);
    setBusy(false);
  }

  async function cancel() {
    if (!token || !window.confirm("Cancel this Peer Support request and any confirmed session?"))
      return;
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await getSupabaseClient().rpc("cancel_peer_request", {
      p_token: token,
    });
    if (rpcError || !data?.[0]?.success) setError("This request could not be cancelled.");
    await load(token);
    setBusy(false);
  }

  return (
    <PageSection
      title="Manage Peer Support"
      intro="Use your private link to check progress and choose an available session time."
    >
      <div className="mx-auto max-w-3xl" aria-live="polite">
        {loading && (
          <div className="paper-card flex min-h-36 items-center justify-center gap-2 p-6 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading your request…
          </div>
        )}
        {!loading && error && !request && (
          <div className="paper-card border-swag-orange/40 p-6 text-center">
            <LockKeyhole className="mx-auto h-8 w-8 text-swag-orange" />
            <h2 className="mt-3 text-xl font-bold text-swag-navy">Private link required</h2>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
        )}
        {!loading && request && (
          <div className="space-y-5">
            <section className="paper-card border-swag-blue/35 p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-swag-blue">
                    Request status
                  </p>
                  <h2 className="mt-1 text-2xl font-bold capitalize text-swag-navy">
                    {request.status}
                  </h2>
                </div>
                {request.status === "scheduled" ? (
                  <CheckCircle2 className="h-9 w-9 text-swag-green" />
                ) : (
                  <Clock3 className="h-9 w-9 text-swag-orange" />
                )}
              </div>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Topic</dt>
                  <dd className="font-semibold text-swag-navy">{request.category}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Preferred</dt>
                  <dd className="font-semibold text-swag-navy">
                    {request.preferred_date} · {request.preferred_time}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Matched with</dt>
                  <dd className="font-semibold text-swag-navy">
                    {request.assigned_mentor_name || "Waiting for a mentor"}
                  </dd>
                </div>
              </dl>
              {request.session_start && (
                <div className="mt-5 rounded-xl border border-swag-green/35 bg-swag-green/5 p-4">
                  <p className="font-bold text-swag-navy">Confirmed session</p>
                  <p className="mt-1 text-sm">
                    {seoul.format(new Date(request.session_start))}
                    {request.session_label ? ` · ${request.session_label}` : ""}
                    {request.session_location ? ` · ${request.session_location}` : ""}
                  </p>
                </div>
              )}
            </section>
            {request.status === "accepted" && (
              <section className="paper-card border-swag-green/35 p-5 sm:p-7">
                <h2 className="text-xl font-bold text-swag-navy">Choose a session time</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Times are shown in Asia/Seoul. Selecting a published slot confirms the session.
                </p>
                <div className="mt-4 grid gap-3">
                  {slots.length ? (
                    slots.map((slot) => (
                      <button
                        key={slot.slot_id}
                        disabled={busy}
                        onClick={() => void schedule(slot.slot_id)}
                        className="flex min-h-14 items-center justify-between rounded-xl border border-border bg-card px-4 text-left hover:border-swag-green disabled:opacity-60"
                      >
                        <span>
                          <span className="block font-semibold text-swag-navy">
                            {seoul.format(new Date(slot.start_at))}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {slot.time_label || "Available time"}
                            {slot.location ? ` · ${slot.location}` : ""}
                          </span>
                        </span>
                        <CalendarClock className="h-5 w-5 text-swag-green" />
                      </button>
                    ))
                  ) : (
                    <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
                      Waiting for a suitable time. Your assigned mentor has not published an
                      available slot yet.
                    </p>
                  )}
                </div>
              </section>
            )}
            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </p>
            )}
            {!["completed", "cancelled", "escalated"].includes(request.status) && (
              <button
                disabled={busy}
                onClick={() => void cancel()}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-destructive/30 px-4 text-sm font-semibold text-destructive disabled:opacity-60"
              >
                <XCircle className="h-4 w-4" />
                Cancel request
              </button>
            )}
            <p className="text-sm text-muted-foreground">
              This online service is not an emergency channel. If someone is in immediate danger,
              contact emergency services or a trusted adult now.
            </p>
          </div>
        )}
      </div>
    </PageSection>
  );
}
