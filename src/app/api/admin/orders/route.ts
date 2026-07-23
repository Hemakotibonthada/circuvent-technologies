import { NextResponse } from "next/server";
import { listOrders, updateOrder, creditWallet, logAudit, type StoredOrder } from "@/lib/store";
import { sendStatusEmail } from "@/lib/order-core";
import { adminFromRequest, requireArea } from "@/lib/admin-auth";

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
  return requireArea(adminFromRequest(request), "orders");
}

// GET /api/admin/orders?status=&q= — list orders + summary
export async function GET(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const q = searchParams.get("q") || undefined;

  const orders = listOrders({ status, q });

  // CSV export of the (filtered) orders.
  if (searchParams.get("format") === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      "Order",
      "Placed",
      "Status",
      "Payment",
      "PaymentStatus",
      "Name",
      "Email",
      "Phone",
      "Address",
      "Subtotal",
      "Discount",
      "Shipping",
      "Total",
      "Tracking",
      "Carrier",
    ];
    const rows = orders.map((o: StoredOrder) =>
      [
        o.orderNo,
        o.placedAt,
        o.status,
        o.paymentMethod,
        o.paymentStatus,
        o.customer.name,
        o.customer.email,
        o.customer.phone,
        [o.customer.address, o.customer.city, o.customer.state, o.customer.pincode].filter(Boolean).join(", "),
        o.subtotal,
        o.discount || 0,
        o.shipping,
        o.total,
        o.trackingNumber || "",
        o.carrier || "",
      ]
        .map(esc)
        .join(",")
    );
    const csv = [header.map(esc).join(","), ...rows].join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="circuvent-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

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

    // Cancelling a paid order refunds the amount to the customer's wallet (once).
    if (status === "cancelled" && updated.paymentStatus === "paid" && updated.customer.email) {
      creditWallet(updated.customer.email, updated.total, `Refund — cancelled order ${updated.orderNo}`, updated.orderNo);
      updated.paymentStatus = "refunded";
      updateOrder(orderNo, {}, `Refunded ₹${updated.total} to wallet on cancellation`);
      logAudit("order.cancel_refund", `${updated.orderNo} ₹${updated.total}`);
    }

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
