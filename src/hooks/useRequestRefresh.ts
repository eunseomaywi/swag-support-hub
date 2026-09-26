import { useEffect, useRef } from "react";

// Only mounted request screens subscribe. Refreshes pause in hidden tabs and do
// not overlap; the in-flight promise is shared per callback across focus events.
export function useRequestRefresh(load: () => Promise<void>, enabled = true) {
  const running = useRef(false);
  const queued = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const refresh = async () => {
      if (disposed || document.visibilityState !== "visible") return;
      if (running.current) {
        queued.current = refresh;
        return;
      }
      running.current = true;
      try {
        await load();
      } finally {
        running.current = false;
        const next = queued.current;
        queued.current = null;
        if (next) void next();
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    const onRefresh = () => void refresh();
    window.addEventListener("focus", onRefresh);
    document.addEventListener("visibilitychange", onRefresh);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onRefresh);
      document.removeEventListener("visibilitychange", onRefresh);
    };
  }, [load, enabled]);
}
