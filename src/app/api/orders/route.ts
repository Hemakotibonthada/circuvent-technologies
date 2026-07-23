import { NextResponse, after } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  priceItems,
  validateCustomer,
  genOrderNo,
  sendOrderEmails,
  type IncomingItem,
  type CustomerInfo,
} from "@/lib/order-core";
import { recordOrder, adjustStock, debitWallet, earnPoints, rewardReferralOnPaidOrder } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";

type Priced = {
  lines: { name: string; price: number; qty: number; lineTotal: number }[];
  subtotal: number;
  shipping: number;
  discount: number;
  couponCode: string;
  couponLabel: string;
  total: number;
};

/**
 * POST /api/orders
 * Places a Cash-on-Delivery / wallet order: recomputes totals from the
 * catalog, persists the order, decrements stock, emails a confirmation +
 * store notification, and returns the order.
 * Online card/UPI payments go through /api/payments/*.
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
    const c: CustomerInfo = body?.customer ?? {};

    const priced = priceItems(items, body?.coupon);
    if (!priced.ok) return NextResponse.json({ success: false, message: priced.error }, { status: 400 });

    const errors = validateCustomer(c);
    if (Object.keys(errors).length > 0) return NextResponse.json({ success: false, errors }, { status: 400 });

    const method = c.paymentMethod || "cod";

    // Wallet (store credit) payment — needs a signed-in account whose email
    // matches the checkout email, and enough balance.
    if (method === "wallet") {
      const tokenEmail = verifyToken(tokenFromRequest(request));
      if (!tokenEmail) {
        return NextResponse.json(
          { success: false, message: "Please sign in to pay with your wallet." },
          { status: 401 }
        );
      }
      if (tokenEmail.toLowerCase() !== String(c.email || "").toLowerCase()) {
        return NextResponse.json(
          { success: false, message: "Use your signed-in account email to pay with wallet." },
          { status: 400 }
        );
      }
      const orderNo = genOrderNo();
      const res = debitWallet(tokenEmail, priced.total, `Order ${orderNo}`, orderNo);
      if (!res.ok) {
        return NextResponse.json(
          { success: false, message: "Insufficient wallet balance. Top up or choose another method." },
          { status: 400 }
        );
      }
      return await finalize(orderNo, priced, c, method, "paid", items);
    }

    return await finalize(genOrderNo(), priced, c, method, "pending", items);
  } catch (error) {
    console.error("Orders error:", error);
    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

async function finalize(
  orderNo: string,
  priced: Priced,
  c: CustomerInfo,
  method: string,
  paymentStatus: string,
  items: IncomingItem[]
) {
  const placedAt = new Date().toISOString();
  const customer = {
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
    city: c.city || "",
    state: c.state || "",
    pincode: c.pincode,
  };

  // Persist + adjust stock (best-effort — never block the order on storage).
  try {
    recordOrder({
      orderNo,
      placedAt,
      items: priced.lines,
      subtotal: priced.subtotal,
      shipping: priced.shipping,
      discount: priced.discount,
      couponCode: priced.couponCode,
      total: priced.total,
      customer,
      paymentMethod: method,
      paymentStatus,
    });
    adjustStock(items, -1);
    if (paymentStatus === "paid" && c.email) {
      earnPoints(c.email, priced.total, orderNo);
      rewardReferralOnPaidOrder(c.email, orderNo);
    }
  } catch (e) {
    console.error("Order persistence error:", e);
  }

  // Email the customer + store in the background so checkout returns instantly.
  after(async () => {
    await sendOrderEmails({
      orderNo,
      lines: priced.lines,
      subtotal: priced.subtotal,
      shipping: priced.shipping,
      discount: priced.discount,
      couponLabel: priced.couponLabel,
      total: priced.total,
      customer: c,
      paymentMethod: method,
      paymentStatus,
    });
  });

  return NextResponse.json({
    success: true,
    order: {
      orderNo,
      placedAt,
      items: priced.lines,
      subtotal: priced.subtotal,
      shipping: priced.shipping,
      discount: priced.discount,
      couponCode: priced.couponCode,
      total: priced.total,
      customer,
      paymentMethod: method,
      paymentStatus,
      status: "placed",
      emailed: true,
    },
  });
}
