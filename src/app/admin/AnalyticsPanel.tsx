"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Download, TrendingUp } from "lucide-react";
import { LineChart, BarChart, DonutChart, HBar, Heatmap, KpiCard, Legend, PALETTE } from "./charts";

function tok() { try { return sessionStorage.getItem("admin-token") || ""; } catch { return ""; } }
const money = (n: number) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };

const RANGES = [7, 30, 90, 180, 365];

export default function AnalyticsPanel() {
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

  if (loading && !d) return <div className="py-16 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>Loading analytics…</div>;
  if (!d) return null;

  const s = d.series || [];
  const labels = s.map((p: any) => p.label);

  return (
    <div className="space-y-5">
      {/* header + range */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          <TrendingUp className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} /> Analytics
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg p-0.5" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)} className="rounded-md px-2.5 py-1 text-xs font-medium"
                style={range === r ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff" } : { color: "var(--text-tertiary)" }}>
                {r}d
              </button>
            ))}
          </div>
          <button onClick={load} className="rounded-lg border p-2" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label={`Revenue (${range}d)`} prefix="₹" value={d.kpis.revenue.value} delta={d.kpis.revenue.delta} spark={d.kpis.revenue.spark} color={PALETTE[0]} />
        <KpiCard label="Orders" value={d.kpis.orders.value} delta={d.kpis.orders.delta} spark={d.kpis.orders.spark} color={PALETTE[1]} />
        <KpiCard label="Avg order value" prefix="₹" value={d.kpis.aov.value} delta={d.kpis.aov.delta} spark={d.kpis.aov.spark} color={PALETTE[2]} />
        <KpiCard label="New customers" value={d.kpis.newCustomers.value} delta={d.kpis.newCustomers.delta} spark={d.kpis.newCustomers.spark} color={PALETTE[4]} />
        <KpiCard label="Units sold" value={d.kpis.units.value} delta={d.kpis.units.delta} spark={d.kpis.units.spark} color={PALETTE[3]} />
      </div>

      {/* revenue + orders */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Revenue trend">
          <LineChart labels={labels} area currency series={[{ name: "Revenue", data: s.map((p: any) => p.revenue), color: PALETTE[0] }]} />
        </Panel>
        <Panel title="Orders per day">
          <BarChart labels={labels} data={s.map((p: any) => p.orders)} color={PALETTE[1]} />
        </Panel>
      </div>

      {/* AOV + new customers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Average order value">
          <LineChart labels={labels} currency series={[{ name: "AOV", data: s.map((p: any) => p.aov), color: PALETTE[2] }]} />
        </Panel>
        <Panel title="New customers">
          <BarChart labels={labels} data={s.map((p: any) => p.newCustomers)} color={PALETTE[4]} />
        </Panel>
      </div>

      {/* breakdowns */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Sales by category">
          {d.categorySales?.length ? <DonutChart centerLabel={money(d.categorySales.reduce((a: number, c: any) => a + c.revenue, 0))} centerSub="revenue"
            data={d.categorySales.slice(0, 6).map((c: any, i: number) => ({ name: c.name, value: c.revenue, color: PALETTE[i % PALETTE.length] }))} /> : <Empty />}
        </Panel>
        <Panel title="Payment methods">
          {d.paymentSplit?.length ? <DonutChart centerLabel={String(d.paymentSplit.reduce((a: number, c: any) => a + c.orders, 0))} centerSub="orders"
            data={d.paymentSplit.map((c: any, i: number) => ({ name: c.name, value: c.orders, color: PALETTE[i % PALETTE.length] }))} /> : <Empty />}
        </Panel>
        <Panel title="New vs returning">
          <DonutChart centerLabel={String((d.newVsReturning.new || 0) + (d.newVsReturning.returning || 0))} centerSub="buyers"
            data={[{ name: "New", value: d.newVsReturning.new, color: PALETTE[0] }, { name: "Returning", value: d.newVsReturning.returning, color: PALETTE[3] }]} />
        </Panel>
      </div>

      {/* funnel + top products */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Fulfilment funnel">
          <HBar items={(d.funnel || []).map((f: any, i: number) => ({ name: `${f.stage} (${f.pct}%)`, value: f.count, color: PALETTE[i % PALETTE.length] }))} />
        </Panel>
        <Panel title="Top products by revenue">
          {d.topProducts?.length ? <HBar currency items={d.topProducts.map((p: any) => ({ name: p.name, value: p.revenue }))} /> : <Empty />}
        </Panel>
      </div>

      {/* top customers + coupons */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Top customers">
          {d.topCustomers?.length ? (
            <table className="w-full text-sm">
              <tbody>
                {d.topCustomers.map((c: any) => (
                  <tr key={c.email} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
                    <td className="py-1.5" style={{ color: "var(--text-primary)" }}>{c.name}</td>
                    <td className="py-1.5 text-xs" style={{ color: "var(--text-muted)" }}>{c.orders} orders</td>
                    <td className="py-1.5 text-right" style={{ color: "var(--text-secondary)" }}>{money(c.spend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty />}
        </Panel>
        <Panel title="Coupon usage">
          {d.couponUsage?.length ? (
            <table className="w-full text-sm">
              <tbody>
                {d.couponUsage.map((c: any) => (
                  <tr key={c.code} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
                    <td className="py-1.5 font-mono" style={{ color: "var(--text-primary)" }}>{c.code}</td>
                    <td className="py-1.5 text-xs" style={{ color: "var(--text-muted)" }}>{c.uses} uses</td>
                    <td className="py-1.5 text-right" style={{ color: "#ef4444" }}>-{money(c.discount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty text="No coupons used yet." />}
        </Panel>
      </div>

      {/* heatmap */}
      <Panel title="Order heatmap (weekday × hour)">
        <Heatmap grid={d.heatmap.grid} rows={d.heatmap.rows} cols={d.heatmap.cols} />
      </Panel>

      {/* exports */}
      <div className="flex flex-wrap gap-2">
        {["sales", "products", "customers", "categories", "coupons", "tax"].map((t) => (
          <a key={t} href={`/api/admin/insights/export?type=${t}&range=${range}`}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm capitalize" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
            <Download className="h-4 w-4" /> {t} report
          </a>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={card}>
      <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h4>
      {children}
    </div>
  );
}
function Empty({ text = "No data yet." }: { text?: string }) {
  return <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>{text}</p>;
}
