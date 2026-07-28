"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, TrendingUp } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface ForecastRow {
  productId: string;
  name: string;
  currentStock: number;
  unitsSoldLast30d: number;
  avgDailyVelocity: number;
  daysOfStockLeft: number | null;
  suggestedReorderQty: number;
  urgency: "ok" | "low" | "critical";
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const URGENCY_COLOR: Record<ForecastRow["urgency"], string> = { critical: "#ef4444", low: "#f59e0b", ok: "#22c55e" };

export default function ForecastingPanel() {
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/forecasting", { headers: { "x-admin-token": tok() } });
    if (res.ok) setRows((await res.json()).forecast || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const critical = rows.filter((r) => r.urgency === "critical").length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><TrendingUp className="w-5 h-5" /> Inventory Forecasting</h2>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Reorder suggestions from real 30-day sales velocity vs current stock.</p>
      </div>

      {critical > 0 && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 flex items-center gap-2 text-red-300 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {critical} product{critical === 1 ? "" : "s"} will run out within a week at current velocity.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={card}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ borderBottom: "1px solid var(--border-primary)" }}>
                {["Product", "Stock", "Sold/30d", "Daily velocity", "Days left", "Reorder", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium" style={{ color: "var(--text-tertiary)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} style={{ borderBottom: "1px solid var(--border-primary)" }}>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-primary)" }}>{r.name}</td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>{r.currentStock}</td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>{r.unitsSoldLast30d}</td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>{r.avgDailyVelocity}</td>
                  <td className="px-4 py-2.5" style={{ color: URGENCY_COLOR[r.urgency] }}>{r.daysOfStockLeft ?? "∞"}</td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-primary)" }}>{r.suggestedReorderQty || "—"}</td>
                  <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: `${URGENCY_COLOR[r.urgency]}22`, color: URGENCY_COLOR[r.urgency] }}>{r.urgency}</span></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>No products yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
