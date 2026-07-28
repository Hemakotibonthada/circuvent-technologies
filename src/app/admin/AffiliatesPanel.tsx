"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, CheckCircle2, Handshake, Loader2, Plus, XCircle } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface Affiliate {
  id: string;
  name: string;
  email: string;
  code: string;
  commissionPct: number;
  status: "pending" | "approved" | "suspended";
}
interface PayoutRequest {
  id: string;
  affiliateId: string;
  amount: number;
  status: "requested" | "paid" | "rejected";
  requestedAt: string;
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

export default function AffiliatesPanel() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [owed, setOwed] = useState<Record<string, number>>({});
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [stats, setStats] = useState<{ total: number; approved: number; pendingPayouts: number; totalCommission: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ name: string; email: string; commissionPct: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/affiliates", { headers: { "x-admin-token": tok() } });
    if (res.ok) {
      const d = await res.json();
      setAffiliates(d.affiliates || []);
      setOwed(d.owed || {});
      setPayouts(d.payouts || []);
      setStats(d.stats || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form?.name || !form.email) return;
    await fetch("/api/admin/affiliates", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify(form),
    });
    setForm(null);
    load();
  };

  const decide = async (id: string, status: "approved" | "suspended") => {
    await fetch("/api/admin/affiliates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id, status }),
    });
    load();
  };

  const decidePayout = async (id: string, status: "paid" | "rejected") => {
    await fetch("/api/admin/affiliates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "payout", id, status }),
    });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Handshake className="w-5 h-5" /> Affiliate Program
          </h2>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Commission-based partners, conversions and payout requests.</p>
        </div>
        <button onClick={() => setForm({ name: "", email: "", commissionPct: 10 })} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
          <Plus className="w-4 h-4" /> New affiliate
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Affiliates", value: stats.total },
            { label: "Approved", value: stats.approved, color: "#22c55e" },
            { label: "Pending payouts", value: stats.pendingPayouts, color: "#f59e0b" },
            { label: "Commission earned", value: `₹${stats.totalCommission.toLocaleString("en-IN")}` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3" style={card}>
              <div className="text-2xl font-extrabold" style={{ color: s.color || "var(--text-primary)" }}>{s.value}</div>
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <>
          <div className="space-y-3">
            {affiliates.map((a) => (
              <div key={a.id} className="rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap" style={card}>
                <div>
                  <div className="font-medium" style={{ color: "var(--text-primary)" }}>{a.name} <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>{a.code}</span></div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{a.email} · {a.commissionPct}% commission · owed ₹{(owed[a.id] || 0).toLocaleString("en-IN")}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold capitalize" style={{ background: a.status === "approved" ? "#22c55e22" : a.status === "suspended" ? "#ef444422" : "#f59e0b22", color: a.status === "approved" ? "#22c55e" : a.status === "suspended" ? "#ef4444" : "#f59e0b" }}>{a.status}</span>
                  {a.status !== "approved" && <button onClick={() => decide(a.id, "approved")} className="p-1.5 rounded-lg text-emerald-400 hover:bg-white/10"><CheckCircle2 className="w-4 h-4" /></button>}
                  {a.status !== "suspended" && <button onClick={() => decide(a.id, "suspended")} className="p-1.5 rounded-lg text-red-400 hover:bg-white/10"><XCircle className="w-4 h-4" /></button>}
                </div>
              </div>
            ))}
            {affiliates.length === 0 && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No affiliates yet.</p>}
          </div>

          {payouts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}><Banknote className="w-4 h-4" /> Payout requests</h3>
              <div className="space-y-2">
                {payouts.map((p) => (
                  <div key={p.id} className="rounded-xl p-3 flex items-center justify-between" style={card}>
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>{affiliates.find((a) => a.id === p.affiliateId)?.name || p.affiliateId} — ₹{p.amount.toLocaleString("en-IN")}</span>
                    {p.status === "requested" ? (
                      <div className="flex gap-1.5">
                        <button onClick={() => decidePayout(p.id, "paid")} className="p-1.5 rounded-lg text-emerald-400 hover:bg-white/10"><CheckCircle2 className="w-4 h-4" /></button>
                        <button onClick={() => decidePayout(p.id, "rejected")} className="p-1.5 rounded-lg text-red-400 hover:bg-white/10"><XCircle className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: p.status === "paid" ? "#22c55e22" : "#ef444422", color: p.status === "paid" ? "#22c55e" : "#ef4444" }}>{p.status}</span>
                    )}
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
            <h3 className="font-bold mb-4" style={{ color: "var(--text-primary)" }}>New affiliate</h3>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input type="number" className={field} style={inputStyle} placeholder="Commission %" value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: Number(e.target.value) })} />
              <button onClick={save} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Save affiliate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
