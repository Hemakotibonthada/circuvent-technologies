"use client";

import { useState } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import { useAccount } from "./AccountProvider";

export default function RestockNotify({ productId }: { productId: string }) {
  const { account } = useAccount();
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const useEmail = account?.email || email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(useEmail)) {
      setError("Enter a valid email.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/notify-restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, email: useEmail }),
      });
      const d = await res.json();
      if (d.success) setDone(true);
      else setError(d.message || "Could not subscribe.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mt-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm text-emerald-500"
        style={{ borderColor: "rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.08)" }}>
        <CheckCircle2 className="h-4 w-4" /> You&rsquo;ll be emailed the moment this is back in stock.
      </div>
    );
  }

  return (
    <form onSubmit={subscribe} className="mt-5 rounded-xl border p-4" style={{ borderColor: "var(--border-primary)", background: "var(--bg-surface)" }}>
      <p className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        <Bell className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Out of stock — get notified when it&rsquo;s back
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {!account && (
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Your email"
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
          />
        )}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Bell className="h-4 w-4" /> Notify me
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </form>
  );
}
