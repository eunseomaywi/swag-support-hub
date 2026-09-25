// One browser clock for every badge. No request data or database polling.
export function createRequestClock() {
  let now: number | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();
  const refresh = () => {
    now = Date.now();
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => now,
    getServerSnapshot: () => null,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        refresh();
        timer = setInterval(refresh, 60_000);
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          clearInterval(timer);
          window.removeEventListener("focus", refresh);
          document.removeEventListener("visibilitychange", refresh);
          now = null;
        }
      };
    },
  };
}
export const requestClock = createRequestClock();
