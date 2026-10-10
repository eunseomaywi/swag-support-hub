export const CHARTER_VERSION = "2026-10-10";
export const REGIONS = ["orange", "red", "green", "blue", "navy", "teal"] as const;
export type Region = (typeof REGIONS)[number];
export const COLOURS: Record<Region, string> = {
  orange: "#F6A62A",
  red: "#FA4338",
  green: "#87D34A",
  blue: "#526BC8",
  navy: "#252A49",
  teal: "#329B78",
};
export const COLOUR_LABELS: Record<Region, string> = {
  orange: "Orange",
  red: "Red",
  green: "Green",
  blue: "Blue",
  navy: "Navy",
  teal: "Teal",
};
export type Point = [number, number, number?];
export type Strokes = Point[][];
export type PublicSignature = {
  id: string;
  strokes: Strokes;
  region_id: Region;
  created_at: string;
};
export const LIMITS = { bytes: 65_536, strokes: 32, points: 1600, minimumLength: 0.35 };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function pathLength(strokes: Strokes): number {
  return strokes.reduce(
    (sum, stroke) =>
      sum +
      stroke.reduce((length, p, i) => {
        const previous = stroke[i - 1];
        return length + (previous ? Math.hypot(p[0] - previous[0], p[1] - previous[1]) : 0);
      }, 0),
    0,
  );
}

export function validateStrokes(value: unknown): Strokes {
  if (!Array.isArray(value) || value.length < 1 || value.length > LIMITS.strokes)
    throw new Error("Please draw a signature with fewer separate strokes.");
  let count = 0;
  for (const stroke of value) {
    if (!Array.isArray(stroke) || stroke.length < 2)
      throw new Error("Please draw a longer signature.");
    count += stroke.length;
    if (count > LIMITS.points) throw new Error("This drawing is too detailed. Please simplify it.");
    for (const point of stroke) {
      if (
        !Array.isArray(point) ||
        point.length < 2 ||
        point.length > 3 ||
        point.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1)
      )
        throw new Error("The drawing could not be read. Please clear it and try again.");
    }
  }
  const strokes = value as Strokes;
  if (pathLength(strokes) < LIMITS.minimumLength)
    throw new Error("Please draw a longer signature.");
  return strokes;
}

// Distance-based simplification preserves endpoints and meaningful pressure changes.
export function normalizeStrokes(strokes: Strokes): Strokes {
  return strokes
    .slice(0, LIMITS.strokes)
    .map((stroke) => {
      const clean: Point[] = [];
      for (let i = 0; i < stroke.length; i++) {
        const p = stroke[i]!;
        const round = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 10000) / 10000;
        const q: Point =
          p[2] === undefined ? [round(p[0]), round(p[1])] : [round(p[0]), round(p[1]), round(p[2])];
        const last = clean.at(-1);
        if (
          !last ||
          i === stroke.length - 1 ||
          Math.hypot(q[0] - last[0], q[1] - last[1]) >= 0.003 ||
          Math.abs((q[2] ?? 0.5) - (last[2] ?? 0.5)) > 0.1
        )
          clean.push(q);
      }
      // Uniform resampling bounds even an unusually long pen gesture.
      const cap = Math.floor(LIMITS.points / Math.max(1, strokes.length));
      return clean.length <= cap
        ? clean
        : Array.from(
            { length: cap },
            (_, i) => clean[Math.round((i * (clean.length - 1)) / (cap - 1))]!,
          );
    })
    .filter((stroke) => stroke.length > 1);
}

export function validateSubmission(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid submission.");
  const body = value as Record<string, unknown>;
  if (
    typeof body["client_submission_id"] !== "string" ||
    !UUID.test(body["client_submission_id"]) ||
    body["charter_version"] !== CHARTER_VERSION ||
    body["consent"] !== true
  )
    throw new Error("Please read the current charter and agree to add your signature.");
  return {
    client_submission_id: body["client_submission_id"],
    charter_version: CHARTER_VERSION,
    strokes: validateStrokes(body["strokes"]),
  };
}
