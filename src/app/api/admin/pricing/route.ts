import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { logAudit } from "@/lib/store";
import { listRules, listHistory, upsertRule, toggleRule, deleteRule, pricingStats } from "@/lib/admin-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "pricing")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ success: true, rules: listRules(), history: listHistory(), stats: pricingStats() });
}

export async function POST(request: Request) {
  const me = guard(request, "pricing");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (!b?.name || !b?.scope || !b?.discountType || !b?.startsAt || !b?.endsAt) {
      return NextResponse.json({ success: false, message: "Missing required fields." }, { status: 400 });
    }
    const rule = upsertRule(
      {
        id: b.id,
        name: b.name,
        scope: b.scope,
        target: b.target,
        discountType: b.discountType,
        value: Math.max(0, Number(b.value) || 0),
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        active: b.active !== false,
      },
      me.name
    );
    logAudit("pricing.rule.upsert", rule.name);
    return NextResponse.json({ success: true, rule });
  } catch {
    return NextResponse.json({ success: false, message: "Could not save rule." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!guard(request, "pricing")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id, active } = await request.json();
    const rule = toggleRule(id, !!active);
    if (!rule) return NextResponse.json({ success: false, message: "Not found." }, { status: 404 });
    return NextResponse.json({ success: true, rule });
  } catch {
    return NextResponse.json({ success: false, message: "Could not update rule." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!guard(request, "pricing")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const ok = deleteRule(searchParams.get("id") || "");
  return NextResponse.json({ success: ok });
}
