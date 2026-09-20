import assert from "node:assert/strict";
import test from "node:test";
import {
  savedReadiness,
  confirmationBlocker,
  confirmationChecklist,
} from "../src/lib/peer-readiness.ts";

const saved = {
  location_guidance: "Meeting room",
  supervisor_teacher_id: "teacher",
  active_weekdays: [1, 2, 3, 4, 5],
  periods: ["break", "lunch_1", "lunch_2"].map((period) => ({
    period,
    start_time: "12:00:00",
    end_time: "12:30:00",
  })),
  schedule_ready: true,
};
test("inactive supervisor does not mislabel persisted period times as unconfigured", () => {
  const result = savedReadiness({ ...saved, schedule_ready: false }, []);
  assert.equal(result.ready, false);
  assert.equal(result.missing.length, 1);
  assert.match(result.missing[0], /not active/);
  assert.ok(
    result.checks
      .filter((c) => ["Break", "1st Lunch", "2nd Lunch", "School days"].includes(c.label))
      .every((c) => c.ready),
  );
});
test("only persisted complete settings and an active candidate are ready", () => {
  assert.equal(savedReadiness(saved, [{ profile_id: "teacher" }]).ready, true);
  assert.equal(
    savedReadiness({ ...saved, schedule_ready: false }, [{ profile_id: "teacher" }]).ready,
    false,
  );
  const result = savedReadiness(
    {
      ...saved,
      supervisor_teacher_id: null,
      location_guidance: null,
      active_weekdays: [],
      periods: [],
    },
    [],
  );
  assert.equal(result.missing.length, 6);
  assert.ok(result.missing.includes("No supervising teacher selected."));
});
test("missing or reversed period times are explicitly not ready", () => {
  const result = savedReadiness(
    { ...saved, periods: [{ period: "break", start_time: "14:00:00", end_time: "13:00:00" }] },
    [{ profile_id: "teacher" }],
  );
  assert.equal(result.ready, false);
  assert.equal(result.missing.length, 3);
});
const option = {
  period: "break",
  ready: true,
  readiness_issue: null,
  scheduled_start: "2027-01-04T01:00:00Z",
  scheduled_end: "2027-01-04T01:30:00Z",
  location_guidance: "Meeting room",
};
test("mentor readiness requires a selected allowed period and a server preview", () => {
  assert.ok(confirmationChecklist(option, "break").every((c) => c.ready));
  assert.equal(confirmationChecklist(option, "lunch_2").at(-1)?.ready, false);
  assert.equal(confirmationChecklist(undefined, "")[0].ready, null);
});
test("first-error RPC cannot prove later checks; unknown is not incorrectly green", () => {
  const checks = confirmationChecklist(
    { ...option, ready: false, readiness_issue: "supervisor_teacher_inactive" },
    "break",
  );
  assert.equal(checks[0].ready, null);
  assert.equal(checks[1].ready, false);
  assert.equal(checks[2].ready, true);
  assert.match(confirmationBlocker("supervisor_teacher_inactive"), /staff registration/);
  assert.match(confirmationBlocker("date_not_active"), /not an active school day/);
  assert.match(confirmationBlocker(null), /could not be verified/);
  assert.equal(
    confirmationChecklist(
      { ...option, ready: false, readiness_issue: "date_not_active" },
      "break",
    )[0].ready,
    false,
  );
});
