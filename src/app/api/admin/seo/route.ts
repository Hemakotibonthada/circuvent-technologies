import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import {
  listOverrides,
  upsertOverride,
  deleteOverride,
  listRedirects,
  upsertRedirect,
  deleteRedirect,
  revalidateSeo,
  flushSeo,
} from "@/lib/admin-seo-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "seo")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await revalidateSeo();
  return NextResponse.json({ success: true, overrides: listOverrides(), redirects: listRedirects() });
}

export async function POST(request: Request) {
  if (!guard(request, "seo")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await revalidateSeo();
    const b = await request.json();
    if (b.kind === "redirect") {
      if (!b.from || !b.to) return NextResponse.json({ success: false, message: "from and to required." }, { status: 400 });
      const redirect = upsertRedirect({ id: b.id, from: b.from, to: b.to, statusCode: b.statusCode === 302 ? 302 : 301 });
      await flushSeo();
      return NextResponse.json({ success: true, redirect });
    }
    if (!b.path) return NextResponse.json({ success: false, message: "path required." }, { status: 400 });
    const override = upsertOverride({ path: b.path, title: b.title, description: b.description, ogImage: b.ogImage, noindex: !!b.noindex });
    await flushSeo();
    return NextResponse.json({ success: true, override });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!guard(request, "seo")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await revalidateSeo();
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const id = searchParams.get("id") || "";
  const ok = kind === "redirect" ? deleteRedirect(id) : deleteOverride(id);
  await flushSeo();
  return NextResponse.json({ success: ok });
}
