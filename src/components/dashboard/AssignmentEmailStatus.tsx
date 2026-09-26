import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
type Status = {
  event_id: string;
  status: string;
  attempts: number;
  last_error_code: string | null;
};
export function AssignmentEmailStatus({ requestId }: { requestId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const load = useCallback(
    async (retryId?: string) => {
      const result = await getSupabaseClient().rpc("get_assignment_email_status", {
        p_request_id: requestId,
        ...(retryId ? { p_retry_event_id: retryId } : {}),
      });
      setUnavailable(Boolean(result.error));
      setStatus(result.data?.[0] ?? null);
      if (retryId && !result.error) {
        const { data } = await getSupabaseClient().auth.getSession();
        if (data.session)
          await fetch("/api/peer-support/email/kick", {
            method: "POST",
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          }).catch(() => undefined);
      }
    },
    [requestId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const processing = status !== null && ["pending", "processing"].includes(status.status);
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load, processing]);
  if (!status && !unavailable) return null;
  const label = unavailable
    ? "Email status unavailable"
    : status?.status === "provider-accepted"
      ? "Email request accepted · Inbox delivery is not confirmed"
      : status?.status === "failed"
        ? "Email failed"
        : status?.status === "needs-review"
          ? "Email needs review · Automatic retries stopped to prevent duplicates"
          : status?.status === "superseded"
            ? "Email processing stopped · Request state changed"
            : "Email processing";
  return (
    <section
      className="mt-4 rounded-xl border border-swag-blue/25 p-4 text-sm"
      aria-label="Assignment email status"
    >
      <p role="status">Assignment complete / {label}</p>
      {status?.last_error_code?.startsWith("configuration_") && (
        <p className="mt-1 text-muted-foreground">
          The Resend sender configuration needs attention.
        </p>
      )}
      <button className="mt-2 min-h-11 underline" onClick={() => void load()}>
        Refresh email status
      </button>
      {status?.status === "failed" && status.attempts < 5 && (
        <button className="ml-4 min-h-11 underline" onClick={() => void load(status.event_id)}>
          Retry this notification
        </button>
      )}
    </section>
  );
}
