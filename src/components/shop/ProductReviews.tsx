"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Star, Loader2, MessageSquare } from "lucide-react";
import { useAccount } from "./AccountProvider";

interface Review {
  id: string;
  name: string;
  rating: number;
  comment: string;
  at: string;
}

function Stars({ value, size = 16, onSelect }: { value: number; size?: number; onSelect?: (n: number) => void }) {
  return (
    <div className="flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onSelect}
          onClick={() => onSelect?.(n)}
          className={onSelect ? "cursor-pointer" : "cursor-default"}
          aria-label={`${n} star`}
        >
          <Star style={{ width: size, height: size, color: "#f59e0b", fill: n <= value ? "#f59e0b" : "none" }} />
        </button>
      ))}
    </div>
  );
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

export default function ProductReviews({ productId }: { productId: string }) {
  const { account, authHeaders } = useAccount();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState({ count: 0, average: 0 });
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/shop/reviews?product=${encodeURIComponent(productId)}`);
      if (r.ok) {
        const d = await r.json();
        setReviews(d.reviews || []);
        setSummary(d.summary || { count: 0, average: 0 });
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/shop/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ productId, rating, comment }),
      });
      const d = await r.json();
      if (d.success) {
        setComment("");
        setMsg("Thanks for your review!");
        load();
      } else {
        setMsg(d.message || "Could not submit your review.");
      }
    } catch {
      setMsg("Network error. Please try again.");
    }
    setBusy(false);
  };

  const card = { background: "var(--bg-surface)", borderColor: "var(--border-primary)" };

  return (
    <div className="mt-16">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          Ratings &amp; reviews
        </h2>
        {summary.count > 0 && (
          <span className="flex items-center gap-2 text-sm" style={{ color: "var(--text-tertiary)" }}>
            <Stars value={Math.round(summary.average)} /> {summary.average} · {summary.count} review{summary.count === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Write a review */}
      <div className="mt-5 rounded-2xl border p-5" style={card}>
        {account ? (
          <form onSubmit={submit} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Your rating
              </span>
              <Stars value={rating} size={22} onSelect={setRating} />
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience with this product…"
              className="min-h-[80px] w-full rounded-xl border px-4 py-3 text-sm outline-none"
              style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={busy}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />} Submit review
              </button>
              {msg && <span className="text-xs" style={{ color: "var(--accent-cyan)" }}>{msg}</span>}
            </div>
          </form>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            <Link href="/shop/account" className="font-semibold" style={{ color: "var(--accent-cyan)" }}>
              Sign in
            </Link>{" "}
            to write a review.
          </p>
        )}
      </div>

      {/* Reviews list */}
      <div className="mt-5">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--accent-cyan)" }} />
          </div>
        ) : reviews.length === 0 ? (
          <p className="py-6 text-sm" style={{ color: "var(--text-muted)" }}>
            No reviews yet — be the first to review this product.
          </p>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-2xl border p-4" style={card}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    {r.name}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {fmt(r.at)}
                  </span>
                </div>
                <div className="mt-1">
                  <Stars value={r.rating} size={14} />
                </div>
                {r.comment && (
                  <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    {r.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
