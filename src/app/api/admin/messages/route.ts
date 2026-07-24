import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { listContactMessages, setContactMessageStatus, flushNow, revalidate } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/messages — contact-form submissions for the admin inbox.
export async function GET(request: Request) {
  if (!guard(request, "support")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await revalidate(["contactMessages"]);
  const messages = listContactMessages();
  const counts = {
    total: messages.length,
    new: messages.filter((m) => m.status === "new").length,
  };
  return NextResponse.json({ ok: true, counts, messages });
}

// PATCH /api/admin/messages { id, status } — mark read / archived.
export async function PATCH(request: Request) {
  if (!guard(request, "support")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, status } = await request.json().catch(() => ({}));
  if (!id || !["new", "read", "archived"].includes(status)) {
    return NextResponse.json({ error: "id and a valid status are required." }, { status: 400 });
  }
  const ok = setContactMessageStatus(String(id), status);
  if (!ok) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  await flushNow();
  return NextResponse.json({ ok: true });
}
