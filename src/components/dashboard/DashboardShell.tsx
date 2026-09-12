import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LogOut, Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ROLE_LABELS, type PrivilegedRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export type DashboardNavItem = {
  label: string;
  to: string;
};

const roleAccent: Record<PrivilegedRole, string> = {
  peer_mentor: "border-swag-green/50 bg-swag-green/10 text-swag-green",
  swag_member: "border-swag-pink/50 bg-swag-pink/10 text-swag-pink",
  teacher: "border-swag-blue/50 bg-swag-blue/10 text-swag-blue",
};

export function DashboardShell({
  role,
  nav,
  children,
}: {
  role: PrivilegedRole;
  nav: DashboardNavItem[];
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });

  async function handleSignOut() {
    await signOut();
    await navigate({ to: "/login", replace: true });
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-9">
      <header className="paper-card overflow-hidden border-swag-blue/30">
        <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" aria-label="SWAG home" className="shrink-0 rounded-lg">
              <img
                src="/swag_logo.png"
                alt=""
                width={500}
                height={499}
                className="h-10 w-10 object-contain"
              />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-display text-lg font-bold text-swag-navy">SWAG Hub</p>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                    roleAccent[role],
                  )}
                >
                  {ROLE_LABELS[role]}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {profile?.full_name || user?.email || "Approved account"}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <Link
              to="/"
              className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-swag-navy"
            >
              Public website
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-swag-navy transition-colors hover:border-swag-blue hover:text-swag-blue"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>

          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-swag-navy md:hidden"
            aria-expanded={menuOpen}
            aria-controls="dashboard-mobile-nav"
            aria-label={menuOpen ? "Close dashboard menu" : "Open dashboard menu"}
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <nav
          aria-label={`${ROLE_LABELS[role]} dashboard`}
          className="hidden border-t border-border/80 px-4 md:flex md:items-center md:gap-1 md:px-6"
        >
          {nav.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to as never}
                className={cn(
                  "border-b-2 px-3 py-3 text-sm font-semibold transition-colors",
                  active
                    ? "border-swag-blue text-swag-navy"
                    : "border-transparent text-muted-foreground hover:border-swag-blue/40 hover:text-swag-navy",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {menuOpen && (
          <nav
            id="dashboard-mobile-nav"
            aria-label={`${ROLE_LABELS[role]} dashboard mobile`}
            className="border-t border-border px-4 py-2 md:hidden"
          >
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to as never}
                onClick={() => setMenuOpen(false)}
                aria-current={pathname === item.to ? "page" : undefined}
                className={cn(
                  "block min-h-11 border-b border-border/60 py-3 text-sm font-semibold last:border-0 hover:text-swag-navy",
                  pathname === item.to ? "text-swag-blue" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/"
              className="block min-h-11 border-t border-border py-3 text-sm font-semibold text-muted-foreground"
            >
              Public website
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex min-h-11 w-full items-center gap-2 border-t border-border py-3 text-left text-sm font-semibold text-swag-navy"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </nav>
        )}
      </header>

      <div className="pb-8 pt-8 sm:pt-10">{children}</div>
    </main>
  );
}
