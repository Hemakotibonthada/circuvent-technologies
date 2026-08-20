"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, PackageX, ShoppingCart, Send, CalendarClock, TrendingUp } from "lucide-react";
import { invGet, money, card, Spinner, Btn } from "./lib";

interface Dash {
  skuCount: number; unitsInStock: number; stockValueCost: number; stockValueRetail: number;
  lowStockCount: number; outOfStockCount: number; hiddenCount: number; supplierCount: number;
  openPOs: number; openCounts: number; inTransit: number; expiringSoon: number; movements30d: number;
}

export default function OverviewTab({ onGoto }: { onGoto: (t: string) => void }) {
  const [d, setD] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await invGet<{ dashboard: Dash }>("/reports?report=dashboard");
      if (r?.dashboard) {
        setD(r.dashboard);
      } else {
        setError("Could not load the inventory overview. This is a loading failure, not an empty result.");
      }
    } catch {
      setError("Could not load the inventory overview. This is a loading failure, not an empty result.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !d) return <Spinner />;
  if (!d) {
    // A failed/blocked fetch leaves `d` null — show an error + retry instead of silently rendering a blank tab.
    return (
      <div>
        <div role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error || "Could not load the inventory overview. This is a loading failure, not an empty result."}
        </div>
        <Btn variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /> Retry</Btn>
      </div>
    );
  }

  const kpis: { label: string; value: string; color?: string }[] = [
    { label: "SKUs", value: String(d.skuCount) },
    { label: "Units in stock", value: d.unitsInStock.toLocaleString("en-IN") },
    { label: "Stock value (cost)", value: money(d.stockValueCost), color: "#06b6d4" },
    { label: "Stock value (retail)", value: money(d.stockValueRetail), color: "#10b981" },
    { label: "Potential margin", value: money(d.stockValueRetail - d.stockValueCost), color: "#8b5cf6" },
    { label: "Movements (30d)", value: String(d.movements30d) },
    { label: "Suppliers", value: String(d.supplierCount) },
    { label: "Open POs", value: String(d.openPOs) },
  ];

  const alerts: { icon: React.ReactNode; label: string; n: number; color: string; goto: string }[] = [
    { icon: <AlertTriangle className="h-4 w-4" />, label: "Low stock items", n: d.lowStockCount, color: "#f59e0b", goto: "reports" },
    { icon: <PackageX className="h-4 w-4" />, label: "Out of stock", n: d.outOfStockCount, color: "#ef4444", goto: "products" },
    { icon: <ShoppingCart className="h-4 w-4" />, label: "Open purchase orders", n: d.openPOs, color: "#06b6d4", goto: "purchase" },
    { icon: <Send className="h-4 w-4" />, label: "Transfers in transit", n: d.inTransit, color: "#06b6d4", goto: "transfers" },
    { icon: <CalendarClock className="h-4 w-4" />, label: "Batches expiring soon", n: d.expiringSoon, color: "#f59e0b", goto: "batches" },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Inventory overview</h3>
        <Btn variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Btn>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl p-4" style={card}>
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{k.label}</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: k.color || "var(--text-primary)" }}>{k.value}</p>
          </div>
        ))}
      </div>

      <h4 className="mb-3 mt-6 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        <TrendingUp className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Attention needed
      </h4>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {alerts.map((a) => (
          <button key={a.label} onClick={() => onGoto(a.goto)}
            className="flex items-center justify-between rounded-xl p-4 text-left transition-transform hover:-translate-y-0.5"
            style={card}>
            <span className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <span style={{ color: a.color }}>{a.icon}</span> {a.label}
            </span>
            <span className="text-lg font-bold" style={{ color: a.n > 0 ? a.color : "var(--text-muted)" }}>{a.n}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
