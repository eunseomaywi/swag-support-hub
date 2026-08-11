import { createFileRoute } from "@tanstack/react-router";
import { SwagLinkButton } from "@/components/SwagButton";
import heroIllustration from "@/assets/hero-student.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SWAG — Student Welfare Action Group, NLCS Jeju" },
      {
        name: "description",
        content:
          "SWAG is a student-led group at NLCS Jeju supporting wellbeing, inclusivity and peer support across our school community.",
      },
      { property: "og:title", content: "Welcome to SWAG — NLCS Jeju" },
      {
        property: "og:description",
        content: "Student-led wellbeing, peer mentoring and support at NLCS Jeju.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
      <div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
        <div>
          <h1 className="text-4xl font-bold leading-tight text-swag-navy sm:text-5xl">
            Welcome to
            <br />
            <span className="text-swag-blue">SWAG!</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            SWAG is here to support your wellbeing and help you thrive at school.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <SwagLinkButton to="/what-is-swag">Learn More</SwagLinkButton>
            <SwagLinkButton to="/form" variant="secondary">
              Get Involved
            </SwagLinkButton>
          </div>
        </div>
        <div className="flex justify-center">
          <img
            src={heroIllustration}
            alt="Illustration of a student waving with colourful painted handprints"
            width={900}
            height={900}
            className="w-full max-w-sm"
          />
        </div>
      </div>
    </main>
  );
}
