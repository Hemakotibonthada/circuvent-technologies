import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import {
  listCategories, upsertCategory, deleteCategory,
  listBrands, upsertBrand, deleteBrand,
} from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ categories: listCategories(), brands: listBrands() });
}
export async function POST(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!body.name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  if (body.kind === "brand") return NextResponse.json({ ok: true, brand: upsertBrand(body) });
  return NextResponse.json({ ok: true, category: upsertCategory(body) });
}
export async function DELETE(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const kind = searchParams.get("kind") || "category";
  return NextResponse.json({ ok: kind === "brand" ? deleteBrand(id) : deleteCategory(id) });
}
