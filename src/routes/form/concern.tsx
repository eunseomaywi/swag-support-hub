import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useRef, useState } from "react";
import { PageSection } from "@/components/PageSection";
import { FormStep, SubmittedPanel } from "@/components/form/FormStep";
import {
  CheckboxField,
  ReviewList,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/form/fields";
import {
  CONCERN_TOPICS,
  FEELINGS,
  YEAR_GROUPS,
  isEmail,
  submitConcern,
  type ConcernSubmission,
} from "@/lib/submissions";

export const Route = createFileRoute("/form/concern")({
  head: () => ({
    meta: [
      { title: "Concern Form — Share a Concern with SWAG" },
      {
        name: "description",
        content:
          "Share a concern with SWAG. You can stay anonymous, and everything you tell us is treated confidentially.",
      },
      { property: "og:title", content: "Share a Concern — SWAG" },
      { property: "og:description", content: "Tell us what's going on. You can stay anonymous." },
    ],
  }),
  component: ConcernForm,
});

const TOTAL = 4;

const empty: ConcernSubmission = {
  anonymous: false,
  name: "",
  yearGroup: "",
  email: "",
  about: "",
  feeling: "",
  details: "",
};

function ConcernForm() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<ConcernSubmission>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  function validate(current: number) {
    const e: Record<string, string> = {};
    if (current === 1) {
      if (!data.anonymous && !data.name.trim()) {
        e["name"] = "Please enter your name, or choose to stay anonymous.";
      }
      if (!data.yearGroup) e["yearGroup"] = "Please choose your year group.";
      if (data.email.trim() && !isEmail(data.email)) {
        e["email"] = "Please enter a valid email address.";
      }
    }
    if (current === 2) {
      if (!data.about) e["about"] = "Please choose what this is about.";
      if (!data.feeling) e["feeling"] = "Please let us know how you're feeling.";
    }
    if (current === 3 && !data.details.trim()) {
      e["details"] = "Please tell us a little more so we can help.";
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
      await submitConcern(data);
      setDone(true);
    } catch {
      setSubmitError("We couldn't submit your concern. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const back = () => setStep((s) => Math.max(1, s - 1));

  return (
    <PageSection
      title="Concern Form"
      intro={
        <span className="flex items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-swag-green" aria-hidden="true" />
          <span>
            Whatever you share stays between you and the SWAG team. You can stay anonymous if you'd
            prefer.
          </span>
        </span>
      }
    >
      {done ? (
        <SubmittedPanel message="Thank you. Your concern has been received. We'll be in touch." />
      ) : (
        <>
          {step === 1 && (
            <FormStep step={1} total={TOTAL} title="Your Details" onNext={next}>
              <CheckboxField
                label="I prefer to stay anonymous"
                checked={data.anonymous}
                onChange={(e) => setData((d) => ({ ...d, anonymous: e.target.checked }))}
              />
              <TextField
                label="Name"
                value={data.anonymous ? "" : data.name}
                disabled={data.anonymous}
                placeholder={data.anonymous ? "Anonymous" : ""}
                onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
                error={errors["name"]}
              />
              <SelectField
                label="Year Group"
                options={YEAR_GROUPS}
                value={data.yearGroup}
                onChange={(e) => setData((d) => ({ ...d, yearGroup: e.target.value }))}
                error={errors["yearGroup"]}
              />
              <TextField
                label="Email (optional)"
                type="email"
                value={data.email}
                onChange={(e) => setData((d) => ({ ...d, email: e.target.value }))}
                error={errors["email"]}
                hint="Only if you'd like a reply."
              />
            </FormStep>
          )}

          {step === 2 && (
            <FormStep step={2} total={TOTAL} title="About Your Concern" onBack={back} onNext={next}>
              <SelectField
                label="What is this about?"
                options={CONCERN_TOPICS}
                value={data.about}
                onChange={(e) => setData((d) => ({ ...d, about: e.target.value }))}
                error={errors["about"]}
              />
              <SelectField
                label="How are you feeling?"
                options={FEELINGS}
                value={data.feeling}
                onChange={(e) => setData((d) => ({ ...d, feeling: e.target.value }))}
                error={errors["feeling"]}
              />
            </FormStep>
          )}

          {step === 3 && (
            <FormStep step={3} total={TOTAL} title="Tell Us More" onBack={back} onNext={next}>
              <TextAreaField
                label="Please share more details"
                rows={7}
                value={data.details}
                onChange={(e) => setData((d) => ({ ...d, details: e.target.value }))}
                error={errors["details"]}
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
                  { label: "Name", value: data.anonymous ? "Anonymous" : data.name },
                  { label: "Year Group", value: data.yearGroup },
                  { label: "Email", value: data.email },
                  { label: "Concern", value: data.about },
                  { label: "Feeling", value: data.feeling },
                  { label: "Details", value: data.details },
                ]}
              />
            </FormStep>
          )}
        </>
      )}
    </PageSection>
  );
}
