import { NextResponse } from "next/server";
import { getMergedProducts } from "@/lib/shop-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/shop/products
 * Public catalog with live stock / availability / price / offers merged from
 * the durable store, plus real average rating + review count.
 */
export async function GET() {
  const merged = await getMergedProducts();
  return NextResponse.json({ success: true, products: merged });
}
