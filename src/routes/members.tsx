import { createFileRoute } from "@tanstack/react-router";
import { PageSection } from "@/components/PageSection";
import { MemberCard } from "@/components/cards";
import { members } from "@/data/swag";

export const Route = createFileRoute("/members")({
  head: () => ({
    meta: [
      { title: "Meet the SWAG Members" },
      {
        name: "description",
        content: "The students behind SWAG — our welfare action group members and their roles.",
      },
      { property: "og:title", content: "Meet the SWAG Members" },
      { property: "og:description", content: "The students behind SWAG and their roles." },
    ],
  }),
  component: Members,
});

function Members() {
  return (
    <PageSection
      title="Meet the SWAG Members"
      intro="Member names, roles and photos will be added here soon."
    >
      <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {members.map((m) => (
          <MemberCard
            key={m.id}
            name={m.name}
            role={m.role}
            year={m.year}
            {...(m.photoUrl ? { photoUrl: m.photoUrl } : {})}
            {...(m.accent ? { accent: m.accent } : {})}
          />
        ))}
      </div>
    </PageSection>
  );
}