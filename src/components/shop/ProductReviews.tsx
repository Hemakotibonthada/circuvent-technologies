"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Star, Loader2, MessageSquare, BadgeCheck, ThumbsUp } from "lucide-react";
import { useAccount } from "./AccountProvider";

interface Review {
  id: string;
  name: string;
  rating: number;
  comment: string;
  at: string;
  verified?: boolean;
  helpful?: number;
  youVoted?: boolean;
  isYours?: boolean;
}

type Histogram = Record<"1" | "2" | "3" | "4" | "5", number>;

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
  const [histogram, setHistogram] = useState<Histogram>({ "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 });
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/shop/reviews?product=${encodeURIComponent(productId)}`, {
        headers: { ...authHeaders() },
      });
      if (r.ok) {
        const d = await r.json();
        setReviews(d.reviews || []);
        setSummary(d.summary || { count: 0, average: 0 });
        if (d.histogram) setHistogram(d.histogram);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [productId, authHeaders]);

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

  const vote = async (reviewId: string) => {
    if (!account) return;
    // Optimistic update.
    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId
          ? { ...r, youVoted: !r.youVoted, helpful: (r.helpful || 0) + (r.youVoted ? -1 : 1) }
          : r
      )
    );
    try {
      const r = await fetch("/api/shop/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ reviewId }),
      });
      const d = await r.json();
      if (d.success) {
        setReviews((prev) => prev.map((x) => (x.id === reviewId ? { ...x, helpful: d.helpful, youVoted: d.voted } : x)));
      } else {
        load(); // revert on failure
      }
    } catch {
      load();
    }
  };

  const shown = useMemo(
    () => (filter === 0 ? reviews : reviews.filter((r) => Math.round(r.rating) === filter)),
    [reviews, filter]
  );

  const card = { background: "var(--bg-surface)", borderColor: "var(--border-primary)" };
  const maxBar = Math.max(1, ...([5, 4, 3, 2, 1] as const).map((n) => histogram[String(n) as keyof Histogram]));

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

      {/* Rating breakdown histogram */}
      {summary.count > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="text-center sm:pr-6">
            <div className="text-4xl font-extrabold" style={{ color: "var(--text-primary)" }}>
              {summary.average.toFixed(1)}
            </div>
            <Stars value={Math.round(summary.average)} />
            <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {summary.count} rating{summary.count === 1 ? "" : "s"}
            </div>
          </div>
          <div className="space-y-1.5">
            {([5, 4, 3, 2, 1] as const).map((n) => {
              const c = histogram[String(n) as keyof Histogram];
              const active = filter === n;
              return (
                <button
                  key={n}
                  onClick={() => setFilter(active ? 0 : n)}
                  className="flex w-full items-center gap-2 text-xs transition-opacity hover:opacity-100"
                  style={{ opacity: filter === 0 || active ? 1 : 0.55 }}
                  aria-label={`Show ${n}-star reviews`}
                >
                  <span className="flex w-7 items-center gap-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {n} <Star className="h-3 w-3" style={{ color: "#f59e0b", fill: "#f59e0b" }} />
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-glass)" }}>
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(c / maxBar) * 100}%`, background: active ? "var(--accent-cyan)" : "#f59e0b" }}
                    />
                  </span>
                  <span className="w-6 text-right" style={{ color: "var(--text-muted)" }}>
                    {c}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
        ) : shown.length === 0 ? (
          <p className="py-6 text-sm" style={{ color: "var(--text-muted)" }}>
            {filter === 0
              ? "No reviews yet — be the first to review this product."
              : `No ${filter}-star reviews yet.`}
          </p>
        ) : (
          <div className="space-y-3">
            {shown.map((r) => (
              <div key={r.id} className="rounded-2xl border p-4" style={card}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--text-primary)" }}>
                    {r.name}
                    {r.verified && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}
                        title="Verified purchase"
                      >
                        <BadgeCheck className="h-3 w-3" /> Verified buyer
                      </span>
                    )}
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
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => vote(r.id)}
                    disabled={!account || r.isYours}
                    title={!account ? "Sign in to vote" : r.isYours ? "You can't vote on your own review" : "Mark as helpful"}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50"
                    style={{
                      borderColor: r.youVoted ? "var(--accent-cyan)" : "var(--border-primary)",
                      color: r.youVoted ? "var(--accent-cyan)" : "var(--text-tertiary)",
                      background: r.youVoted ? "var(--accent-cyan-muted)" : "transparent",
                    }}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" style={{ fill: r.youVoted ? "currentColor" : "none" }} />
                    Helpful{r.helpful ? ` (${r.helpful})` : ""}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
