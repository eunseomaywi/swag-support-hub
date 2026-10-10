import { LOGO_REGIONS, regionCapacities } from "./logo";
import { seeded } from "./random";
import type { TargetSlot } from "./slots";

export function makeTargets(count: number): TargetSlot[] {
  const ctx = document.createElement("canvas").getContext("2d")!;
  const capacities = regionCapacities(count);
  const targets: TargetSlot[] = [];
  for (const region of LOGO_REGIONS) {
    const path = new Path2D(region.path),
      random = seeded(`charter-targets/${region.id}`);
    const pool: TargetSlot[] = [];
    let attempts = 0;
    while (pool.length < capacities[region.id] && attempts < count * 500) {
      attempts++;
      const x = random() * 512,
        y = random() * 512;
      if (!ctx.isPointInPath(path, x, y, "evenodd")) continue;
      const spacing = attempts < count * 80 ? 4.5 : 2.5;
      if (pool.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < spacing ** 2)) continue;
      pool.push({ key: `${region.id}-${pool.length}`, region: region.id, x, y });
    }
    targets.push(...pool);
  }
  return targets;
}
