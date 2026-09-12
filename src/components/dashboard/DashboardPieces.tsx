import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "blue" | "pink" | "green" | "orange";

const accents: Record<Accent, { border: string; bg: string; text: string }> = {
  blue: { border: "border-swag-blue/40", bg: "bg-swag-blue/10", text: "text-swag-blue" },
  pink: { border: "border-swag-pink/40", bg: "bg-swag-pink/10", text: "text-swag-pink" },
  green: {
    border: "border-swag-green/40",
    bg: "bg-swag-green/10",
    text: "text-swag-green",
  },
  orange: {
    border: "border-swag-orange/40",
    bg: "bg-swag-orange/10",
    text: "text-swag-orange",
  },
};

export function SummaryCard({
  icon: Icon,
  label,
  value,
  note,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  accent: Accent;
}) {
  const colors = accents[accent];
  return (
    <article className={cn("paper-card p-5", colors.border)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 font-display text-3xl font-bold leading-none text-swag-navy">
            {value}
          </p>
        </div>
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", colors.bg)}>
          <Icon className={cn("h-5 w-5", colors.text)} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{note}</p>
    </article>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-swag-blue">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-bold text-swag-navy sm:text-3xl">{title}</h2>
      {description && (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}

export function ComingSoonCard({
  icon: Icon,
  title,
  description,
  accent = "blue",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  accent?: Accent;
}) {
  const colors = accents[accent];
  return (
    <article className={cn("paper-card flex h-full flex-col p-5 sm:p-6", colors.border)}>
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", colors.bg)}>
        <Icon className={cn("h-5 w-5", colors.text)} aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg font-bold text-swag-navy">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <span className="mt-5 w-fit rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
        Coming next
      </span>
    </article>
  );
}
