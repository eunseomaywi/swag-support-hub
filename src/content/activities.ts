import type { Accent } from "@/lib/accents";

export type ActivityImage = {
  src: string;
  alt: string;
  caption?: string;
};

export type ActivitySection = {
  heading: string;
  body: string;
};

export type PublicActivity = {
  id: string;
  slug: string;
  entryType: "event" | "programme";
  title: string;
  summary: string;
  date?: string;
  typeLabel: string;
  images: readonly ActivityImage[];
  sections: readonly ActivitySection[];
  tags: readonly string[];
  sortOrder: number;
  publicationStatus: "public";
  accent: Accent;
};

/**
 * These are programme overviews based on the existing public SWAG copy. They
 * are not presented as completed or dated events. Add only approved records.
 */
export const publicActivities: readonly PublicActivity[] = [
  {
    id: "wellbeing-week",
    slug: "wellbeing-week",
    entryType: "programme",
    title: "Wellbeing Week",
    typeLabel: "Programme overview",
    summary: "A programme focused on everyday wellbeing and self-care in the school community.",
    images: [],
    sections: [
      {
        heading: "What this involves",
        body: "Activities and messages that encourage students to pause, look after their wellbeing, and make space for supportive conversations.",
      },
      {
        heading: "Why we do it",
        body: "To keep practical wellbeing and self-care visible as part of everyday school life.",
      },
    ],
    tags: ["Wellbeing", "Self-care"],
    sortOrder: 1,
    publicationStatus: "public",
    accent: "blue",
  },
  {
    id: "awareness-campaigns",
    slug: "awareness-campaigns",
    entryType: "programme",
    title: "Awareness Campaigns",
    typeLabel: "Programme overview",
    summary: "Student-focused campaigns that bring attention to issues connected to welfare.",
    images: [],
    sections: [
      {
        heading: "What this involves",
        body: "Clear, accessible information that helps the school community notice and talk about important welfare topics.",
      },
      {
        heading: "Why we do it",
        body: "To make helpful information easier to find and encourage thoughtful conversations across the community.",
      },
    ],
    tags: ["Awareness", "Community"],
    sortOrder: 2,
    publicationStatus: "public",
    accent: "green",
  },
  {
    id: "peer-support",
    slug: "peer-support",
    entryType: "programme",
    title: "Peer Support",
    typeLabel: "Programme overview",
    summary:
      "A student-to-student route for requesting a conversation about school life or wellbeing.",
    images: [],
    sections: [
      {
        heading: "What this involves",
        body: "Students can request a conversation with a Peer Mentor or SWAG Member and suggest the school-day periods when they are available.",
      },
      {
        heading: "Why we do it",
        body: "To provide a clear way to ask for peer support while keeping Teacher handover available when it is needed.",
      },
    ],
    tags: ["Peer Support", "Student support"],
    sortOrder: 3,
    publicationStatus: "public",
    accent: "pink",
  },
];

export const sortedPublicActivities = [...publicActivities]
  .filter((activity) => activity.publicationStatus === "public")
  .sort((left, right) => left.sortOrder - right.sortOrder);

export function findPublicActivity(slug: string | undefined) {
  return slug ? sortedPublicActivities.find((activity) => activity.slug === slug) : undefined;
}
