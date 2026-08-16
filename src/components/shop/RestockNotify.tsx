"use client";

import { useState } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import { useRestockAlert } from "./useRestockAlert";

/**
 * The full-width restock form, for a product detail page.
 *
 * Shares `useRestockAlert` with the compact card button. The two look nothing
 * alike, which is precisely why the request had to stop being written twice —
 * one copy learns that a signed-in shopper needs no email field, or that a
 * dropped connection is not a refusal, and the other does not.
 */
export default function RestockNotify({ productId }: { productId: string }) {
  const alert = useRestockAlert(productId);
  const [email, setEmail] = useState("");

  if (alert.state === "done") {
    return (
      <div
        className="mt-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm text-emerald-500"
        style={{ borderColor: "rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.08)" }}
      >
        <CheckCircle2 className="h-4 w-4" /> You&rsquo;ll be emailed the moment this is back in stock.
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void alert.subscribe(email);
      }}
      className="mt-5 rounded-xl border p-4"
      style={{ borderColor: "var(--border-primary)", background: "var(--bg-surface)" }}
    >
      <p className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        <Bell className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Out of stock — get notified when it&rsquo;s back
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {alert.needsEmail && (
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Your email"
            aria-label="Email for restock alert"
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--bg-glass)",
              borderColor: "var(--border-primary)",
              color: "var(--text-primary)",
            }}
          />
        )}
        <button
          type="submit"
          disabled={alert.state === "busy"}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Bell className="h-4 w-4" /> Notify me
        </button>
      </div>
      {alert.error && <p className="mt-2 text-sm text-red-400">{alert.error}</p>}
    </form>
  );
}
