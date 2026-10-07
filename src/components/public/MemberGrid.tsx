import type { PublicMember } from "@/content/members";
import { accentBorder } from "@/lib/accents";
import { cn } from "@/lib/utils";

function MemberPortrait({ member }: { member: PublicMember }) {
  return (
    <div className="aspect-[4/5] w-full overflow-hidden rounded-2xl bg-muted">
      <img
        src={member.photo}
        alt={member.photoAlt}
        width={420}
        height={600}
        loading={member.sortOrder <= 4 ? "eager" : "lazy"}
        className="h-full w-full object-cover object-center"
      />
    </div>
  );
}

export function MemberGrid({ members }: { members: readonly PublicMember[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-2 lg:grid-cols-4">
      {members.map((member) => {
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
              <h2 className="break-words text-sm font-bold leading-tight text-swag-navy sm:text-lg">
                {member.displayName}
              </h2>
              <p className="mt-1 text-sm leading-snug text-muted-foreground">
                {member.roleLabel} · {member.yearGroup}
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
