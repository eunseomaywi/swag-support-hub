import { useState } from "react";
import { RotateCcw, ArrowUpRight, MousePointer2 } from "lucide-react";
import { COLOURS, REGIONS, type PublicSignature } from "@/lib/charter/model";
import { useSignatures } from "@/lib/charter/useSignatures";
import { SignatureLogoWall } from "./SignatureLogoWall";
import { CharterSigningDialog } from "./CharterSigningDialog";
import "./charter.css";

export function CharterPage() {
  const { signatures, unavailable } = useSignatures();
  const [receipt, setReceipt] = useState<PublicSignature | null>(null),
    [replay, setReplay] = useState(0);
  return (
    <main className="charter-page" data-clarity-mask="true">
      <div className="charter-hero">
        <SignatureLogoWall signatures={signatures} receipt={receipt} replay={replay} />
        <header className="charter-hero-copy">
          <p className="charter-eyebrow">Kindness &amp; Respect Charter</p>
          <h1>
            Every promise
            <br />
            <em>leaves a mark.</em>
          </h1>
          <p className="charter-hero-description">
            Read our shared charter, add your signature, and watch it receive a SWAG colour before
            travelling into the matching part of our logo.
          </p>
          <div className="charter-palette">
            <span className="charter-palette-item">
              <span className="charter-palette-dots" aria-hidden="true">
                {REGIONS.map((region) => (
                  <i key={region} style={{ background: COLOURS[region] }} />
                ))}
              </span>
              Randomly assigned SWAG colour
            </span>
            <span className="charter-palette-item charter-motion-hint">
              <ArrowUpRight size={14} aria-hidden="true" />
              Move through the living logo
            </span>
          </div>
        </header>
        <div className="charter-dock">
          <p className="charter-interaction-note">
            <MousePointer2 size={16} aria-hidden="true" />
            Move across the signatures — every mark responds.
          </p>
          <div className="charter-dock-actions">
            <button
              type="button"
              className="charter-secondary"
              onClick={() => setReplay((value) => value + 1)}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Replay logo
            </button>
            <CharterSigningDialog onJoin={setReceipt} />
          </div>
        </div>
      </div>
      {unavailable ? (
        <p role="status" className="mx-auto max-w-6xl px-6 pb-4 text-sm text-muted-foreground">
          Community signatures are temporarily unavailable. The artwork will reconnect
          automatically.
        </p>
      ) : null}
    </main>
  );
}
