import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { addReview, listReviews, reviewSummary, getAccount } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/shop/reviews?product=<id> — public reviews + rating summary. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const product = (searchParams.get("product") || "").trim();
  if (!product) return NextResponse.json({ success: false, message: "product is required." }, { status: 400 });
  const reviews = listReviews(product).map((r) => ({ id: r.id, name: r.name, rating: r.rating, comment: r.comment, at: r.at }));
  return NextResponse.json({ success: true, reviews, summary: reviewSummary(product) });
}

/** POST /api/shop/reviews { productId, rating, comment } — account-gated. */
export async function POST(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in to write a review." }, { status: 401 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok, retryAfter } = rateLimit("account", ip);
  if (!ok) {
    return NextResponse.json(
      { success: false, message: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const { productId, rating, comment } = await request.json();
  if (!productId || !rating) {
    return NextResponse.json({ success: false, message: "productId and rating are required." }, { status: 400 });
  }
  const acc = getAccount(email);
  const name = acc?.name || email.split("@")[0];
  const review = addReview({ productId: String(productId), email, name, rating: Number(rating), comment: String(comment || "") });
  return NextResponse.json({
    success: true,
    review: { id: review.id, name: review.name, rating: review.rating, comment: review.comment, at: review.at },
  });
}
