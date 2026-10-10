import { REGIONS, type PublicSignature, type Region, type Strokes } from "./model";
export type TargetSlot = { key: string; region: Region; x: number; y: number };
export type RenderSlot = TargetSlot & { signature: PublicSignature | null; strokes: Strokes };
import { hash } from "./random";
import { makeDecorativeSignature } from "./decorative";
export { hash, seeded } from "./random";
// These deterministic gestures are decorative, never persisted or treated as participants.
export function decorativeStrokes(key: string): Strokes {
  return makeDecorativeSignature(hash(key)).strokes.map((stroke) =>
    stroke.map((p) => [p.x / 1.8 + 0.5, p.y / 1.2 + 0.5, p.p]),
  );
}
export function assignSlots(
  targets: TargetSlot[],
  signatures: PublicSignature[],
  previous: ReadonlyMap<string, string> = new Map(),
): RenderSlot[] {
  const slots = targets.map((target) => ({
    ...target,
    signature: null as PublicSignature | null,
    strokes: decorativeStrokes(target.key),
  }));
  for (const region of REGIONS) {
    const available = slots.filter((slot) => slot.region === region);
    if (!available.length) continue;
    const rows = signatures
      .filter((row) => row.region_id === region)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
      .slice(0, available.length);
    const used = new Set<string>();
    const place = (slot: RenderSlot, row: PublicSignature) => {
      slot.signature = row;
      slot.strokes = row.strokes;
      used.add(row.id);
    };
    for (const row of rows) {
      const prior = available.find((slot) => slot.key === previous.get(row.id));
      if (prior && !prior.signature) place(prior, row);
    }
    for (const row of rows
      .filter((row) => !used.has(row.id))
      .sort((a, b) => a.id.localeCompare(b.id))) {
      const start = hash(row.id) % available.length;
      for (let offset = 0; offset < available.length; offset++) {
        const slot = available[(start + offset) % available.length]!;
        if (!slot.signature) {
          place(slot, row);
          break;
        }
      }
    }
  }
  return slots;
}
