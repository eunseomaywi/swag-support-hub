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
      titleClassName="text-4xl sm:text-5xl"
      introClassName="max-w-5xl text-base leading-7 text-swag-navy/70"
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

      <section className="mt-12 border-t border-border pt-9" aria-labelledby="support-links-title">
        <h2 id="support-links-title" className="text-3xl font-bold leading-tight text-swag-navy">
          How SWAG supports you
        </h2>
        <p className="mt-3 max-w-5xl text-base leading-7 text-swag-navy/70">
          Learn about peer support, share a concern with the authorised team, or discover the
          students and programmes behind SWAG.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 lg:flex lg:flex-nowrap">
          <SwagLinkButton to="/peer-mentor" className="w-full px-4 lg:w-auto">
            Peer Support
          </SwagLinkButton>
          <SwagLinkButton
            to="/form/concern"
            variant="secondary"
            className="w-full border-swag-pink/50 bg-swag-pink/10 px-4 text-swag-navy hover:border-swag-pink/70 hover:bg-swag-pink/15 hover:text-swag-navy lg:w-auto"
          >
            Share a Concern
          </SwagLinkButton>
          <SwagLinkButton
            to="/members"
            variant="secondary"
            className="w-full border-swag-green/50 bg-swag-green/10 px-4 text-swag-navy hover:border-swag-green/70 hover:bg-swag-green/15 hover:text-swag-navy lg:w-auto"
          >
            Meet the Members
          </SwagLinkButton>
          <SwagLinkButton
            to="/activities"
            variant="secondary"
            className="w-full border-swag-orange/55 bg-swag-orange/10 px-4 text-swag-navy hover:border-swag-orange/75 hover:bg-swag-orange/15 hover:text-swag-navy lg:w-auto"
          >
            Explore Activities
          </SwagLinkButton>
        </div>
      </section>
    </PageSection>
  );
}
