import { NextResponse } from "next/server";
import { addNotifyRequest, getStoredProduct } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/notify-restock { productId, email? } — subscribe to a back-in-stock alert. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const productId = (body.productId || "").toString();
  const authedEmail = verifyToken(tokenFromRequest(request));
  const email = (authedEmail || body.email || "").toString().trim().toLowerCase();

  if (!productId || !getStoredProduct(productId)) {
    return NextResponse.json({ success: false, message: "Unknown product." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ success: false, message: "A valid email is required." }, { status: 400 });
  }

  addNotifyRequest(productId, email);
  return NextResponse.json({ success: true, message: "You'll be emailed the moment this is back in stock." });
}
