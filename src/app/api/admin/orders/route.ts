import { NextResponse } from "next/server";
import { listOrders, updateOrder } from "@/lib/store";
import { sendStatusEmail } from "@/lib/order-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function verifyAdmin(request: Request): boolean {
  const token = request.headers.get("x-admin-token");
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || !token) return false;
  const expected = Buffer.from(`${adminPassword}:${new Date().toDateString()}`).toString("base64");
  return token === expected;
}

// GET /api/admin/orders?status=&q= — list orders + summary
export async function GET(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const q = searchParams.get("q") || undefined;

  const orders = listOrders({ status, q });
  const all = listOrders();
  const counts: Record<string, number> = {};
  for (const o of all) counts[o.status] = (counts[o.status] || 0) + 1;
  const revenue = all.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + o.total, 0);

  return NextResponse.json({ success: true, orders, counts, total: all.length, revenue });
}

// PATCH /api/admin/orders — update status / tracking / carrier / note
export async function PATCH(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { orderNo, status, trackingNumber, carrier, note, notify } = body || {};
    if (!orderNo) return NextResponse.json({ success: false, message: "orderNo is required." }, { status: 400 });

    const patch: Record<string, string> = {};
    if (typeof status === "string") patch.status = status;
    if (typeof trackingNumber === "string") patch.trackingNumber = trackingNumber;
    if (typeof carrier === "string") patch.carrier = carrier;

    const updated = updateOrder(orderNo, patch, note);
    if (!updated) return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });

    if (notify && status && updated.customer.email) {
      // fire-and-forget email
      sendStatusEmail({
        orderNo: updated.orderNo,
        email: updated.customer.email,
        name: updated.customer.name,
        statusLabel: STATUS_LABEL[status] || status,
        trackingNumber: updated.trackingNumber,
        carrier: updated.carrier,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, order: updated });
  } catch {
    return NextResponse.json({ success: false, message: "Could not update the order." }, { status: 500 });
  }
}
