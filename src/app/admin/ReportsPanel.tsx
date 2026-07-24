"use client";

import { useCallback, useEffect, useState } from "react";
import { FileBarChart, Download, RefreshCw } from "lucide-react";
import { LineChart, HBar, DonutChart, PALETTE } from "./charts";

function tok() { try { return sessionStorage.getItem("admin-token") || ""; } catch { return ""; } }
const money = (n: number) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };

type Report = "sales" | "products" | "customers" | "categories" | "coupons" | "tax";
const REPORTS: { id: Report; label: string; desc: string }[] = [
  { id: "sales", label: "Sales report", desc: "Daily orders, revenue, AOV and new customers" },
  { id: "products", label: "Product performance", desc: "Units, orders and revenue per product" },
  { id: "customers", label: "Customer report", desc: "Top customers by spend and orders" },
  { id: "categories", label: "Category report", desc: "Revenue and units by category" },
  { id: "coupons", label: "Coupon report", desc: "Usage and discount given per coupon" },
  { id: "tax", label: "GST / tax report", desc: "Taxable value and GST @18% by day" },
];
const RANGES = [7, 30, 90, 180, 365];

export default function ReportsPanel() {
  const [rep, setRep] = useState<Report>("sales");
  const [range, setRange] = useState(30);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/insights?range=${range}`, { headers: { "x-admin-token": tok() } });
      if (r.ok) setD(await r.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [range]);
  useEffect(() => { load(); }, [load]);

  const s = d?.series || [];

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      {/* report picker */}
      <div className="space-y-2">
        <h3 className="mb-1 flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          <FileBarChart className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} /> Reports
        </h3>
        {REPORTS.map((r) => (
          <button key={r.id} onClick={() => setRep(r.id)} className="w-full rounded-xl p-3 text-left transition-colors"
            style={rep === r.id ? { background: "var(--accent-cyan-muted)", border: "1px solid var(--border-accent)" } : card}>
            <p className="text-sm font-semibold" style={{ color: rep === r.id ? "var(--accent-cyan)" : "var(--text-primary)" }}>{r.label}</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{r.desc}</p>
          </button>
        ))}
      </div>

      {/* report body */}
      <div className="rounded-2xl p-5" style={card}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{REPORTS.find((r) => r.id === rep)?.label}</h4>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg p-0.5" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
              {RANGES.map((r) => (
                <button key={r} onClick={() => setRange(r)} className="rounded-md px-2 py-1 text-xs font-medium"
                  style={range === r ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff" } : { color: "var(--text-tertiary)" }}>{r}d</button>
              ))}
            </div>
            <button onClick={load} className="rounded-lg border p-2" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}><RefreshCw className="h-4 w-4" /></button>
            <a href={`/api/admin/insights/export?type=${rep}&range=${range}`} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-2 text-sm font-semibold text-white">
              <Download className="h-4 w-4" /> CSV
            </a>
          </div>
        </div>

        {loading && !d ? <p className="py-10 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>Loading…</p> : d && (
          <>
            {rep === "sales" && (
              <>
                <LineChart labels={s.map((p: any) => p.label)} area currency series={[{ name: "Revenue", data: s.map((p: any) => p.revenue), color: PALETTE[0] }]} />
                <TableBlock head={["Date", "Orders", "Paid", "Revenue", "AOV", "New cust."]}
                  rows={s.map((p: any) => [p.date, p.orders, p.paidOrders, money(p.revenue), money(p.aov), p.newCustomers])} />
              </>
            )}
            {rep === "products" && (d.topProducts?.length
              ? <><HBar currency items={d.topProducts.map((p: any) => ({ name: p.name, value: p.revenue }))} />
                  <TableBlock head={["Product", "Orders", "Units", "Revenue"]} rows={d.topProducts.map((p: any) => [p.name, p.orders, p.qty, money(p.revenue)])} /></>
              : <Empty />)}
            {rep === "customers" && (d.topCustomers?.length
              ? <TableBlock head={["Name", "Email", "Orders", "Spend"]} rows={d.topCustomers.map((c: any) => [c.name, c.email, c.orders, money(c.spend)])} />
              : <Empty />)}
            {rep === "categories" && (d.categorySales?.length
              ? <><DonutChart centerLabel={money(d.categorySales.reduce((a: number, c: any) => a + c.revenue, 0))} centerSub="revenue"
                    data={d.categorySales.slice(0, 8).map((c: any, i: number) => ({ name: c.name, value: c.revenue, color: PALETTE[i % PALETTE.length] }))} />
                  <TableBlock head={["Category", "Units", "Revenue"]} rows={d.categorySales.map((c: any) => [c.name, c.units, money(c.revenue)])} /></>
              : <Empty />)}
            {rep === "coupons" && (d.couponUsage?.length
              ? <TableBlock head={["Code", "Uses", "Discount given"]} rows={d.couponUsage.map((c: any) => [c.code, c.uses, money(c.discount)])} />
              : <Empty text="No coupons used." />)}
            {rep === "tax" && (
              <TableBlock head={["Date", "Taxable value", "GST @18%", "Total (incl.)"]}
                rows={s.map((p: any) => [p.date, money(Math.round(p.revenue / 1.18)), money(Math.round(p.revenue - p.revenue / 1.18)), money(p.revenue)])} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TableBlock({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="mt-4 max-h-96 overflow-auto">
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
function Empty({ text = "No data for this range." }: { text?: string }) {
  return <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>{text}</p>;
}
