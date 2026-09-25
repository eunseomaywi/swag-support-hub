import type { PublicActivity } from "./activities";

export type Newsletter = PublicActivity & {
  entryType: "newsletter";
  sourcePage: number;
  sourceLabel?: string;
  subtitle?: string;
  paragraphs: readonly string[];
  emphasizedParagraph?: number;
  contactText?: string;
  contactHref?: string;
};
export const newsletters: readonly Newsletter[] = [
  {
    id: "peer-mentoring",
    slug: "peer-mentoring",
    sourcePage: 1,
    sourceLabel: "Damian - peer mentor advertisement",
    title: "Learn Together, Grow Together",
    entryType: "newsletter",
    typeLabel: "SWAG Newsletter",
    summary:
      "Have you ever been feeling completely lost at something and cound not tell everything.",
    paragraphs: [
      "Have you ever been feeling completely lost at something and cound not tell everything.",
      "Peer mentor is here for you to resolve that. They will found out the way together and at some point you will encounter better version of yourself. You might be a peer mentor one day!",
      "Have a question, need some guidance, or simply want to learn more about peer mentoring? Don’t hesitate to reach out to us by email. Your next step toward a better version of yourself could start with just one message.",
    ],
    contactText: "📩 EmailMs.Mcgibbon! (kmcgibbon@nlcsjeju.kr)",
    contactHref: "mailto:kmcgibbon@nlcsjeju.kr",
    images: [
      {
        src: "/images/activities/newsletter/peer-mentoring.png",
        alt: "Two people helping each other climb steps above an open book.",
      },
    ],
    tags: ["PeerMentoring", "GrowTogether"],
    sections: [],
    sortOrder: 1,
    publicationStatus: "public",
    accent: "blue",
  },
  {
    id: "student-voice",
    slug: "student-voice",
    sourcePage: 2,
    title: "Looking for some inspiration?",
    subtitle: "Hear from young people as they share their own inspiring stories.",
    entryType: "newsletter",
    typeLabel: "SWAG Newsletter",
    summary: "Hear from young people as they share their own inspiring stories.",
    paragraphs: [
      "When we feel lost, we often need someone to guide us. When it’s hard to ask the people around us, or when you need advice from someone who has experienced same thing",
      "Student voice is here for you to share experiences from others. Anytime you feel lost, feel free to take 5 minutes before bed to listen",
    ],
    emphasizedParagraph: 1,
    images: [
      {
        src: "/images/activities/newsletter/student-voice.png",
        alt: "One person speaking through a megaphone while another person listens.",
      },
    ],
    tags: ["Wellbeing Hub", "Advice"],
    sections: [],
    sortOrder: 2,
    publicationStatus: "public",
    accent: "green",
  },
  {
    id: "wellbeing-tips",
    slug: "wellbeing-tips",
    sourcePage: 3,
    title: "Do you need advice on wellbeing?",
    subtitle: "How sources from wellbeing hub can help you",
    entryType: "newsletter",
    typeLabel: "SWAG Newsletter",
    summary: "How sources from wellbeing hub can help you",
    paragraphs: [
      "Many students agree that taking care of their well-being is important for a better school life. However, some people need simple tips to reduce stress, manage a heavy load of assessments and homework, and sleep well.",
      "Well-being Hub provides useful advice for your well-being! Resources on Academic, Physical Health, Sleep, and more can help you build healthy habits and manage school life. Find simple tips for studying, relaxing, and sleeping better—all in one place. Take a look and find what works best for you!",
    ],
    images: [
      {
        src: "/images/activities/newsletter/wellbeing-tips.png",
        alt: "Two hands holding a glowing light bulb surrounded by small decorative marks.",
      },
    ],
    tags: ["Tips", "Wellbeing"],
    sections: [],
    sortOrder: 3,
    publicationStatus: "public",
    accent: "pink",
  },
];
