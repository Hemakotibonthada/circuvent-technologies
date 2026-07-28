"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertOctagon, Ban, CheckCircle2, Loader2, Plus, ShieldAlert, Trash2, X } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface FlaggedOrder {
  orderNo: string;
  email: string;
  name: string;
  total: number;
  placedAt: string;
  riskScore: number;
  reasons: string[];
  review?: { decision: "cleared" | "blocked"; reviewedBy: string; at: string };
}
interface BlocklistEntry {
  id: string;
  type: "email" | "phone" | "pincode";
  value: string;
  reason: string;
  addedAt: string;
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

function riskColor(score: number) {
  if (score >= 60) return "#ef4444";
  if (score >= 30) return "#f59e0b";
  return "#94a3b8";
}

export default function FraudPanel() {
  const [flagged, setFlagged] = useState<FlaggedOrder[]>([]);
  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>([]);
  const [stats, setStats] = useState<{ flagged: number; pendingReview: number; blockedCount: number; blocklistSize: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockForm, setBlockForm] = useState({ type: "email", value: "", reason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/fraud", { headers: { "x-admin-token": tok() } });
    if (res.ok) {
      const d = await res.json();
      setFlagged(d.flagged || []);
      setBlocklist(d.blocklist || []);
      setStats(d.stats || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (orderNo: string, decision: "cleared" | "blocked") => {
    setFlagged((prev) => prev.map((f) => (f.orderNo === orderNo ? { ...f, review: { decision, reviewedBy: "you", at: new Date().toISOString() } } : f)));
    await fetch("/api/admin/fraud", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ orderNo, decision }),
    });
  };

  const addBlock = async () => {
    if (!blockForm.value.trim()) return;
    await fetch("/api/admin/fraud", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "blocklist", ...blockForm }),
    });
    setShowBlockForm(false);
    setBlockForm({ type: "email", value: "", reason: "" });
    load();
  };

  const removeBlock = async (id: string) => {
    await fetch(`/api/admin/fraud?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <ShieldAlert className="w-5 h-5" /> Fraud & Risk Center
          </h2>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Heuristic order risk scoring, manual review queue and a blocklist.</p>
        </div>
        <button onClick={() => setShowBlockForm(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
          <Plus className="w-4 h-4" /> Add to blocklist
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Flagged (30d)", value: stats.flagged },
            { label: "Pending review", value: stats.pendingReview, color: "#f59e0b" },
            { label: "Blocked", value: stats.blockedCount, color: "#ef4444" },
            { label: "Blocklist size", value: stats.blocklistSize },
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
        <div className="space-y-3">
          {flagged.map((f) => (
            <div key={f.orderNo} className="rounded-xl p-4" style={card}>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs" style={{ color: "var(--text-tertiary)" }}>{f.orderNo}</span>
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>{f.name || f.email}</span>
                  </div>
                  <ul className="text-xs mt-1 space-y-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {f.reasons.map((r, i) => (
                      <li key={i} className="flex items-center gap-1"><AlertOctagon className="w-3 h-3" /> {r}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-extrabold" style={{ color: riskColor(f.riskScore) }}>{f.riskScore}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>risk score</div>
                  </div>
                  {f.review ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: f.review.decision === "cleared" ? "#22c55e22" : "#ef444422", color: f.review.decision === "cleared" ? "#22c55e" : "#ef4444" }}>
                      {f.review.decision}
                    </span>
                  ) : (
                    <div className="flex gap-1.5">
                      <button onClick={() => decide(f.orderNo, "cleared")} className="p-1.5 rounded-lg text-emerald-400 hover:bg-white/10" title="Clear"><CheckCircle2 className="w-4 h-4" /></button>
                      <button onClick={() => decide(f.orderNo, "blocked")} className="p-1.5 rounded-lg text-red-400 hover:bg-white/10" title="Block"><Ban className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {flagged.length === 0 && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No flagged orders in the last 30 days.</p>}
        </div>
      )}

      {blocklist.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Blocklist</h3>
          <div className="space-y-1.5">
            {blocklist.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg-glass)" }}>
                <span style={{ color: "var(--text-primary)" }}>{b.type}: {b.value} <span style={{ color: "var(--text-tertiary)" }}>— {b.reason}</span></span>
                <button onClick={() => removeBlock(b.id)} className="p-1 rounded hover:bg-white/10 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showBlockForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>Add to blocklist</h3>
              <button onClick={() => setShowBlockForm(false)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button>
            </div>
            <div className="space-y-3">
              <select className={field} style={inputStyle} value={blockForm.type} onChange={(e) => setBlockForm({ ...blockForm, type: e.target.value })}>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="pincode">Pincode</option>
              </select>
              <input className={field} style={inputStyle} placeholder="Value" value={blockForm.value} onChange={(e) => setBlockForm({ ...blockForm, value: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Reason" value={blockForm.reason} onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })} />
              <button onClick={addBlock} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
