const DAY = 86_400_000;
const KST = 9 * 3_600_000;
export const REQUEST_DATE_HELP =
  "학생 희망 날짜의 시작(00:00 KST)까지 남은 시간입니다. 확정 상담 시간이 아닙니다.";
export function requestedMidnight(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const utc = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== value) return null;
  return utc - KST;
}
export function requestCountdown(value: string | null | undefined, now: number | null): string {
  const target = requestedMidnight(value);
  if (target === null) return "희망 날짜 미지정";
  if (now === null || !Number.isFinite(now)) return "요청일 기준 · KST";
  const today = Math.floor((now + KST) / DAY);
  const day = Math.floor((target + KST) / DAY);
  if (day === today) return "D-Day";
  if (day < today) return `요청일 지남 · ${today - day}일`;
  const remaining = target - now;
  if (remaining < 60_000) return "D-1분 미만";
  const minutes = Math.floor(remaining / 60_000);
  const days = Math.floor(minutes / 1440);
  return `D-${days ? `${days}일 ` : ""}${Math.floor((minutes % 1440) / 60)}시간 ${minutes % 60}분`;
}
export function requestedDateLabel(value: string | null | undefined): string {
  const instant = requestedMidnight(value);
  return instant === null
    ? "희망 날짜 미지정"
    : new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Seoul",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(instant);
}
