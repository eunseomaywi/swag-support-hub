import { useEffect, useRef, useState } from "react";
import { createClientOnlyFn } from "@tanstack/react-start";
import type { SignatureAnimation } from "@/lib/charter/animation.client";
import type { PublicSignature } from "@/lib/charter/model";
import { SwagLogoMask } from "./SwagLogoMask";
const loadAnimation = createClientOnlyFn(() => import("@/lib/charter/animation.client"));

export function SignatureLogoWall({
  signatures,
  receipt,
  replay,
}: {
  signatures: PublicSignature[];
  receipt: PublicSignature | null;
  replay: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<SignatureAnimation | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({ signatures, receipt });
  latest.current = { signatures, receipt };
  const joined = useRef<string | null>(null),
    approvedOwn = useRef(false);
  useEffect(() => {
    let active = true;
    void loadAnimation()
      .then(({ SignatureAnimation }) => {
        if (!active || !canvas.current) return;
        engine.current = new SignatureAnimation(canvas.current);
        engine.current.setSignatures(latest.current.signatures);
        setReady(true);
      })
      .catch(() => {
        /* The canonical SVG and signing flow remain available. */
      });
    return () => {
      active = false;
      engine.current?.destroy();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    if (!engine.current) return;
    if (receipt && signatures.some((row) => row.id === receipt.id)) approvedOwn.current = true;
    const rows =
      receipt && !approvedOwn.current
        ? [...signatures.filter((row) => row.id !== receipt.id), receipt]
        : signatures;
    const joinId = receipt && joined.current !== receipt.id ? receipt.id : undefined;
    engine.current.setSignatures(rows, joinId);
    if (joinId) joined.current = joinId;
  }, [signatures, receipt, ready]);
  useEffect(() => {
    if (replay > 0) engine.current?.replay();
  }, [replay]);
  return (
    <div className="charter-artwork">
      {!ready ? <SwagLogoMask /> : null}
      <canvas
        ref={canvas}
        className="charter-canvas"
        role="img"
        aria-label="An interactive artwork of coloured signatures forming the SWAG logo"
        aria-describedby="charter-artwork-description"
      >
        Coloured signatures form our shared SWAG logo. Read and sign the charter to add your mark.
      </canvas>
      <p id="charter-artwork-description" className="sr-only">
        Decorative marks form the logo while approved community signatures gradually take their
        place. You can read and sign the charter without interacting with the artwork.
      </p>
    </div>
  );
}
