import type { Accent } from "@/lib/accents";

/**
 * Placeholder content. Replace the entries below with real SWAG data
 * (or swap these arrays for a Lovable Cloud query later).
 */

export type Member = {
  id: string;
  name: string;
  role: string;
  year: string;
  photoUrl?: string;
  accent?: Accent;
};

const memberAccents: Accent[] = ["blue", "green", "pink", "orange", "purple"];

export const members: Member[] = Array.from({ length: 10 }, (_, i) => ({
  id: `member-${i + 1}`,
  name: "Name",
  role: "Role",
  year: "Year",
  accent: memberAccents[i % memberAccents.length]!,
}));

export type Mentor = {
  id: string;
  name: string;
  year: string;
  intro: string;
  photoUrl?: string;
  accent?: Accent;
};

export const peerMentors: Mentor[] = Array.from({ length: 4 }, (_, i) => ({
  id: `mentor-${i + 1}`,
  name: "Name",
  year: "Year",
  intro: "Short intro...",
  accent: memberAccents[i % memberAccents.length]!,
}));

export type Activity = {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  accent?: Accent;
};

export const activities: Activity[] = [
  {
    id: "wellbeing-week",
    title: "Wellbeing Week",
    description: "Activities that promote mental health and self-care.",
    accent: "blue",
  },
  {
    id: "awareness-campaigns",
    title: "Awareness Campaigns",
    description: "We raise awareness about important issues.",
    accent: "green",
  },
  {
    id: "peer-support",
    title: "Peer Support",
    description: "We support each other through peer mentoring.",
    accent: "pink",
  },
];
