import { NextResponse } from "next/server";
import { listQuestions, addQuestion, markQuestionHelpful, getStoredProduct, getAccount } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/shop/questions?productId=... — published Q&A for a product. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId") || undefined;
  const questions = listQuestions(productId).map((q) => ({
    id: q.id,
    name: q.name,
    question: q.question,
    answer: q.answer ?? null,
    answeredBy: q.answeredBy ?? null,
    at: q.at,
    answeredAt: q.answeredAt ?? null,
    helpful: q.helpful,
  }));
  return NextResponse.json({ success: true, questions });
}

/** POST /api/shop/questions { productId, question, name?, email? } — ask a question. */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok, retryAfter } = rateLimit("questions", ip);
  if (!ok) {
    return NextResponse.json(
      { success: false, message: "Too many questions. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const productId = (body.productId || "").toString();
  const question = (body.question || "").toString().trim();
  if (!productId || !getStoredProduct(productId)) {
    return NextResponse.json({ success: false, message: "Unknown product." }, { status: 400 });
  }
  if (question.length < 5) {
    return NextResponse.json({ success: false, message: "Please enter a longer question." }, { status: 400 });
  }

  const authedEmail = verifyToken(tokenFromRequest(request));
  const account = authedEmail ? getAccount(authedEmail) : null;
  const email = (authedEmail || body.email || "").toString().trim().toLowerCase();
  const name = account?.name || (body.name || "").toString().trim() || "Customer";

  const q = addQuestion({ productId, name, email, question });
  return NextResponse.json({ success: true, question: { id: q.id, name: q.name, question: q.question, at: q.at } });
}

/** PATCH /api/shop/questions { id } — mark a question/answer as helpful. */
export async function PATCH(request: Request) {
  const { id } = await request.json().catch(() => ({}));
  if (!id) return NextResponse.json({ success: false }, { status: 400 });
  const helpful = markQuestionHelpful(String(id));
  return NextResponse.json({ success: true, helpful });
}
