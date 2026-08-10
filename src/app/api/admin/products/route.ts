import { NextResponse, after } from "next/server";
import { listProducts, upsertProduct, deleteProduct, getStoredProduct, takeRestockSubscribers, revalidate, flushNow } from "@/lib/store";
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

/**
 * Product text is written by staff but rendered into HTML sinks (JSON-LD,
 * printed labels, restock emails), so angle brackets are stripped at the
 * boundary rather than relying on every downstream renderer to escape.
 */
function plainText(s: unknown, max: number): string {
  return String(s ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[<>\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );
}

/** Extracts optional rich presentation fields from a request body. */
function richFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (typeof body.image === "string") out.image = body.image.slice(0, 600000);
  if (Array.isArray(body.images)) out.images = (body.images as unknown[]).filter((s) => typeof s === "string").slice(0, 6);
  if (typeof body.description === "string") out.description = plainText(body.description, 5000);
  if (typeof body.tagline === "string") out.tagline = plainText(body.tagline, 200);
  if (Array.isArray(body.specs)) out.specs = (body.specs as unknown[]).filter((s) => typeof s === "string").map((s) => plainText(s, 300)).slice(0, 24);
  if (body.compareAt !== undefined) {
    const c = Math.max(0, Math.round(Number(body.compareAt) || 0));
    out.compareAt = c || undefined;
  }
  if (typeof body.badge === "string") out.badge = plainText(body.badge, 40);
  if (body.featured !== undefined) out.featured = !!body.featured;
  if (typeof body.accent === "string") out.accent = plainText(body.accent, 40);
  /*
   * Warranty term and release date.
   *
   * This function is a whitelist, so a field the admin form sends and this
   * does not name is dropped without complaint — the form would appear to
   * save and the value would never exist. Both are validated rather than
   * trusted: a warranty of 600 months or a release date of "soon" would be
   * printed on a customer's invoice.
   */
  if (body.warrantyMonths !== undefined) {
    const m = Math.round(Number(body.warrantyMonths) || 0);
    // Zero is not "no warranty"; it means the field was left blank, and blank
    // means the published default applies.
    out.warrantyMonths = m > 0 && m <= 120 ? m : undefined;
  }
  if (body.releaseAt !== undefined) {
    const at = new Date(String(body.releaseAt));
    out.releaseAt = Number.isNaN(at.getTime()) ? undefined : at.toISOString();
  }
  if (body.discontinued !== undefined) out.discontinued = !!body.discontinued;
  return out;
}

// GET /api/admin/products — full inventory
export async function GET(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Re-read from the durable store so edits made on other serverless instances
  // are always reflected (fixes stock appearing to "revert" across refreshes).
  await revalidate(["products"]);
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
        const nm = plainText(row?.name, 200);
        if (!nm) {
          errors.push("Row skipped: missing name");
          continue;
        }
        upsertProduct({
          id: slugify(String(row?.id || nm)) || slugify(nm),
          slug: slugify(String(row?.slug || nm)) || slugify(nm),
          name: nm,
          price: Math.max(0, Math.round(Number(row?.price) || 0)),
          stock: Math.max(0, Math.round(Number(row?.stock) || 0)),
          available: row?.available !== false && String(row?.available).toLowerCase() !== "false",
          category: plainText(row?.category || "General", 60),
        });
        imported++;
      }
      await flushNow();
      return NextResponse.json({ success: true, imported, errors });
    }

    const name = plainText(body?.name, 200);
    if (!name) return NextResponse.json({ success: false, message: "Product name is required." }, { status: 400 });

    const id = slugify(String(body?.id || name)) || slugify(name);
    const product = upsertProduct({
      id,
      slug: slugify(String(body?.slug || name)) || slugify(name),
      name,
      price: Math.max(0, Math.round(Number(body?.price) || 0)),
      stock: Math.max(0, Math.round(Number(body?.stock) || 0)),
      available: body?.available !== false,
      category: plainText(body?.category || "General", 60),
      ...richFields(body),
    });
    await flushNow();
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

    const patch: { id: string; stock?: number; available?: boolean; price?: number } & Record<string, unknown> = { id };
    if (body?.stock !== undefined) patch.stock = Math.max(0, Math.round(Number(body.stock) || 0));
    if (body?.available !== undefined) patch.available = !!body.available;
    if (body?.price !== undefined) patch.price = Math.max(0, Math.round(Number(body.price) || 0));
    if (body?.name !== undefined && plainText(body.name, 200)) patch.name = plainText(body.name, 200);
    if (body?.category !== undefined) patch.category = plainText(body.category, 60);
    Object.assign(patch, richFields(body));

    const product = upsertProduct(patch);
    await flushNow();

    // Back-in-stock: email everyone who subscribed while it was sold out.
    let notified = 0;
    if (oldStock <= 0 && product.stock > 0 && product.available) {
      const subs = takeRestockSubscribers(id);
      notified = subs.length;
      if (subs.length) {
        const origin = new URL(request.url).origin;
        const link = `${origin}/shop/${encodeURIComponent(product.slug)}`;
        after(async () => {
          for (const email of subs) {
            await sendMail(
              email,
              `${product.name} is back in stock`,
              `<div style="font-family:sans-serif"><h2>Good news — it's back!</h2><p><b>${escapeHtml(product.name)}</b> is back in stock at Circuvent.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#06b6d4;color:#fff;border-radius:8px;text-decoration:none">Shop now</a></p></div>`,
              undefined,
              { type: "product_restock", related: email }
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
  await flushNow();
  return NextResponse.json({ success: true });
}
