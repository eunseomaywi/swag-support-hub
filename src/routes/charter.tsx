import { createFileRoute } from "@tanstack/react-router";
import { CharterPage } from "@/components/charter/CharterPage";
export const Route = createFileRoute("/charter")({
  head: () => ({
    meta: [
      { title: "Kindness & Respect Charter — SWAG" },
      {
        name: "description",
        content:
          "Read the SWAG Kindness & Respect Charter, add your signature, and become part of our shared community artwork.",
      },
    ],
    links: [{ rel: "canonical", href: "https://nlcsswag.com/charter" }],
  }),
  component: CharterPage,
});
