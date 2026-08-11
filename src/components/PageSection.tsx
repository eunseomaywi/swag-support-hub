import type { ReactNode } from "react";

export function PageSection({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="sketch-underline inline-block text-3xl font-bold text-swag-navy sm:text-4xl">
        {title}
      </h1>
      {intro && <div className="mt-7 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{intro}</div>}
      <div className="mt-10">{children}</div>
    </main>
  );
}