"use client";

import { Star } from "lucide-react";

/**
 * Accessible star rating. The visual stars are decorative — the rating is
 * exposed once, as text, so screen readers don't read five separate icons.
 */
export default function Stars({
  rating,
  reviewCount,
  size = 14,
  showValue = true,
}: {
  rating: number;
  reviewCount?: number;
  size?: number;
  showValue?: boolean;
}) {
  const safe = Math.max(0, Math.min(5, Number(rating) || 0));
  const label =
    safe > 0
      ? `Rated ${safe.toFixed(1)} out of 5${reviewCount ? ` from ${reviewCount} reviews` : ""}`
      : "No ratings yet";

  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <span aria-hidden="true" className="relative inline-flex">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} style={{ width: size, height: size, color: "var(--text-muted)" }} />
        ))}
        <span
          className="absolute inset-0 overflow-hidden whitespace-nowrap"
          style={{ width: `${(safe / 5) * 100}%` }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <Star
              key={i}
              className="fill-current"
              style={{ width: size, height: size, color: "#f59e0b", display: "inline" }}
            />
          ))}
        </span>
      </span>
      {showValue && (
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {safe > 0 ? safe.toFixed(1) : "New"}
          {reviewCount ? ` (${reviewCount})` : ""}
        </span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
