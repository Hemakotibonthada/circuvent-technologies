import { NextResponse } from "next/server";
import { getOrder, listOrdersByEmail, revalidate } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { buildDocument, availableDocuments, type DocumentKind, type DocumentOrderLike } from "@/lib/documents";
import { registrationsForOrder } from "@/lib/admin-warranty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: DocumentKind[] = ["invoice", "packing-slip", "delivery-note", "warranty-certificate"];

/**
 * GET /api/account/documents/[orderNo]?kind=invoice[&email=...]
 *
 * Everything a customer document needs, in one call.
 *
 * The invoice page used to read /api/orders/track, which is public and
 * deliberately returns only the customer's email — so the "Billed to" block
 * rendered a heading with nothing under it. Nobody noticed because the page
 * still looked like an invoice.
 *
 * Two ways in, on purpose:
 *
 * A signed-in customer is served from their session, scoped to their own
 * orders, and never has to prove anything further.
 *
 * A guest is served on order number plus the email the order was placed with.
 * Requiring an account is the safer-looking choice and it is the wrong one:
 * checkout does not require an account, so that rule means somebody who
 * bought as a guest can never obtain the invoice for their own purchase —
 * which they need for a warranty claim or an expense report. The bar here is
 * the one /api/orders/track has always used and the business already accepts:
 * both values must match, an order number carries roughly sixty million
 * possibilities, and the path is rate limited. Guessing it requires already
 * knowing the victim's email.
 */
export async function GET(request: Request, ctx: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await ctx.params;
  if (!orderNo) {
    return NextResponse.json({ success: false, message: "Order number is required." }, { status: 400 });
  }

  const url = new URL(request.url);
  const sessionEmail = verifyToken(tokenFromRequest(request));
  const claimedEmail = (url.searchParams.get("email") || "").trim();

  if (!sessionEmail) {
    if (!claimedEmail) {
      return NextResponse.json(
        { success: false, message: "Sign in, or open this from the link in your order confirmation email." },
        { status: 401 }
      );
    }
    // Only the guest path is guessable, so only it is rate limited.
    const { ok, retryAfter } = rateLimit("track", clientIp(request));
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
  }

  await revalidate(["orders"]);

  // getOrder matches on order number AND email, so an order belonging to
  // somebody else resolves to nothing rather than to their address.
  const order = sessionEmail
    ? getOrder(orderNo, sessionEmail) ?? listOrdersByEmail(sessionEmail).find((o) => o.orderNo === orderNo) ?? null
    : getOrder(orderNo, claimedEmail);

  if (!order) {
    return NextResponse.json({ success: false, message: "No order found for that number and email." }, { status: 404 });
  }

  const requested = (new URL(request.url).searchParams.get("kind") || "invoice") as DocumentKind;
  const kind: DocumentKind = KINDS.includes(requested) ? requested : "invoice";

  const available = availableDocuments(order as unknown as DocumentOrderLike);
  if (!available.includes(kind)) {
    return NextResponse.json(
      {
        success: false,
        message:
          kind === "warranty-certificate"
            ? "A warranty certificate is issued once the order has been delivered."
            : "That document is not available for this order yet.",
        available,
      },
      { status: 409 }
    );
  }

  const doc = buildDocument(order as unknown as DocumentOrderLike, kind);

  // Per-unit cover records, so a certificate can list the actual devices
  // rather than repeating the order line.
  const units = registrationsForOrder(order.orderNo).map((r) => ({
    id: r.id,
    productName: r.productName,
    deviceOrSerial: r.deviceOrSerial,
    purchaseDate: r.purchaseDate,
    warrantyMonths: r.warrantyMonths,
    auto: Boolean(r.auto),
  }));

  return NextResponse.json({ success: true, document: doc, units, available });
}
