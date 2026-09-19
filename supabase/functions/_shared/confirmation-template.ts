export type ConfirmationDetails = {
  recipient_kind: "student" | "mentor" | "teacher";
  recipient_address: string;
  student_name: string;
  mentor_name: string | null;
  teacher_name?: string | null;
  scheduled_start: string;
  scheduled_end: string;
  period_label: string;
  location: string | null;
};

export const CONFIRMATION_SUBJECTS = {
  student: "🌱 Your SWAG Peer Support Meeting is Confirmed",
  mentor: "💙 SWAG Peer Support Meeting Confirmed",
  teacher: "📅 SWAG Peer Support Meeting Confirmed",
} as const;

const date = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const time = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ||
      character,
  );
}

type Detail = [label: string, value: string];

function renderCard(
  job: ConfirmationDetails,
  heading: string,
  name: string | null | undefined,
  intro: string,
  details: Detail[],
  closing = "",
  tagline = "",
) {
  const firstName = name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  const footer = "SWAG — Student Welfare Awareness Group";
  const rows = details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 18px;border-bottom:1px solid #e0edf6"><p style="margin:0 0 5px;font-size:13px;color:#506779">${escapeHtml(label)}</p><p style="margin:0;font-size:16px;line-height:1.5;font-weight:700;color:#18384d;overflow-wrap:anywhere">${escapeHtml(value)}</p></td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(heading)}</title></head><body style="margin:0;padding:0;background:#ffffff;color:#18384d;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;border:1px solid #dceaf4;border-radius:18px;background:#ffffff"><tr><td style="padding:24px 24px 18px;border-radius:18px 18px 0 0;background:#edf7ff"><p style="margin:0 0 14px;font-size:13px;letter-spacing:1px;font-weight:700;color:#356e99">SWAG PEER SUPPORT</p><h1 style="margin:0;font-size:26px;line-height:1.3;color:#18384d">${escapeHtml(heading)}</h1></td></tr><tr><td style="padding:24px"><p style="margin:0 0 14px;font-size:16px;line-height:1.7">${escapeHtml(greeting)}</p><p style="margin:0 0 22px;font-size:16px;line-height:1.7">${escapeHtml(intro)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4faff;border:1px solid #e0edf6;border-radius:12px">${rows}</table>${closing ? `<p style="margin:22px 0 0;font-size:15px;line-height:1.7;color:#425d70">${escapeHtml(closing)}</p>` : ""}<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #e0edf6;font-size:12px;line-height:1.7;color:#587185">${escapeHtml(footer)}${tagline ? `<br>${escapeHtml(tagline)}` : ""}</p></td></tr></table></td></tr></table></body></html>`;
  return {
    to: job.recipient_address,
    subject: CONFIRMATION_SUBJECTS[job.recipient_kind],
    html,
    text: [
      heading,
      greeting,
      intro,
      details.map(([label, value]) => `${label}\n${value}`).join("\n\n"),
      closing,
      footer,
      tagline,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

function schedule(job: ConfirmationDetails): Detail[] {
  const start = new Date(job.scheduled_start);
  const end = new Date(job.scheduled_end);
  return [
    ["📅 Date", date.format(start)],
    ["🕐 Time", `${job.period_label} · ${time.format(start)}–${time.format(end)} Korea time`],
  ];
}
function location(job: ConfirmationDetails): Detail[] {
  return job.location?.trim() ? [["📍 Location", job.location.trim()]] : [];
}

export function renderStudentConfirmationEmail(job: ConfirmationDetails) {
  return renderCard(
    job,
    "Your meeting is confirmed 💙",
    job.student_name,
    "Your SWAG Peer Support meeting has been confirmed. Here are the details:",
    [
      ...schedule(job),
      ["👋 Peer Supporter", job.mentor_name?.trim() || "Your assigned Peer Supporter"],
      ...location(job),
    ],
    "If anything changes or you are unable to attend, please speak to your Peer Supporter or a trusted member of staff.",
    "A space to talk, connect, and get support.",
  );
}

export function renderSupporterConfirmationEmail(job: ConfirmationDetails) {
  return renderCard(
    job,
    "You have a confirmed Peer Support meeting",
    job.mentor_name,
    "A Peer Support meeting assigned to you has now been confirmed.",
    [
      ["👤 Student", job.student_name],
      ...schedule(job),
      ...location(job),
      ["🏫 Supervising Teacher", job.teacher_name?.trim() || "Your supervising teacher"],
    ],
    "Please arrive on time and follow the SWAG Peer Support guidelines.",
  );
}

export function renderTeacherConfirmationEmail(job: ConfirmationDetails) {
  return renderCard(
    job,
    "Peer Support meeting confirmed",
    job.teacher_name,
    "A SWAG Peer Support meeting under your supervision has been confirmed.",
    [
      ["👤 Student", job.student_name],
      ["💙 Peer Supporter", job.mentor_name?.trim() || "Assigned Peer Supporter"],
      ...schedule(job),
      ...location(job),
    ],
  );
}

export function renderConfirmationEmail(job: ConfirmationDetails) {
  if (job.recipient_kind === "student") return renderStudentConfirmationEmail(job);
  if (job.recipient_kind === "mentor") return renderSupporterConfirmationEmail(job);
  return renderTeacherConfirmationEmail(job);
}
