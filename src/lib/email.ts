/**
 * Transactional email via Resend.
 *
 * Config (all required for sends to actually go out):
 *   RESEND_API_KEY      — API key from resend.com
 *   RESEND_FROM_EMAIL   — verified sender, e.g. "Planet Pooch <noreply@planetpooch.com>"
 *   NEXT_PUBLIC_APP_URL — base URL used in email links (falls back to NEXTAUTH_URL)
 *
 * If any of those are missing, `isEmailEnabled()` returns false and senders
 * throw a descriptive error — the caller surfaces that to the admin so they
 * know what to configure.
 */
import { Resend } from "resend";

let cachedClient: Resend | null = null;

export function isEmailEnabled(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.RESEND_FROM_EMAIL &&
      (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL)
  );
}

function getClient(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
  }
  if (!cachedClient) {
    cachedClient = new Resend(process.env.RESEND_API_KEY);
  }
  return cachedClient;
}

function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_APP_URL or NEXTAUTH_URL must be set");
  }
  return url.replace(/\/+$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface WelcomeEmailRecipient {
  email: string;
  firstName: string;
}

export async function sendWelcomeEmail(
  recipient: WelcomeEmailRecipient,
  tempPassword: string
): Promise<void> {
  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("RESEND_FROM_EMAIL is not set");
  }

  const loginUrl = `${getAppUrl()}/login`;
  const safeName = escapeHtml(recipient.firstName);
  const safeEmail = escapeHtml(recipient.email);
  const safePassword = escapeHtml(tempPassword);
  const safeLoginUrl = escapeHtml(loginUrl);

  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 560px; margin: 0 auto; padding: 24px;">
    <h1 style="font-size: 20px; margin: 0 0 16px;">Welcome to Planet Pooch, ${safeName}!</h1>
    <p>Your portal account has been created. Use the credentials below to sign in for the first time — you'll be asked to set a new password right after.</p>
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0 0 8px;"><strong>Email:</strong> ${safeEmail}</p>
      <p style="margin: 0;"><strong>Temporary password:</strong> <code style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; padding: 2px 6px;">${safePassword}</code></p>
    </div>
    <p>
      <a href="${safeLoginUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 500;">Sign in to the portal</a>
    </p>
    <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">If the button doesn't work, copy and paste this URL into your browser:<br><span style="word-break: break-all;">${safeLoginUrl}</span></p>
    <p style="color: #6b7280; font-size: 13px;">This temporary password is single-use. If you didn't expect this email, please contact your manager.</p>
  </body>
</html>`;

  const text = [
    `Welcome to Planet Pooch, ${recipient.firstName}!`,
    "",
    "Your portal account has been created. Use these credentials to sign in for the first time — you'll be asked to set a new password right after.",
    "",
    `Email: ${recipient.email}`,
    `Temporary password: ${tempPassword}`,
    "",
    `Sign in: ${loginUrl}`,
    "",
    "This temporary password is single-use. If you didn't expect this email, please contact your manager.",
  ].join("\n");

  const result = await getClient().emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: recipient.email,
    subject: "Welcome to the Planet Pooch portal — your login details",
    html,
    text,
  });

  if (result.error) {
    throw new Error(result.error.message || "Failed to send email");
  }
}
