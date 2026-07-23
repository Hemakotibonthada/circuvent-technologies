import { NextResponse, after } from "next/server";
import { listProducts, upsertProduct, deleteProduct, getStoredProduct, takeRestockSubscribers } from "@/lib/store";
import { adminFromRequest, requireArea } from "@/lib/admin-auth";
import { sendMail } from "@/lib/order-core";

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

// POST /api/admin/products — add or replace a product (or bulk import)
export async function POST(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();

    // Bulk import: { products: [{ name, price, stock, category, ... }] }
    if (Array.isArray(body?.products)) {
      let imported = 0;
      const errors: string[] = [];
      for (const row of body.products) {
        const nm = String(row?.name || "").trim();
        if (!nm) {
          errors.push("Row skipped: missing name");
          continue;
        }
        upsertProduct({
          id: String(row?.id || slugify(nm)),
          slug: String(row?.slug || slugify(nm)),
          name: nm,
          price: Math.max(0, Math.round(Number(row?.price) || 0)),
          stock: Math.max(0, Math.round(Number(row?.stock) || 0)),
          available: row?.available !== false && String(row?.available).toLowerCase() !== "false",
          category: String(row?.category || "General"),
        });
        imported++;
      }
      return NextResponse.json({ success: true, imported, errors });
    }

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

    const before = getStoredProduct(id);
    const oldStock = before?.stock ?? 0;

    const patch: { id: string; stock?: number; available?: boolean; price?: number } = { id };
    if (body?.stock !== undefined) patch.stock = Math.max(0, Math.round(Number(body.stock) || 0));
    if (body?.available !== undefined) patch.available = !!body.available;
    if (body?.price !== undefined) patch.price = Math.max(0, Math.round(Number(body.price) || 0));

    const product = upsertProduct(patch);

    // Back-in-stock: email everyone who subscribed while it was sold out.
    let notified = 0;
    if (oldStock <= 0 && product.stock > 0 && product.available) {
      const subs = takeRestockSubscribers(id);
      notified = subs.length;
      if (subs.length) {
        const origin = new URL(request.url).origin;
        const link = `${origin}/shop/${product.slug}`;
        after(async () => {
          for (const email of subs) {
            await sendMail(
              email,
              `${product.name} is back in stock`,
              `<div style="font-family:sans-serif"><h2>Good news — it's back!</h2><p><b>${product.name}</b> is back in stock at Circuvent.</p><p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#06b6d4;color:#fff;border-radius:8px;text-decoration:none">Shop now</a></p></div>`
            );
          }
        });
      }
    }

    return NextResponse.json({ success: true, product, notified });
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
