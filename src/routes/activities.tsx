import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { PageSection } from "@/components/PageSection";
import { ActivityArchive } from "@/components/public/ActivityArchive";
import {
  findPublicActivity,
  sortedPublicActivities,
  type PublicActivity,
} from "@/content/activities";
import { canonicalUrl } from "@/content/public-copy";

type ActivitiesSearch = {
  activity?: string;
};

export const Route = createFileRoute("/activities")({
  validateSearch: (search: Record<string, unknown>): ActivitiesSearch =>
    typeof search["activity"] === "string" ? { activity: search["activity"] } : {},
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
    links: [{ rel: "canonical", href: canonicalUrl("/activities") }],
  }),
  component: Activities,
});

function Activities() {
  const { activity: activitySlug } = Route.useSearch();
  const navigate = Route.useNavigate();
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const selected = findPublicActivity(activitySlug);

  const selectActivity = (activity: PublicActivity, replace: boolean) => {
    void navigate({
      search: { activity: activity.slug },
      replace,
      resetScroll: false,
    });
  };

  return (
    <PageSection
      title="Our Activities"
      intro="Explore the programmes SWAG supports across the school community. Approved event records and photography can be added to this archive over time."
    >
      <ActivityArchive
        activities={sortedPublicActivities}
        selected={selected}
        {...(activitySlug && !selected ? { invalidSlug: activitySlug } : {})}
        openerRef={openerRef}
        onOpen={(activity, opener) => {
          openerRef.current = opener;
          selectActivity(activity, false);
        }}
        onChange={(activity) => selectActivity(activity, true)}
        onClose={() => {
          void navigate({ search: {}, replace: true, resetScroll: false });
        }}
      />
    </PageSection>
  );
}
