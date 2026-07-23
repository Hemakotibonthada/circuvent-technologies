"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { invGet, card, inputStyle, inputCls, Btn, Spinner, Empty, Badge, fmtDateTime, type ProductRow } from "./lib";

interface Movement { id: string; at: string; productId: string; type: string; qty: number; reason: string; balanceAfter: number }

const TYPE_COLOR: Record<string, string> = {
  receive: "#10b981", manual_in: "#10b981", transfer_in: "#06b6d4", return: "#10b981",
  adjust: "#f59e0b", count: "#8b5cf6", manual_out: "#ef4444", transfer_out: "#ef4444", sale: "#ef4444", damage: "#ef4444",
};

export default function StockTab() {
  const [mv, setMv] = useState<Movement[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [m, r] = await Promise.all([
      invGet<{ movements: Movement[] }>("/movements?limit=500"),
      invGet<{ rows: ProductRow[] }>("/meta"),
    ]);
    if (m?.movements) setMv(m.movements);
    if (r?.rows) setNames(Object.fromEntries(r.rows.map((x) => [x.productId, x.name])));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const types = useMemo(() => ["all", ...Array.from(new Set(mv.map((m) => m.type)))], [mv]);
  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return mv.filter((m) => (type === "all" || m.type === type) && (!ql || (names[m.productId] || "").toLowerCase().includes(ql) || m.reason.toLowerCase().includes(ql)));
  }, [mv, type, q, names]);

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product / reason…" className={`${inputCls} w-full pl-9`} style={inputStyle} />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls} style={inputStyle}>
          {types.map((t) => <option key={t} value={t}>{t === "all" ? "All types" : t}</option>)}
        </select>
        <Btn variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Btn>
      </div>
      <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>Every stock change is logged here. Adjust stock from the Products tab.</p>

      {loading ? <Spinner /> : shown.length === 0 ? <Empty text="No stock movements yet." /> : (
        <div className="overflow-x-auto rounded-xl" style={card}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                <th className="p-3">When</th><th className="p-3">Product</th><th className="p-3">Type</th><th className="p-3">Qty</th><th className="p-3">Balance</th><th className="p-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
                  <td className="p-3 text-xs" style={{ color: "var(--text-muted)" }}>{fmtDateTime(m.at)}</td>
                  <td className="p-3" style={{ color: "var(--text-primary)" }}>{names[m.productId] || m.productId}</td>
                  <td className="p-3"><Badge color={TYPE_COLOR[m.type] || "#94a3b8"}>{m.type}</Badge></td>
                  <td className="p-3 font-medium" style={{ color: m.qty >= 0 ? "#10b981" : "#ef4444" }}>{m.qty >= 0 ? "+" : ""}{m.qty}</td>
                  <td className="p-3" style={{ color: "var(--text-secondary)" }}>{m.balanceAfter}</td>
                  <td className="p-3 text-xs" style={{ color: "var(--text-tertiary)" }}>{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
