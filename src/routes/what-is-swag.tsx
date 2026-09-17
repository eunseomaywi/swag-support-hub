import { createFileRoute } from "@tanstack/react-router";
import { HandHeart, Heart, Users } from "lucide-react";
import { PageSection } from "@/components/PageSection";
import { SwagLinkButton } from "@/components/SwagButton";
import { FeatureCard } from "@/components/cards";

export const Route = createFileRoute("/what-is-swag")({
  head: () => ({
    meta: [
      { title: "What is SWAG? — Student Welfare Awareness Group" },
      {
        name: "description",
        content:
          "SWAG (Student Welfare Awareness Group) is a student-led initiative supporting wellbeing, inclusivity and support within our school community.",
      },
      { property: "og:title", content: "What is SWAG?" },
      {
        property: "og:description",
        content: "A student-led initiative for wellbeing, inclusivity and support.",
      },
    ],
  }),
  component: WhatIsSwag,
});

function WhatIsSwag() {
  return (
    <PageSection
      title="What is SWAG?"
      intro="SWAG (Student Welfare Awareness Group) is a student-led initiative supporting wellbeing, inclusivity and support within our school community."
    >
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard
          icon={HandHeart}
          accent="blue"
          title="Support"
          description="We're here to listen and help."
        />
        <FeatureCard
          icon={Heart}
          accent="green"
          title="Wellbeing"
          description="We promote positive mental health."
        />
        <FeatureCard
          icon={Users}
          accent="pink"
          title="Community"
          description="We connect students and create change."
        />
      </div>

      <section className="mt-14 border-t border-border pt-9" aria-labelledby="support-links-title">
        <h2 id="support-links-title" className="text-2xl font-bold text-swag-navy">
          How SWAG supports you
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Learn about peer support, share a concern with the authorised team, or discover the
          students and programmes behind SWAG.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <SwagLinkButton to="/peer-mentor">Peer Support</SwagLinkButton>
          <SwagLinkButton to="/form/concern" variant="secondary">
            Share a Concern
          </SwagLinkButton>
          <SwagLinkButton to="/members" variant="secondary">
            Meet the Members
          </SwagLinkButton>
          <SwagLinkButton to="/activities" variant="secondary">
            Explore Activities
          </SwagLinkButton>
        </div>
      </section>
    </PageSection>
  );
}
