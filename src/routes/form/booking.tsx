import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageSection } from "@/components/PageSection";
import { FormStep } from "@/components/form/FormStep";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { ReviewList, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { BOOKING_TOPICS, YEAR_GROUPS, isEmail, type BookingSubmission } from "@/lib/submissions";

export const Route = createFileRoute("/form/booking")({
  head: () => ({
    meta: [
      { title: "Booking Form — Book a Peer Mentor Session" },
      {
        name: "description",
        content: "Request confidential support from a SWAG Peer Mentor in four short steps.",
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
  const [intakeState, setIntakeState] = useState<"checking" | "enabled" | "disabled">("checking");
  const [step, setStep] = useState(1);
  const [data, setData] = useState<BookingSubmission>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<{
    requestId: string;
    token: string;
    expiresAt: string;
  } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/peer-support/status", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { enabled?: boolean };
        if (active) setIntakeState(response.ok && body.enabled === true ? "enabled" : "disabled");
      })
      .catch(() => {
        if (active) setIntakeState("disabled");
      });
    return () => {
      active = false;
    };
  }, []);

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
      if (
        data.preferredDate &&
        data.preferredDate < new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
      ) {
        e["preferredDate"] = "Please choose today or a future date.";
      }
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
      if (!turnstileToken) throw new Error("security_check");
      const response = await fetch("/api/peer-support/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turnstileToken,
          studentName: data.name,
          yearGroup: data.yearGroup,
          contactEmail: data.email,
          category: data.topic,
          preferredDate: data.preferredDate,
          preferredTime: data.preferredTime,
          privateExplanation: data.additionalInfo,
        }),
      });
      const body = (await response.json()) as {
        requestId?: string;
        managementToken?: string;
        expiresAt?: string;
        error?: string;
      };
      if (!response.ok || !body.requestId || !body.managementToken || !body.expiresAt) {
        throw new Error(body.error || "submission_failed");
      }
      setResult({
        requestId: body.requestId,
        token: body.managementToken,
        expiresAt: body.expiresAt,
      });
    } catch {
      setSubmitError(
        "We couldn't submit your request. Check the form and security check, then try again.",
      );
      setTurnstileReset((value) => value + 1);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const back = () => setStep((s) => Math.max(1, s - 1));
  const managementLink = useMemo(
    () =>
      result && typeof window !== "undefined"
        ? `${window.location.origin}/peer-support/manage#token=${result.token}`
        : "",
    [result],
  );
  const handleToken = useCallback((token: string | null) => setTurnstileToken(token), []);
  const handleTurnstileError = useCallback(
    () => setSubmitError("The security check could not load. Please refresh and try again."),
    [],
  );

  async function copyLink() {
    if (!managementLink) return;
    await navigator.clipboard.writeText(managementLink);
    setCopied(true);
  }

  return (
    <PageSection
      title="Peer Support Request"
      intro="Ask for support from a Peer Mentor or SWAG Member. Submitting a request does not confirm a session time."
    >
      {intakeState === "checking" ? (
        <section className="paper-card mx-auto max-w-2xl border-swag-blue/35 p-6 text-center text-sm text-muted-foreground sm:p-8">
          Checking whether Peer Support requests are open…
        </section>
      ) : intakeState === "disabled" ? (
        <section
          className="paper-card mx-auto max-w-2xl border-swag-orange/45 p-6 text-center sm:p-8"
          aria-live="polite"
        >
          <h2 className="text-2xl font-bold text-swag-navy">
            Peer Support requests are not open yet
          </h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            The secure request service is ready for review, but approved staff monitoring is still
            being set up. Please use another SWAG support option for now.
          </p>
          <a
            href="/form"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-card px-5 text-sm font-semibold text-swag-navy"
          >
            View SWAG forms
          </a>
          <p className="mt-5 text-sm text-muted-foreground">
            This online service is not an emergency channel. If someone is in immediate danger,
            contact emergency services or a trusted adult now.
          </p>
        </section>
      ) : result ? (
        <section
          className="paper-card mx-auto max-w-2xl border-swag-green/45 p-6 sm:p-8"
          aria-live="polite"
        >
          <CheckCircle2 className="h-10 w-10 text-swag-green" aria-hidden="true" />
          <h2 className="mt-4 text-2xl font-bold text-swag-navy">Request received</h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            Your request is waiting for a Peer Mentor or SWAG Member to accept it. A match does not
            confirm an appointment; you will choose from their published times afterward.
          </p>
          <div className="mt-6 rounded-xl border border-swag-orange/35 bg-swag-orange/5 p-4">
            <h3 className="font-bold text-swag-navy">Save your private management link</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              This link is shown once. Anyone holding it can manage this request, so store it
              privately. It expires after 90 days.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />{" "}
                {copied ? "Copied" : "Copy private link"}
              </button>
              <a
                href={managementLink}
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-swag-navy"
              >
                Open request <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            This online form is not an emergency channel. If someone is in immediate danger, contact
            emergency services or a trusted adult now.
          </p>
        </section>
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
              <SelectField
                label="Preferred Time"
                options={["Break", "1st Lunch", "2nd Lunch"]}
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
                Please review your details. Your request enters a private matching queue; it is not
                a confirmed session.
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
              <TurnstileWidget
                resetKey={turnstileReset}
                onToken={handleToken}
                onError={handleTurnstileError}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                This online form is not an emergency channel. If someone is in immediate danger,
                contact emergency services or a trusted adult now.
              </p>
            </FormStep>
          )}
        </>
      )}
    </PageSection>
  );
}
