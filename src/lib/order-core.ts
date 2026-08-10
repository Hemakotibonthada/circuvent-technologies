import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { Resend } from "resend";
import { products, computeTotals, formatINR } from "./shop-data";
import { validateCoupon } from "./coupons";
import { listProducts } from "./store";
import { productAvailability, type AvailabilityInput } from "./product-availability";
import { BRAND } from "./brand";
import { recordEmail } from "./email-log";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://circuvent.com";

/** Absolute logo URL for emails (relative paths don't resolve in mail clients). */
const LOGO_URL = `${SITE_URL}/logo-mark.png`;
const emailLogo = (size = 26) =>
  `<img src="${LOGO_URL}" width="${size}" height="${size}" alt="Circuvent" style="vertical-align:middle;margin-right:8px;border-radius:5px" />`;

let transporter: Transporter | null = null;
function getTransport(): Transporter | null {
  if (transporter) return transporter;
  // Trimmed because a trailing newline in a dashboard-set variable is invisible
  // but fatal: it turns the host into an unresolvable name (ENOTFOUND) and
  // makes SMTP_SECURE fail its "true" comparison, silently disabling TLS.
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) return null;
  transporter = nodemailer.createTransport({
    host,
    port: Number(String(process.env.SMTP_PORT || 587).trim()),
    secure: String(process.env.SMTP_SECURE).trim() === "true",
    auth: { user, pass },
    requireTLS: true,
  });
  return transporter;
}

export interface MailMeta {
  /** Category tag for the evidence log (otp, order, contact, alert, report, ...). */
  type?: string;
  /** Extra recipients (also captured as evidence). */
  cc?: string[];
  /** Related identifier — order number, customer email, ticket id, etc. */
  related?: string;
}

/**
 * Sends one email and records it to the email evidence log (email_history).
 * Prefers SMTP (the store's own domain mailbox) and falls back to Resend.
 * Returns true on delivery; every attempt (success or failure) is logged.
 */
export async function sendMail(
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
  meta?: MailMeta
): Promise<boolean> {
  const type = meta?.type || "other";
  const replyToUsed = replyTo || process.env.EMAIL_REPLY_TO || null;
  const cc = meta?.cc && meta.cc.length ? meta.cc : undefined;
  let ok = false;
  let provider = "none";
  let messageId: string | null = null;
  let error: string | null = null;
  let fromUsed: string | null = null;

  const t = getTransport();
  if (t) {
    provider = "smtp";
    fromUsed = process.env.EMAIL_FROM || `Circuvent Store <${process.env.SMTP_USER}>`;
    try {
      const info = await t.sendMail({ from: fromUsed, to, cc, subject, html, replyTo: replyToUsed || undefined });
      ok = true;
      messageId = (info as { messageId?: string })?.messageId ?? null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      console.error("SMTP send error:", e);
    }
  }
  if (!ok && process.env.RESEND_API_KEY) {
    provider = "resend";
    fromUsed = "Circuvent Store <onboarding@resend.dev>";
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const r = (await resend.emails.send({ from: fromUsed, to: [to], cc, subject, html, replyTo: replyToUsed || undefined })) as { data: { id?: string } | null; error: { message?: string } | string | null };
      if (r.error) {
        error = typeof r.error === "string" ? r.error : r.error.message || JSON.stringify(r.error);
        // onboarding@resend.dev is Resend's sandbox sender: it can only deliver
        // to the API key owner's own address, and rejects every other recipient
        // with a 403. Called out explicitly because the generic message reads
        // like a transient error, and this one silently broke every OTP.
        if (/only send testing emails|verify a domain/i.test(error)) {
          console.error(
            `Resend is in sandbox mode and refused to mail ${to}. ` +
              "Configure SMTP_HOST/SMTP_USER/SMTP_PASS to send from the Circuvent mail server, " +
              "or verify a domain at resend.com/domains."
          );
        } else {
          console.error("Resend send error:", r.error);
        }
      } else {
        ok = true;
        messageId = r.data?.id ?? null;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      console.error("Resend send error:", e);
    }
  }
  if (provider === "none") error = error || "No mail transport configured (set SMTP_* or RESEND_API_KEY)";

  await recordEmail({
    to,
    from: fromUsed,
    replyTo: replyToUsed,
    cc: cc ? cc.join(", ") : null,
    subject,
    type,
    status: ok ? "sent" : "failed",
    provider,
    messageId,
    error,
    related: meta?.related ?? null,
    bodyHtml: html,
    meta: meta ?? null,
  });

  return ok;
}

export interface IncomingItem {
  id?: string;
  slug?: string;
  qty?: number;
}

export interface OrderLine {
  name: string;
  price: number;
  qty: number;
  lineTotal: number;
  /**
   * Warranty months as they stood when the order was placed.
   *
   * Snapshotted rather than looked up later, because a term is a promise made
   * at the moment of sale. If the catalogue is edited afterwards — shortened
   * for a new batch, or the product withdrawn entirely — reading it live would
   * silently rewrite the cover somebody already bought, and there would be no
   * record that it had changed.
   */
  warrantyMonths?: number;
}

export interface CustomerInfo {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  paymentMethod?: string;
}

export function genOrderNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `CV-${ymd}-${rand}`;
}

type PriceResult =
  | {
      ok: true;
      lines: OrderLine[];
      subtotal: number;
      shipping: number;
      discount: number;
      couponCode: string;
      couponLabel: string;
      total: number;
    }
  | { ok: false; error: string };

/** Recompute every line from the catalog — never trust client-supplied prices. */
export function priceItems(items: IncomingItem[], couponCode?: string): PriceResult {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Your cart is empty." };
  }
  const lines: OrderLine[] = [];
  const live = listProducts(); // authoritative prices/availability (admin-editable)
  for (const it of items) {
    const cat = products.find((pr) => pr.id === it.id || pr.slug === it.slug);
    const lp = live.find((pr) => pr.id === it.id || pr.slug === it.slug);
    if (!cat && !lp) return { ok: false, error: "A product in your cart is no longer available." };
    /*
     * Refuse on the server, not just in the UI.
     *
     * Hiding a button stops an accident; it does not stop a POST. A product
     * that has not been released has no stock, so the stock check below would
     * have rejected it anyway — with "out of stock", which is both untrue and
     * the wrong instruction to give somebody. Checking availability properly
     * gets the reason right and covers the withdrawn case, which no stock
     * check would have caught at all.
     */
    const availability = productAvailability((lp ?? cat) as AvailabilityInput);
    if (!availability.canBuy && availability.state !== "sold-out") {
      const name = cat?.name || lp?.name || "A product in your cart";
      return { ok: false, error: `${name}: ${availability.reason ?? "not available to order."}` };
    }
    if (lp && lp.available === false) return { ok: false, error: `${lp.name} is currently unavailable.` };
    if (lp && typeof lp.stock === "number" && lp.stock <= 0) {
      return { ok: false, error: `${lp.name} is out of stock and can't be ordered right now.` };
    }
    const name = cat?.name || lp?.name || "Item";
    const price = lp?.price ?? cat?.price ?? 0; // live store price wins over the static catalog
    const qty = Math.max(1, Math.min(99, Number(it.qty) || 1));
    if (lp && typeof lp.stock === "number" && qty > lp.stock) {
      return { ok: false, error: `Only ${lp.stock} unit(s) of ${name} left in stock.` };
    }
    lines.push({ name, price, qty, lineTotal: price * qty, warrantyMonths: lp?.warrantyMonths ?? cat?.warrantyMonths });
  }
  const { subtotal, shipping } = computeTotals(lines);
  let discount = 0;
  let code = "";
  let label = "";
  if (couponCode) {
    const r = validateCoupon(couponCode, subtotal, shipping);
    if (r.valid) {
      discount = r.discount;
      code = r.code;
      label = r.label;
    }
  }
  const total = Math.max(0, subtotal + shipping - discount);
  return { ok: true, lines, subtotal, shipping, discount, couponCode: code, couponLabel: label, total };
}

export function validateCustomer(c: CustomerInfo): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!c?.name || String(c.name).trim().length < 2) errors.name = "Please enter your full name.";
  if (!c?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) errors.email = "Please provide a valid email.";
  if (!c?.phone || String(c.phone).trim().length < 6) errors.phone = "Please provide a contact number.";
  if (!c?.address || String(c.address).trim().length < 5) errors.address = "Please provide a delivery address.";
  if (!c?.pincode || String(c.pincode).trim().length < 4) errors.pincode = "Please provide a PIN code.";
  return errors;
}

interface EmailArgs {
  orderNo: string;
  lines: OrderLine[];
  subtotal: number;
  shipping: number;
  discount?: number;
  couponLabel?: string;
  total: number;
  customer: CustomerInfo;
  paymentMethod: string;
  paymentStatus: string;
}

/** Sends a customer confirmation + a store notification via Resend (best-effort). */
export async function sendOrderEmails(a: EmailArgs): Promise<boolean> {
  const rows = a.lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 0;font-size:14px;color:#0c1222">${l.name} <span style="color:#8494a7">× ${l.qty}</span></td><td style="padding:6px 0;font-size:14px;text-align:right;color:#0c1222">${formatINR(l.lineTotal)}</td></tr>`
    )
    .join("");
  const summary = `
    <table style="width:100%;border-collapse:collapse;margin-top:8px">${rows}
      <tr><td style="padding:6px 0;border-top:1px solid #e2e8f0;color:#536478">Subtotal</td><td style="padding:6px 0;border-top:1px solid #e2e8f0;text-align:right;color:#0c1222">${formatINR(a.subtotal)}</td></tr>
      <tr><td style="padding:4px 0;color:#536478">Shipping</td><td style="padding:4px 0;text-align:right;color:#0c1222">${a.shipping === 0 ? "Free" : formatINR(a.shipping)}</td></tr>
      ${a.discount && a.discount > 0 ? `<tr><td style="padding:4px 0;color:#536478">Discount${a.couponLabel ? ` (${a.couponLabel})` : ""}</td><td style="padding:4px 0;text-align:right;color:#10b981">- ${formatINR(a.discount)}</td></tr>` : ""}
      <tr><td style="padding:6px 0;font-weight:700;color:#0c1222">Total</td><td style="padding:6px 0;text-align:right;font-weight:800;color:#0c1222">${formatINR(a.total)}</td></tr>
    </table>`;
  const addr = [a.customer.address, a.customer.city, a.customer.state, a.customer.pincode].filter(Boolean).join(", ");
  const payLabel = a.paymentMethod === "razorpay" ? `Paid online (Razorpay) — ${a.paymentStatus}` : a.paymentMethod.toUpperCase();
  const trackUrl = `${SITE_URL}/track?order=${encodeURIComponent(a.orderNo)}&email=${encodeURIComponent(a.customer.email || "")}`;

  const customerHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#06b6d4,#8b5cf6);padding:24px;border-radius:12px 12px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">${emailLogo()}Thanks for your order!</h1>
        <p style="color:#e0f2fe;margin:6px 0 0;font-size:13px">Order ${a.orderNo}</p>
      </div>
      <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
        <p style="font-size:14px;color:#0c1222">Hi ${a.customer.name}, we've received your order and will confirm dispatch shortly.</p>
        ${summary}
        <p style="margin-top:16px;font-size:12px;color:#536478">Deliver to: ${addr}<br/>Payment: ${payLabel}</p>
        <div style="text-align:center;margin:20px 0 8px">
          <a href="${trackUrl}" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#8b5cf6);color:#fff;text-decoration:none;padding:12px 26px;border-radius:10px;font-size:14px;font-weight:600">Track your order</a>
        </div>
        <p style="font-size:12px;color:#94a3b8;text-align:center">Or track anytime at ${SITE_URL}/track using order <b>${a.orderNo}</b> and this email.</p>
      </div>
    </div>`;
  const adminHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#0c1222;padding:20px;border-radius:12px 12px 0 0"><h1 style="color:#fff;margin:0;font-size:18px">New order ${a.orderNo} — ${formatINR(a.total)} · ${payLabel}</h1></div>
      <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
        <p style="font-size:14px;color:#0c1222"><b>${a.customer.name}</b> · ${a.customer.email} · ${a.customer.phone}</p>
        <p style="font-size:13px;color:#536478">${addr}</p>
        ${summary}
      </div>
    </div>`;

  const [toCustomer, toStore] = await Promise.all([
    sendMail(
      a.customer.email as string,
      `Your Circuvent order ${a.orderNo}`,
      customerHtml,
      process.env.EMAIL_REPLY_TO || process.env.CONTACT_EMAIL || BRAND.supportEmail,
      { type: "order", related: a.orderNo }
    ),
    sendMail(
      process.env.CONTACT_EMAIL || process.env.EMAIL_REPLY_TO || "hemakotibonthada@gmail.com",
      `[Order] ${a.orderNo} — ${a.customer.name} — ${formatINR(a.total)}`,
      adminHtml,
      a.customer.email as string,
      { type: "order", related: a.orderNo }
    ),
  ]);
  return toCustomer || toStore;
}

/** Emails the customer when an order's status changes (called from admin). */
export async function sendStatusEmail(args: {
  orderNo: string;
  email: string;
  name?: string;
  statusLabel: string;
  trackingNumber?: string;
  carrier?: string;
}): Promise<boolean> {
  if (!args.email) return false;
  const trackUrl = `${SITE_URL}/track?order=${encodeURIComponent(args.orderNo)}&email=${encodeURIComponent(args.email)}`;
  const tracking = args.trackingNumber
    ? `<p style="font-size:13px;color:#536478;margin:6px 0 0">Tracking: <b>${args.trackingNumber}</b>${args.carrier ? ` · ${args.carrier}` : ""}</p>`
    : "";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#06b6d4,#8b5cf6);padding:24px;border-radius:12px 12px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">${emailLogo()}Order update</h1>
        <p style="color:#e0f2fe;margin:6px 0 0;font-size:13px">Order ${args.orderNo}</p>
      </div>
      <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
        <p style="font-size:14px;color:#0c1222">Hi ${args.name || "there"}, your order status is now <b>${args.statusLabel}</b>.</p>
        ${tracking}
        <div style="text-align:center;margin:20px 0 8px">
          <a href="${trackUrl}" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#8b5cf6);color:#fff;text-decoration:none;padding:12px 26px;border-radius:10px;font-size:14px;font-weight:600">Track your order</a>
        </div>
      </div>
    </div>`;
  return sendMail(
    args.email,
    `Your Circuvent order ${args.orderNo} — ${args.statusLabel}`,
    html,
    process.env.EMAIL_REPLY_TO,
    { type: "order_status", related: args.orderNo }
  );
}

/** Sends a 6-digit account verification code. */
export async function sendOtpEmail(email: string, name: string, otp: string): Promise<boolean> {
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#06b6d4,#8b5cf6);padding:24px;border-radius:12px 12px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">${emailLogo()}Verify your email</h1>
      </div>
      <div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center">
        <p style="font-size:14px;color:#0c1222;margin:0 0 14px">Hi ${name || "there"}, use this code to finish creating your Circuvent account:</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#0c1222;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 0">${otp}</div>
        <p style="font-size:12px;color:#94a3b8;margin:16px 0 0">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
      </div>
    </div>`;
  return sendMail(email, `${otp} is your Circuvent verification code`, html, process.env.EMAIL_REPLY_TO, { type: "otp", related: email });
}

export async function sendPasswordResetEmail(email: string, name: string, otp: string): Promise<boolean> {
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#06b6d4,#8b5cf6);padding:24px;border-radius:12px 12px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">${emailLogo()}Reset your password</h1>
      </div>
      <div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center">
        <p style="font-size:14px;color:#0c1222;margin:0 0 14px">Hi ${name || "there"}, use this code to reset your Circuvent account password:</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#0c1222;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 0">${otp}</div>
        <p style="font-size:12px;color:#94a3b8;margin:16px 0 0">This code expires in 15 minutes. If you didn't request a password reset, you can safely ignore this email — your password won't change.</p>
      </div>
    </div>`;
  return sendMail(email, `${otp} is your Circuvent password reset code`, html, process.env.EMAIL_REPLY_TO, { type: "password_reset", related: email });
}

export async function sendAdmin2faEmail(email: string, name: string, otp: string): Promise<boolean> {
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#06b6d4,#8b5cf6);padding:24px;border-radius:12px 12px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">${emailLogo()}Admin sign-in code</h1>
      </div>
      <div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center">
        <p style="font-size:14px;color:#0c1222;margin:0 0 14px">Hi ${name || "there"}, enter this code to complete your Circuvent admin sign-in:</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#0c1222;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 0">${otp}</div>
        <p style="font-size:12px;color:#94a3b8;margin:16px 0 0">This code expires in 10 minutes. If this wasn't you, change your password immediately.</p>
      </div>
    </div>`;
  return sendMail(email, `${otp} is your Circuvent admin sign-in code`, html, process.env.EMAIL_REPLY_TO, { type: "admin_2fa", related: email });
}
