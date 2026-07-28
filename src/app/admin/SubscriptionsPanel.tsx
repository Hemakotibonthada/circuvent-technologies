"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2, Plus, Trash2, TrendingUp, Users, X, XCircle } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  active: boolean;
}
interface Subscriber {
  id: string;
  email: string;
  planId: string;
  status: "trialing" | "active" | "paused" | "cancelled";
  billingCycle: "monthly" | "yearly";
  renewsAt: string;
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

export default function SubscriptionsPanel() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<{ plans: number; activeSubscribers: number; mrr: number; churned: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<Plan> | null>(null);
  const [subForm, setSubForm] = useState<{ email: string; planId: string; billingCycle: "monthly" | "yearly" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/subscriptions", { headers: { "x-admin-token": tok() } });
    if (res.ok) {
      const d = await res.json();
      setPlans(d.plans || []);
      setSubscribers(d.subscribers || []);
      setStats(d.stats || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const savePlan = async () => {
    if (!form?.name || form.priceMonthly === undefined) return;
    await fetch("/api/admin/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify(form),
    });
    setForm(null);
    load();
  };

  const removePlan = async (id: string) => {
    if (!confirm("Delete this plan?")) return;
    await fetch(`/api/admin/subscriptions?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  const addSubscriber = async () => {
    if (!subForm?.email || !subForm.planId) return;
    await fetch("/api/admin/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "subscriber", ...subForm, status: "active" }),
    });
    setSubForm(null);
    load();
  };

  const cancel = async (id: string) => {
    await fetch("/api/admin/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id }),
    });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <CreditCard className="w-5 h-5" /> Subscriptions & Membership
          </h2>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Recurring "Circuvent+" plans, subscriber lifecycle and MRR.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setForm({ features: [], active: true })} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
            <Plus className="w-4 h-4" /> New plan
          </button>
          <button onClick={() => setSubForm({ email: "", planId: plans[0]?.id || "", billingCycle: "monthly" })} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}>
            <Users className="w-4 h-4" /> Add subscriber
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Plans", value: stats.plans },
            { label: "Active subscribers", value: stats.activeSubscribers, color: "#22c55e" },
            { label: "MRR", value: `₹${stats.mrr.toLocaleString("en-IN")}`, icon: TrendingUp },
            { label: "Churned", value: stats.churned, color: "#ef4444" },
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {plans.map((p) => (
              <div key={p.id} className="rounded-xl p-4" style={card}>
                <div className="flex items-center justify-between">
                  <div className="font-bold" style={{ color: "var(--text-primary)" }}>{p.name}</div>
                  <button onClick={() => removePlan(p.id)} className="p-1 rounded hover:bg-white/10 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="text-2xl font-extrabold mt-1" style={{ color: "var(--accent-cyan)" }}>₹{p.priceMonthly}<span className="text-xs font-normal" style={{ color: "var(--text-tertiary)" }}>/mo</span></div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>₹{p.priceYearly}/yr</div>
                <ul className="mt-2 text-xs space-y-0.5" style={{ color: "var(--text-secondary)" }}>
                  {p.features.map((f, i) => <li key={i}>• {f}</li>)}
                </ul>
              </div>
            ))}
            {plans.length === 0 && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No plans yet.</p>}
          </div>

          <div className="rounded-xl overflow-hidden" style={card}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ borderBottom: "1px solid var(--border-primary)" }}>
                  {["Subscriber", "Plan", "Cycle", "Status", "Renews", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-medium" style={{ color: "var(--text-tertiary)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subscribers.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--border-primary)" }}>
                    <td className="px-4 py-2.5" style={{ color: "var(--text-primary)" }}>{s.email}</td>
                    <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>{plans.find((p) => p.id === s.planId)?.name || "—"}</td>
                    <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>{s.billingCycle}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: s.status === "active" ? "#22c55e22" : s.status === "cancelled" ? "#ef444422" : "#f59e0b22", color: s.status === "active" ? "#22c55e" : s.status === "cancelled" ? "#ef4444" : "#f59e0b" }}>{s.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-tertiary)" }}>{new Date(s.renewsAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5">
                      {s.status !== "cancelled" && <button onClick={() => cancel(s.id)} className="text-xs text-red-400 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Cancel</button>}
                    </td>
                  </tr>
                ))}
                {subscribers.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>No subscribers yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>New plan</h3>
              <button onClick={() => setForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button>
            </div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Plan name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" className={field} style={inputStyle} placeholder="₹/month" value={form.priceMonthly ?? ""} onChange={(e) => setForm({ ...form, priceMonthly: Number(e.target.value) })} />
                <input type="number" className={field} style={inputStyle} placeholder="₹/year" value={form.priceYearly ?? ""} onChange={(e) => setForm({ ...form, priceYearly: Number(e.target.value) })} />
              </div>
              <textarea className={field} style={inputStyle} rows={3} placeholder="Features (one per line)" onChange={(e) => setForm({ ...form, features: e.target.value.split("\n").filter(Boolean) })} />
              <button onClick={savePlan} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Save plan</button>
            </div>
          </div>
        </div>
      )}

      {subForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>Add subscriber</h3>
              <button onClick={() => setSubForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button>
            </div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Email" value={subForm.email} onChange={(e) => setSubForm({ ...subForm, email: e.target.value })} />
              <select className={field} style={inputStyle} value={subForm.planId} onChange={(e) => setSubForm({ ...subForm, planId: e.target.value })}>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className={field} style={inputStyle} value={subForm.billingCycle} onChange={(e) => setSubForm({ ...subForm, billingCycle: e.target.value as "monthly" | "yearly" })}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
              <button onClick={addSubscriber} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
