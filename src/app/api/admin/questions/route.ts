import { NextResponse } from "next/server";
import { listQuestions, answerQuestion, setQuestionPublished, deleteQuestion, logAudit } from "@/lib/store";
import { guard } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — all product questions (including unanswered / unpublished)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (!guard(request, "support")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const productId = searchParams.get("productId") || undefined;
  return NextResponse.json({ questions: listQuestions(productId, true) });
}

// PATCH — answer a question or toggle its visibility
export async function PATCH(request: Request) {
  const me = guard(request, "support");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (typeof body.answer === "string" && body.answer.trim()) {
    const q = answerQuestion(id, body.answer, me.name || me.email);
    if (!q) return NextResponse.json({ error: "Question not found" }, { status: 404 });
    logAudit("qa.answer", `${me.email} answered ${id}`);
    return NextResponse.json({ ok: true, question: q });
  }
  if (typeof body.published === "boolean") {
    const ok = setQuestionPublished(id, body.published);
    if (!ok) return NextResponse.json({ error: "Question not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}

// DELETE — remove a question
export async function DELETE(request: Request) {
  const me = guard(request, "support");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const ok = deleteQuestion(id);
  if (!ok) return NextResponse.json({ error: "Question not found" }, { status: 404 });
  logAudit("qa.delete", `${me.email} deleted ${id}`);
  return NextResponse.json({ ok: true });
}
