"use client";

// Admin Reports panel.
//
// Every figure shown here is fetched from /api/admin/reports/data as a raw
// ReportTable and formatted on the client with the SAME reports-format helpers
// the server PDF and CSV use — so a number is identical on screen, in the CSV
// and in the PDF. Nothing is computed in the browser and nothing is hardcoded
// (the old panel divided revenue by a flat 1.18 for "GST" and printed the DOM
// via window.print(); both are gone). PDF export now streams a real,
// server-generated PDF from /api/admin/reports/pdf.

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileBarChart, Download, RefreshCw, FileText, CalendarClock, Plus, Trash2, Send } from "lucide-react";
import { LineChart, BarChart, HBar, DonutChart, PALETTE } from "./charts";
import {
  REPORT_CATALOG, REPORT_GROUPS,
  formatCell, columnAlign, isNumericType, indianGroup,
  type ReportTable, type ReportColumn, type Cell, type ChartSpec,
} from "@/lib/reports-format";

function tok() { try { return sessionStorage.getItem("admin-token") || ""; } catch { return ""; } }
const authHead = () => ({ "x-admin-token": tok() });
const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const RANGES = [7, 30, 90, 180, 365];

// --------------------------------------------------------------- schedules ---

interface Schedule {
  id: string;
  reportType: string;
  rangeDays: number;
  frequency: "daily" | "weekly" | "monthly";
  recipients: string[];
  enabled: boolean;
  label?: string;
  lastSentAt: string | null;
  lastStatus: "ok" | "failed" | "skipped" | null;
  lastError: string | null;
  sendCount: number;
}
interface ReportOption { id: string; label: string; group: string }

// ------------------------------------------------------------------ panel ----

export default function ReportsPanel() {
  const [rep, setRep] = useState<string>("sales");
  const [range, setRange] = useState(30);
  const [table, setTable] = useState<ReportTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "csv" | null>(null);
  const [showSchedules, setShowSchedules] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/reports/data?type=${rep}&range=${range}`, { headers: authHead() });
      if (!r.ok) { setError(`Failed to load report (${r.status})`); setTable(null); }
      else { const j = await r.json(); setTable(j.table as ReportTable); }
    } catch { setError("Network error loading report."); setTable(null); }
    setLoading(false);
  }, [rep, range]);
  useEffect(() => { load(); }, [load]);

  const download = async (kind: "pdf" | "csv") => {
    setDownloading(kind);
    try {
      const r = await fetch(`/api/admin/reports/${kind}?type=${rep}&range=${range}`, { headers: authHead() });
      if (!r.ok) { setError(`Export failed (${r.status})`); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `circuvent-${rep}-report-${new Date().toISOString().slice(0, 10)}.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch { setError("Network error during export."); }
    setDownloading(null);
  };

  const active = REPORT_CATALOG.find((r) => r.id === rep);

  return (
    <div className="grid gap-4 lg:grid-cols-[248px_1fr]">
      {/* report rail, grouped */}
      <div className="space-y-4">
        <h3 className="mb-1 flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          <FileBarChart className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} /> Reports
        </h3>
        {REPORT_GROUPS.map((group) => (
          <div key={group} className="space-y-1.5">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{group}</p>
            {REPORT_CATALOG.filter((r) => r.group === group).map((r) => (
              <button key={r.id} onClick={() => setRep(r.id)} className="w-full rounded-xl p-2.5 text-left transition-colors"
                style={rep === r.id ? { background: "var(--accent-cyan-muted)", border: "1px solid var(--border-accent)" } : card}>
                <p className="text-sm font-semibold" style={{ color: rep === r.id ? "var(--accent-cyan)" : "var(--text-primary)" }}>{r.label}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{r.desc}</p>
              </button>
            ))}
          </div>
        ))}
        <button onClick={() => setShowSchedules((s) => !s)}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold"
          style={{ borderColor: "var(--border-primary)", color: showSchedules ? "var(--accent-cyan)" : "var(--text-secondary)" }}>
          <CalendarClock className="h-4 w-4" /> Scheduled emails
        </button>
      </div>

      {/* report body */}
      <div className="space-y-4">
        <div className="rounded-2xl p-5" style={card}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{active?.label}</h4>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{table?.subtitle || active?.desc}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg p-0.5" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
                {RANGES.map((r) => (
                  <button key={r} onClick={() => setRange(r)} className="rounded-md px-2 py-1 text-xs font-medium"
                    style={range === r ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff" } : { color: "var(--text-tertiary)" }}>{r}d</button>
                ))}
              </div>
              <button onClick={load} title="Refresh" className="rounded-lg border p-2" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
              <button onClick={() => download("pdf")} disabled={!!downloading || !table}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
                <FileText className="h-4 w-4" /> {downloading === "pdf" ? "Building…" : "PDF"}
              </button>
              <button onClick={() => download("csv")} disabled={!!downloading || !table}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <Download className="h-4 w-4" /> {downloading === "csv" ? "…" : "CSV"}
              </button>
            </div>
          </div>

          {error && <p className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--accent-rose-muted,#fee)", color: "#b91c1c" }}>{error}</p>}

          {loading && !table ? (
            <p className="py-10 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>Loading…</p>
          ) : table ? (
            <ReportView table={table} />
          ) : (
            <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
          )}
        </div>

        {showSchedules && <SchedulePanel currentType={rep} currentRange={range} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- report view ---

function ReportView({ table }: { table: ReportTable }) {
  return (
    <>
      {table.summary.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {table.summary.map((s, i) => (
            <div key={i} className="rounded-xl p-3" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{s.label}</p>
              <p className="mt-0.5 text-lg font-bold" style={{ color: "var(--text-primary)" }}>{s.value}</p>
              {s.hint && <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{s.hint}</p>}
            </div>
          ))}
        </div>
      )}

      {table.chart && table.chart.kind !== "none" && <ChartBlock table={table} spec={table.chart} />}

      <SortableTable columns={table.columns} rows={table.rows} totals={table.totals} signed={table.id === "pnl"} />

      {(table.sections ?? []).map((sec, i) => (
        <div key={i} className="mt-5">
          {sec.title && <h5 className="mb-1 text-sm font-bold" style={{ color: "var(--text-primary)" }}>{sec.title}</h5>}
          {sec.subtitle && <p className="mb-1 text-xs" style={{ color: "var(--text-muted)" }}>{sec.subtitle}</p>}
          <SortableTable columns={sec.columns} rows={sec.rows} totals={sec.totals} />
        </div>
      ))}

      {table.notes.length > 0 && (
        <div className="mt-4 rounded-xl p-3" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Notes</p>
          <ul className="space-y-1">
            {table.notes.map((n, i) => (
              <li key={i} className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>• {n}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// --------------------------------------------------------------- chart spec --

function colIndex(columns: ReportColumn[], key: string): number {
  return columns.findIndex((c) => c.key === key);
}
function numAt(row: Cell[], i: number): number {
  const v = i >= 0 ? row[i] : null;
  return typeof v === "number" && isFinite(v) ? v : 0;
}
function strAt(row: Cell[], i: number): string {
  const v = i >= 0 ? row[i] : "";
  return v === null || v === undefined ? "" : String(v);
}

function ChartBlock({ table, spec }: { table: ReportTable; spec: ChartSpec }) {
  const li = colIndex(table.columns, spec.labelKey);
  const rows = table.rows;
  if (!rows.length) return null;

  if (spec.kind === "line") {
    const labels = rows.map((r) => strAt(r, li));
    const series = spec.valueKeys.map((k, idx) => {
      const vi = colIndex(table.columns, k);
      return { name: table.columns[vi]?.label || k, data: rows.map((r) => numAt(r, vi)), color: PALETTE[idx % PALETTE.length] };
    });
    return <div className="mb-4"><LineChart labels={labels} series={series} area={!!spec.area} currency={!!spec.currency} /></div>;
  }
  if (spec.kind === "bar") {
    const vi = colIndex(table.columns, spec.valueKeys[0]);
    const labels = rows.map((r) => strAt(r, li));
    const data = rows.map((r) => numAt(r, vi));
    return <div className="mb-4"><BarChart labels={labels} data={data} currency={!!spec.currency} /></div>;
  }
  if (spec.kind === "hbar") {
    const vi = colIndex(table.columns, spec.valueKeys[0]);
    const items = rows.map((r) => ({ name: strAt(r, li), value: numAt(r, vi) }))
      .sort((a, b) => b.value - a.value).slice(0, spec.limit || 12);
    return <div className="mb-4"><HBar items={items} currency={!!spec.currency} /></div>;
  }
  if (spec.kind === "donut") {
    const vi = colIndex(table.columns, spec.valueKeys[0]);
    const items = rows.map((r) => ({ name: strAt(r, li), value: numAt(r, vi) }))
      .sort((a, b) => b.value - a.value).slice(0, spec.limit || 8)
      .map((it, i) => ({ ...it, color: PALETTE[i % PALETTE.length] }));
    const total = items.reduce((a, c) => a + c.value, 0);
    const center = spec.currency ? "₹" + indianGroup(total) : indianGroup(total);
    return <div className="mb-4 flex justify-center"><DonutChart data={items} centerLabel={center} centerSub={spec.title || "total"} /></div>;
  }
  return null;
}

// ------------------------------------------------------------ sortable table -

function SortableTable({ columns, rows, totals, signed }: { columns: ReportColumn[]; rows: Cell[][]; totals?: Cell[]; signed?: boolean }) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    if (sortCol === null) return rows;
    const col = columns[sortCol];
    const numeric = isNumericType(col.type);
    const copy = rows.slice();
    copy.sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      if (av === null || av === undefined || av === "") return 1;
      if (bv === null || bv === undefined || bv === "") return -1;
      let cmp: number;
      if (numeric) cmp = Number(av) - Number(bv);
      else cmp = String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, columns, sortCol, dir]);

  const onSort = (i: number) => {
    if (sortCol === i) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(i); setDir(isNumericType(columns[i].type) ? "desc" : "asc"); }
  };

  const hasTotals = totals && totals.some((t) => t !== null && t !== undefined && t !== "");

  return (
    <div className="mt-2 max-h-[30rem] overflow-auto rounded-lg" style={{ border: "1px solid var(--border-primary)" }}>
      <table className="w-full text-sm">
        <thead className="sticky top-0" style={{ background: "var(--bg-surface)" }}>
          <tr className="text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
            {columns.map((c, i) => (
              <th key={c.key} onClick={() => onSort(i)}
                className="cursor-pointer select-none p-2 whitespace-nowrap"
                style={{ textAlign: columnAlign(c) }}>
                {c.label}{sortCol === i ? (dir === "asc" ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={columns.length} className="p-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>No rows for this range.</td></tr>
          ) : sorted.map((r, ri) => (
            <tr key={ri} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
              {columns.map((c, ci) => {
                const v = r[ci] ?? null;
                const neg = signed && c.type === "money" && typeof v === "number" && v < 0;
                return (
                  <td key={ci} className="p-2 whitespace-nowrap"
                    style={{ textAlign: columnAlign(c), color: neg ? "#dc2626" : ci === 0 ? "var(--text-primary)" : "var(--text-secondary)" }}>
                    {formatCell(v, c.type)}
                  </td>
                );
              })}
            </tr>
          ))}
          {hasTotals && (
            <tr className="border-t-2 font-bold" style={{ borderColor: "var(--border-accent)", background: "var(--bg-glass)" }}>
              {columns.map((c, ci) => {
                const v = totals![ci] ?? null;
                const disp = typeof v === "number" ? formatCell(v, c.type) : v === null ? "" : String(v);
                return <td key={ci} className="p-2 whitespace-nowrap" style={{ textAlign: columnAlign(c), color: "var(--text-primary)" }}>{disp}</td>;
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------- schedules UI --

function SchedulePanel({ currentType, currentRange }: { currentType: string; currentRange: number }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [options, setOptions] = useState<ReportOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ reportType: currentType, rangeDays: currentRange, frequency: "weekly", recipients: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/reports/schedules", { headers: authHead() });
      if (r.ok) { const j = await r.json(); setSchedules(j.schedules || []); setOptions(j.reportOptions || []); }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy("create"); setMsg(null);
    try {
      const r = await fetch("/api/admin/reports/schedules", {
        method: "POST", headers: { ...authHead(), "content-type": "application/json" },
        body: JSON.stringify({ ...form, rangeDays: Number(form.rangeDays) }),
      });
      const j = await r.json();
      if (!r.ok) setMsg(j.error || "Could not create schedule.");
      else { setForm((f) => ({ ...f, recipients: "" })); await load(); }
    } catch { setMsg("Network error."); }
    setBusy(null);
  };

  const act = async (id: string, method: "DELETE" | "PUT" | "SEND", body?: unknown) => {
    setBusy(id); setMsg(null);
    try {
      const url = method === "SEND" ? `/api/admin/reports/schedules?id=${id}&action=send` : `/api/admin/reports/schedules?id=${id}`;
      const r = await fetch(url, {
        method: method === "SEND" ? "POST" : method,
        headers: { ...authHead(), "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(j.error || (j.outcome?.error ? `Send failed: ${j.outcome.error}` : "Action failed."));
      else if (method === "SEND") setMsg(j.ok ? "Report sent." : `Send failed: ${j.outcome?.error || "transport not configured"}`);
      await load();
    } catch { setMsg("Network error."); }
    setBusy(null);
  };

  return (
    <div className="rounded-2xl p-5" style={card}>
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} />
        <h4 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Scheduled email reports</h4>
      </div>
      <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
        Each run rebuilds the report from live data and emails it as an inline table. Delivery uses the store&apos;s configured mail transport; the cron endpoint is <code>/api/admin/reports/schedules/run</code>.
      </p>

      {msg && <p className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg-glass)", color: "var(--text-secondary)" }}>{msg}</p>}

      {/* create form */}
      <div className="mb-4 grid gap-2 rounded-xl p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
        <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>Report
          <select value={form.reportType} onChange={(e) => setForm({ ...form, reportType: e.target.value })}
            className="mt-1 w-full rounded-lg px-2 py-1.5 text-sm" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}>
            {(options.length ? options : REPORT_CATALOG.map((r) => ({ id: r.id, label: r.label }))).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>Range
          <select value={form.rangeDays} onChange={(e) => setForm({ ...form, rangeDays: Number(e.target.value) })}
            className="mt-1 rounded-lg px-2 py-1.5 text-sm" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}>
            {RANGES.map((r) => <option key={r} value={r}>{r}d</option>)}
          </select>
        </label>
        <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>Frequency
          <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            className="mt-1 rounded-lg px-2 py-1.5 text-sm" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}>
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </select>
        </label>
        <div />
        <label className="text-xs sm:col-span-4" style={{ color: "var(--text-tertiary)" }}>Recipients (comma or space separated)
          <div className="mt-1 flex gap-2">
            <input value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} placeholder="ops@circuvent.example, finance@circuvent.example"
              className="w-full rounded-lg px-2 py-1.5 text-sm" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }} />
            <button onClick={create} disabled={busy === "create"} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </label>
      </div>

      {/* list */}
      {loading ? <p className="py-4 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>Loading…</p> :
        schedules.length === 0 ? <p className="py-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>No schedules yet.</p> : (
          <div className="space-y-2">
            {schedules.map((s) => {
              const opt = REPORT_CATALOG.find((r) => r.id === s.reportType);
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-3" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{opt?.label || s.reportType} <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>· {s.frequency} · {s.rangeDays}d</span></p>
                    <p className="truncate text-xs" style={{ color: "var(--text-tertiary)" }}>{s.recipients.join(", ")}</p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {s.lastSentAt ? `Last sent ${new Date(s.lastSentAt).toLocaleString("en-IN")} · ${s.lastStatus}` : "Never sent"}
                      {s.lastError ? ` · ${s.lastError}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => act(s.id, "PUT", { enabled: !s.enabled })} disabled={busy === s.id}
                      className="rounded-lg border px-2 py-1 text-xs font-semibold" style={{ borderColor: "var(--border-primary)", color: s.enabled ? "var(--accent-cyan)" : "var(--text-muted)" }}>
                      {s.enabled ? "Enabled" : "Paused"}
                    </button>
                    <button onClick={() => act(s.id, "SEND")} disabled={busy === s.id} title="Send now"
                      className="rounded-lg border p-1.5" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}><Send className="h-3.5 w-3.5" /></button>
                    <button onClick={() => act(s.id, "DELETE")} disabled={busy === s.id} title="Delete"
                      className="rounded-lg border p-1.5" style={{ borderColor: "var(--border-primary)", color: "#dc2626" }}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
