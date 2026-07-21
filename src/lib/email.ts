import nodemailer from "nodemailer";
import { Resend } from "resend";

const MAIL_FROM = process.env.MAIL_FROM || "חוזרים לבראשית <no-reply@example.com>";

let resendClient: Resend | null = null;
function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
  }
  return transporter;
}

export function isEmailConfigured() {
  return !!(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
}

// Tries Resend first (simplest to set up, works well on serverless), then
// SMTP if configured, and finally falls back to logging on the server
// console — keeps every auth flow (new-client password, reset links)
// fully functional in dev/demo without requiring real mail credentials.
export async function sendMail(to: string, subject: string, text: string) {
  const resend = getResend();
  if (resend) {
    const { error } = await resend.emails.send({ from: MAIL_FROM, to, subject, text });
    if (error) throw new Error(`Resend error: ${error.message}`);
    return;
  }

  const t = getTransporter();
  if (t) {
    await t.sendMail({ from: MAIL_FROM, to, subject, text });
    return;
  }

  console.log(`[email:dev-fallback] to=${to} subject="${subject}"\n${text}`);
}
