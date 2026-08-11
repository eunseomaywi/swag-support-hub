import { createFileRoute } from "@tanstack/react-router";
import { HandHeart, Heart, Users } from "lucide-react";
import { PageSection } from "@/components/PageSection";
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
    </PageSection>
  );
}
