import assert from "node:assert/strict";
import test from "node:test";
import {
  requestCountdown,
  requestedMidnight,
  requestedDateLabel,
} from "../src/lib/request-countdown";
import { createRequestClock } from "../src/lib/request-clock";
import { safeCaseReturn } from "../src/lib/safe-return-to";
const at = (date: string, now: string) => requestCountdown(date, Date.parse(now));
test("KST countdown: exact example, under a day/minute, midnight and past dates", () => {
  assert.equal(at("2026-09-29", "2026-09-26T19:25:00+09:00"), "D-2일 4시간 35분");
  assert.equal(at("2026-09-27", "2026-09-26T19:25:00+09:00"), "D-4시간 35분");
  assert.equal(at("2026-09-27", "2026-09-26T23:59:30+09:00"), "D-1분 미만");
  assert.equal(at("2026-09-27", "2026-09-27T00:00:00+09:00"), "D-Day");
  assert.equal(at("2026-09-27", "2026-09-27T23:59:59+09:00"), "D-Day");
  assert.equal(at("2026-09-26", "2026-09-27T00:00:00+09:00"), "요청일 지남 · 1일");
});
test("calendar boundaries, leap year, invalid dates and SSR snapshot", () => {
  assert.equal(at("2027-01-01", "2026-12-31T23:00:00+09:00"), "D-1시간 0분");
  assert.equal(at("2028-03-01", "2028-02-28T00:00:00+09:00"), "D-2일 0시간 0분");
  assert.equal(at("2026-10-01", "2026-09-30T23:30:00+09:00"), "D-0시간 30분");
  for (const value of [
    null,
    undefined,
    "",
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-9-1",
    "bad",
  ]) {
    assert.equal(requestedMidnight(value), null);
    assert.equal(requestCountdown(value, Date.now()), "희망 날짜 미지정");
  }
  assert.equal(requestCountdown("2026-09-29", null), "요청일 기준 · KST");
  assert.equal(requestedDateLabel("2026-09-29"), "29 Sept 2026");
});
test("client timezone cannot alter countdown", () => {
  const prior = process.env.TZ;
  for (const zone of ["America/Los_Angeles", "Pacific/Honolulu", "UTC", "Asia/Seoul"]) {
    process.env.TZ = zone;
    assert.equal(at("2026-09-29", "2026-09-26T10:25:00Z"), "D-2일 4시간 35분");
  }
  if (prior === undefined) delete process.env.TZ;
  else process.env.TZ = prior;
});
test("shared timer, current time on focus/visibility, cleanup and SSR", (t) => {
  const win = new EventTarget(),
    doc = new EventTarget();
  Object.defineProperty(globalThis, "window", { value: win, configurable: true });
  Object.defineProperty(globalThis, "document", { value: doc, configurable: true });
  t.after(() => {
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "document");
  });
  const clock = createRequestClock();
  let now = 1000,
    intervals = 0,
    clears = 0;
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "setInterval", (() => {
    intervals++;
    return 1;
  }) as typeof setInterval);
  t.mock.method(globalThis, "clearInterval", () => {
    clears++;
  });
  assert.equal(clock.getServerSnapshot(), null);
  const first = clock.subscribe(() => {}),
    second = clock.subscribe(() => {});
  assert.equal(intervals, 1);
  now = 2000;
  win.dispatchEvent(new Event("focus"));
  assert.equal(clock.getSnapshot(), 2000);
  now = 3000;
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(clock.getSnapshot(), 3000);
  first();
  assert.equal(clears, 0);
  second();
  assert.equal(clears, 1);
  now = 4000;
  win.dispatchEvent(new Event("focus"));
  assert.equal(clock.getSnapshot(), null);
});
test("return-to accepts only the signed-in role's real case path", () => {
  const path = "/peer-mentor/cases/92000000-0000-4000-8000-000000000001";
  assert.equal(safeCaseReturn(path, "peer_mentor"), path);
  assert.equal(safeCaseReturn(path, "swag_member"), undefined);
  for (const input of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    path + "?studentToken=x",
    path + "#x",
    "/teacher/dashboard",
  ])
    assert.equal(safeCaseReturn(input), undefined);
});
