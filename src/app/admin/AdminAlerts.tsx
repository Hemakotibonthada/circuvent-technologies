"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

function tok() { try { return sessionStorage.getItem("admin-token") || ""; } catch { return ""; } }

interface Alert { type: string; title: string; detail: string; tab: string; severity: "info" | "warn" | "urgent"; at?: string }
const SEV: Record<string, string> = { info: "#06b6d4", warn: "#f59e0b", urgent: "#ef4444" };

export default function AdminAlerts({ onGoto }: { onGoto: (tab: string) => void }) {
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<Alert[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/alerts", { headers: { "x-admin-token": tok() } });
      if (r.ok) { const d = await r.json(); setTotal(d.total || 0); setItems(d.items || []); setCounts(d.counts || {}); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(load, 20000);
    return () => clearInterval(i);
  }, [load]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="relative flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
        <Bell className="h-4 w-4" />
        {total > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white" style={{ background: "#ef4444" }}>
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl p-2 shadow-xl"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-lg)" }}>
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Alerts</span>
            <button onClick={load} className="text-xs" style={{ color: "var(--accent-cyan)" }}>Refresh</button>
          </div>
          <div className="mb-1 flex flex-wrap gap-1 px-2">
            {[
              ["New orders", counts.newOrders, "orders"],
              ["Low stock", counts.lowStock, "inventory"],
              ["Returns", counts.pendingReturns, "returns"],
              ["Tickets", counts.openTickets, "support"],
              ["Expiring", counts.expiring, "inventory"],
            ].map(([label, n, tab]) => (
              <button key={label as string} onClick={() => { onGoto(tab as string); setOpen(false); }}
                className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--bg-glass)", color: Number(n) ? "var(--text-secondary)" : "var(--text-muted)" }}>
                {label} <b style={{ color: Number(n) ? "var(--accent-cyan)" : "var(--text-muted)" }}>{Number(n) || 0}</b>
              </button>
            ))}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>All clear — nothing needs attention.</p>
            ) : items.map((a, i) => (
              <button key={i} onClick={() => { onGoto(a.tab); setOpen(false); }}
                className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--bg-glass)]">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: SEV[a.severity] }} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>{a.title}</span>
                  <span className="block truncate text-xs" style={{ color: "var(--text-muted)" }}>{a.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
