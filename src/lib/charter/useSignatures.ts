import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { REGIONS, validateStrokes, type PublicSignature } from "./model";

// A bounded manifest every 45 seconds detects approvals and removals without exposing moderation.
// Only new IDs need stroke downloads. Hidden signatures disappear on the next successful refresh.
export function useSignatures() {
  const [signatures, setSignatures] = useState<PublicSignature[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const cache = new Map<string, PublicSignature>();
    const controller = new AbortController();
    async function refresh() {
      try {
        if (document.visibilityState === "hidden") return;
        const client = getSupabaseClient();
        const perRegion = window.matchMedia("(max-width: 640px)").matches ? 84 : 164;
        const manifest = await client
          .rpc("charter_public_manifest", { p_per_region: perRegion })
          .abortSignal(controller.signal);
        if (manifest.error) throw new Error("manifest unavailable");
        const ids = (manifest.data || []).map((row) => row.id);
        const missing = ids.filter((id) => !cache.has(id));
        // Bound URL length and response size even on the first load.
        for (let start = 0; start < missing.length; start += 40) {
          const result = await client
            .from("charter_signatures")
            .select("id,strokes,region_id,created_at")
            .in("id", missing.slice(start, start + 40))
            .abortSignal(controller.signal);
          if (result.error) throw new Error("signatures unavailable");
          for (const row of result.data || []) {
            const region = REGIONS.find((region) => region === row.region_id);
            if (!region) continue;
            try {
              cache.set(row.id, {
                id: row.id,
                region_id: region,
                created_at: row.created_at,
                strokes: validateStrokes(row.strokes),
              });
            } catch {
              /* A malformed legacy drawing never enters the renderer. */
            }
          }
        }
        const allowed = new Set(ids);
        for (const id of cache.keys()) if (!allowed.has(id)) cache.delete(id);
        if (active) {
          setSignatures([...cache.values()]);
          setUnavailable(false);
        }
      } catch {
        if (active) setUnavailable(true);
      } finally {
        if (active) timer = setTimeout(() => void refresh(), 45_000);
      }
    }
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);
  return { signatures, unavailable };
}
