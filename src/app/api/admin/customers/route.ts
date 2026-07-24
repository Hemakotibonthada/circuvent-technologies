import { NextResponse } from "next/server";
import { listCustomers, setAccountBlocked, creditWallet, debitWallet, logAudit, revalidate } from "@/lib/store";
import { adminFromRequest, requireArea } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyAdmin(request: Request): boolean {
  return requireArea(adminFromRequest(request), "customers");
}

/** GET /api/admin/customers — directory with order count, spend, wallet. */
export async function GET(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await revalidate(["accounts", "orders", "wallets", "loyalty"]);
  return NextResponse.json({ success: true, customers: listCustomers() });
}

/** PATCH /api/admin/customers { email, action, amount? } — block/unblock/credit/debit wallet. */
export async function PATCH(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { email, action, amount, reason } = await request.json();
    if (!email || !action) {
      return NextResponse.json({ success: false, message: "email and action are required." }, { status: 400 });
    }
    const em = String(email).toLowerCase();
    switch (action) {
      case "block":
        setAccountBlocked(em, true);
        logAudit("customer.block", em);
        break;
      case "unblock":
        setAccountBlocked(em, false);
        logAudit("customer.unblock", em);
        break;
      case "credit": {
        const w = creditWallet(em, Number(amount) || 0, reason || "Store credit (admin)");
        logAudit("wallet.credit", `${em} +${amount}`);
        return NextResponse.json({ success: true, balance: w.balance });
      }
      case "debit": {
        const res = debitWallet(em, Number(amount) || 0, reason || "Adjustment (admin)");
        if (!res.ok) return NextResponse.json({ success: false, message: "Insufficient balance." }, { status: 400 });
        logAudit("wallet.debit", `${em} -${amount}`);
        return NextResponse.json({ success: true, balance: res.wallet.balance });
      }
      default:
        return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: "Could not update the customer." }, { status: 500 });
  }
}
