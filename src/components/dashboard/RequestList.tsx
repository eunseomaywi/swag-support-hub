import type { ReactNode } from "react";
const columns =
  "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]";
export function RequestList({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-swag-blue/25 bg-card">
      <div
        className={`hidden gap-4 border-b border-border bg-swag-blue/5 px-5 py-3 text-xs font-semibold text-swag-navy lg:grid ${columns}`}
        aria-hidden="true"
      >
        <span>Student</span>
        <span>Requested date / Meeting</span>
        <span>Supporter</span>
        <span>Status</span>
        <span>Actions</span>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}
export function RequestListRow({
  student,
  date,
  supporter,
  status,
  actions,
  extra,
}: {
  student: ReactNode;
  date: ReactNode;
  supporter: ReactNode;
  status: ReactNode;
  actions: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <article className={`grid min-w-0 gap-4 p-5 lg:items-start ${columns}`}>
      {[
        ["Student", student],
        ["Requested date / Meeting", date],
        ["Supporter", supporter],
        ["Status", status],
        ["Actions", actions],
      ].map(([label, content]) => (
        <div key={String(label)} className="min-w-0 break-words text-sm">
          <p className="mb-1 text-xs font-semibold text-muted-foreground lg:hidden">{label}</p>
          {content}
        </div>
      ))}
      {extra && <div className="min-w-0 lg:col-span-5">{extra}</div>}
    </article>
  );
}
export function RequestStatus({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-swag-blue/25 bg-swag-blue/5 px-3 py-1 text-xs font-semibold text-swag-navy">
      {children}
    </span>
  );
}
