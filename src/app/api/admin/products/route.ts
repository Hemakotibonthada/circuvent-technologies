import { NextResponse } from "next/server";
import { listProducts, upsertProduct, deleteProduct } from "@/lib/store";
import { adminFromRequest, requireArea } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyAdmin(request: Request): boolean {
  return requireArea(adminFromRequest(request), "inventory");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// GET /api/admin/products — full inventory
export async function GET(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ success: true, products: listProducts() });
}

// POST /api/admin/products — add or replace a product
export async function POST(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const name = String(body?.name || "").trim();
    if (!name) return NextResponse.json({ success: false, message: "Product name is required." }, { status: 400 });

    const id = String(body?.id || slugify(name));
    const product = upsertProduct({
      id,
      slug: String(body?.slug || slugify(name)),
      name,
      price: Math.max(0, Math.round(Number(body?.price) || 0)),
      stock: Math.max(0, Math.round(Number(body?.stock) || 0)),
      available: body?.available !== false,
      category: String(body?.category || "General"),
    });
    return NextResponse.json({ success: true, product });
  } catch {
    return NextResponse.json({ success: false, message: "Could not save the product." }, { status: 500 });
  }
}

// PATCH /api/admin/products — update stock / availability / price
export async function PATCH(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const id = String(body?.id || "");
    if (!id) return NextResponse.json({ success: false, message: "id is required." }, { status: 400 });

    const patch: { id: string; stock?: number; available?: boolean; price?: number } = { id };
    if (body?.stock !== undefined) patch.stock = Math.max(0, Math.round(Number(body.stock) || 0));
    if (body?.available !== undefined) patch.available = !!body.available;
    if (body?.price !== undefined) patch.price = Math.max(0, Math.round(Number(body.price) || 0));

    const product = upsertProduct(patch);
    return NextResponse.json({ success: true, product });
  } catch {
    return NextResponse.json({ success: false, message: "Could not update the product." }, { status: 500 });
  }
}

// DELETE /api/admin/products?id=... — remove an admin-added product
export async function DELETE(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const ok = deleteProduct(id);
  if (!ok) {
    return NextResponse.json(
      { success: false, message: "Only admin-added products can be deleted." },
      { status: 400 }
    );
  }
  return NextResponse.json({ success: true });
}
