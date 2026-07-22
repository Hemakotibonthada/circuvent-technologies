import { Resend } from "resend";
import { products, computeTotals, formatINR } from "./shop-data";

const resend = new Resend(process.env.RESEND_API_KEY);
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://circuvent.com";

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
  | { ok: true; lines: OrderLine[]; subtotal: number; shipping: number; total: number }
  | { ok: false; error: string };

/** Recompute every line from the catalog — never trust client-supplied prices. */
export function priceItems(items: IncomingItem[]): PriceResult {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Your cart is empty." };
  }
  const lines: OrderLine[] = [];
  for (const it of items) {
    const p = products.find((pr) => pr.id === it.id || pr.slug === it.slug);
    if (!p) return { ok: false, error: "A product in your cart is no longer available." };
    const qty = Math.max(1, Math.min(99, Number(it.qty) || 1));
    lines.push({ name: p.name, price: p.price, qty, lineTotal: p.price * qty });
  }
  const { subtotal, shipping, total } = computeTotals(lines);
  return { ok: true, lines, subtotal, shipping, total };
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
  total: number;
  customer: CustomerInfo;
  paymentMethod: string;
  paymentStatus: string;
}

/** Sends a customer confirmation + a store notification via Resend (best-effort). */
export async function sendOrderEmails(a: EmailArgs): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

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

  try {
    await resend.emails.send({
      from: "Circuvent Store <onboarding@resend.dev>",
      to: [a.customer.email as string],
      replyTo: process.env.CONTACT_EMAIL || "hemakotibonthada@gmail.com",
      subject: `Your Circuvent order ${a.orderNo}`,
      html: customerHtml,
    });
    await resend.emails.send({
      from: "Circuvent Store <onboarding@resend.dev>",
      to: [process.env.CONTACT_EMAIL || "hemakotibonthada@gmail.com"],
      replyTo: a.customer.email as string,
      subject: `[Order] ${a.orderNo} — ${a.customer.name} — ${formatINR(a.total)}`,
      html: adminHtml,
    });
    return true;
  } catch (e) {
    console.error("Order email error:", e);
    return false;
  }
}
