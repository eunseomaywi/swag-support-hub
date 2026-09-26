import type { Accent } from "@/lib/accents";

export type ActivityImage = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  caption?: string;
};

export type ActivitySection = {
  heading: string;
  body: string;
};

export type PublicActivity = {
  id: string;
  slug: string;
  entryType: "event" | "programme" | "newsletter";
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
