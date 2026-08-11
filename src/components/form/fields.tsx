import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-swag-blue focus:outline-none";

function FieldShell({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-swag-navy">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  error,
  hint,
  className,
  ...props
}: ComponentProps<"input"> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <FieldShell label={label} htmlFor={id} error={error} hint={hint}>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(control, error && "border-destructive", className)}
        {...props}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  className,
  ...props
}: ComponentProps<"textarea"> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <FieldShell label={label} htmlFor={id} error={error} hint={hint}>
      <textarea
        id={id}
        rows={5}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(control, error && "border-destructive", className)}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  error,
  hint,
  options,
  className,
  ...props
}: ComponentProps<"select"> & {
  label: string;
  error?: string;
  hint?: string;
  options: string[];
}) {
  const id = useId();
  return (
    <FieldShell label={label} htmlFor={id} error={error} hint={hint}>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(control, error && "border-destructive", className)}
        {...props}
      >
        <option value="">Please choose…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  ...props
}: ComponentProps<"input"> & { label: string }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 rounded border-border accent-[var(--swag-blue)]"
        {...props}
      />
      <label htmlFor={id} className="text-sm text-swag-navy">
        {label}
      </label>
    </div>
  );
}

export function ReviewList({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="divide-y divide-border rounded-lg border border-border bg-card">
      {items.map((item) => (
        <div key={item.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="text-sm font-semibold text-swag-navy">{item.label}</dt>
          <dd className="min-w-0 break-words text-sm text-muted-foreground">
            {item.value || "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}