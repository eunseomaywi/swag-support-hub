import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock3, LockKeyhole, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageSection } from "@/components/PageSection";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/peer-support/manage")({
  head: () => ({
    meta: [
      { title: "Manage Peer Support Request — SWAG" },
      { name: "referrer", content: "no-referrer" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PeerSupportManage,
});

type Management = {
  request_id: string;
  status: string;
  category?: string;
  preferred_date: string;
  preferred_time?: string;
  preferred_periods?: string[];
  submitted_at?: string;
  assigned_mentor_name: string | null;
  session_id: string | null;
  session_start: string | null;
  session_end: string | null;
  session_label: string | null;
  session_location: string | null;
  session_status: string | null;
};
const TOKEN_KEY = "swag_peer_request_token";
const CONFIRMATION_KEY = "swag_peer_confirmation_token";
const seoul = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});
const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", timeStyle: "short" });

function PeerSupportManage() {
  const [credential, setCredential] = useState<{
    token: string;
    kind: "legacy" | "confirmation";
  } | null>(null);
  const [request, setRequest] = useState<Management | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const signed = fragment.get("confirmation");
    const legacy = fragment.get("token");
    if (signed?.startsWith("v1.")) sessionStorage.setItem(CONFIRMATION_KEY, signed);
    if (legacy && /^[0-9a-f]{64}$/.test(legacy)) sessionStorage.setItem(TOKEN_KEY, legacy);
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    if (signed?.startsWith("v1.")) setCredential({ token: signed, kind: "confirmation" });
    else if (legacy && /^[0-9a-f]{64}$/.test(legacy))
      setCredential({ token: legacy, kind: "legacy" });
    else {
      const savedSigned = sessionStorage.getItem(CONFIRMATION_KEY);
      const savedLegacy = sessionStorage.getItem(TOKEN_KEY);
      setCredential(
        savedSigned
          ? { token: savedSigned, kind: "confirmation" }
          : savedLegacy
            ? { token: savedLegacy, kind: "legacy" }
            : null,
      );
    }
  }, []);

  const load = useCallback(async (current: { token: string; kind: "legacy" | "confirmation" }) => {
    setLoading(true);
    setError(null);
    if (current.kind === "legacy") {
      const { data, error: rpcError } = await getSupabaseClient().rpc(
        "get_peer_request_management",
        { p_token: current.token },
      );
      if (rpcError || !data?.[0]) {
        setRequest(null);
        setError("This private link is invalid, expired, or has been revoked.");
      } else setRequest(data[0] as Management);
    } else {
      const response = await fetch("/api/peer-support/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: current.token, action: "status" }),
      });
      const body = (await response.json()) as Management & { error?: string };
      if (!response.ok) {
        setRequest(null);
        setError(body.error || "This private link is no longer active.");
      } else setRequest(body);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    if (credential) void load(credential);
    else {
      setLoading(false);
      setError("Open the private link shown after submitting or sent in your confirmation email.");
    }
  }, [credential, load]);

  async function cancel() {
    if (
      !credential ||
      !window.confirm(
        "Cancel this appointment? The schedule will be cancelled and no separate cancellation email will be sent.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    if (credential.kind === "legacy") {
      const { data, error: rpcError } = await getSupabaseClient().rpc("cancel_peer_request", {
        p_token: credential.token,
      });
      if (rpcError || !data?.[0]?.success) setError("This request could not be cancelled.");
      else {
        setRequest((current) =>
          current ? { ...current, status: "cancelled", session_status: "cancelled" } : current,
        );
        setNotice("The appointment is cancelled. No cancellation email was sent.");
        sessionStorage.removeItem(TOKEN_KEY);
      }
    } else {
      const response = await fetch("/api/peer-support/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: credential.token, action: "cancel" }),
      });
      const body = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !body.success)
        setError(body.error || "This appointment could not be cancelled.");
      else {
        setRequest((current) =>
          current ? { ...current, status: "cancelled", session_status: "cancelled" } : current,
        );
        setNotice("The appointment is cancelled. No cancellation email was sent.");
        sessionStorage.removeItem(CONFIRMATION_KEY);
      }
    }
    setBusy(false);
  }

  return (
    <PageSection
      title="Manage Peer Support"
      intro="Use your private link to check the latest status and cancel your own appointment."
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
                    {request.status === "accepted" && request.session_start
                      ? "Confirmed"
                      : request.status.replace("_", " ")}
                  </h2>
                </div>
                {request.session_start && request.status !== "cancelled" ? (
                  <CheckCircle2 className="h-9 w-9 text-swag-green" />
                ) : (
                  <Clock3 className="h-9 w-9 text-swag-orange" />
                )}
              </div>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Requested date</dt>
                  <dd className="font-semibold text-swag-navy">{request.preferred_date}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Mentor</dt>
                  <dd className="font-semibold text-swag-navy">
                    {request.assigned_mentor_name || "Waiting for a mentor"}
                  </dd>
                </div>
              </dl>
              {request.session_start && request.session_end && (
                <div className="mt-5 rounded-xl border border-swag-green/35 bg-swag-green/5 p-4">
                  <p className="font-bold text-swag-navy">Confirmed appointment</p>
                  <p className="mt-1 text-sm">
                    {seoul.format(new Date(request.session_start))}–
                    {time.format(new Date(request.session_end))}
                    {request.session_label ? ` · ${request.session_label}` : ""}
                    {request.session_location ? ` · ${request.session_location}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Korea time</p>
                </div>
              )}
            </section>
            {notice && (
              <p className="rounded-lg border border-swag-green/35 p-3 text-sm text-swag-navy">
                {notice}
              </p>
            )}
            {error && (
              <p className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
                {error}
              </p>
            )}
            {!["completed", "cancelled", "no_show", "escalated"].includes(request.status) && (
              <div>
                <button
                  disabled={busy}
                  onClick={() => void cancel()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-destructive/30 px-4 text-sm font-semibold text-destructive disabled:opacity-60"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel appointment
                </button>
                <p className="mt-2 text-xs text-muted-foreground">
                  The schedule will be cancelled and no separate cancellation email will be sent.
                </p>
              </div>
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
