import { createFileRoute } from "@tanstack/react-router";
import { SwagLinkButton } from "@/components/SwagButton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SWAG — Student Welfare Awareness Group, NLCS Jeju" },
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
          <div
            className="relative flex aspect-square w-full max-w-sm items-center justify-center"
            style={{ width: "100%", maxWidth: "24rem", aspectRatio: "1 / 1" }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 360 360"
              className="pointer-events-none absolute inset-0 h-full w-full"
              fill="none"
            >
              <path
                d="M278 54c5 0 6 12 10 16 4 3 15-1 18 4 3 5-8 11-11 16-2 5 5 14 0 18-5 4-13-7-18-8-5-1-13 8-18 4-5-4 1-14-1-19-2-5-13-9-10-15 3-6 15-1 19-4 4-3 5-16 10-16Z"
                fill="var(--swag-orange)"
                opacity="0.88"
              />
              <path
                d="M61 119c6-15 25-23 40-17 17 6 23 27 14 41-8 13-29 16-40 5-9-9-6-25 4-31 8-5 20-1 21 8 1 7-7 13-13 10"
                stroke="var(--swag-blue)"
                strokeWidth="9"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.76"
              />
              <path
                d="M291 154c-9 2-13 9-7 15 6 5 16-4 21 1 5 6-8 12-5 20"
                stroke="var(--swag-pink)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.8"
              />
              <path
                d="M276 258c5-3 9 3 13 2 5-1 7-8 12-6 5 3 1 10 3 14 2 5 10 7 8 12-2 6-11 3-16 5-5 2-6 11-12 10-6-1-5-10-9-13-4-4-13-2-14-8-1-6 9-10 15-16Z"
                fill="var(--swag-green)"
                opacity="0.82"
              />
              <path
                d="M62 267c7-7 13 8 20 1 7-8 13 8 20 0 6-6 12 4 18 2"
                stroke="var(--swag-blue)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.68"
              />
            </svg>
            <img
              src="/swag_logo.png"
              alt="SWAG — Student Welfare Awareness Group"
              width={500}
              height={499}
              loading="eager"
              decoding="sync"
              className="relative z-10 h-auto w-[36%] object-contain"
              style={{ width: "36%", height: "auto", aspectRatio: "500 / 499" }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
