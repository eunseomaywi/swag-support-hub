import { Link, useNavigate } from "@tanstack/react-router";
import { LockKeyhole, RefreshCw } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { SwagButton, SwagLinkButton } from "@/components/SwagButton";
import { useAuth } from "@/hooks/useAuth";
import { dashboardRouteFor, ROLE_LABELS, type PrivilegedRole } from "@/lib/auth";

function DashboardLoading({ label = "Checking your access…" }: { label?: string }) {
  return (
    <main
      className="mx-auto flex min-h-[55vh] w-full max-w-6xl items-center justify-center px-4 py-12 sm:px-6"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="paper-card flex max-w-sm items-center gap-3 border-swag-blue/35 px-5 py-4 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin text-swag-blue" aria-hidden="true" />
        {label}
      </div>
    </main>
  );
}

export function AccountAccessNotice({ title, message }: { title: string; message: string }) {
  const { role, signOut } = useAuth();
  const ownDashboard = dashboardRouteFor(role);
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    await navigate({ to: "/login", replace: true });
  }

  return (
    <main className="mx-auto flex min-h-[58vh] w-full max-w-6xl items-center justify-center px-4 py-12 sm:px-6">
      <section className="paper-card w-full max-w-lg border-swag-orange/45 p-6 text-center sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-swag-orange/12 text-swag-orange">
          <LockKeyhole className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-swag-navy">{title}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {ownDashboard ? (
            <Link
              to={ownDashboard}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Go to my dashboard
            </Link>
          ) : (
            <SwagLinkButton to="/" variant="secondary" className="min-h-11">
              Back to SWAG
            </SwagLinkButton>
          )}
          <SwagButton
            type="button"
            variant="secondary"
            className="min-h-11"
            onClick={handleSignOut}
          >
            Sign out
          </SwagButton>
        </div>
      </section>
    </main>
  );
}

export function ProtectedDashboard({
  requiredRole,
  children,
}: {
  requiredRole: PrivilegedRole;
  children: ReactNode;
}) {
  const { user, profile, loading, profileError, refreshProfile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      void navigate({ to: "/login", replace: true });
    }
  }, [loading, navigate, user]);

  if (loading) return <DashboardLoading />;
  if (!user) return <DashboardLoading label="Taking you to sign in…" />;

  if (profileError || !profile) {
    return (
      <main className="mx-auto flex min-h-[58vh] w-full max-w-6xl items-center justify-center px-4 py-12 sm:px-6">
        <section className="paper-card w-full max-w-lg border-swag-pink/45 p-6 text-center sm:p-8">
          <h1 className="text-2xl font-bold text-swag-navy">Profile unavailable</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {profileError ?? "Your approved account profile could not be loaded."}
          </p>
          <SwagButton type="button" className="mt-6 min-h-11" onClick={() => void refreshProfile()}>
            Try again
          </SwagButton>
        </section>
      </main>
    );
  }

  if (profile.role !== requiredRole) {
    return (
      <AccountAccessNotice
        title="This dashboard isn't available to your account"
        message={`You are signed in as a ${ROLE_LABELS[profile.role]}. Your approved role does not include access to the ${ROLE_LABELS[requiredRole]} dashboard.`}
      />
    );
  }

  return children;
}
