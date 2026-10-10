import { useEffect, useRef, useState, type PointerEvent } from "react";
import { LIMITS, normalizeStrokes, type Point, type Strokes } from "@/lib/charter/model";

import { drawStrokes } from "@/lib/charter/draw";

export function SignaturePad({
  value,
  onChange,
  disabled = false,
}: {
  value: Strokes;
  onChange: (value: Strokes) => void;
  disabled?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    active = useRef<{ id: number; points: Point[] } | null>(null);
  const current = useRef(value);
  current.current = value;
  const [message, setMessage] = useState("");
  function paint(strokes: Strokes) {
    const el = canvas.current,
      ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const rect = el.getBoundingClientRect();
    drawStrokes(ctx, strokes, rect.width, rect.height);
  }
  useEffect(() => {
    paint(value);
  }, [value]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const resize = () => {
      const box = el.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio || 1, 2);
      el.width = Math.round(box.width * dpr);
      el.height = Math.round(box.height * dpr);
      el.getContext("2d")?.scale(dpr, dpr);
      paint(current.current);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    return () => observer.disconnect();
  }, []);
  function point(event: PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
      event.pressure,
    ];
  }
  function finish(event: PointerEvent<HTMLCanvasElement>) {
    if (!active.current || active.current.id !== event.pointerId) return;
    const points = active.current.points;
    active.current = null;
    if (points.length > 1) onChange(normalizeStrokes([...value, points]));
    else paint(value);
  }
  return (
    <div>
      <p id="signature-help" className="mb-2 text-sm text-muted-foreground">
        Draw a personal mark with your mouse, touch or pen. Please avoid writing personal details.
      </p>
      <canvas
        ref={canvas}
        aria-label="Draw your signature"
        aria-describedby="signature-help"
        className="h-44 w-full rounded-xl border border-swag-blue/30 bg-white"
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          if (disabled || active.current) return;
          if (value.length >= LIMITS.strokes) {
            setMessage("Please undo or clear before adding more strokes.");
            return;
          }
          setMessage("");
          event.currentTarget.setPointerCapture(event.pointerId);
          active.current = { id: event.pointerId, points: [point(event)] };
        }}
        onPointerMove={(event) => {
          if (!active.current || active.current.id !== event.pointerId) return;
          if (active.current.points.length < 6400) active.current.points.push(point(event));
          paint([...value, active.current.points]);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
      />
      <div className="mt-2 flex flex-wrap gap-3">
        <button
          type="button"
          className="charter-secondary"
          disabled={disabled || !value.length}
          onClick={() => onChange(value.slice(0, -1))}
        >
          Undo
        </button>
        <button
          type="button"
          className="charter-secondary"
          disabled={disabled || !value.length}
          onClick={() => onChange([])}
        >
          Clear
        </button>
        <button
          type="button"
          className="charter-secondary"
          disabled={disabled}
          onClick={() => {
            onChange([
              [
                [0.15, 0.55],
                [0.25, 0.72],
                [0.42, 0.24],
                [0.5, 0.64],
                [0.65, 0.35],
                [0.85, 0.48],
              ],
            ]);
            setMessage("A simple mark is ready. You can add it using the consent checkbox below.");
          }}
        >
          Use a simple mark
        </button>
      </div>
      <p role="status" className="mt-2 text-xs text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
