import { UserRound } from "lucide-react";
import { useState } from "react";
import type { PublicMember } from "@/content/members";
import { accentBorder, accentSoftBg, accentText } from "@/lib/accents";
import { cn } from "@/lib/utils";

function MemberPortrait({ member }: { member: PublicMember }) {
  const [failed, setFailed] = useState(false);
  const hasPhoto = member.photo && !failed;

  return (
    <div className="aspect-[4/5] w-full overflow-hidden rounded-2xl bg-muted">
      {hasPhoto ? (
        <img
          src={member.photo!}
          alt={member.photoAlt}
          width={480}
          height={600}
          loading="lazy"
          className="h-full w-full object-cover object-center"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center bg-gradient-to-br",
            accentSoftBg[member.accent],
            accentText[member.accent],
          )}
          role="img"
          aria-label={`Portrait space for SWAG member ${String(member.sortOrder).padStart(2, "0")}`}
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-current/15 bg-white/65 shadow-sm sm:h-24 sm:w-24">
            <UserRound className="h-9 w-9 sm:h-11 sm:w-11" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}

export function MemberGrid({ members }: { members: readonly PublicMember[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-2 lg:grid-cols-4">
      {members.map((member) => {
        const ready = member.publicationStatus === "ready";
        return (
          <article
            key={member.id}
            data-member-card
            className={cn(
              "paper-card min-w-0 overflow-hidden p-3 sm:p-4",
              accentBorder[member.accent],
            )}
          >
            <MemberPortrait member={member} />
            <div className="min-h-24 px-1 pb-1 pt-4 sm:min-h-28">
              {ready ? (
                <>
                  <h2 className="break-words text-base font-bold leading-snug text-swag-navy sm:text-lg">
                    {member.displayName}
                  </h2>
                  <p className="mt-1 text-sm leading-snug text-muted-foreground">
                    {member.roleLabel}
                  </p>
                  <p className="mt-1 text-sm leading-snug text-muted-foreground">
                    {member.yearGroup}
                  </p>
                </>
              ) : (
                <p className="font-display text-sm font-semibold tracking-[0.08em] text-swag-navy/65 sm:text-base">
                  MEMBER {String(member.sortOrder).padStart(2, "0")}
                </p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
