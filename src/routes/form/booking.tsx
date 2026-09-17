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
        content: "Request a private peer-support conversation from SWAG in four short steps.",
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
  preferredPeriods: [],
  topic: "",
  additionalInfo: "",
};

function BookingForm() {
  const [intakeState, setIntakeState] = useState<"checking" | "enabled" | "disabled">("checking");
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [step, setStep] = useState(1);
  const [data, setData] = useState<BookingSubmission>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const submissionKeyRef = useRef(crypto.randomUUID());
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<{
    requestId: string;
    token: string;
    expiresAt: string;
  } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [copied, setCopied] = useState(false);
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/peer-support/status", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as {
          enabled?: boolean;
          email?: { configured?: boolean };
        };
        if (active) setIntakeState(response.ok && body.enabled === true ? "enabled" : "disabled");
        if (active) setEmailConfigured(body.email?.configured === true);
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
      if (data.preferredPeriods.length === 0)
        e["preferredPeriods"] = "Please choose at least one time.";
      if (!data.topic) e["topic"] = "Please choose a topic.";
    }
    if (current === 3 && !data.additionalInfo.trim()) {
      e["additionalInfo"] = "Please tell us briefly what you would like to talk about.";
    }
    if (current === 4 && !consented) {
      e["consent"] = "Please confirm that you understand who can review this request.";
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
          submissionKey: submissionKeyRef.current,
          studentName: data.name,
          yearGroup: data.yearGroup,
          contactEmail: data.email,
          category: data.topic,
          preferredDate: data.preferredDate,
          preferredPeriods: data.preferredPeriods,
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
          <h2 className="mt-4 text-2xl font-bold text-swag-navy">
            Request received — waiting for a mentor.
          </h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            Your request is waiting for a Peer Mentor or SWAG Member to confirm one of the times you
            selected.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {emailConfigured
              ? "When the appointment is confirmed, details will be sent to the email address you entered."
              : "Confirmation email delivery is not configured yet. Staff will only confirm appointments after the approved service is ready."}
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
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-swag-navy">
                  Available times
                </legend>
                <p className="mb-3 text-xs text-muted-foreground">
                  Choose every period you can attend.
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["break", "Break"],
                      ["lunch_1", "1st Lunch"],
                      ["lunch_2", "2nd Lunch"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-swag-navy focus-within:border-swag-blue"
                    >
                      <input
                        type="checkbox"
                        checked={data.preferredPeriods.includes(value)}
                        onChange={(event) =>
                          setData((current) => ({
                            ...current,
                            preferredPeriods: event.target.checked
                              ? [...current.preferredPeriods, value]
                              : current.preferredPeriods.filter((period) => period !== value),
                          }))
                        }
                        className="h-4 w-4"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {errors["preferredPeriods"] && (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {errors["preferredPeriods"]}
                  </p>
                )}
              </fieldset>
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
                label="What would you like to talk about?"
                value={data.additionalInfo}
                onChange={(e) => set("additionalInfo")(e.target.value)}
                hint="Required. Keep it brief; do not use this form for emergencies."
                error={errors["additionalInfo"]}
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
                  {
                    label: "Available times",
                    value: data.preferredPeriods
                      .map(
                        (period) =>
                          ({ break: "Break", lunch_1: "1st Lunch", lunch_2: "2nd Lunch" })[period],
                      )
                      .join(", "),
                  },
                  { label: "Topic", value: data.topic },
                  { label: "Notes", value: data.additionalInfo },
                ]}
              />
              <TurnstileWidget
                resetKey={turnstileReset}
                onToken={handleToken}
                onError={handleTurnstileError}
              />
              <label className="flex items-start gap-3 rounded-xl border border-swag-blue/30 bg-swag-blue/5 p-4 text-sm leading-relaxed text-swag-navy">
                <input
                  type="checkbox"
                  checked={consented}
                  onChange={(event) => setConsented(event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <span>
                  I understand that this request can be reviewed by approved Peer Mentors, approved
                  SWAG Members, and the responsible Teacher so that support can be arranged. It is
                  not visible to public website visitors, but SWAG cannot promise absolute
                  confidentiality. Peer Support is not therapy or professional counselling.
                </span>
              </label>
              {errors["consent"] && (
                <p role="alert" className="text-sm text-destructive">
                  {errors["consent"]}
                </p>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Entering an email in the expected school format does not by itself verify your
                identity.
              </p>
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
