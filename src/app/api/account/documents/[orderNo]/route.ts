import { NextResponse } from "next/server";
import { getOrder, listOrdersByEmail, revalidate } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";
import { buildDocument, availableDocuments, type DocumentKind, type DocumentOrderLike } from "@/lib/documents";
import { registrationsForOrder } from "@/lib/admin-warranty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: DocumentKind[] = ["invoice", "packing-slip", "delivery-note", "warranty-certificate"];

/**
 * GET /api/account/documents/[orderNo]?kind=invoice
 *
 * Everything a customer document needs, in one authenticated call.
 *
 * The invoice page used to read /api/orders/track, which is public and
 * deliberately returns only the customer's email — so the "Billed to" block
 * rendered a heading with nothing under it. Nobody noticed because the page
 * still looked like an invoice. Widening the public endpoint would have fixed
 * the blank but handed out a postal address and phone number to anyone who
 * could guess an order number; this route requires the session instead, and
 * only ever returns the signed-in customer's own orders.
 */
export async function GET(request: Request, ctx: { params: Promise<{ orderNo: string }> }) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) {
    return NextResponse.json({ success: false, message: "Please sign in to view your documents." }, { status: 401 });
  }

  const { orderNo } = await ctx.params;
  if (!orderNo) {
    return NextResponse.json({ success: false, message: "Order number is required." }, { status: 400 });
  }

  await revalidate(["orders"]);

  // Scoped to the signed-in email, so an order number belonging to somebody
  // else resolves to nothing rather than to their address.
  const order = getOrder(orderNo, email) ?? listOrdersByEmail(email).find((o) => o.orderNo === orderNo) ?? null;
  if (!order) {
    return NextResponse.json({ success: false, message: "No such order on your account." }, { status: 404 });
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
