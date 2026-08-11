/**
 * Single place where form submissions leave the app.
 * Today it only logs; swap the body for a Lovable Cloud insert later.
 */

export type BookingSubmission = {
  name: string;
  yearGroup: string;
  email: string;
  preferredDate: string;
  preferredTime: string;
  topic: string;
  additionalInfo: string;
};

export type ConcernSubmission = {
  anonymous: boolean;
  name: string;
  yearGroup: string;
  email: string;
  about: string;
  feeling: string;
  details: string;
};

export async function submitBooking(data: BookingSubmission): Promise<void> {
  console.info("[SWAG] booking submission", data);
  await new Promise((r) => setTimeout(r, 400));
}

export async function submitConcern(data: ConcernSubmission): Promise<void> {
  console.info("[SWAG] concern submission", data);
  await new Promise((r) => setTimeout(r, 400));
}

export const YEAR_GROUPS = [
  "Year 7",
  "Year 8",
  "Year 9",
  "Year 10",
  "Year 11",
  "Year 12",
  "Year 13",
];

export const BOOKING_TOPICS = [
  "Settling in",
  "Friendships",
  "School work & stress",
  "Wellbeing",
  "Something else",
];

export const CONCERN_TOPICS = [
  "Friendships",
  "Bullying",
  "School work & stress",
  "Wellbeing",
  "Something else",
];

export const FEELINGS = ["Okay", "A bit worried", "Struggling", "I'd rather not say"];

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());