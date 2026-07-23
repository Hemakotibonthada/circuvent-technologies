import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { Resend } from "resend";
import { products, computeTotals, formatINR } from "./shop-data";
import { validateCoupon } from "./coupons";
import { listProducts } from "./store";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://circuvent.com";

let transporter: Transporter | null = null;
function getTransport(): Transporter | null {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE) === "true",
    auth: { user, pass },
  });
  return transporter;
}

/**
 * Sends one email. Prefers SMTP (the store's own domain mailbox, which can
 * deliver to any recipient) and falls back to Resend when SMTP isn't set up.
 */
export async function sendMail(
  to: string,
  subject: string,
  html: string,
  replyTo?: string
): Promise<boolean> {
  const t = getTransport();
  if (t) {
    try {
      await t.sendMail({
        from: process.env.EMAIL_FROM || `Circuvent Store <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
        replyTo: replyTo || process.env.EMAIL_REPLY_TO,
      });
      return true;
    } catch (e) {
      console.error("SMTP send error:", e);
    }
  }
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "Circuvent Store <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
        replyTo,
      });
      return true;
    } catch (e) {
      console.error("Resend send error:", e);
    }
  }
  return false;
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
    if (lp && lp.available === false) return { ok: false, error: `${lp.name} is currently unavailable.` };
    const name = cat?.name || lp?.name || "Item";
    const price = lp?.price ?? cat?.price ?? 0; // live store price wins over the static catalog
    const qty = Math.max(1, Math.min(99, Number(it.qty) || 1));
    lines.push({ name, price, qty, lineTotal: price * qty });
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
        <h1 style="color:#fff;margin:0;font-size:20px">Thanks for your order!</h1>
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
      process.env.EMAIL_REPLY_TO || process.env.CONTACT_EMAIL || "hema@circuvent.com"
    ),
    sendMail(
      process.env.CONTACT_EMAIL || process.env.EMAIL_REPLY_TO || "hemakotibonthada@gmail.com",
      `[Order] ${a.orderNo} — ${a.customer.name} — ${formatINR(a.total)}`,
      adminHtml,
      a.customer.email as string
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
        <h1 style="color:#fff;margin:0;font-size:20px">Order update</h1>
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
    process.env.EMAIL_REPLY_TO
  );
}

/** Sends a 6-digit account verification code. */
export async function sendOtpEmail(email: string, name: string, otp: string): Promise<boolean> {
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#06b6d4,#8b5cf6);padding:24px;border-radius:12px 12px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">Verify your email</h1>
      </div>
      <div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center">
        <p style="font-size:14px;color:#0c1222;margin:0 0 14px">Hi ${name || "there"}, use this code to finish creating your Circuvent account:</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#0c1222;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 0">${otp}</div>
        <p style="font-size:12px;color:#94a3b8;margin:16px 0 0">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
      </div>
    </div>`;
  return sendMail(email, `${otp} is your Circuvent verification code`, html, process.env.EMAIL_REPLY_TO);
}
