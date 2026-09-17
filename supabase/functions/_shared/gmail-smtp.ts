import nodemailer from "npm:nodemailer@9.1.1";

export const GMAIL_FROM = "SWAG Support <nlcsswag2025@gmail.com>";

export type GmailSmtpConfig = {
  user: string;
  password: string;
  replyTo?: string;
};

export type GmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type GmailSendResult = {
  messageId: string;
  accepted: boolean;
};

function transport(config: GmailSmtpConfig) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
  });
}

export async function verifyGmailSmtp(config: GmailSmtpConfig): Promise<void> {
  await transport(config).verify();
}

export async function sendWithGmail(
  config: GmailSmtpConfig,
  message: GmailMessage,
): Promise<GmailSendResult> {
  const result = await transport(config).sendMail({
    from: GMAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
    ...(config.replyTo ? { replyTo: config.replyTo } : {}),
  });
  return {
    messageId: result.messageId,
    accepted: result.accepted.some(
      (address) => String(address).toLowerCase() === message.to.toLowerCase(),
    ),
  };
}

export function smtpFailure(error: unknown): {
  outcome: "temporary" | "permanent" | "uncertain";
  errorCode: string;
} {
  const smtpError = error as { code?: unknown; responseCode?: unknown };
  const code = typeof smtpError?.code === "string" ? smtpError.code : "unknown";
  const responseCode =
    typeof smtpError?.responseCode === "number" ? smtpError.responseCode : null;
  if (code === "ETIMEDOUT" || code === "ESOCKET")
    return { outcome: "uncertain", errorCode: "gmail_smtp_timeout_uncertain" };
  if (code === "EAUTH" || (responseCode !== null && responseCode >= 500))
    return { outcome: "permanent", errorCode: `gmail_smtp_${code.toLowerCase()}` };
  return { outcome: "temporary", errorCode: `gmail_smtp_${code.toLowerCase()}` };
}
