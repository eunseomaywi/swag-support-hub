import { seeded } from "./random";

// Ported from the approved prototype: varied initials, cursive groups and flourishes.
export function makeDecorativeSignature(seed: number) {
  const random = seeded(String(seed));
  const strokes: { x: number; y: number; p: number }[][] = [];
  const compact = random() < 0.22;
  const width = compact ? 0.36 + random() * 0.34 : 0.76 + random() * 0.48;
  const baseline = (random() - 0.5) * 0.075;
  const slant = (random() - 0.5) * (compact ? 0.22 : 0.15);
  const groups = compact ? 2 + Math.floor(random() * 3) : 3 + Math.floor(random() * 4);
  const groupWeights = Array.from({ length: groups }, () => 0.55 + random());
  const totalWeight = groupWeights.reduce((sum, value) => sum + value, 0);
  const main = [];
  let cursor = 0;

  // A connected cursive line made from a mixture of arches, loops,
  // initials and quick pen flicks rather than a repeated sine wave.
  for (let group = 0; group < groups; group++) {
    const span = groupWeights[group]! / totalWeight;
    const style = Math.floor(random() * 5);
    const steps = 5 + Math.floor(random() * 5);
    const amplitude = 0.065 + random() * 0.12;
    const direction = random() > 0.22 ? -1 : 1;
    for (let i = 0; i < steps; i++) {
      if (group > 0 && i === 0) continue;
      const u = i / (steps - 1);
      const globalT = cursor + span * u;
      let x = -width / 2 + globalT * width;
      let y = baseline + slant * (globalT - 0.5);

      if (style === 0) {
        y += direction * Math.sin(u * Math.PI) * amplitude;
      } else if (style === 1) {
        y += Math.sin(u * Math.PI * 2) * amplitude * 0.74;
      } else if (style === 2) {
        x += Math.sin(u * Math.PI * 2) * amplitude * 0.38;
        y += -Math.cos(u * Math.PI * 2) * amplitude * 0.78 + amplitude * 0.28;
      } else if (style === 3) {
        const peak = Math.pow(Math.sin(u * Math.PI), 2.4);
        y += direction * peak * amplitude * (1.25 + random() * 0.28);
      } else {
        y += Math.sin(u * Math.PI * 3) * amplitude * 0.48;
      }

      y += Math.sin(globalT * Math.PI * 13 + seed * 0.003) * 0.011;
      x += Math.sin(globalT * Math.PI * 7 + seed * 0.0017) * 0.008;
      main.push({ x, y, p: 0.4 + random() * 0.34 });
    }
    cursor += span;
  }
  strokes.push(main);

  // Larger opening initial — present in most, but not all, signatures.
  if (random() > 0.2) {
    const initial = [];
    const loopSteps = 12 + Math.floor(random() * 8);
    const loopW = 0.1 + random() * 0.11;
    const loopH = 0.13 + random() * 0.16;
    const cx = -width / 2 + loopW * 0.55;
    const cy = baseline - loopH * 0.1;
    const turns = random() > 0.54 ? 1.55 : 1.05;
    for (let i = 0; i < loopSteps; i++) {
      const t = i / (loopSteps - 1);
      const angle = Math.PI * (0.12 + t * 2 * turns);
      initial.push({
        x: cx + Math.sin(angle) * loopW * (0.72 + t * 0.28),
        y: cy - Math.cos(angle) * loopH * (0.68 + t * 0.32),
        p: 0.48 + random() * 0.28,
      });
    }
    strokes.unshift(initial);
  }

  // Underlines and final flourishes are common, but varied in length
  // and direction so the wall does not look procedurally tiled.
  if (random() > (compact ? 0.58 : 0.31)) {
    const underline = [];
    const steps = 10 + Math.floor(random() * 7);
    const start = -width * (0.42 + random() * 0.08);
    const lineWidth = width * (0.72 + random() * 0.33);
    const y = baseline + 0.13 + random() * 0.075;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      underline.push({
        x: start + lineWidth * t,
        y: y - Math.sin(t * Math.PI) * (0.018 + random() * 0.014) + (t - 0.5) * slant * 0.32,
        p: 0.42 + random() * 0.22,
      });
    }
    strokes.push(underline);
  }

  if (!compact && random() > 0.62) {
    const flourish = [];
    const steps = 12 + Math.floor(random() * 6);
    const startX = width * 0.28;
    const startY = baseline + (random() - 0.5) * 0.08;
    const radiusX = 0.1 + random() * 0.12;
    const radiusY = 0.055 + random() * 0.08;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const angle = t * Math.PI * (1.2 + random() * 0.55);
      flourish.push({
        x: startX + t * 0.18 + Math.sin(angle) * radiusX * (1 - t * 0.32),
        y: startY + Math.sin(angle * 1.18) * radiusY,
        p: 0.4 + random() * 0.2,
      });
    }
    strokes.push(flourish);
  }

  return {
    strokes,
    aspect: compact ? 0.84 + random() * 0.38 : 0.92 + random() * 0.58,
    lineWidth: 0.037 + random() * 0.02,
  };
}
