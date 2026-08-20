import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { listMacros, upsertMacro, deleteMacro, recordMacroUsage, revalidateMacros, flushMacros } from "@/lib/admin-macros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "macros")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await revalidateMacros();
  return NextResponse.json({ success: true, macros: listMacros() });
}

export async function POST(request: Request) {
  if (!guard(request, "macros")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await revalidateMacros();
    const b = await request.json();
    if (b.kind === "use") {
      recordMacroUsage(b.id);
      await flushMacros();
      return NextResponse.json({ success: true });
    }
    if (!b.title || !b.body || !b.category) return NextResponse.json({ success: false, message: "title, body and category required." }, { status: 400 });
    const macro = upsertMacro({ id: b.id, title: b.title, body: b.body, category: b.category });
    await flushMacros();
    return NextResponse.json({ success: true, macro });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!guard(request, "macros")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await revalidateMacros();
  const { searchParams } = new URL(request.url);
  const ok = deleteMacro(searchParams.get("id") || "");
  await flushMacros();
  return NextResponse.json({ success: ok });
}
