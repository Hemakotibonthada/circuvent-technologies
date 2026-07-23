import { NextResponse, after } from "next/server";
import { listReturns, getReturn, updateReturn, getOrder, creditWallet, logAudit } from "@/lib/store";
import { sendMail } from "@/lib/order-core";
import { adminFromRequest, requireArea } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyAdmin(request: Request): boolean {
  return requireArea(adminFromRequest(request), "returns");
}

export async function GET(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ success: true, returns: listReturns() });
}

/** PATCH /api/admin/returns { id, action: approve|reject|refund, note?, amount? } */
export async function PATCH(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id, action, note, amount } = await request.json();
    const r = getReturn(id);
    if (!r) return NextResponse.json({ success: false, message: "Return not found." }, { status: 404 });

    if (action === "approve") {
      updateReturn(id, { status: "approved", adminNote: note });
    } else if (action === "reject") {
      updateReturn(id, { status: "rejected", adminNote: note });
    } else if (action === "refund") {
      const order = getOrder(r.orderNo, r.email);
      const amt = Math.max(0, Number(amount) || order?.total || 0);
      creditWallet(r.email, amt, `Refund — order ${r.orderNo}`, r.orderNo);
      updateReturn(id, { status: "refunded", refundAmount: amt, adminNote: note });
      logAudit("return.refund", `${r.orderNo} ₹${amt} -> ${r.email}`);
      after(async () => {
        await sendMail(
          r.email,
          `Refund processed — order ${r.orderNo}`,
          `<div style="font-family:system-ui,sans-serif"><p>We've credited ₹${amt} to your Circuvent Wallet for order ${r.orderNo}. You can use it on your next order.</p></div>`
        );
      });
    } else {
      return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ success: true, request: getReturn(id) });
  } catch {
    return NextResponse.json({ success: false, message: "Could not update the return." }, { status: 500 });
  }
}
