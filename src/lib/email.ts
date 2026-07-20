import nodemailer from "nodemailer";

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

// Falls back to logging on the server console when no SMTP_HOST is
// configured — keeps every auth flow (new-client password, reset link)
// fully functional in dev/demo without requiring real mail credentials.
export async function sendMail(to: string, subject: string, text: string) {
  const t = getTransporter();
  if (!t) {
    console.log(`[email:dev-fallback] to=${to} subject="${subject}"\n${text}`);
    return;
  }
  await t.sendMail({
    from: process.env.SMTP_FROM || "חוזרים לבראשית <no-reply@example.com>",
    to,
    subject,
    text,
  });
}
