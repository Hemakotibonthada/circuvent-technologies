"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Copy, FileSpreadsheet, Loader2, Plus, Receipt, RefreshCw, Trash2, X } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface HsnMapping {
  id: string;
  matchType: "category" | "productId";
  matchValue: string;
  hsnCode: string;
  gstRatePct: number;
}
interface GstReturnRecord {
  id: string;
  periodLabel: string;
  ordersCount: number;
  grossSales: number;
  taxableValue: number;
  gstCollected: number;
  generatedAt: string;
}
interface SequenceState {
  prefix: string;
  financialYear: string;
  nextNumber: number;
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function TaxCenterPanel() {
  const [mappings, setMappings] = useState<HsnMapping[]>([]);
  const [returns, setReturns] = useState<GstReturnRecord[]>([]);
  const [sequence, setSequence] = useState<SequenceState | null>(null);
  const [stats, setStats] = useState<{ mappings: number; ytdCollected: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  const [form, setForm] = useState<Partial<HsnMapping> | null>(null);
  const [reservedNumber, setReservedNumber] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/tax", { headers: { "x-admin-token": tok() } });
      if (res.ok) {
        const d = await res.json();
        setMappings(d.mappings || []);
        setReturns(d.returns || []);
        setSequence(d.sequence || null);
        setStats(d.stats || null);
      } else {
        setError("Could not load tax & GST data. This is a loading failure, not an empty list.");
      }
    } catch {
      setError("Could not load tax & GST data. This is a loading failure, not an empty list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveMapping = async () => {
    if (!form?.matchValue || !form.hsnCode) return;
    await fetch("/api/admin/tax", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ matchType: form.matchType || "category", matchValue: form.matchValue, hsnCode: form.hsnCode, gstRatePct: form.gstRatePct || 18 }),
    });
    setForm(null);
    load();
  };

  const removeMapping = async (id: string) => {
    await fetch(`/api/admin/tax?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  const generate = async () => {
    await fetch("/api/admin/tax", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "generate-return", periodLabel: period }),
    });
    load();
  };

  const reserveNumber = async () => {
    const res = await fetch("/api/admin/tax", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "reserve-invoice-number" }),
    });
    const d = await res.json();
    if (d.success) {
      setReservedNumber(d.number);
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <Receipt className="w-5 h-5" /> Tax & GST Compliance Center
        </h2>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>HSN/GST mappings, monthly return generation, and gapless tax-invoice numbering.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-3" style={card}>
            <div className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>{stats.mappings}</div>
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>HSN mappings</div>
          </div>
          <div className="rounded-xl p-3" style={card}>
            <div className="text-2xl font-extrabold text-emerald-400">₹{stats.ytdCollected.toLocaleString("en-IN")}</div>
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>GST collected (FY to date)</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : error ? (
        <div>
          <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
          <button onClick={load} className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-xl p-4" style={card}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>Generate monthly GST return</h3>
            <div className="flex gap-2">
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={field} style={{ ...inputStyle, width: "auto" }} />
              <button onClick={generate} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Generate</button>
            </div>
            <div className="mt-4 space-y-1.5">
              {returns.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs rounded-lg px-3 py-2" style={{ background: "var(--bg-glass)" }}>
                  <span style={{ color: "var(--text-primary)" }}>{r.periodLabel} · {r.ordersCount} orders</span>
                  <span style={{ color: "var(--text-tertiary)" }}>Taxable ₹{r.taxableValue.toLocaleString("en-IN")} · GST ₹{r.gstCollected.toLocaleString("en-IN")}</span>
                </div>
              ))}
              {returns.length === 0 && <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No returns generated yet.</p>}
            </div>
          </div>

          {sequence && (
            <div className="rounded-xl p-4" style={card}>
              <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Tax invoice numbering</h3>
              <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>
                {sequence.prefix}/{sequence.financialYear}/{String(sequence.nextNumber).padStart(6, "0")} is next.
              </p>
              <button onClick={reserveNumber} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
                <FileSpreadsheet className="w-3.5 h-3.5" /> Reserve next number
              </button>
              {reservedNumber && (
                <div className="mt-2 flex items-center gap-2 text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                  <Copy className="w-3.5 h-3.5" /> {reservedNumber}
                </div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>HSN / GST mappings</h3>
              <button onClick={() => setForm({ matchType: "category", gstRatePct: 18 })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
                <Plus className="w-3.5 h-3.5" /> New mapping
              </button>
            </div>
            <div className="space-y-2">
              {mappings.map((m) => (
                <div key={m.id} className="rounded-xl p-3 flex items-center justify-between" style={card}>
                  <span className="text-sm" style={{ color: "var(--text-primary)" }}>{m.matchType}: {m.matchValue} → HSN {m.hsnCode} @ {m.gstRatePct}%</span>
                  <button onClick={() => removeMapping(m.id)} className="p-1 rounded hover:bg-white/10 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {mappings.length === 0 && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No mappings yet.</p>}
            </div>
          </div>
        </>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>New HSN mapping</h3>
              <button onClick={() => setForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button>
            </div>
            <div className="space-y-3">
              <select className={field} style={inputStyle} value={form.matchType} onChange={(e) => setForm({ ...form, matchType: e.target.value as HsnMapping["matchType"] })}>
                <option value="category">Category</option>
                <option value="productId">Product ID</option>
              </select>
              <input className={field} style={inputStyle} placeholder="Match value" value={form.matchValue || ""} onChange={(e) => setForm({ ...form, matchValue: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="HSN code" value={form.hsnCode || ""} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} />
              <input type="number" className={field} style={inputStyle} placeholder="GST rate %" value={form.gstRatePct ?? 18} onChange={(e) => setForm({ ...form, gstRatePct: Number(e.target.value) })} />
              <button onClick={saveMapping} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Save mapping</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
