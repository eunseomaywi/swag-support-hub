import {
  ArrowLeft,
  ArrowRight,
  HeartHandshake,
  ImageOff,
  Megaphone,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import type { PublicActivity } from "@/content/activities";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { accentBorder, accentSoftBg, accentText } from "@/lib/accents";
import { cn } from "@/lib/utils";

const activityIcons = {
  "wellbeing-week": Sparkles,
  "awareness-campaigns": Megaphone,
  "peer-support": HeartHandshake,
} as const;

function ActivityArtwork({
  activity,
  mode,
}: {
  activity: PublicActivity;
  mode: "card" | "detail";
}) {
  const image = activity.images[0];
  const [failed, setFailed] = useState(false);
  const Icon = activityIcons[activity.slug as keyof typeof activityIcons] ?? Sparkles;

  useEffect(() => setFailed(false), [image?.src]);

  if (image && !failed) {
    return (
      <figure className="h-full w-full">
        <img
          src={image.src}
          alt={image.alt}
          width={mode === "card" ? 720 : 1440}
          height={mode === "card" ? 540 : 1080}
          loading={mode === "card" ? "lazy" : "eager"}
          className={cn(
            "h-full w-full bg-muted",
            mode === "card" ? "object-cover" : "object-contain",
          )}
          onError={() => setFailed(true)}
        />
        {mode === "detail" && image.caption ? (
          <figcaption className="sr-only">{image.caption}</figcaption>
        ) : null}
      </figure>
    );
  }

  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br",
        accentSoftBg[activity.accent],
        accentText[activity.accent],
      )}
      role="img"
      aria-label={`${activity.title} programme illustration; approved activity photography has not been added`}
    >
      <span className="absolute -left-12 top-8 h-32 w-32 rounded-full border-[18px] border-current/10" />
      <span className="absolute -bottom-10 -right-8 h-40 w-40 rotate-12 rounded-[2.5rem] bg-white/35" />
      <span className="absolute right-[16%] top-[18%] h-5 w-5 rotate-12 rounded-md bg-current/25" />
      <div className="relative flex flex-col items-center gap-3 rounded-3xl border border-white/70 bg-white/70 px-7 py-6 text-center shadow-sm backdrop-blur-sm">
        {failed ? (
          <ImageOff className="h-9 w-9" aria-hidden="true" />
        ) : (
          <Icon className="h-10 w-10" aria-hidden="true" />
        )}
        <span className="font-display text-sm font-bold uppercase tracking-[0.12em]">
          Programme overview
        </span>
      </div>
    </div>
  );
}

export function ActivityArchive({
  activities,
  selected,
  invalidSlug,
  openerRef,
  onOpen,
  onClose,
  onChange,
}: {
  activities: readonly PublicActivity[];
  selected: PublicActivity | undefined;
  invalidSlug?: string;
  openerRef: RefObject<HTMLButtonElement | null>;
  onOpen: (activity: PublicActivity, opener: HTMLButtonElement) => void;
  onClose: () => void;
  onChange: (activity: PublicActivity) => void;
}) {
  const currentIndex = selected
    ? activities.findIndex((activity) => activity.id === selected.id)
    : -1;
  const previous = currentIndex > 0 ? activities[currentIndex - 1] : undefined;
  const next =
    currentIndex >= 0 && currentIndex < activities.length - 1
      ? activities[currentIndex + 1]
      : undefined;

  useEffect(() => {
    if (!selected) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']") ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      if (event.key === "ArrowLeft" && previous) {
        event.preventDefault();
        onChange(previous);
      }
      if (event.key === "ArrowRight" && next) {
        event.preventDefault();
        onChange(next);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [next, onChange, previous, selected]);

  if (activities.length === 0) {
    return (
      <section className="paper-card border-swag-blue/30 p-7 text-center">
        <h2 className="text-xl font-bold text-swag-navy">No public activity entries yet</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Approved programme or event records can be added without changing this archive layout.
        </p>
      </section>
    );
  }

  return (
    <>
      {invalidSlug ? (
        <div
          className="mb-6 rounded-2xl border border-swag-orange/40 bg-swag-orange/5 px-5 py-4 text-sm leading-relaxed text-swag-navy"
          role="status"
        >
          That activity is not available. You can choose one of the public programme overviews
          below.
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {activities.map((activity) => (
          <article
            key={activity.id}
            className={cn(
              "paper-card group min-w-0 overflow-hidden",
              accentBorder[activity.accent],
            )}
          >
            <button
              type="button"
              data-activity-card={activity.slug}
              className="flex h-full w-full flex-col text-left"
              onClick={(event) => onOpen(activity, event.currentTarget)}
              aria-haspopup="dialog"
            >
              <div className="aspect-[4/3] w-full overflow-hidden border-b border-border/70">
                <ActivityArtwork activity={activity} mode="card" />
              </div>
              <div className="flex flex-1 flex-col p-5 sm:p-6">
                <p
                  className={cn(
                    "text-xs font-semibold uppercase tracking-[0.13em]",
                    accentText[activity.accent],
                  )}
                >
                  {activity.date ?? activity.typeLabel}
                </p>
                <h2 className="mt-2 text-xl font-bold leading-snug text-swag-navy">
                  {activity.title}
                </h2>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {activity.summary}
                </p>
                <span className="mt-5 inline-flex min-h-11 items-center gap-2 self-start font-semibold text-swag-navy">
                  View overview
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </div>
            </button>
          </article>
        ))}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && onClose()}>
        {selected ? (
          <DialogContent
            hideDefaultClose
            overlayClassName="bg-swag-navy/35 backdrop-blur-[2px]"
            className="left-3 right-3 top-3 max-h-[calc(100dvh-1.5rem)] w-auto max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-2xl border-swag-blue/30 bg-background p-0 shadow-2xl sm:left-1/2 sm:right-auto sm:top-1/2 sm:max-h-[min(88dvh,860px)] sm:w-[min(94vw,1180px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
            onCloseAutoFocus={(event) => {
              if (!openerRef.current) return;
              event.preventDefault();
              openerRef.current.focus({ preventScroll: true });
            }}
          >
            <div className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain sm:max-h-[min(88dvh,860px)]">
              <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-4 border-b border-border/80 bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-swag-blue">
                    Activity {String(currentIndex + 1).padStart(2, "0")} /{" "}
                    {String(activities.length).padStart(2, "0")}
                  </p>
                  <DialogTitle className="truncate font-display text-base font-bold text-swag-navy sm:text-lg">
                    {selected.title}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Programme details for {selected.title}
                  </DialogDescription>
                </div>
                <DialogClose className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-swag-navy transition-colors hover:border-swag-blue">
                  <X className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Close</span>
                  <span className="sr-only sm:hidden">Close activity</span>
                </DialogClose>
              </header>

              <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
                <div className="min-w-0 border-b border-border/80 bg-muted/40 p-3 sm:p-5 lg:border-b-0 lg:border-r lg:p-7">
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/80 bg-card shadow-sm">
                    <ActivityArtwork activity={selected} mode="detail" />
                  </div>
                  {selected.images[0]?.caption ? (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      {selected.images[0].caption}
                    </p>
                  ) : null}
                </div>

                <div className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-8">
                  <p
                    className={cn(
                      "text-xs font-semibold uppercase tracking-[0.13em]",
                      accentText[selected.accent],
                    )}
                  >
                    {selected.date ?? selected.typeLabel}
                  </p>
                  <h2 className="mt-2 break-words text-3xl font-bold leading-tight text-swag-navy sm:text-4xl">
                    {selected.title}
                  </h2>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {selected.summary}
                  </p>

                  <div className="mt-7 space-y-6">
                    {selected.sections.map((section) => (
                      <section key={section.heading}>
                        <h3 className="text-lg font-bold text-swag-navy">{section.heading}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {section.body}
                        </p>
                      </section>
                    ))}
                  </div>

                  <div className="mt-7 flex flex-wrap gap-2" aria-label="Activity tags">
                    {selected.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-swag-blue/20 bg-swag-blue/5 px-3 py-1.5 text-xs font-semibold text-swag-navy"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <nav
                className="grid grid-cols-2 gap-3 border-t border-border/80 bg-card/70 p-4 sm:p-5"
                aria-label="Activity archive"
              >
                <button
                  type="button"
                  disabled={!previous}
                  onClick={() => previous && onChange(previous)}
                  className="inline-flex min-h-12 min-w-0 items-center justify-start gap-2 rounded-xl border border-border bg-background px-3 text-left text-sm font-semibold text-swag-navy transition-colors hover:border-swag-blue disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{previous ? previous.title : "First activity"}</span>
                </button>
                <button
                  type="button"
                  disabled={!next}
                  onClick={() => next && onChange(next)}
                  className="inline-flex min-h-12 min-w-0 items-center justify-end gap-2 rounded-xl border border-border bg-background px-3 text-right text-sm font-semibold text-swag-navy transition-colors hover:border-swag-blue disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
                >
                  <span className="truncate">{next ? next.title : "Last activity"}</span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
              </nav>
              <p className="sr-only" aria-live="polite">
                Showing activity {currentIndex + 1} of {activities.length}: {selected.title}
              </p>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
