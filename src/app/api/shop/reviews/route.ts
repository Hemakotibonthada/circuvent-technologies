import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  addReview,
  listReviews,
  reviewSummary,
  reviewHistogram,
  hasPurchased,
  voteReviewHelpful,
  getAccount,
} from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/shop/reviews?product=<id> — public reviews + rating summary + histogram. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const product = (searchParams.get("product") || "").trim();
  if (!product) return NextResponse.json({ success: false, message: "product is required." }, { status: 400 });

  const viewer = verifyToken(tokenFromRequest(request));
  const reviews = listReviews(product)
    .slice()
    .sort((a, b) => (b.helpful || 0) - (a.helpful || 0) || b.at.localeCompare(a.at))
    .map((r) => ({
      id: r.id,
      name: r.name,
      rating: r.rating,
      comment: r.comment,
      at: r.at,
      verified: hasPurchased(r.email, product),
      helpful: r.helpful || 0,
      youVoted: viewer ? (r.helpfulBy || []).includes(viewer.toLowerCase()) : false,
      isYours: viewer ? r.email.toLowerCase() === viewer.toLowerCase() : false,
    }));

  return NextResponse.json({
    success: true,
    reviews,
    summary: reviewSummary(product),
    histogram: reviewHistogram(product),
  });
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
    review: {
      id: review.id,
      name: review.name,
      rating: review.rating,
      comment: review.comment,
      at: review.at,
      verified: hasPurchased(email, String(productId)),
      helpful: 0,
      youVoted: false,
      isYours: true,
    },
  });
}

/** PATCH /api/shop/reviews { reviewId } — toggle a "helpful" vote (account-gated). */
export async function PATCH(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in to vote." }, { status: 401 });

  const { reviewId } = await request.json();
  if (!reviewId) return NextResponse.json({ success: false, message: "reviewId is required." }, { status: 400 });

  const res = voteReviewHelpful(String(reviewId), email);
  if (!res) return NextResponse.json({ success: false, message: "Review not found." }, { status: 404 });
  return NextResponse.json({ success: true, ...res });
}
