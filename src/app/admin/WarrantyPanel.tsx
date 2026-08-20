"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, ShieldCheck, Wrench, X } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface WarrantyRegistration {
  id: string;
  orderNo?: string;
  productName: string;
  deviceOrSerial: string;
  customerEmail: string;
  purchaseDate: string;
  warrantyMonths: number;
  status: "active" | "expired";
}
interface RmaCase {
  id: string;
  registrationId: string;
  issueDescription: string;
  status: "requested" | "diagnosing" | "approved" | "repair" | "replaced" | "rejected" | "closed";
  updatedAt: string;
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };
const RMA_STATUSES: RmaCase["status"][] = ["requested", "diagnosing", "approved", "repair", "replaced", "rejected", "closed"];

export default function WarrantyPanel() {
  const [registrations, setRegistrations] = useState<WarrantyRegistration[]>([]);
  const [rmas, setRmas] = useState<RmaCase[]>([]);
  const [stats, setStats] = useState<{ registrations: number; openCases: number; closedCases: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Partial<WarrantyRegistration> | null>(null);
  const [rmaFor, setRmaFor] = useState<WarrantyRegistration | null>(null);
  const [issue, setIssue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/warranty", { headers: { "x-admin-token": tok() } });
      if (res.ok) {
        const d = await res.json();
        setRegistrations(d.registrations || []);
        setRmas(d.rmas || []);
        setStats(d.stats || null);
      } else {
        setError("Could not load warranty registrations. This is a loading failure, not an empty list.");
      }
    } catch {
      setError("Could not load warranty registrations. This is a loading failure, not an empty list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form?.productName || !form.deviceOrSerial || !form.customerEmail || !form.purchaseDate) return;
    await fetch("/api/admin/warranty", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ ...form, warrantyMonths: form.warrantyMonths || 12 }),
    });
    setForm(null);
    load();
  };

  const openRma = (r: WarrantyRegistration) => {
    setRmaFor(r);
    setIssue("");
  };

  const submitRma = async () => {
    if (!rmaFor || !issue.trim()) return;
    await fetch("/api/admin/warranty", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "rma", registrationId: rmaFor.id, issueDescription: issue }),
    });
    setRmaFor(null);
    load();
  };

  const setStatus = async (id: string, status: RmaCase["status"]) => {
    setRmas((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    await fetch("/api/admin/warranty", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id, status }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <ShieldCheck className="w-5 h-5" /> Warranty & RMA Center
          </h2>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Warranty registrations linked to devices, and a repair/replacement workflow.</p>
        </div>
        <button onClick={() => setForm({ warrantyMonths: 12, purchaseDate: new Date().toISOString().slice(0, 10) })} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
          <Plus className="w-4 h-4" /> Register warranty
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl p-3" style={card}><div className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>{stats.registrations}</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Registrations</div></div>
          <div className="rounded-xl p-3" style={card}><div className="text-2xl font-extrabold text-amber-400">{stats.openCases}</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Open RMA cases</div></div>
          <div className="rounded-xl p-3" style={card}><div className="text-2xl font-extrabold text-emerald-400">{stats.closedCases}</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Closed cases</div></div>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <>
          <div className="space-y-2">
            {registrations.map((r) => (
              <div key={r.id} className="rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap" style={card}>
                <div>
                  <div className="font-medium" style={{ color: "var(--text-primary)" }}>{r.productName} <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>{r.deviceOrSerial}</span></div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{r.customerEmail} · purchased {new Date(r.purchaseDate).toLocaleDateString()} · {r.warrantyMonths} mo warranty</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: r.status === "active" ? "#22c55e22" : "#94a3b822", color: r.status === "active" ? "#22c55e" : "#94a3b8" }}>{r.status}</span>
                  <button onClick={() => openRma(r)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
                    <Wrench className="w-3.5 h-3.5" /> File RMA
                  </button>
                </div>
              </div>
            ))}
            {registrations.length === 0 && !error && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No warranty registrations yet.</p>}
          </div>

          {rmas.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>RMA cases</h3>
              <div className="space-y-2">
                {rmas.map((c) => (
                  <div key={c.id} className="rounded-xl p-3 flex items-center justify-between gap-3" style={card}>
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>{c.issueDescription}</span>
                    <select value={c.status} onChange={(e) => setStatus(c.id, e.target.value as RmaCase["status"])} className="text-xs rounded-lg px-2 py-1" style={inputStyle}>
                      {RMA_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>Register warranty</h3>
              <button onClick={() => setForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button>
            </div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Product name" value={form.productName || ""} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Device ID / serial" value={form.deviceOrSerial || ""} onChange={(e) => setForm({ ...form, deviceOrSerial: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Customer email" value={form.customerEmail || ""} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Order number (optional)" value={form.orderNo || ""} onChange={(e) => setForm({ ...form, orderNo: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" className={field} style={inputStyle} value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
                <input type="number" className={field} style={inputStyle} placeholder="Warranty months" value={form.warrantyMonths ?? 12} onChange={(e) => setForm({ ...form, warrantyMonths: Number(e.target.value) })} />
              </div>
              <button onClick={save} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Save registration</button>
            </div>
          </div>
        </div>
      )}

      {rmaFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>File RMA — {rmaFor.productName}</h3>
              <button onClick={() => setRmaFor(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button>
            </div>
            <textarea className={field} style={inputStyle} rows={3} placeholder="Describe the issue…" value={issue} onChange={(e) => setIssue(e.target.value)} />
            <button onClick={submitRma} className="w-full mt-3 py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Submit RMA</button>
          </div>
        </div>
      )}
    </div>
  );
}
