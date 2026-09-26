import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { PageSection } from "@/components/PageSection";
import { ActivityArchive } from "@/components/public/ActivityArchive";
import { canonicalUrl } from "@/content/public-copy";
import { newsletters } from "@/content/newsletters";

type ActivitiesSearch = {
  newsletter?: string;
};

export const Route = createFileRoute("/activities")({
  validateSearch: (search: Record<string, unknown>): ActivitiesSearch => ({
    ...(typeof search["newsletter"] === "string" ? { newsletter: search["newsletter"] } : {}),
  }),
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
  const { newsletter: newsletterSlug } = Route.useSearch();
  const navigate = Route.useNavigate();
  const showNewsletters = __NEWSLETTER_ASSETS_READY__ || import.meta.env.DEV;
  const selectedNewsletter = newsletters.find((item) => item.slug === newsletterSlug);
  const newsletterOpener = useRef<HTMLButtonElement | null>(null);

  return (
    <PageSection
      title="Our Activities"
      intro="Explore the programmes SWAG supports across the school community. Approved event records and photography can be added to this archive over time."
    >
      {showNewsletters && (
        <section aria-labelledby="newsletter-heading">
          <h2 id="newsletter-heading" className="mb-6 text-3xl font-bold text-swag-navy">
            SWAG Newsletter
          </h2>
          <ActivityArchive
            activities={newsletters}
            selected={selectedNewsletter}
            openerRef={newsletterOpener}
            onOpen={(item, opener) => {
              newsletterOpener.current = opener;
              void navigate({ search: { newsletter: item.slug }, resetScroll: false });
            }}
            onChange={(item) => {
              void navigate({
                search: { newsletter: item.slug },
                replace: true,
                resetScroll: false,
              });
            }}
            onClose={() => {
              void navigate({ search: {}, replace: true, resetScroll: false });
            }}
          />
        </section>
      )}
    </PageSection>
  );
}
