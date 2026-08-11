import { createFileRoute } from "@tanstack/react-router";
import { Heart, Lock, Sparkles, Users } from "lucide-react";
import { PageSection } from "@/components/PageSection";
import { MentorCard, MiniFeature } from "@/components/cards";
import { mentors } from "@/data/swag";

export const Route = createFileRoute("/peer-mentor")({
  head: () => ({
    meta: [
      { title: "Peer Mentor — SWAG" },
      {
        name: "description",
        content:
          "Need someone to talk to? SWAG peer mentors offer confidential, student-to-student support.",
      },
      { property: "og:title", content: "Peer Mentor — SWAG" },
      {
        property: "og:description",
        content: "Confidential, student-to-student support from trained peer mentors.",
      },
    ],
  }),
  component: PeerMentor,
});

function PeerMentor() {
  return (
    <PageSection
      title="Peer Mentor"
      intro="Need someone to talk to? Our peer mentors are here for you."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MiniFeature icon={Users} label="Student to Student" accent="blue" />
        <MiniFeature icon={Lock} label="Confidential & Safe" accent="green" />
        <MiniFeature icon={Heart} label="Supportive & Kind" accent="pink" />
        <MiniFeature icon={Sparkles} label="Here for Everyone" accent="purple" />
      </div>

      <h2 className="mt-14 text-2xl font-bold text-swag-navy">Meet the Peer Mentors</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {mentors.map((m) => (
          <MentorCard
            key={m.id}
            name={m.name}
            year={m.year}
            intro={m.intro}
            {...(m.photoUrl ? { photoUrl: m.photoUrl } : {})}
            {...(m.accent ? { accent: m.accent } : {})}
          />
        ))}
      </div>
    </PageSection>
  );
}