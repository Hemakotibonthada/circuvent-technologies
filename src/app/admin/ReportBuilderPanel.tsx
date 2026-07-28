"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Play, Save, Trash2 } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

type ReportDimension = "orderNo" | "date" | "customerEmail" | "status" | "paymentMethod" | "total" | "itemsCount";
interface SavedReport { id: string; name: string; dimensions: ReportDimension[]; fromDate?: string; toDate?: string }

const ALL_DIMENSIONS: ReportDimension[] = ["orderNo", "date", "customerEmail", "status", "paymentMethod", "total", "itemsCount"];
const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
}

export default function ReportBuilderPanel() {
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [dims, setDims] = useState<Set<ReportDimension>>(new Set(["orderNo", "date", "total"]));
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [rows, setRows] = useState<Record<string, string | number>[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/report-builder", { headers: { "x-admin-token": tok() } });
    if (res.ok) setSaved((await res.json()).reports || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDim = (d: ReportDimension) => {
    setDims((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  const run = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/report-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "run", dimensions: Array.from(dims), fromDate: fromDate || undefined, toDate: toDate || undefined }),
    });
    const d = await res.json();
    setBusy(false);
    if (d.success) setRows(d.rows || []);
  };

  const save = async () => {
    if (!name.trim()) return;
    await fetch("/api/admin/report-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "save", name, dimensions: Array.from(dims), fromDate: fromDate || undefined, toDate: toDate || undefined }),
    });
    setName("");
    load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/admin/report-builder?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  const download = () => {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "custom-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><FileSpreadsheet className="w-5 h-5" /> Custom Report Builder</h2>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Pick dimensions and a date range, then export — no need to wait for a purpose-built report.</p>
      </div>

      <div className="rounded-xl p-4" style={card}>
        <div className="flex flex-wrap gap-2 mb-3">
          {ALL_DIMENSIONS.map((d) => (
            <button key={d} onClick={() => toggleDim(d)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: dims.has(d) ? "linear-gradient(135deg, #06b6d4, #8b5cf6)" : "var(--bg-glass)", color: dims.has(d) ? "#fff" : "var(--text-secondary)", border: "1px solid var(--border-primary)" }}>
              {d}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>From<input type="date" className={field} style={inputStyle} value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label>
          <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>To<input type="date" className={field} style={inputStyle} value={toDate} onChange={(e) => setToDate(e.target.value)} /></label>
          <button onClick={run} disabled={busy || dims.size === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run
          </button>
          <input className={field} style={{ ...inputStyle, maxWidth: 180 }} placeholder="Save as…" value={name} onChange={(e) => setName(e.target.value)} />
          <button onClick={save} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}><Save className="w-4 h-4" /></button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={card}>
          <div className="flex justify-end p-2">
            <button onClick={download} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--accent-cyan)" }}><Download className="w-3.5 h-3.5" /> Download CSV</button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-primary)" }}>
                {Object.keys(rows[0]).map((h) => <th key={h} className="px-4 py-2 text-left font-medium" style={{ color: "var(--text-tertiary)" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-primary)" }}>
                  {Object.values(r).map((v, j) => <td key={j} className="px-4 py-1.5" style={{ color: "var(--text-secondary)" }}>{String(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 && <p className="text-xs p-2" style={{ color: "var(--text-tertiary)" }}>Showing first 50 of {rows.length} rows — download for the full set.</p>}
        </div>
      )}

      {saved.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Saved reports</h3>
          <div className="space-y-1.5">
            {saved.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg-glass)" }}>
                <span style={{ color: "var(--text-primary)" }}>{s.name} <span style={{ color: "var(--text-tertiary)" }}>({s.dimensions.join(", ")})</span></span>
                <button onClick={() => remove(s.id)} className="p-1 rounded hover:bg-white/10 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
