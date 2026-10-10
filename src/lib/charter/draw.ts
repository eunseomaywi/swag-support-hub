import type { Strokes } from "./model";

export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Strokes,
  width: number,
  height: number,
  colour = "#252A49",
) {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = colour;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes)
    for (let i = 1; i < stroke.length; i++) {
      const p = stroke[i]!,
        previous = stroke[i - 1]!;
      ctx.lineWidth = 1.3 + (p[2] ?? 0.5) * 1.5;
      ctx.beginPath();
      ctx.moveTo(previous[0] * width, previous[1] * height);
      ctx.lineTo(p[0] * width, p[1] * height);
      ctx.stroke();
    }
}
