import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { createTicket, listTicketsByEmail, getAccount } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/support — the signed-in customer's tickets. */
export async function GET(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  return NextResponse.json({ success: true, tickets: listTicketsByEmail(email) });
}

/** POST /api/support { subject, message, orderNo? } — open a support ticket. */
export async function POST(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });

  const ip = clientIp(request);
  const { ok, retryAfter } = rateLimit("contact", ip);
  if (!ok) {
    return NextResponse.json(
      { success: false, message: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const { subject, message, orderNo } = await request.json();
  if (!message || String(message).trim().length < 5) {
    return NextResponse.json({ success: false, message: "Please describe your issue." }, { status: 400 });
  }
  const acc = getAccount(email);
  const ticket = createTicket({
    email,
    name: acc?.name || email,
    subject: subject || "Support request",
    message,
    orderNo: orderNo || undefined,
  });
  return NextResponse.json({ success: true, ticket });
}
