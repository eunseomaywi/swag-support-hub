const DAY = 86_400_000;
const KST = 9 * 3_600_000;
export const REQUEST_DATE_HELP =
  "Time until the start of the student's requested date, at 00:00 KST. This is not a confirmed appointment time.";
export function requestedMidnight(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const utc = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== value) return null;
  return utc - KST;
}
export function requestCountdown(value: string | null | undefined, now: number | null): string {
  const target = requestedMidnight(value);
  if (target === null) return "Date not specified";
  if (now === null || !Number.isFinite(now)) return "Requested date · KST";
  const today = Math.floor((now + KST) / DAY);
  const day = Math.floor((target + KST) / DAY);
  if (day === today) return "Today";
  if (day < today) return `${today - day} ${today - day === 1 ? "day" : "days"} past`;
  const remaining = target - now;
  if (remaining < 60_000) return "Less than 1m";
  const minutes = Math.floor(remaining / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return `D-${days ? `${days}d ` : ""}${hours || days ? `${hours}h ` : ""}${minutes % 60}m`;
}
export function requestedDateLabel(value: string | null | undefined): string {
  const instant = requestedMidnight(value);
  return instant === null
    ? "Date not specified"
    : new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Seoul",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(instant);
}
