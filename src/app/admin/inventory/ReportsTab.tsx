"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Download } from "lucide-react";
import { invGet, money, card, Btn, Spinner, Empty, Badge } from "./lib";

type Report = "valuation" | "reorder" | "lowstock" | "deadstock" | "abc" | "movement";
const REPORTS: { id: Report; label: string }[] = [
  { id: "valuation", label: "Valuation" },
  { id: "reorder", label: "Reorder suggestions" },
  { id: "lowstock", label: "Low stock" },
  { id: "deadstock", label: "Dead stock" },
  { id: "abc", label: "ABC analysis" },
  { id: "movement", label: "Movement (30d)" },
];

export default function ReportsTab() {
  const [rep, setRep] = useState<Report>("valuation");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await invGet<any>(`/reports?report=${rep}`);
    setData(r);
    setLoading(false);
  }, [rep]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {REPORTS.map((r) => (
          <button key={r.id} onClick={() => setRep(r.id)} className="rounded-full border px-3 py-1.5 text-sm font-medium"
            style={rep === r.id ? { borderColor: "var(--accent-cyan)", background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" } : { borderColor: "var(--border-primary)", color: "var(--text-tertiary)" }}>
            {r.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <a href="/api/admin/inventory/export" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
            <Download className="h-4 w-4" /> Export inventory CSV
          </a>
          <Btn variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Btn>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="rounded-2xl p-5" style={card}>
          {rep === "valuation" && <Valuation v={data?.valuation} />}
          {rep === "reorder" && <ReorderTable rows={data?.rows || []} />}
          {rep === "lowstock" && <LowStock rows={data?.rows || []} />}
          {rep === "deadstock" && <DeadStock rows={data?.rows || []} />}
          {rep === "abc" && <ABC rows={data?.rows || []} />}
          {rep === "movement" && <Movement s={data?.summary} />}
        </div>
      )}
    </div>
  );
}

function KV({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-glass)" }}>
      <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{k}</p>
      <p className="mt-1 text-xl font-bold" style={{ color: color || "var(--text-primary)" }}>{v}</p>
    </div>
  );
}

function Valuation({ v }: { v: any }) {
  if (!v) return <Empty text="No data." />;
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KV k="Units in stock" v={Number(v.units).toLocaleString("en-IN")} />
        <KV k="Value at cost" v={money(v.cost)} color="#06b6d4" />
        <KV k="Value at retail" v={money(v.retail)} color="#10b981" />
        <KV k="Potential margin" v={money(v.potentialProfit)} color="#8b5cf6" />
      </div>
      <h4 className="mb-2 mt-5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>By category</h4>
      <Table head={["Category", "Units", "Cost value", "Retail value"]}
        rows={(v.byCategory || []).map((c: any) => [c.name, String(c.units), money(c.cost), money(c.retail)])} />
    </div>
  );
}
function ReorderTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <Empty text="Nothing to reorder — stock is healthy." />;
  const total = rows.reduce((s, r) => s + (r.estCost || 0), 0);
  return (
    <div>
      <p className="mb-3 text-sm" style={{ color: "var(--text-tertiary)" }}>Estimated reorder spend: <b style={{ color: "var(--text-primary)" }}>{money(total)}</b></p>
      <Table head={["Product", "SKU", "Stock", "Reorder pt", "Suggested qty", "Est. cost"]}
        rows={rows.map((r) => [r.name, r.sku, String(r.stock), String(r.reorderPoint), String(r.suggestedQty), money(r.estCost)])} />
    </div>
  );
}
function LowStock({ rows }: { rows: any[] }) {
  if (!rows.length) return <Empty text="No low-stock items." />;
  return <Table head={["Product", "SKU", "Stock", "Reorder pt"]} rows={rows.map((r) => [r.name, r.sku, String(r.stock), String(r.reorderPoint)])} />;
}
function DeadStock({ rows }: { rows: any[] }) {
  if (!rows.length) return <Empty text="No dead stock — everything is moving." />;
  return <Table head={["Product", "SKU", "Stock", "Value (retail)"]} rows={rows.map((r) => [r.name, r.sku, String(r.stock), money(r.stockValueRetail)])} />;
}
function ABC({ rows }: { rows: any[] }) {
  if (!rows.length) return <Empty text="No data." />;
  const color = (c: string) => (c === "A" ? "#10b981" : c === "B" ? "#f59e0b" : "#94a3b8");
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}><th className="p-2">Class</th><th className="p-2">Product</th><th className="p-2">SKU</th><th className="p-2">Value</th><th className="p-2">Cumulative %</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.productId} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
            <td className="p-2"><Badge color={color(r.class)}>{r.class}</Badge></td>
            <td className="p-2" style={{ color: "var(--text-primary)" }}>{r.name}</td>
            <td className="p-2 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>{r.sku}</td>
            <td className="p-2" style={{ color: "var(--text-secondary)" }}>{money(r.value)}</td>
            <td className="p-2" style={{ color: "var(--text-muted)" }}>{r.cumulativePct}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function Movement({ s }: { s: any }) {
  if (!s) return <Empty text="No data." />;
  const rows = [
    ...Object.entries(s.in || {}).map(([k, v]) => ["IN", k, String(v)]),
    ...Object.entries(s.out || {}).map(([k, v]) => ["OUT", k, String(v)]),
  ];
  return (
    <div>
      <p className="mb-3 text-sm" style={{ color: "var(--text-tertiary)" }}>{s.totalMovements} movements in the last {s.days} days.</p>
      {rows.length === 0 ? <Empty text="No movements in this window." /> : <Table head={["Direction", "Type", "Units"]} rows={rows} />}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{head.map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
              {r.map((c, j) => <td key={j} className="p-2" style={{ color: j === 0 ? "var(--text-primary)" : "var(--text-secondary)" }}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
