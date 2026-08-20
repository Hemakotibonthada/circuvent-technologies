"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Search, Ban, CheckCircle2, PlusCircle, MinusCircle } from "lucide-react";
import { formatINR } from "@/lib/shop-data";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface Customer {
  email: string;
  name: string;
  blocked: boolean;
  createdAt: string;
  orders: number;
  spend: number;
  wallet: number;
}

export default function CustomersPanel() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/customers", { headers: { "x-admin-token": tok() } });
      if (res.ok) {
        const d = await res.json();
        setCustomers(d.customers || []);
      } else {
        setError("Could not load customers. This is a loading failure, not an empty list.");
      }
    } catch {
      setError("Could not load customers. This is a loading failure, not an empty list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (email: string, action: string, amount?: number) => {
    await fetch("/api/admin/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ email, action, amount }),
    });
    load();
  };

  const adjust = (email: string, action: "credit" | "debit") => {
    const raw = window.prompt(`${action === "credit" ? "Add to" : "Deduct from"} wallet — amount (₹):`, "100");
    const amt = Math.round(Number(raw));
    if (amt > 0) act(email, action, amt);
  };

  const shown = customers.filter(
    (c) => !q.trim() || c.email.includes(q.toLowerCase()) || c.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email…"
            className="w-full rounded-xl border py-2.5 pl-10 pr-3 text-sm outline-none"
            style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
          />
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent-cyan)" }} />
        </div>
      ) : shown.length === 0 && !error ? (
        // Empty-state copy must stay hidden while `error` is set — otherwise a failed fetch looks identical to "no data".
        <p className="py-16 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>No customers yet.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((c) => (
            <div
              key={c.email}
              className="flex flex-wrap items-center gap-3 rounded-xl p-4"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}
            >
              <div className="min-w-[180px] flex-1">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {c.name} {c.blocked && <span className="ml-1 text-xs text-rose-500">(suspended)</span>}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{c.email}</p>
              </div>
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {c.orders} order{c.orders === 1 ? "" : "s"} · {formatINR(c.spend)} spent
              </div>
              <div className="rounded-lg px-2.5 py-1 text-xs font-semibold" style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}>
                Wallet {formatINR(c.wallet)}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => adjust(c.email, "credit")} title="Add wallet credit" className="rounded-lg border p-1.5" style={{ borderColor: "var(--border-primary)", color: "#10b981" }}>
                  <PlusCircle className="h-4 w-4" />
                </button>
                <button onClick={() => adjust(c.email, "debit")} title="Deduct wallet" className="rounded-lg border p-1.5" style={{ borderColor: "var(--border-primary)", color: "#f59e0b" }}>
                  <MinusCircle className="h-4 w-4" />
                </button>
                {c.blocked ? (
                  <button onClick={() => act(c.email, "unblock")} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs" style={{ borderColor: "var(--border-primary)", color: "#10b981" }}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Unblock
                  </button>
                ) : (
                  <button onClick={() => act(c.email, "block")} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs" style={{ borderColor: "var(--border-primary)", color: "#ef4444" }}>
                    <Ban className="h-3.5 w-3.5" /> Block
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
