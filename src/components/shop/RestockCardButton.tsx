"use client";

import { useState } from "react";
import { Bell, CheckCircle2, Loader2 } from "lucide-react";
import { useRestockAlert } from "./useRestockAlert";

/**
 * "Tell me when it is back", sized for a product card.
 *
 * WHY A CARD NEEDS THIS AT ALL
 *
 * A sold-out card used to be a disabled button and nothing else. That is a dead
 * end on the one surface where a shopper has already decided they want the
 * thing — they are looking at it, they know the price, and the shop's entire
 * response is "no". The demand is real and it is thrown away.
 *
 * It matters more than usual right now: most of the catalogue is showing as
 * out of stock, so for nearly every product the listing page is a wall of
 * refusals. Capturing the interest costs an email field and turns the same
 * moment into a lead.
 *
 * The button holds its own expanded state rather than opening a modal: a
 * dialog over a grid loses the product you were looking at, and the whole
 * point is that this one is the one they wanted.
 */
export default function RestockCardButton({ productId }: { productId: string }) {
  const alert = useRestockAlert(productId);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");

  if (alert.state === "done") {
    return (
      <p
        className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium"
        style={{ background: "rgba(16,185,129,0.10)", color: "#10b981" }}
      >
        <CheckCircle2 className="h-4 w-4" /> We&rsquo;ll email you
      </p>
    );
  }

  // A signed-in shopper never sees a field: we already have the address, and
  // asking for it again is a form between them and something they wanted.
  if (!alert.needsEmail) {
    return (
      <button
        type="button"
        onClick={() => void alert.subscribe()}
        disabled={alert.state === "busy"}
        className="min-h-[44px] flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:opacity-60"
        style={{ borderColor: "var(--border-accent)", color: "var(--accent-cyan-text)" }}
      >
        {alert.state === "busy" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        Notify me
      </button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[44px] flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors"
        style={{ borderColor: "var(--border-accent)", color: "var(--accent-cyan-text)" }}
      >
        <Bell className="h-4 w-4" /> Notify me
      </button>
    );
  }

  return (
    <form
      className="flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        void alert.subscribe(email);
      }}
    >
      <div className="flex gap-1.5">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email"
          aria-label="Email for restock alert"
          autoFocus
          className="min-h-[44px] min-w-0 flex-1 rounded-xl border px-3 text-xs outline-none"
          style={{
            background: "var(--bg-glass)",
            borderColor: "var(--border-primary)",
            color: "var(--text-primary)",
          }}
        />
        <button
          type="submit"
          disabled={alert.state === "busy"}
          className="min-h-[44px] rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-3 text-xs font-semibold text-white disabled:opacity-60"
        >
          {alert.state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go"}
        </button>
      </div>
      {alert.error && (
        <p className="mt-1 text-[11px]" style={{ color: "var(--status-danger-text)" }}>
          {alert.error}
        </p>
      )}
    </form>
  );
}
