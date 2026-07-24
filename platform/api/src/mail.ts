import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config";
import { logger } from "./logger";

let transporter: Transporter | null = null;
function smtp(): Transporter | null {
  if (!config.SMTP_HOST || !config.SMTP_USER) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE === "true",
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    });
  }
  return transporter;
}

/**
 * Send one email. Prefers SMTP (own-domain mailbox), falls back to Resend's
 * REST API (no SDK needed), and finally logs in dev so flows still work.
 * Returns true if the message was accepted by a provider.
 */
export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const t = smtp();
  if (t) {
    try {
      await t.sendMail({ from: config.EMAIL_FROM, to, subject, html });
      return true;
    } catch (err) {
      logger.error({ err }, "SMTP send failed; trying Resend");
    }
  }
  if (config.RESEND_API_KEY) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: config.EMAIL_FROM, to, subject, html }),
      });
      if (r.ok) return true;
      logger.error({ status: r.status, body: await r.text().catch(() => "") }, "Resend send failed");
    } catch (err) {
      logger.error({ err }, "Resend request failed");
    }
  }
  logger.warn({ to, subject }, "No email provider configured — email not sent");
  return false;
}

export function otpEmailHtml(name: string, otp: string): string {
  const who = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  return `<!doctype html><html><body style="margin:0;background:#0b1020;font-family:system-ui,Segoe UI,Roboto,sans-serif">
  <div style="max-width:460px;margin:0 auto;padding:32px 20px;color:#e5e7eb">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
      <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#06b6d4,#8b5cf6)"></div>
      <div style="font-size:20px;font-weight:800;color:#fff">Circuvent</div>
    </div>
    <p style="font-size:15px">${who}</p>
    <p style="font-size:15px;color:#9aa6c0">Use this code to verify your Circuvent account:</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#fff;background:#131a30;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:18px;text-align:center;margin:18px 0">${otp}</div>
    <p style="font-size:13px;color:#64748b">This code expires in ${config.OTP_TTL_MIN} minutes. If you didn't request it, you can ignore this email.</p>
  </div></body></html>`;
}

export async function sendOtpEmail(email: string, name: string, otp: string): Promise<boolean> {
  return sendMail(email, `${otp} is your Circuvent verification code`, otpEmailHtml(name, otp));
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
