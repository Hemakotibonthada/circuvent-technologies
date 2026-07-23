import { NextResponse } from "next/server";
import { getOrder, getStoredProduct } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/orders/reorder { orderNo } — returns the purchasable items from a past order. */
export async function POST(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });

  const { orderNo } = await request.json().catch(() => ({}));
  const order = getOrder(String(orderNo || ""), email);
  if (!order) return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });

  const items = order.items
    .map((it) => {
      const p = it.id ? getStoredProduct(it.id) : null;
      const available = !!p && p.available && p.stock > 0;
      return {
        id: it.id,
        slug: it.slug,
        name: it.name,
        price: p?.price ?? it.price,
        qty: it.qty,
        available,
        inStock: p?.stock ?? 0,
      };
    })
    .filter((x) => x.id);

  const anyAvailable = items.some((i) => i.available);
  return NextResponse.json({ success: true, items, anyAvailable });
}
