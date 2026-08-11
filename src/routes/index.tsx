import { createFileRoute } from "@tanstack/react-router";
import { SwagLinkButton } from "@/components/SwagButton";

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
            <span className="relative inline-block text-swag-navy">
              SWAG!
              <span
                aria-hidden="true"
                className="absolute -bottom-1 left-1 h-1 w-[92%] -rotate-1 rounded-full bg-swag-blue/55"
              />
            </span>
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
        <div className="flex justify-center" aria-label="SWAG logo with hand-drawn decorations">
          <div className="relative flex aspect-square w-full max-w-sm items-center justify-center">
            <svg
              aria-hidden="true"
              viewBox="0 0 360 360"
              className="pointer-events-none absolute inset-0 h-full w-full"
              fill="none"
            >
              <path
                d="M275 64l3.5 10 9 3.5-9.5 3.2-4 9.8-3-9.6-9.5-3.8 9.8-3.3L275 64Z"
                stroke="var(--swag-orange)"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M63 239c-8-7-17 3-11 11 4 6 12 10 18 14 4-7 10-15 10-22-1-8-12-9-17-3Z"
                stroke="var(--swag-pink)"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M62 122c13-7 27-9 40-6 7 1 12 4 18 3"
                stroke="var(--swag-blue)"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M269 254c7 2 13 1 19-3"
                stroke="var(--swag-green)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="296" cy="157" r="2.7" fill="var(--swag-green)" />
              <path
                d="M104 291c5-3 9-3 13 0 4 2 8 2 12-1"
                stroke="var(--swag-navy)"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            <img
              src="/swag_logo.png"
              alt="SWAG — Student Welfare Action Group"
              width={500}
              height={499}
              className="relative z-10 h-auto w-[36%] object-contain"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
