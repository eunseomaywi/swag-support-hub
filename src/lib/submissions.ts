import { getSupabaseClient } from "@/lib/supabase";

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
  const { error } = await getSupabaseClient()
    .from("peer_mentor_bookings")
    .insert({
      name: data.name.trim(),
      year_group: data.yearGroup,
      email: data.email.trim(),
      preferred_date: data.preferredDate,
      preferred_time: data.preferredTime,
      topic: data.topic,
      additional_info: data.additionalInfo.trim() || null,
    });

  if (error) throw new Error("Booking submission failed.");
}

export async function submitConcern(data: ConcernSubmission): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("concerns")
    .insert({
      is_anonymous: data.anonymous,
      name: data.anonymous ? null : data.name.trim(),
      year_group: data.yearGroup,
      email: data.email.trim() || null,
      category: data.about,
      feeling: data.feeling,
      details: data.details.trim(),
    });

  if (error) throw new Error("Concern submission failed.");
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
