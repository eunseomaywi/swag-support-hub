import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarDays, MessageCircle } from "lucide-react";
import { PageSection } from "@/components/PageSection";

export const Route = createFileRoute("/form/")({
  head: () => ({
    meta: [
      { title: "How can we help? — SWAG Forms" },
      {
        name: "description",
        content:
          "Request a peer support conversation or share a concern with SWAG. Choose the route that fits what you need.",
      },
      { property: "og:title", content: "How can we help? — SWAG" },
      {
        property: "og:description",
        content: "Request peer support or share a concern with the authorised SWAG team.",
      },
    ],
  }),
  component: FormHub,
});

function FormHub() {
  return (
    <PageSection
      title="How can we help?"
      intro="Peer Support is for requesting a student-to-student conversation. The Concern form shares information with authorised SWAG Members and Teachers so the right support can respond."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Link
          to="/form/booking"
          className="paper-card block border-swag-blue/40 p-8 text-center hover:-translate-y-0.5 hover:border-swag-blue"
        >
          <CalendarDays className="mx-auto h-8 w-8 text-swag-blue" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-swag-navy">Peer Support Request</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Ask for a peer conversation. Your request is not confirmed until the team finalises the
            arrangements.
          </p>
        </Link>
        <Link
          to="/form/concern"
          className="paper-card block border-swag-green/40 p-8 text-center hover:-translate-y-0.5 hover:border-swag-green"
        >
          <MessageCircle className="mx-auto h-8 w-8 text-swag-green" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-swag-navy">Concern Form</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Share a concern for review by authorised SWAG Members and Teachers.
          </p>
        </Link>
      </div>
    </PageSection>
  );
}
