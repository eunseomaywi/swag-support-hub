import assert from "node:assert/strict";
import test from "node:test";
import {
  supporterDisplay,
  missingProfileFields,
  queueErrorMessage,
  type SupporterIdentity,
} from "../src/lib/supporter-identity";
import {
  renderStudentConfirmationEmail,
  renderTeacherConfirmationEmail,
} from "../supabase/functions/_shared/confirmation-template";
const assigned: SupporterIdentity = {
  supporter_id: "linked-id",
  supporter_name: null,
  supporter_year_group: null,
  supporter_role: "swag_member",
  supporter_active: true,
  supporter_details_available: true,
};
test("assignment uses UUID, not presence of a name; inactive identity is retained", () => {
  assert.equal(supporterDisplay({ ...assigned, supporter_id: null }).name, "Unassigned");
  assert.equal(supporterDisplay(assigned).name, "Assigned · Profile incomplete");
  assert.equal(
    supporterDisplay({ ...assigned, supporter_details_available: false }).name,
    "Assigned · Supporter details unavailable",
  );
  assert.equal(
    supporterDisplay({ ...assigned, supporter_name: "Known Name", supporter_active: false }).name,
    "Known Name",
  );
  assert.match(
    supporterDisplay({ ...assigned, supporter_active: false }).subtitle,
    /SWAG Member · Inactive/,
  );
  assert.deepEqual(missingProfileFields("Teacher", null, "teacher"), []);
  assert.deepEqual(missingProfileFields(null, null, "swag_member"), ["name", "year group"]);
  assert.match(queueErrorMessage("42501"), /staff registration/);
  assert.doesNotMatch(queueErrorMessage("500"), /no available requests/i);
});
test("email full names, years and actual SWAG role are shared safely with legacy fallback", () => {
  const job = {
    recipient_kind: "student" as const,
    recipient_address: "test@example.invalid",
    student_name: "Full Student Name",
    student_year_group: "Year 9",
    mentor_name: "Full Supporter & Name",
    mentor_year_group: "Year 12",
    mentor_role: "swag_member" as const,
    teacher_name: "Full Teacher Name",
    scheduled_start: "2099-09-21T03:00:00Z",
    scheduled_end: "2099-09-21T03:30:00Z",
    period_label: "Lunch",
    location: "Room",
  };
  for (const mail of [
    renderStudentConfirmationEmail(job),
    renderTeacherConfirmationEmail({ ...job, recipient_kind: "teacher" }),
  ]) {
    assert.match(mail.text, /Full Supporter & Name · Year 12 · SWAG Member/);
    assert.match(mail.html, /Full Supporter &amp; Name/);
    assert.doesNotMatch(mail.text, /Peer Mentor/);
  }
  assert.match(renderStudentConfirmationEmail(job).text, /Hi Full Student Name,/);
  assert.match(
    renderTeacherConfirmationEmail({ ...job, recipient_kind: "teacher" }).text,
    /Full Student Name · Year 9/,
  );
  const legacy = renderStudentConfirmationEmail({
    ...job,
    mentor_name: null,
    mentor_year_group: null,
    mentor_role: null,
  });
  assert.match(legacy.text, /name not recorded/);
  assert.doesNotMatch(legacy.text, /Year 12|Peer Mentor|SWAG Member/);
});
