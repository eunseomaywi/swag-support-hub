import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import {
  YEAR_GROUPS,
  missingProfileFields,
  type SupporterIdentity as Identity,
} from "@/lib/supporter-identity";
import { DashboardPageHeading, PageState } from "./DashboardLayout";
import { SupporterIdentity } from "./SupporterIdentity";

const inputClass =
  "mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-swag-navy";
export function IdentityFields({
  name,
  year,
  teacher,
  setName,
  setYear,
}: {
  name: string;
  year: string;
  teacher: boolean;
  setName: (value: string) => void;
  setYear: (value: string) => void;
}) {
  return (
    <>
      <label className="block text-sm font-semibold text-swag-navy">
        Name
        <input
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className={inputClass}
        />
      </label>
      {!teacher && (
        <label className="mt-4 block text-sm font-semibold text-swag-navy">
          Year group
          <select
            required
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className={inputClass}
          >
            <option value="">Select your year group</option>
            {YEAR_GROUPS.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}
export function MyProfile() {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name || "");
  const [year, setYear] = useState(profile?.year_group || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const teacher = profile?.role === "teacher";
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: rpcError } = await getSupabaseClient().rpc("save_my_staff_profile", {
      p_full_name: name.trim(),
      ...(teacher ? {} : { p_year_group: year }),
    });
    if (rpcError)
      setError(
        "Profile was not saved. Enter a name (1–100 characters, no HTML) and your year group if required.",
      );
    else {
      await refreshProfile();
      setMessage(
        "Profile saved. Your name and year group are now available to your support team. Existing confirmation emails are unchanged.",
      );
    }
    setBusy(false);
  }
  return (
    <>
      <DashboardPageHeading
        eyebrow="Your account"
        title="My Profile"
        description="Use the name your school community knows you by. This does not change your role or staff approval."
      />
      <form
        onSubmit={(e) => void save(e)}
        className="paper-card max-w-2xl border-swag-blue/35 p-5 sm:p-7"
      >
        <fieldset disabled={busy}>
          <IdentityFields
            name={name}
            year={year}
            teacher={teacher}
            setName={setName}
            setYear={setYear}
          />
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Email · read only</dt>
              <dd className="break-all">{profile?.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Role · read only</dt>
              <dd>{profile ? ROLE_LABELS[profile.role] : ""}</dd>
            </div>
          </dl>
          {error && (
            <p role="alert" className="mt-4 text-sm text-swag-orange">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="mt-4 text-sm text-swag-green">
              {message}
            </p>
          )}
          <button className="mt-5 min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">
            {busy ? "Saving…" : "Save profile"}
          </button>
        </fieldset>
      </form>
    </>
  );
}
export function SupportTeam() {
  const [rows, setRows] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Identity | null>(null);
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await getSupabaseClient().rpc("list_support_team");
    if (rpcError)
      setError("Support team could not be loaded. Try again or check your Teacher access.");
    else setRows((data ?? []) as unknown as Identity[]);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing?.supporter_id) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: rpcError } = await getSupabaseClient().rpc("teacher_save_supporter_profile", {
      p_profile_id: editing.supporter_id,
      p_full_name: name.trim(),
      p_year_group: year,
    });
    if (rpcError)
      setError(
        "Profile was not saved. Check the name, year group, and registered supporter status.",
      );
    else {
      setEditing(null);
      await load();
      setNotice("Supporter profile saved. Role and operational approval are unchanged.");
    }
    setBusy(false);
  }
  return (
    <>
      <DashboardPageHeading
        eyebrow="Teacher workspace"
        title="Support team"
        description="Review registered staff and correct supporter names or year groups. Roles and operational approval are managed by a trusted administrator."
      />
      {notice && (
        <p role="status" className="mb-4 text-sm text-swag-green">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 text-sm text-swag-orange">
          {error}
        </p>
      )}
      {editing && (
        <form
          onSubmit={(e) => void save(e)}
          className="paper-card mb-5 border-swag-blue/35 p-5 sm:p-7"
        >
          <fieldset disabled={busy}>
            <h2 className="mb-4 text-lg font-bold text-swag-navy">
              Edit supporter profile · {editing.supporter_id?.slice(0, 8)}
            </h2>
            <IdentityFields
              name={name}
              year={year}
              teacher={false}
              setName={setName}
              setYear={setYear}
            />
            <div className="mt-4 flex gap-3">
              <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
                Save supporter profile
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="min-h-11 px-3 text-sm"
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {loading ? (
        <PageState>Loading support team…</PageState>
      ) : error && !rows.length ? (
        <button onClick={() => void load()} className="text-swag-blue underline">
          Try again
        </button>
      ) : rows.length === 0 ? (
        <PageState>No registered staff found.</PageState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((row) => (
            <article key={row.supporter_id} className="paper-card border-swag-blue/30 p-5">
              <SupporterIdentity identity={row} />
              {row.supporter_role !== "teacher" && (
                <button
                  onClick={() => {
                    setEditing(row);
                    setName(row.supporter_name || "");
                    setYear(row.supporter_year_group || "");
                    setError(null);
                  }}
                  className="mt-3 min-h-11 text-sm font-semibold text-swag-blue underline"
                >
                  {missingProfileFields(
                    row.supporter_name,
                    row.supporter_year_group,
                    row.supporter_role,
                  ).length
                    ? "Complete profile"
                    : "Edit profile"}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
