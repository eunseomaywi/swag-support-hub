import { createFileRoute } from "@tanstack/react-router";
import { PageSection } from "@/components/PageSection";
import { MemberGrid } from "@/components/public/MemberGrid";
import { sortedPublicMembers } from "@/content/members";
import { canonicalUrl } from "@/content/public-copy";

export const Route = createFileRoute("/members")({
  head: () => ({
    meta: [
      { title: "Meet the SWAG Members" },
      {
        name: "description",
        content:
          "Meet the students who help make SWAG a welcoming, supportive part of school life.",
      },
      { property: "og:title", content: "Meet the SWAG Members" },
      { property: "og:description", content: "The students behind SWAG and their roles." },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/members") }],
  }),
  component: Members,
});

function Members() {
  return (
    <PageSection
      title="Meet the SWAG Members"
      intro="Meet the students who help make SWAG a welcoming, supportive part of school life."
    >
      <MemberGrid members={sortedPublicMembers} />
    </PageSection>
  );
}
