import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { SwagButton, SwagLinkButton } from "@/components/SwagButton";
import { AccountAccessNotice } from "@/components/auth/ProtectedDashboard";
import { dashboardRouteFor } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Staff & Peer Mentor Access — SWAG Support Hub" },
      {
        name: "description",
        content: "Secure sign in for approved SWAG Members, Peer Mentors and staff.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { user, profile, loading, profileError, signIn, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const destination = dashboardRouteFor(profile?.role ?? null);
    if (!loading && user && destination) {
      void navigate({ to: destination, replace: true });
    }
  }, [loading, navigate, profile?.role, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError("");
    const result = await signIn(email, password);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    const destination = dashboardRouteFor(result.role);
    if (destination) {
      await navigate({ to: destination, replace: true });
    }
  }

  if (!loading && user && profile?.role === "student") {
    return (
      <AccountAccessNotice
        title="Staff dashboard access is not enabled"
        message="This account does not have access to the SWAG staff dashboard. Access is available only to approved SWAG Members, Peer Mentors and staff."
      />
    );
  }

  if (!loading && user && (profileError || !profile)) {
    return (
      <main className="mx-auto flex min-h-[58vh] w-full max-w-6xl items-center justify-center px-4 py-12 sm:px-6">
        <section className="paper-card w-full max-w-lg border-swag-pink/45 p-6 text-center sm:p-8">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-swag-pink/10 text-swag-pink">
            <LockKeyhole className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-2xl font-bold text-swag-navy">Profile unavailable</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {profileError ?? "Your approved account profile could not be loaded."}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <SwagLinkButton to="/" variant="secondary" className="min-h-11">
              Back to SWAG
            </SwagLinkButton>
            <SwagButton type="button" variant="secondary" onClick={() => void signOut()}>
              Sign out
            </SwagButton>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:py-18">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)] lg:gap-16">
        <section className="max-w-xl">
          <div className="flex items-center gap-3">
            <img
              src="/swag_logo.png"
              alt="SWAG logo"
              width={500}
              height={499}
              className="h-12 w-12 object-contain"
            />
            <p className="text-sm font-semibold text-swag-blue">SWAG Support Hub</p>
          </div>
          <h1 className="mt-6 text-4xl font-bold leading-tight text-swag-navy sm:text-5xl">
            Staff & Peer Mentor
            <br />
            <span className="sketch-underline inline-block">Access</span>
          </h1>
          <p className="mt-7 max-w-md text-base leading-relaxed text-muted-foreground">
            A private workspace for approved members of the SWAG support team.
          </p>

          <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-2">
            <div className="paper-card flex items-start gap-3 border-swag-blue/35 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-swag-blue/10 text-swag-blue">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-swag-navy">Approved accounts</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Your access follows the role approved for your account.
                </p>
              </div>
            </div>
            <div className="paper-card flex items-start gap-3 border-swag-green/35 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-swag-green/10 text-swag-green">
                <LockKeyhole className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-swag-navy">Private by design</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Database permissions protect each support area.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="paper-card border-swag-blue/40 p-5 sm:p-7"
          aria-labelledby="sign-in-title"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-swag-blue/10 text-swag-blue">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 id="sign-in-title" className="mt-5 text-2xl font-bold text-swag-navy">
            Sign in
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Access is available only to approved SWAG Members, Peer Mentors and staff.
          </p>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="email" className="text-sm font-semibold text-swag-navy">
                Email
              </label>
              <div className="relative mt-2">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-input bg-card py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70"
                  placeholder="you@school.org"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="text-sm font-semibold text-swag-navy">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm text-foreground"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-swag-pink/40 bg-swag-pink/8 px-3 py-2.5 text-sm leading-relaxed text-swag-navy"
              >
                {error}
              </p>
            )}

            <SwagButton
              type="submit"
              className="min-h-11 w-full"
              disabled={submitting || loading || !email.trim() || !password}
            >
              {submitting || loading ? "Signing in…" : "Sign in"}
            </SwagButton>
          </form>

          <div className="mt-5 border-t border-border pt-4">
            <SwagLinkButton to="/" variant="secondary" className="min-h-11 w-full">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to the SWAG website
            </SwagLinkButton>
          </div>
        </section>
      </div>
    </main>
  );
}
