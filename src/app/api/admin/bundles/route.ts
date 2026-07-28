import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { bundlesWithSavings, upsertBundle, deleteBundle } from "@/lib/admin-bundles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "bundles")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ success: true, bundles: bundlesWithSavings() });
}

export async function POST(request: Request) {
  if (!guard(request, "bundles")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (!b.name || !Array.isArray(b.productIds) || !b.productIds.length || b.bundlePrice === undefined) {
      return NextResponse.json({ success: false, message: "name, productIds[] and bundlePrice required." }, { status: 400 });
    }
    const bundle = upsertBundle({ id: b.id, name: b.name, productIds: b.productIds, bundlePrice: Number(b.bundlePrice), active: b.active !== false });
    return NextResponse.json({ success: true, bundle });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!guard(request, "bundles")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const ok = deleteBundle(searchParams.get("id") || "");
  return NextResponse.json({ success: ok });
}
