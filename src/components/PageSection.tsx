import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageSection({
  title,
  intro,
  titleClassName,
  introClassName,
  children,
}: {
  title: string;
  intro?: ReactNode;
  titleClassName?: string;
  introClassName?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl overflow-x-hidden px-4 py-10 sm:px-6 sm:py-14">
      <h1
        className={cn(
          "sketch-underline inline-block text-3xl font-bold leading-tight text-swag-navy sm:text-4xl",
          titleClassName,
        )}
      >
        {title}
      </h1>
      {intro && (
        <div
          className={cn(
            "mt-7 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base",
            introClassName,
          )}
        >
          {intro}
        </div>
      )}
      <div className="mt-10 min-w-0">{children}</div>
    </main>
  );
}
