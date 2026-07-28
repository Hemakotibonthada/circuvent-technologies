import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { crmOverview, setTags, listNotes, addNote, deleteNote, crmStats } from "@/lib/admin-crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "crm")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || undefined;
  const email = searchParams.get("email");
  return NextResponse.json({
    success: true,
    customers: crmOverview(q),
    notes: email ? listNotes(email) : [],
    stats: crmStats(),
  });
}

export async function POST(request: Request) {
  const me = guard(request, "crm");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (b.kind === "tags") {
      if (!b.email) return NextResponse.json({ success: false, message: "email required." }, { status: 400 });
      const tags = setTags(b.email, Array.isArray(b.tags) ? b.tags : []);
      return NextResponse.json({ success: true, tags });
    }
    if (b.kind === "note") {
      if (!b.email || !b.note) return NextResponse.json({ success: false, message: "email and note required." }, { status: 400 });
      const note = addNote(b.email, b.note, me.name);
      return NextResponse.json({ success: true, note });
    }
    return NextResponse.json({ success: false, message: "Unknown kind." }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!guard(request, "crm")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const ok = deleteNote(searchParams.get("id") || "");
  return NextResponse.json({ success: ok });
}
