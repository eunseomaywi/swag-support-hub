import type { LucideIcon } from "lucide-react";
import { ImageIcon, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { accentBorder, accentSoftBg, accentText, type Accent } from "@/lib/accents";

export function FeatureCard({
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
  return (
    <div className={cn("paper-card p-6 hover:-translate-y-0.5", accentBorder[accent])}>
      <span
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-lg",
          accentSoftBg[accent],
          accentText[accent],
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg font-bold text-swag-navy">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

export function MiniFeature({
  icon: Icon,
  label,
  accent = "blue",
}: {
  icon: LucideIcon;
  label: string;
  accent?: Accent;
}) {
  return (
    <div
      className={cn(
        "paper-card flex items-center gap-3 px-4 py-3 hover:-translate-y-0.5",
        accentBorder[accent],
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0", accentText[accent])} aria-hidden="true" />
      <span className="min-w-0 text-sm font-semibold text-swag-navy">{label}</span>
    </div>
  );
}

function PhotoPlaceholder({ label }: { label: string }) {
  return (
    <div
      className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-muted-foreground"
      role="img"
      aria-label={label}
    >
      <User className="h-9 w-9" aria-hidden="true" />
    </div>
  );
}

export function MemberCard({
  name,
  role,
  year,
  photoUrl,
  accent = "blue",
}: {
  name: string;
  role: string;
  year: string;
  photoUrl?: string;
  accent?: Accent;
}) {
  return (
    <article
      className={cn(
        "paper-card flex flex-col items-center p-6 text-center hover:-translate-y-0.5",
        accentBorder[accent],
      )}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          loading="lazy"
          className="h-20 w-20 rounded-full object-cover"
        />
      ) : (
        <PhotoPlaceholder label={`${name} photo placeholder`} />
      )}
      <h3 className="mt-4 text-base font-bold text-swag-navy">{name}</h3>
      <p className="text-sm text-muted-foreground">{role}</p>
      <p className="text-sm text-muted-foreground">{year}</p>
    </article>
  );
}

export function MentorCard({
  name,
  year,
  intro,
  photoUrl,
  accent = "pink",
}: {
  name: string;
  year: string;
  intro: string;
  photoUrl?: string;
  accent?: Accent;
}) {
  return (
    <article
      className={cn(
        "paper-card flex flex-col items-center p-6 text-center hover:-translate-y-0.5",
        accentBorder[accent],
      )}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          loading="lazy"
          className="h-20 w-20 rounded-full object-cover"
        />
      ) : (
        <PhotoPlaceholder label={`${name} photo placeholder`} />
      )}
      <h3 className="mt-4 text-base font-bold text-swag-navy">{name}</h3>
      <p className="text-sm text-muted-foreground">{year}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{intro}</p>
    </article>
  );
}

export function ActivityCard({
  title,
  description,
  imageUrl,
  accent = "blue",
}: {
  title: string;
  description: string;
  imageUrl?: string;
  accent?: Accent;
}) {
  return (
    <article
      className={cn(
        "paper-card overflow-hidden hover:-translate-y-0.5",
        accentBorder[accent],
      )}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={title}
          loading="lazy"
          className="h-40 w-full object-cover"
        />
      ) : (
        <div
          className="flex h-40 w-full items-center justify-center bg-muted text-muted-foreground"
          role="img"
          aria-label={`${title} photo coming soon`}
        >
          <ImageIcon className="h-8 w-8" aria-hidden="true" />
        </div>
      )}
      <div className="p-5 text-center">
        <h3 className="text-base font-bold text-swag-navy">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </article>
  );
}