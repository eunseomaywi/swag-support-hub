import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SwagButton, SwagLinkButton } from "@/components/SwagButton";

export function StepProgress({
  step,
  total,
  label,
}: {
  step: number;
  total: number;
  label: string;
}) {
  return (
    <div className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Step {step} of {total} — {label}
      </p>
      <div className="mt-2 flex gap-1.5" role="presentation">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < step ? "bg-swag-blue" : "bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function FormStep({
  step,
  total,
  title,
  children,
  onBack,
  onNext,
  nextLabel = "Next",
  submitting,
}: {
  step: number;
  total: number;
  title: string;
  children: ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  submitting?: boolean;
}) {
  return (
    <form
      className="paper-card mx-auto max-w-xl p-6 sm:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
      noValidate
    >
      <StepProgress step={step} total={total} label={title} />
      <h2 className="text-xl font-bold text-swag-navy">{title}</h2>
      <div className="mt-6 space-y-5">{children}</div>
      <div className="mt-8 flex justify-between gap-3">
        {onBack ? (
          <SwagButton type="button" variant="secondary" onClick={onBack}>
            Back
          </SwagButton>
        ) : (
          <span />
        )}
        <SwagButton type="submit" disabled={submitting}>
          {submitting ? "Sending…" : nextLabel}
        </SwagButton>
      </div>
    </form>
  );
}

export function SubmittedPanel({ message }: { message: string }) {
  return (
    <div className="paper-card mx-auto max-w-xl p-8 text-center" role="status" aria-live="polite">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-swag-green/10 text-swag-green">
        <Check className="h-7 w-7" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-xl font-bold text-swag-navy">Submitted!</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
      <div className="mt-7 flex justify-center">
        <SwagLinkButton to="/">Back to Home</SwagLinkButton>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Need something else?{" "}
        <Link to="/form" className="underline hover:text-swag-blue">
          Back to Form Hub
        </Link>
      </p>
    </div>
  );
}