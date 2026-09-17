import { sendWithGmail, smtpFailure } from "../_shared/gmail-smtp.ts";

type Job = {
  job_id: string;
  recipient_kind: "student" | "mentor" | "teacher";
  recipient_address: string;
  idempotency_key: string;
  request_id: string;
  student_name: string;
  mentor_name: string | null;
  mentor_role: "peer_mentor" | "swag_member";
  scheduled_start: string;
  scheduled_end: string;
  period_label: string;
  location: string;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function equalSecret(actual: string, expected: string) {
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(actualHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`rpc_${name}_${response.status}`);
  return (await response.json()) as T;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ||
      character,
  );
}

const date = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  weekday: "short",
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

function render(job: Job, baseUrl: string) {
  const start = new Date(job.scheduled_start);
  const end = new Date(job.scheduled_end);
  const schedule = `${date.format(start)} · ${job.period_label} · ${time.format(start)}–${time.format(end)} Korea time · ${job.location}`;
  const supporter = job.mentor_name?.trim() || "your assigned supporter";
  const internalLink = `${baseUrl}/${job.mentor_role === "swag_member" ? "swag" : "peer-mentor"}/cases/${job.request_id}`;
  const teacherLink = `${baseUrl}/teacher/peer-support?request=${job.request_id}`;
  let intro: string;
  let detail: string;
  let action = "";
  if (job.recipient_kind === "student") {
    intro = "Your SWAG Peer Support meeting is confirmed.";
    detail = `Supporter: ${supporter}`;
  } else if (job.recipient_kind === "mentor") {
    intro = "You have a confirmed SWAG Peer Support meeting.";
    detail = `Student: ${job.student_name}`;
    action = `\n\nOpen My Case: ${internalLink}`;
  } else {
    intro = "A SWAG Peer Support meeting has been confirmed under your supervision.";
    detail = `Student: ${job.student_name}\nSupporter: ${supporter}`;
    action = `\n\nOpen Teacher Overview: ${teacherLink}`;
  }
  const link =
    job.recipient_kind === "mentor"
      ? internalLink
      : job.recipient_kind === "teacher"
        ? teacherLink
        : "";
  const htmlAction = link
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#12213a;color:#fff;text-decoration:none;font-weight:700">Open protected SWAG page</a></p>`
    : "";
  return {
    to: [job.recipient_address],
    subject: "Your SWAG Peer Support meeting details",
    text: `${intro}\n\n${detail}\n${schedule}${action}${job.recipient_kind === "student" ? "\n\nUse the private management link you saved when submitting to check or cancel this meeting." : ""}`,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#f8f7f2;color:#12213a;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="border:1px solid #bfd7ef;background:#fff;border-radius:14px;padding:28px"><p style="margin:0 0 16px;font-size:12px;font-weight:700;letter-spacing:.12em;color:#3278b7">SWAG PEER SUPPORT</p><h1 style="margin:0 0 20px;font-size:25px">Meeting confirmed</h1><p style="line-height:1.7">${escapeHtml(intro)}</p><p style="white-space:pre-line;line-height:1.7"><strong>${escapeHtml(detail)}</strong></p><p style="line-height:1.7"><strong>${escapeHtml(schedule)}</strong></p>${job.recipient_kind === "student" ? '<p style="line-height:1.7">Use the private management link you saved when submitting to check or cancel this meeting.</p>' : ""}${htmlAction}<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#647084">This email contains scheduling information only. Please use the protected SWAG website for the latest status.</p></div></div></body></html>`,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { ...jsonHeaders, allow: "POST" } });
  const dispatchSecret = env("EMAIL_DISPATCH_SECRET");
  if (
    !dispatchSecret ||
    !(await equalSecret(request.headers.get("x-swag-dispatch-secret") || "", dispatchSecret))
  ) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }
  const provider = env("EMAIL_PROVIDER");
  const smtpUser = env("GMAIL_SMTP_USER");
  const smtpPassword = env("GMAIL_SMTP_APP_PASSWORD").replace(/\s+/g, "");
  const replyTo = env("SWAG_EMAIL_REPLY_TO") || env("EMAIL_REPLY_TO");
  const baseUrl = (env("SWAG_PUBLIC_BASE_URL") || "").replace(/\/$/, "");
  if (
    provider !== "gmail" ||
    !smtpUser ||
    !validEmail(smtpUser) ||
    !smtpPassword ||
    (replyTo && !validEmail(replyTo)) ||
    !baseUrl
  ) {
    return new Response(JSON.stringify({ error: "email_configuration_incomplete" }), {
      status: 503,
      headers: jsonHeaders,
    });
  }

  const workerId = crypto.randomUUID();
  const jobs = await rpc<Job[]>("claim_confirmation_email_jobs", {
    p_dispatch_secret: dispatchSecret,
    p_worker_id: workerId,
    p_limit: 10,
    p_lease_seconds: 120,
  });
  for (const job of jobs) {
    let outcome = "temporary";
    let providerMessageId: string | null = null;
    let errorCode: string | null = "provider_network_error";
    let retryAfterSeconds: number | null = null;
    try {
      const message = render(job, baseUrl);
      const result = await sendWithGmail(
        { user: smtpUser, password: smtpPassword, ...(replyTo ? { replyTo } : {}) },
        {
          to: job.recipient_address,
          subject: message.subject,
          text: message.text,
          html: message.html,
        },
      );
      if (result.accepted && result.messageId.length <= 200) {
        outcome = "submitted";
        providerMessageId = result.messageId;
        errorCode = null;
      } else {
        outcome = "permanent";
        errorCode = "gmail_smtp_recipient_rejected";
      }
    } catch (error) {
      const failure = smtpFailure(error);
      outcome = failure.outcome;
      errorCode = failure.errorCode;
    }
    await rpc("finish_confirmation_email_job", {
      p_dispatch_secret: dispatchSecret,
      p_job_id: job.job_id,
      p_worker_id: workerId,
      p_outcome: outcome,
      p_provider_message_id: providerMessageId,
      p_error_code: errorCode,
      p_retry_after_seconds: retryAfterSeconds,
    });
  }
  return new Response(JSON.stringify({ processed: jobs.length }), {
    status: 200,
    headers: jsonHeaders,
  });
});
