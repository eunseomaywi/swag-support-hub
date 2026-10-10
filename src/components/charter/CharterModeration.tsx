import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardPageHeading } from "@/components/dashboard/DashboardLayout";
import { getSupabaseClient } from "@/lib/supabase";
import { COLOURS, COLOUR_LABELS, validateStrokes, type PublicSignature } from "@/lib/charter/model";
import { drawStrokes } from "@/lib/charter/draw";

type Entry = PublicSignature & { status: string };
function SignatureThumbnail({ entry }: { entry: Entry }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current,
      ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    try {
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      drawStrokes(ctx, validateStrokes(entry.strokes), 240, 100, COLOURS[entry.region_id]);
    } catch {
      ctx.clearRect(0, 0, 480, 200);
    }
  }, [entry]);
  return (
    <canvas
      width={480}
      height={200}
      ref={canvas}
      className="h-25 w-full max-w-60 rounded-lg bg-white"
      role="img"
      aria-label={`${COLOUR_LABELS[entry.region_id]} signature preview`}
    />
  );
}
export function CharterModeration({ role }: { role: "swag_member" | "teacher" }) {
  const [status, setStatus] = useState<"pending" | "approved">("pending"),
    [entries, setEntries] = useState<Entry[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [before, setBefore] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getSupabaseClient().rpc("charter_moderation_queue", {
      p_status: status,
      ...(before ? { p_before: before } : {}),
    });
    if (error) setError("The review queue could not load. Please retry.");
    else setEntries((data || []) as Entry[]);
    setLoading(false);
  }, [status, before]);
  useEffect(() => {
    void load();
  }, [load]);
  async function moderate(entry: Entry, next: "approved" | "rejected" | "hidden") {
    setBusy(entry.id);
    setError("");
    try {
      const result = await getSupabaseClient().rpc("moderate_charter_signature", {
        p_id: entry.id,
        p_status: next,
      });
      if (result.error || !result.data)
        throw new Error("This signature could not be updated. Refresh the queue and retry.");
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please retry.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="mt-7">
      <DashboardPageHeading
        eyebrow="Community artwork"
        title="Charter signatures"
        description="Review drawings before they become visible in the shared SWAG logo."
      />
      <div className="mb-5 flex flex-wrap gap-3">
        {(["pending", "approved"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className="rounded-lg border bg-white px-4 py-2 text-sm"
            aria-pressed={status === value}
            onClick={() => {
              setStatus(value);
              setBefore(null);
            }}
          >
            {value === "pending" ? "Pending review" : "Approved"}
          </button>
        ))}
        <button
          type="button"
          className="rounded-lg border bg-white px-4 py-2 text-sm"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
      {error ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p role="status">Loading signatures…</p>
      ) : !entries.length ? (
        <p>No signatures in this queue.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <article key={entry.id} className="paper-card p-4">
              <SignatureThumbnail entry={entry} />
              <p className="mt-3 text-sm font-semibold">{COLOUR_LABELS[entry.region_id]}</p>
              <time dateTime={entry.created_at} className="text-xs text-muted-foreground">
                {new Date(entry.created_at).toLocaleString()}
              </time>
              <div className="mt-4 flex gap-2">
                {(status === "pending"
                  ? (["approved", "rejected"] as const)
                  : role === "teacher"
                    ? (["hidden"] as const)
                    : []
                ).map((next) => (
                  <button
                    key={next}
                    type="button"
                    className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => void moderate(entry, next)}
                  >
                    {busy === entry.id
                      ? "Saving…"
                      : next === "approved"
                        ? "Approve"
                        : next === "rejected"
                          ? "Reject"
                          : "Hide"}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="mt-6 flex gap-4">
        {before ? (
          <button type="button" onClick={() => setBefore(null)}>
            Back to newest
          </button>
        ) : null}
        {entries.length === 40 ? (
          <button type="button" onClick={() => setBefore(entries.at(-1)!.created_at)}>
            Older signatures
          </button>
        ) : null}
      </div>
    </section>
  );
}
