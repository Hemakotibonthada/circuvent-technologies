import { NextResponse } from "next/server";
import { listCoupons, upsertCoupon, deleteCoupon, logAudit, type StoreCoupon } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyAdmin(request: Request): boolean {
  const token = request.headers.get("x-admin-token");
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || !token) return false;
  return token === Buffer.from(`${pw}:${new Date().toDateString()}`).toString("base64");
}

export async function GET(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ success: true, coupons: listCoupons() });
}

/** POST /api/admin/coupons — create or replace a coupon. */
export async function POST(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await request.json();
    const code = String(b?.code || "").trim().toUpperCase();
    const type = b?.type as StoreCoupon["type"];
    if (!code || !["percent", "flat", "shipping"].includes(type)) {
      return NextResponse.json({ success: false, message: "Code and a valid type are required." }, { status: 400 });
    }
    const coupon = upsertCoupon({
      code,
      type,
      value: Math.max(0, Number(b?.value) || 0),
      minSubtotal: b?.minSubtotal ? Math.max(0, Number(b.minSubtotal)) : undefined,
      label: String(b?.label || code),
      active: b?.active !== false,
    });
    logAudit("coupon.upsert", code);
    return NextResponse.json({ success: true, coupon });
  } catch {
    return NextResponse.json({ success: false, message: "Could not save the coupon." }, { status: 500 });
  }
}

/** PATCH /api/admin/coupons { code, active } — toggle a coupon on/off. */
export async function PATCH(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { code, active } = await request.json();
    const existing = listCoupons().find((c) => c.code === String(code || "").trim().toUpperCase());
    if (!existing) return NextResponse.json({ success: false, message: "Coupon not found." }, { status: 404 });
    const coupon = upsertCoupon({ ...existing, active: !!active });
    logAudit("coupon.toggle", `${coupon.code}=${coupon.active}`);
    return NextResponse.json({ success: true, coupon });
  } catch {
    return NextResponse.json({ success: false, message: "Could not update the coupon." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code") || "";
  const ok = deleteCoupon(code);
  if (ok) logAudit("coupon.delete", code);
  return NextResponse.json({ success: ok });
}
