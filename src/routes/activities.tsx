import { createFileRoute } from "@tanstack/react-router";
import { PageSection } from "@/components/PageSection";
import { ActivityCard } from "@/components/cards";
import { activities } from "@/data/swag";

export const Route = createFileRoute("/activities")({
  head: () => ({
    meta: [
      { title: "Our Activities — SWAG" },
      {
        name: "description",
        content:
          "Wellbeing Week, awareness campaigns and peer support — the activities SWAG runs across the school year.",
      },
      { property: "og:title", content: "Our Activities — SWAG" },
      {
        property: "og:description",
        content: "Wellbeing Week, awareness campaigns and peer support.",
      },
    ],
  }),
  component: Activities,
});

function Activities() {
  return (
    <PageSection
      title="Our Activities"
      intro="A look at what SWAG runs through the year. Photos and details will be added as activities take place."
    >
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {activities.map((a) => (
          <ActivityCard
            key={a.id}
            title={a.title}
            description={a.description}
            {...(a.imageUrl ? { imageUrl: a.imageUrl } : {})}
            {...(a.accent ? { accent: a.accent } : {})}
          />
        ))}
      </div>
    </PageSection>
  );
}
