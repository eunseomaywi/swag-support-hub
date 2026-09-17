import { createFileRoute } from "@tanstack/react-router";
import { Heart, Lock, Sparkles, Users } from "lucide-react";
import { PageSection } from "@/components/PageSection";
import { SwagLinkButton } from "@/components/SwagButton";
import { MentorCard, MiniFeature } from "@/components/cards";
import { peerMentors } from "@/data/swag";

export const Route = createFileRoute("/peer-mentor")({
  head: () => ({
    meta: [
      { title: "Peer Support — SWAG" },
      {
        name: "description",
        content:
          "Learn how to request a student-to-student conversation through SWAG peer support.",
      },
      { property: "og:title", content: "Peer Support — SWAG" },
      {
        property: "og:description",
        content: "A student-to-student route for requesting a supportive conversation.",
      },
    ],
  }),
  component: PeerMentor,
});

function PeerMentor() {
  return (
    <PageSection
      title="Peer Support"
      intro="Need someone to talk to? Our peer mentors are here for you."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MiniFeature icon={Users} label="Student to Student" accent="blue" />
        <MiniFeature icon={Lock} label="Handled with Care" accent="green" />
        <MiniFeature icon={Heart} label="Supportive & Kind" accent="pink" />
        <MiniFeature icon={Sparkles} label="Here for Everyone" accent="purple" />
      </div>

      <section className="mt-8 rounded-2xl border border-swag-blue/30 bg-card p-5 sm:p-6">
        <h2 className="text-xl font-bold text-swag-navy">Requesting peer support</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          A request tells the SWAG team that you would like a conversation. It is not a confirmed
          appointment: a mentor and the designated Teacher must confirm the school-day time and
          arrangements separately. If requests are currently closed, the form will say so before you
          submit anything.
        </p>
        <SwagLinkButton to="/form/booking" className="mt-5">
          Check Peer Support Request
        </SwagLinkButton>
      </section>

      <h2 className="mt-14 text-2xl font-bold text-swag-navy">Meet the Peer Mentors</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {peerMentors.map((m) => (
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
