import type { ReactNode } from "react";
import { ProtectedDashboard } from "@/components/auth/ProtectedDashboard";
import { DashboardShell, type DashboardNavItem } from "@/components/dashboard/DashboardShell";
import type { PrivilegedRole } from "@/lib/auth";

const PEER_NAV: DashboardNavItem[] = [
  { label: "Home", to: "/peer-mentor/dashboard" },
  { label: "Available Requests", to: "/peer-mentor/requests" },
  { label: "My Cases", to: "/peer-mentor/cases" },
];

const SWAG_NAV: DashboardNavItem[] = [
  { label: "Home", to: "/swag/dashboard" },
  { label: "Available Requests", to: "/swag/requests" },
  { label: "My Cases", to: "/swag/cases" },
  { label: "Concerns", to: "/swag/concerns" },
  { label: "Escalations", to: "/swag/escalations" },
];

const TEACHER_NAV: DashboardNavItem[] = [
  { label: "Home", to: "/teacher/dashboard" },
  { label: "Peer Support Overview", to: "/teacher/peer-support" },
  { label: "Concerns", to: "/teacher/concerns" },
  { label: "Escalations", to: "/teacher/escalations" },
  { label: "Bookings", to: "/teacher/bookings" },
];

const NAVS: Record<PrivilegedRole, DashboardNavItem[]> = {
  peer_mentor: PEER_NAV,
  swag_member: SWAG_NAV,
  teacher: TEACHER_NAV,
};

export function DashboardPage({ role, children }: { role: PrivilegedRole; children: ReactNode }) {
  return (
    <ProtectedDashboard requiredRole={role}>
      <DashboardShell role={role} nav={NAVS[role]}>
        {children}
      </DashboardShell>
    </ProtectedDashboard>
  );
}

export function DashboardPageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-swag-blue">{eyebrow}</p>
      <h1 className="mt-1 text-3xl font-bold text-swag-navy sm:text-4xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        {description}
      </p>
    </header>
  );
}

export function PageState({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: "blue" | "green" | "orange" | "pink";
}) {
  const border = {
    blue: "border-swag-blue/35",
    green: "border-swag-green/35",
    orange: "border-swag-orange/35",
    pink: "border-swag-pink/35",
  }[tone];
  return (
    <div
      className={`paper-card min-h-36 ${border} flex items-center justify-center p-6 text-center text-sm leading-relaxed text-muted-foreground`}
    >
      {children}
    </div>
  );
}
