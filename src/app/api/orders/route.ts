import { NextResponse } from "next/server";
import { Resend } from "resend";
import { rateLimit } from "@/lib/rate-limit";
import { products, computeTotals, formatINR } from "@/lib/shop-data";

const resend = new Resend(process.env.RESEND_API_KEY);

function genOrderNo() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `CV-${ymd}-${rand}`;
}

interface IncomingItem {
  id?: string;
  slug?: string;
  qty?: number;
}

/**
 * POST /api/orders
 * Places a shop order: recomputes totals from the catalog (never trusts client
 * prices), emails a confirmation + a store notification via Resend, and returns
 * the order with a generated order number.
 */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { ok, retryAfter } = rateLimit("orders", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await request.json();
    const items: IncomingItem[] = body?.items;
    const c = body?.customer ?? {};

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, message: "Your cart is empty." }, { status: 400 });
    }

    const errors: Record<string, string> = {};
    if (!c.name || String(c.name).trim().length < 2) errors.name = "Please enter your full name.";
    if (!c.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) errors.email = "Please provide a valid email.";
    if (!c.phone || String(c.phone).trim().length < 6) errors.phone = "Please provide a contact number.";
    if (!c.address || String(c.address).trim().length < 5) errors.address = "Please provide a delivery address.";
    if (!c.pincode || String(c.pincode).trim().length < 4) errors.pincode = "Please provide a PIN code.";
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ success: false, errors }, { status: 400 });
    }

    // Recompute every price from the catalog.
    const lines: { name: string; price: number; qty: number; lineTotal: number }[] = [];
    for (const it of items) {
      const p = products.find((pr) => pr.id === it.id || pr.slug === it.slug);
      if (!p) {
        return NextResponse.json(
          { success: false, message: "A product in your cart is no longer available." },
          { status: 400 }
        );
      }
      const qty = Math.max(1, Math.min(99, Number(it.qty) || 1));
      lines.push({ name: p.name, price: p.price, qty, lineTotal: p.price * qty });
    }

    const { subtotal, shipping, total } = computeTotals(lines);
    const orderNo = genOrderNo();
    const placedAt = new Date().toISOString();

    const rowsHtml = lines
      .map(
        (l) =>
          `<tr><td style="padding:6px 0;font-size:14px;color:#0c1222">${l.name} <span style="color:#8494a7">× ${l.qty}</span></td><td style="padding:6px 0;font-size:14px;text-align:right;color:#0c1222">${formatINR(l.lineTotal)}</td></tr>`
      )
      .join("");

    const summaryTable = `
      <table style="width:100%;border-collapse:collapse;margin-top:8px">${rowsHtml}
        <tr><td style="padding:6px 0;border-top:1px solid #e2e8f0;color:#536478">Subtotal</td><td style="padding:6px 0;border-top:1px solid #e2e8f0;text-align:right;color:#0c1222">${formatINR(subtotal)}</td></tr>
        <tr><td style="padding:4px 0;color:#536478">Shipping</td><td style="padding:4px 0;text-align:right;color:#0c1222">${shipping === 0 ? "Free" : formatINR(shipping)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:700;color:#0c1222">Total</td><td style="padding:6px 0;text-align:right;font-weight:800;color:#0c1222">${formatINR(total)}</td></tr>
      </table>`;

    const addr = [c.address, c.city, c.state, c.pincode].filter(Boolean).join(", ");

    const customerHtml = `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:linear-gradient(135deg,#06b6d4,#8b5cf6);padding:24px;border-radius:12px 12px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">Thanks for your order!</h1>
          <p style="color:#e0f2fe;margin:6px 0 0;font-size:13px">Order ${orderNo}</p>
        </div>
        <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:14px;color:#0c1222">Hi ${c.name}, we've received your order and will confirm dispatch shortly.</p>
          ${summaryTable}
          <p style="margin-top:16px;font-size:12px;color:#536478">Deliver to: ${addr}<br/>Payment: ${(c.paymentMethod || "cod").toUpperCase()}</p>
          <p style="margin-top:16px;font-size:12px;color:#94a3b8">Track your order anytime at circuvent.tech/track using ${orderNo} and this email.</p>
        </div>
      </div>`;

    const adminHtml = `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#0c1222;padding:20px;border-radius:12px 12px 0 0"><h1 style="color:#fff;margin:0;font-size:18px">New order ${orderNo} — ${formatINR(total)}</h1></div>
        <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:14px;color:#0c1222"><b>${c.name}</b> · ${c.email} · ${c.phone}</p>
          <p style="font-size:13px;color:#536478">${addr}</p>
          ${summaryTable}
        </div>
      </div>`;

    let emailed = false;
    if (process.env.RESEND_API_KEY) {
      try {
        await resend.emails.send({
          from: "Circuvent Store <onboarding@resend.dev>",
          to: [c.email],
          replyTo: process.env.CONTACT_EMAIL || "hemakotibonthada@gmail.com",
          subject: `Your Circuvent order ${orderNo}`,
          html: customerHtml,
        });
        await resend.emails.send({
          from: "Circuvent Store <onboarding@resend.dev>",
          to: [process.env.CONTACT_EMAIL || "hemakotibonthada@gmail.com"],
          replyTo: c.email,
          subject: `[Order] ${orderNo} — ${c.name} — ${formatINR(total)}`,
          html: adminHtml,
        });
        emailed = true;
      } catch (e) {
        console.error("Order email error:", e);
      }
    }

    return NextResponse.json({
      success: true,
      order: {
        orderNo,
        placedAt,
        items: lines,
        subtotal,
        shipping,
        total,
        customer: {
          name: c.name,
          email: c.email,
          phone: c.phone,
          address: c.address,
          city: c.city || "",
          state: c.state || "",
          pincode: c.pincode,
        },
        paymentMethod: c.paymentMethod || "cod",
        status: "placed",
        emailed,
      },
    });
  } catch (error) {
    console.error("Orders error:", error);
    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
