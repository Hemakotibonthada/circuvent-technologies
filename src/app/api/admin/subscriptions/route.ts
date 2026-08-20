import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { logAudit } from "@/lib/store";
import {
  listPlans,
  upsertPlan,
  deletePlan,
  listSubscribers,
  upsertSubscriber,
  cancelSubscriber,
  subscriptionStats,
  revalidateSubscriptions,
  flushSubscriptions,
} from "@/lib/admin-subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "subscriptions")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await revalidateSubscriptions();
  return NextResponse.json({ success: true, plans: listPlans(), subscribers: listSubscribers(), stats: subscriptionStats() });
}

export async function POST(request: Request) {
  if (!guard(request, "subscriptions")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await revalidateSubscriptions();
    const b = await request.json();
    if (b.kind === "subscriber") {
      if (!b.email || !b.planId) return NextResponse.json({ success: false, message: "email and planId required." }, { status: 400 });
      const subscriber = upsertSubscriber({ email: b.email, planId: b.planId, billingCycle: b.billingCycle || "monthly", status: b.status });
      logAudit("subscriptions.subscriber.upsert", subscriber.email);
      await flushSubscriptions();
      return NextResponse.json({ success: true, subscriber });
    }
    if (!b.name || b.priceMonthly === undefined) return NextResponse.json({ success: false, message: "name and priceMonthly required." }, { status: 400 });
    const plan = upsertPlan({ id: b.id, name: b.name, priceMonthly: Number(b.priceMonthly), priceYearly: Number(b.priceYearly) || Number(b.priceMonthly) * 10, features: b.features || [], active: b.active });
    logAudit("subscriptions.plan.upsert", plan.name);
    await flushSubscriptions();
    return NextResponse.json({ success: true, plan });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!guard(request, "subscriptions")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await revalidateSubscriptions();
    const { id } = await request.json();
    const subscriber = cancelSubscriber(id);
    if (!subscriber) return NextResponse.json({ success: false, message: "Not found." }, { status: 404 });
    await flushSubscriptions();
    return NextResponse.json({ success: true, subscriber });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!guard(request, "subscriptions")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await revalidateSubscriptions();
  const { searchParams } = new URL(request.url);
  const ok = deletePlan(searchParams.get("id") || "");
  await flushSubscriptions();
  return NextResponse.json({ success: ok });
}
