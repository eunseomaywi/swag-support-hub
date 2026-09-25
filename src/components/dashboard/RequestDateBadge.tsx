import { useSyncExternalStore } from "react";
import { requestClock } from "@/lib/request-clock";
import { requestCountdown, requestedDateLabel, REQUEST_DATE_HELP } from "@/lib/request-countdown";
export function RequestDateBadge({ date, periods }: { date: string | null; periods: string }) {
  const now = useSyncExternalStore(
    requestClock.subscribe,
    requestClock.getSnapshot,
    requestClock.getServerSnapshot,
  );
  return (
    <div className="space-y-1 text-sm text-swag-navy" title={REQUEST_DATE_HELP}>
      <span className="inline-block rounded-full border border-swag-blue/25 bg-swag-blue/5 px-3 py-1 font-semibold">
        {requestCountdown(date, now)}
      </span>
      <p>
        {requestedDateLabel(date)}
        {periods ? ` · ${periods}` : ""}
      </p>
      <span className="sr-only">{REQUEST_DATE_HELP}</span>
    </div>
  );
}
