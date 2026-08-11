import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { PageSection } from "@/components/PageSection";
import { FormStep, SubmittedPanel } from "@/components/form/FormStep";
import { ReviewList, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import {
  BOOKING_TOPICS,
  YEAR_GROUPS,
  isEmail,
  submitBooking,
  type BookingSubmission,
} from "@/lib/submissions";

export const Route = createFileRoute("/form/booking")({
  head: () => ({
    meta: [
      { title: "Booking Form — Book a Peer Mentor Session" },
      {
        name: "description",
        content: "Book a session with a SWAG peer mentor in four short steps.",
      },
      { property: "og:title", content: "Book a Peer Mentor Session — SWAG" },
      { property: "og:description", content: "Book a session with a SWAG peer mentor." },
    ],
  }),
  component: BookingForm,
});

const TOTAL = 4;

const empty: BookingSubmission = {
  name: "",
  yearGroup: "",
  email: "",
  preferredDate: "",
  preferredTime: "",
  topic: "",
  additionalInfo: "",
};

function BookingForm() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<BookingSubmission>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  const set = (key: keyof BookingSubmission) => (value: string) =>
    setData((d) => ({ ...d, [key]: value }));

  function validate(current: number) {
    const e: Record<string, string> = {};
    if (current === 1) {
      if (!data.name.trim()) e["name"] = "Please enter your name.";
      if (!data.yearGroup) e["yearGroup"] = "Please choose your year group.";
      if (!isEmail(data.email)) e["email"] = "Please enter a valid email address.";
    }
    if (current === 2) {
      if (!data.preferredDate) e["preferredDate"] = "Please choose a date.";
      if (!data.preferredTime) e["preferredTime"] = "Please choose a time.";
      if (!data.topic) e["topic"] = "Please choose a topic.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function next() {
    if (submittingRef.current) return;
    if (!validate(step)) return;
    if (step < TOTAL) {
      setStep(step + 1);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      await submitBooking(data);
      setDone(true);
    } catch {
      setSubmitError("We couldn't submit your booking. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const back = () => setStep((s) => Math.max(1, s - 1));

  return (
    <PageSection
      title="Booking Form"
      intro="Book a session with one of our peer mentors. It only takes a minute."
    >
      {done ? (
        <SubmittedPanel message="Your booking has been submitted successfully." />
      ) : (
        <>
          {step === 1 && (
            <FormStep step={1} total={TOTAL} title="Your Details" onNext={next}>
              <TextField
                label="Name"
                value={data.name}
                onChange={(e) => set("name")(e.target.value)}
                error={errors["name"]}
                autoComplete="name"
              />
              <SelectField
                label="Year Group"
                options={YEAR_GROUPS}
                value={data.yearGroup}
                onChange={(e) => set("yearGroup")(e.target.value)}
                error={errors["yearGroup"]}
              />
              <TextField
                label="Email"
                type="email"
                value={data.email}
                onChange={(e) => set("email")(e.target.value)}
                error={errors["email"]}
                autoComplete="email"
              />
            </FormStep>
          )}

          {step === 2 && (
            <FormStep step={2} total={TOTAL} title="Session Details" onBack={back} onNext={next}>
              <TextField
                label="Preferred Date"
                type="date"
                value={data.preferredDate}
                onChange={(e) => set("preferredDate")(e.target.value)}
                error={errors["preferredDate"]}
              />
              <TextField
                label="Preferred Time"
                type="time"
                value={data.preferredTime}
                onChange={(e) => set("preferredTime")(e.target.value)}
                error={errors["preferredTime"]}
              />
              <SelectField
                label="Topic"
                options={BOOKING_TOPICS}
                value={data.topic}
                onChange={(e) => set("topic")(e.target.value)}
                error={errors["topic"]}
              />
            </FormStep>
          )}

          {step === 3 && (
            <FormStep step={3} total={TOTAL} title="Additional Info" onBack={back} onNext={next}>
              <TextAreaField
                label="Anything you'd like your mentor to know?"
                value={data.additionalInfo}
                onChange={(e) => set("additionalInfo")(e.target.value)}
                hint="Optional — share as much or as little as you like."
              />
            </FormStep>
          )}

          {step === 4 && (
            <FormStep
              step={4}
              total={TOTAL}
              title="Review"
              onBack={back}
              onNext={next}
              nextLabel="Submit"
              submitting={submitting}
              submitError={submitError}
            >
              <p className="text-sm text-muted-foreground">
                Please review your details before submitting.
              </p>
              <ReviewList
                items={[
                  { label: "Name", value: data.name },
                  { label: "Year Group", value: data.yearGroup },
                  { label: "Email", value: data.email },
                  { label: "Date", value: data.preferredDate },
                  { label: "Time", value: data.preferredTime },
                  { label: "Topic", value: data.topic },
                  { label: "Notes", value: data.additionalInfo },
                ]}
              />
            </FormStep>
          )}
        </>
      )}
    </PageSection>
  );
}
