import { AlertTriangle, CheckCircle2, Inbox } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { DashboardPageHeading } from "./DashboardLayout";
import { SummaryCard } from "./DashboardPieces";
import { TeacherRequestsPage } from "./TeacherPeerDetails";
import { getSupabaseClient } from "@/lib/supabase";
import { savedReadiness } from "@/lib/peer-readiness";

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
const periodFields = [
  ["Break", "breakStart", "breakEnd"],
  ["1st Lunch", "lunch1Start", "lunch1End"],
  ["2nd Lunch", "lunch2Start", "lunch2End"],
] as const;

export function TeacherPeerSupport() {
  return (
    <TeacherRequestsPage>
      <SchoolSettings />
    </TeacherRequestsPage>
  );
}

function settingsForm(row: SettingsRow) {
  const byPeriod = Object.fromEntries(row.periods.map((p) => [p.period, p]));
  const time = (value: string | null | undefined) => value?.slice(0, 5) || "";
  return {
    location: row.location_guidance || "",
    teacher: row.supervisor_teacher_id || "",
    weekdays: [...row.active_weekdays].sort(),
    breakStart: time(byPeriod["break"]?.start_time),
    breakEnd: time(byPeriod["break"]?.end_time),
    lunch1Start: time(byPeriod["lunch_1"]?.start_time),
    lunch1End: time(byPeriod["lunch_1"]?.end_time),
    lunch2Start: time(byPeriod["lunch_2"]?.start_time),
    lunch2End: time(byPeriod["lunch_2"]?.end_time),
  };
}

function SchoolSettings() {
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [form, setForm] = useState<ReturnType<typeof settingsForm> | null>(null);
  const [attentionHours, setAttentionHours] = useState(24);
  const [savedAttentionHours, setSavedAttentionHours] = useState<number | null>(null);
  const [email, setEmail] = useState<{ configured: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const client = getSupabaseClient();
    const [settingResult, candidateResult, policyResult, emailResult] = await Promise.all([
      client.rpc("get_peer_support_settings"),
      client.rpc("list_teacher_candidates"),
      client.rpc("get_peer_assignment_policy" as never),
      fetch("/api/peer-support/status", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
    ]);
    const row = settingResult.data?.[0] as SettingsRow | undefined;
    if (settingResult.error || candidateResult.error || !row) {
      setError(
        "Saved settings could not be verified. Your edits have been kept. Reload to check readiness.",
      );
      return false;
    }
    setSettings(row);
    setCandidates((candidateResult.data ?? []) as Candidate[]);
    setForm(settingsForm(row));
    setEmail(emailResult?.email ?? null);
    const policy = (policyResult.data as Array<{ assignment_attention_hours: number }> | null)?.[0];
    if (policy) {
      setAttentionHours(policy.assignment_attention_hours);
      setSavedAttentionHours(policy.assignment_attention_hours);
    }
    setError(
      policyResult.error
        ? "The attention threshold could not be loaded. School settings are shown below."
        : null,
    );
    return true;
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const readiness = settings ? savedReadiness(settings, candidates) : null;
  const dirty = Boolean(
    form && settings && JSON.stringify(form) !== JSON.stringify(settingsForm(settings)),
  );
  const policyDirty = savedAttentionHours !== null && attentionHours !== savedAttentionHours;
  useEffect(() => {
    if (!dirty && !policyDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, policyDirty]);
  async function save() {
    if (!form) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const { data, error: rpcError } = await getSupabaseClient().rpc(
        "save_peer_support_settings",
        {
          p_location_guidance: form.location,
          p_supervisor_teacher_id: form.teacher,
          p_active_weekdays: form.weekdays,
          p_break_start: form.breakStart,
          p_break_end: form.breakEnd,
          p_lunch_1_start: form.lunch1Start,
          p_lunch_1_end: form.lunch1End,
          p_lunch_2_start: form.lunch2Start,
          p_lunch_2_end: form.lunch2End,
        },
      );
      if (rpcError || !data) {
        setError(
          "Settings were not saved. Choose an active teacher, a location, school days, and valid start/end times for all three periods. Your edits have been kept.",
        );
      } else {
        // Do not reset an independently edited attention threshold.
        const result = await getSupabaseClient().rpc("get_peer_support_settings");
        const candidatesResult = await getSupabaseClient().rpc("list_teacher_candidates");
        const row = result.data?.[0] as SettingsRow | undefined;
        if (result.error || candidatesResult.error || !row) {
          setError(
            "Save succeeded, but readiness could not be reloaded. Reload to verify the saved setup.",
          );
        } else {
          setSettings(row);
          setForm(settingsForm(row));
          setCandidates((candidatesResult.data ?? []) as Candidate[]);
          setMessage("School settings saved. Readiness below reflects the saved setup.");
        }
      }
    } catch {
      setError("Could not reach the server. Your edits have been kept; try saving again.");
    } finally {
      setBusy(false);
    }
  }
  async function saveAttentionPolicy() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const { data, error: rpcError } = await getSupabaseClient().rpc(
        "set_peer_assignment_policy" as never,
        { p_assignment_attention_hours: attentionHours } as never,
      );
      if (rpcError || !data)
        setError("Threshold was not saved. Use a whole number from 1 to 168 hours.");
      else {
        setSavedAttentionHours(attentionHours);
        setMessage("Attention threshold saved. Other edits are unchanged.");
      }
    } catch {
      setError("Could not save the attention threshold. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const inputClass =
    "mt-2 min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 font-normal";
  return (
    <section
      id="school-settings"
      className="paper-card mt-6 scroll-mt-6 border-swag-blue/35 p-5 sm:p-7"
      aria-label="Peer Support setup status"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-swag-navy">Peer Support setup status</h2>
          <p className="mt-1 text-sm text-muted-foreground">Saved school setup · Asia/Seoul</p>
        </div>
        <span
          role="status"
          className={`rounded-full px-3 py-1 text-sm font-semibold ${readiness?.ready ? "bg-swag-green/10 text-swag-green" : "bg-swag-orange/10 text-swag-orange"}`}
        >
          {readiness
            ? readiness.ready
              ? "Ready to run"
              : "Setup needs attention"
            : "Checking saved setup…"}
        </span>
      </div>
      {readiness && (
        <>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {readiness.checks.map((check) => (
              <li key={check.label} className="rounded-lg bg-muted/40 px-3 py-2">
                <span aria-hidden="true">{check.ready ? "✓" : "!"}</span> {check.label}:{" "}
                <strong>{check.ready ? "Ready" : "Missing"}</strong>
              </li>
            ))}
          </ul>
          {!readiness.ready && (
            <div
              className="mt-4 rounded-xl border border-swag-orange/40 bg-swag-orange/5 p-4 text-sm"
              role="status"
            >
              <p className="font-bold text-swag-navy">What needs attention</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {readiness.missing.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Confirmation email:{" "}
        {email ? (email.configured ? "ready" : "not configured") : "status unavailable"}. Sent only
        when a meeting is confirmed.
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-swag-orange/40 p-3 text-sm">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm font-semibold text-swag-green">
          {message}
        </p>
      )}
      {!form ? (
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 text-sm font-semibold text-swag-blue"
        >
          Reload settings
        </button>
      ) : (
        <details className="mt-5" open={!readiness?.ready || undefined}>
          <summary className="cursor-pointer text-sm font-semibold text-swag-blue">
            Edit school settings{dirty || policyDirty ? " · Unsaved changes" : ""}
          </summary>
          <fieldset disabled={busy} className="mt-5 min-w-0 disabled:opacity-60">
            <legend className="text-base font-bold text-swag-navy">General settings</legend>
            <label className="mt-3 block text-sm font-semibold text-swag-navy">
              Approved location or guidance
              <input
                value={form.location}
                maxLength={160}
                onChange={(e) => setForm((old) => old && { ...old, location: e.target.value })}
                className={inputClass}
              />
            </label>
            <h3 className="mt-5 font-bold text-swag-navy">Supervisor</h3>
            <label className="mt-2 block text-sm font-semibold text-swag-navy">
              Designated supervising teacher
              <select
                value={form.teacher}
                onChange={(e) => setForm((old) => old && { ...old, teacher: e.target.value })}
                className={inputClass}
              >
                <option value="">Select an approved Teacher</option>
                {form.teacher && !candidates.some((c) => c.profile_id === form.teacher) && (
                  <option value={form.teacher} disabled>
                    {settings?.supervisor_teacher_name || "Saved teacher"} — inactive / unavailable
                  </option>
                )}
                {candidates.map((c) => (
                  <option key={c.profile_id} value={c.profile_id}>
                    {c.full_name || `Profile incomplete · account ${c.profile_id.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              Only teachers with active staff registration can supervise. Missing teacher? Ask the
              administrator to check their registration.
            </p>
            <fieldset className="mt-5">
              <legend className="font-bold text-swag-navy">School days</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => (
                  <label
                    key={label}
                    className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.weekdays.includes(index + 1)}
                      onChange={(e) =>
                        setForm(
                          (old) =>
                            old && {
                              ...old,
                              weekdays: e.target.checked
                                ? [...old.weekdays, index + 1].sort()
                                : old.weekdays.filter((d) => d !== index + 1),
                            },
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <h3 className="mt-5 font-bold text-swag-navy">
              Period times{" "}
              <span className="text-sm font-normal text-muted-foreground">(Asia/Seoul)</span>
            </h3>
            <div className="mt-3 grid gap-3 xl:grid-cols-3">
              {periodFields.map(([label, start, end]) => (
                <fieldset key={label} className="min-w-0 rounded-xl border border-border p-3">
                  <legend className="px-1 text-sm font-semibold text-swag-navy">{label}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="min-w-0 text-xs text-muted-foreground">
                      Start
                      <input
                        type="time"
                        value={form[start]}
                        onChange={(e) =>
                          setForm((old) => old && { ...old, [start]: e.target.value })
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="min-w-0 text-xs text-muted-foreground">
                      End
                      <input
                        type="time"
                        value={form[end]}
                        onChange={(e) => setForm((old) => old && { ...old, [end]: e.target.value })}
                        className={inputClass}
                      />
                    </label>
                  </div>
                </fieldset>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void save()}
                className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                {busy ? "Saving…" : "Save school settings"}
              </button>
              <p role="status" className="text-sm text-muted-foreground">
                {dirty
                  ? "Unsaved school settings — save to apply."
                  : "School settings match the saved setup."}
              </p>
            </div>
          </fieldset>
          <fieldset
            disabled={busy || savedAttentionHours === null}
            className="mt-6 min-w-0 border-t border-border pt-5"
          >
            <legend className="text-base font-bold text-swag-navy">Attention threshold</legend>
            <p className="text-xs text-muted-foreground">
              Highlight requests waiting this long. This does not assign or block meetings.
            </p>
            <label className="mt-3 block max-w-xs text-sm font-semibold text-swag-navy">
              Hours
              <input
                type="number"
                min={1}
                max={168}
                step={1}
                value={attentionHours}
                onChange={(e) => setAttentionHours(Number(e.target.value))}
                className={inputClass}
              />
            </label>
            <button
              type="button"
              disabled={!policyDirty || busy}
              onClick={() => void saveAttentionPolicy()}
              className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-50"
            >
              Save attention threshold
            </button>
            {policyDirty && (
              <p className="mt-2 text-xs text-muted-foreground">
                Unsaved attention threshold (saved separately).
              </p>
            )}
          </fieldset>
        </details>
      )}
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
        description="Start with requests needing support and today’s meetings."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          icon={Inbox}
          label="Unassigned"
          value={value("open_count")}
          note="Open requests"
          accent="orange"
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
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          to="/teacher/peer-support"
          search={{ filter: "all", page: 0, from: "requests" }}
          className="paper-card border-swag-blue/35 p-5"
        >
          <h2 className="font-bold text-swag-navy">Manage Peer Support →</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Assign requests, check meetings, and review school setup.
          </p>
        </Link>
        <Link to="/teacher/escalations" className="paper-card border-swag-pink/35 p-5">
          <h2 className="font-bold text-swag-navy">Review escalations →</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Follow up on cases that need Teacher support.
          </p>
        </Link>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Confirmed meetings: {value("scheduled_count")} · Email needs attention:{" "}
        {value("email_attention_count")}
      </p>
    </>
  );
}
