import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { bundlesWithSavings, upsertBundle, deleteBundle, isDurable } from "@/lib/admin-bundles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "bundles")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // `durable: false` means this deployment cannot persist bundles to disk, so
  // anything configured here is lost on the next cold start. Bundles now change
  // what customers are charged, so that has to be surfaced rather than looking
  // like the save silently failed.
  return NextResponse.json({ success: true, bundles: bundlesWithSavings(), durable: isDurable() });
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
