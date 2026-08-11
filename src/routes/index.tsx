import { createFileRoute } from "@tanstack/react-router";
import { Heart, Smile, Sparkles } from "lucide-react";
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
            <span
              aria-hidden="true"
              className="absolute inset-[12%] rotate-2 rounded-[46%_54%_48%_52%] border border-swag-blue/25"
            />
            <span
              aria-hidden="true"
              className="absolute inset-[18%_8%_10%_18%] -rotate-3 rounded-[54%_46%_52%_48%] border border-swag-green/25"
            />
            <Sparkles
              aria-hidden="true"
              className="absolute right-[12%] top-[16%] h-7 w-7 rotate-12 text-swag-orange"
              strokeWidth={1.6}
            />
            <Heart
              aria-hidden="true"
              className="absolute bottom-[18%] left-[12%] h-6 w-6 -rotate-12 text-swag-pink"
              strokeWidth={1.6}
            />
            <Smile
              aria-hidden="true"
              className="absolute bottom-[13%] right-[17%] h-6 w-6 rotate-6 text-swag-green"
              strokeWidth={1.5}
            />
            <span
              aria-hidden="true"
              className="absolute left-[9%] top-[28%] h-px w-10 -rotate-12 bg-swag-blue/55"
            />
            <span
              aria-hidden="true"
              className="absolute right-[7%] top-1/2 h-px w-12 rotate-12 bg-swag-purple/45"
            />
            <img
              src="/favicon.png"
              alt="SWAG — Student Welfare Action Group"
              width={320}
              height={320}
              className="relative z-10 h-auto w-[36%] object-contain"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
