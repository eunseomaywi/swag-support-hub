import "./charter.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { charterSections } from "@/content/charter";
import {
  CHARTER_VERSION,
  COLOURS,
  COLOUR_LABELS,
  REGIONS,
  validateStrokes,
  type PublicSignature,
  type Strokes,
} from "@/lib/charter/model";
import { SignaturePad } from "./SignaturePad";

function CharterReading({ onRead }: { onRead: () => void }) {
  const scroll = useRef<HTMLDivElement>(null),
    end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = scroll.current,
      marker = end.current;
    if (!root || !marker) return;
    const check = () => {
      const r = root.getBoundingClientRect(),
        m = marker.getBoundingClientRect();
      if (r.height > 0 && m.top >= r.top - 1 && m.bottom <= r.bottom + 2) onRead();
    };
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.9)) onRead();
            },
            { root, threshold: 0.9 },
          )
        : null;
    observer?.observe(marker);
    const resize = new ResizeObserver(check);
    resize.observe(root);
    resize.observe(marker);
    root.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    const frame = requestAnimationFrame(check);
    return () => {
      observer?.disconnect();
      resize.disconnect();
      root.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      cancelAnimationFrame(frame);
    };
  }, [onRead]);
  return (
    <div
      ref={scroll}
      className="charter-reading"
      tabIndex={0}
      aria-label="Kindness and respect charter"
    >
      <div className="charter-columns">
        {charterSections.map((section) => (
          <section
            key={section.title}
            className={`charter-promise-card ${section.title.toLowerCase()}`}
          >
            <h3>{section.title}</h3>
            <ol>
              {section.promises.map(([title, copy], i) => (
                <li key={title}>
                  <span className="charter-promise-number" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h4>{title}</h4>
                    <p>{copy}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <div ref={end} data-charter-end className="charter-end-marker">
        Together, we uphold kindness and respect.
      </div>
    </div>
  );
}
export function CharterSigningDialog({ onJoin }: { onJoin: (signature: PublicSignature) => void }) {
  const [open, setOpen] = useState(false),
    [step, setStep] = useState<"read" | "sign" | "complete">("read");
  const [read, setRead] = useState(false),
    [agree, setAgree] = useState(false),
    [consent, setConsent] = useState(false);
  const [strokes, setStrokes] = useState<Strokes>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null),
    [resetKey, setResetKey] = useState(0),
    [result, setResult] = useState<PublicSignature | null>(null);
  const submissionId = useRef<string | null>(null),
    ready = useRef<Promise<void> | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const scrollPosition = useRef({ x: 0, y: 0 });
  const markRead = useCallback(() => setRead(true), []);
  const securityError = useCallback(
    () => setError("The security check could not load. Please reopen this window to retry."),
    [],
  );
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [step, open]);
  function beginSession() {
    ready.current = fetch("/api/charter/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).then(async (response) => {
      if (!response.ok) throw new Error("Signing is temporarily unavailable. Please try again.");
    });
    void ready.current.catch(() => {});
  }
  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      scrollPosition.current = { x: window.scrollX, y: window.scrollY };
      setError("");
      beginSession();
    }
  }
  function changeStrokes(next: Strokes) {
    setStrokes(next);
    submissionId.current = null;
    setError("");
  }
  async function submit() {
    if (busy || !consent || !agree || !read) return;
    setError("");
    try {
      validateStrokes(strokes);
      let last = 0;
      try {
        last = Number(localStorage.getItem("swag-charter-last") || 0);
      } catch {
        /* Storage is optional. */
      }
      if (!submissionId.current && Date.now() - last < 60_000)
        throw new Error("Please wait a minute before adding another mark.");
      if (!token) throw new Error("Please complete the security check.");
      setBusy(true);
      if (!ready.current) beginSession();
      await ready.current;
      submissionId.current ??= crypto.randomUUID();
      const response = await fetch("/api/charter/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_submission_id: submissionId.current,
          charter_version: CHARTER_VERSION,
          strokes,
          consent: true,
          turnstileToken: token,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Please try again. Your drawing is still here.");
      if (!REGIONS.includes(body.region_id) || typeof body.id !== "string")
        throw new Error("We could not confirm your signature. Please retry.");
      setResult({ id: body.id, region_id: body.region_id, created_at: body.created_at, strokes });
      try {
        localStorage.setItem("swag-charter-last", String(Date.now()));
      } catch {
        /* Storage is optional. */
      }
      setStep("complete");
    } catch (error) {
      setError(error instanceof Error ? error.message : "We could not connect. Please retry.");
      ready.current = null;
      setResetKey((k) => k + 1);
      setToken(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <button ref={trigger} type="button" className="charter-primary">
          Read &amp; sign the charter
        </button>
      </DialogTrigger>
      <DialogContent
        className={`charter-dialog charter-dialog-${step}`}
        data-clarity-mask="true"
        overlayClassName="bg-swag-navy/30 backdrop-blur-sm"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus({ preventScroll: true });
          window.scrollTo(scrollPosition.current.x, scrollPosition.current.y);
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <div className="charter-dialog-heading pr-6">
          <p className="charter-eyebrow">SWAG community promise</p>
          <DialogTitle ref={heading} tabIndex={-1} className="text-2xl text-swag-navy">
            {step === "read"
              ? "Kindness & Respect Charter"
              : step === "sign"
                ? "Leave your mark."
                : "You are part of the mark."}
          </DialogTitle>
          <DialogDescription className="mt-2">
            {step === "read"
              ? "Read our shared promises, then add your signature."
              : step === "sign"
                ? "A small mark. A shared promise."
                : "Your signature has been assigned a SWAG colour and placed in the matching part of the logo."}
          </DialogDescription>
        </div>
        {step === "read" ? (
          <>
            <h2 className="charter-dialog-intro">
              How we choose to treat <em>one another.</em>
            </h2>
            <CharterReading onRead={markRead} />
            <div className="charter-agreement">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0"
                  checked={agree}
                  disabled={!read}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                I have read the charter and will help uphold kindness and respect in our community.
              </label>
              <button
                type="button"
                className="charter-primary w-full"
                disabled={!read || !agree}
                onClick={() => setStep("sign")}
              >
                Continue
              </button>
            </div>
          </>
        ) : null}
        {step === "sign" ? (
          <div className="charter-sign-content">
            <SignaturePad value={strokes} onChange={changeStrokes} disabled={busy} />
            <label className="my-4 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0"
                checked={consent}
                disabled={busy}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I agree to add this signature to the shared SWAG artwork.
            </label>
            <TurnstileWidget
              action="charter_signing"
              resetKey={resetKey}
              onToken={setToken}
              onError={securityError}
            />
            <p className="my-3 text-xs text-muted-foreground">
              Your mark appears here immediately. Staff review signatures before they become visible
              to everyone.
            </p>
            {error ? (
              <p role="alert" className="my-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              className="charter-primary w-full"
              disabled={busy || !consent || !strokes.length || !token}
              onClick={() => void submit()}
            >
              {busy ? "Adding your signature…" : "Add my signature"}
            </button>
          </div>
        ) : null}
        {step === "complete" && result ? (
          <div className="py-5 text-center">
            <div
              className="mx-auto mb-5 h-20 w-20 rounded-full shadow-sm"
              style={{ background: COLOURS[result.region_id] }}
              aria-hidden="true"
            />
            <p className="mb-7 font-semibold">Your colour: {COLOUR_LABELS[result.region_id]}</p>
            <button
              type="button"
              className="charter-primary"
              onClick={() => {
                setOpen(false);
                onJoin(result);
              }}
            >
              Watch my signature join
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
