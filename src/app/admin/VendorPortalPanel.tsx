"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, Building2, CheckCircle2, Loader2, Plus, ShieldQuestion, Trash2, X, XCircle } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface VendorAccount {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  categories: string[];
  status: "invited" | "active" | "suspended";
  portalCode: string;
  createdAt: string;
}
interface Scorecard {
  vendorId: string;
  deliveries: number;
  onTimePct: number | null;
  qualityIssues: number;
  score: number | null;
}
interface QuoteRequest {
  id: string;
  vendorId: string;
  title: string;
  itemsDescription: string;
  quotedAmount?: number;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

function scoreColor(score: number | null): string {
  // No deliveries logged yet is not the same as a perfect record — keep it a
  // neutral colour rather than the green used for genuinely good scores.
  if (score === null) return "var(--text-tertiary)";
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

export default function VendorPortalPanel() {
  const [vendors, setVendors] = useState<VendorAccount[]>([]);
  const [scorecards, setScorecards] = useState<Record<string, Scorecard>>({});
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [stats, setStats] = useState<{ total: number; active: number; pendingQuotes: number; avgScore: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Partial<VendorAccount> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/vendor-portal", { headers: { "x-admin-token": tok() } });
      if (res.ok) {
        const d = await res.json();
        setVendors(d.vendors || []);
        setScorecards(d.scorecards || {});
        setQuotes(d.quotes || []);
        setStats(d.stats || null);
      } else {
        setError("Could not load vendors. This is a loading failure, not an empty list.");
      }
    } catch {
      setError("Could not load vendors. This is a loading failure, not an empty list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form?.companyName || !form.contactName || !form.email) return;
    await fetch("/api/admin/vendor-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify(form),
    });
    setForm(null);
    load();
  };

  const remove = async (v: VendorAccount) => {
    if (!confirm(`Remove vendor "${v.companyName}"?`)) return;
    await fetch(`/api/admin/vendor-portal?id=${encodeURIComponent(v.id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  const logEvent = async (vendorId: string, type: "on_time" | "late" | "quality_issue") => {
    await fetch("/api/admin/vendor-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "event", vendorId, type, detail: type.replace("_", " ") }),
    });
    load();
  };

  const decide = async (id: string, approved: boolean) => {
    await fetch("/api/admin/vendor-portal", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ action: "decide-quote", id, approved }),
    });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Building2 className="w-5 h-5" /> Vendor Portal
          </h2>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            Self-service vendor accounts, delivery scorecards and quote approvals.
          </p>
        </div>
        <button onClick={() => setForm({ status: "invited", categories: [] })} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
          <Plus className="w-4 h-4" /> Invite vendor
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Vendors", value: stats.total },
            { label: "Active", value: stats.active, color: "#22c55e" },
            { label: "Pending quotes", value: stats.pendingQuotes, color: "#f59e0b" },
            { label: "Avg. score", value: stats.avgScore === null ? "—" : stats.avgScore, color: scoreColor(stats.avgScore) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3" style={card}>
              <div className="text-2xl font-extrabold" style={{ color: s.color || "var(--text-primary)" }}>{s.value}</div>
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{s.label}</div>
            </div>
          ))}
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
        <div className="space-y-3">
          {vendors.map((v) => {
            const sc = scorecards[v.id];
            return (
              <div key={v.id} className="rounded-xl p-4" style={card}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-medium" style={{ color: "var(--text-primary)" }}>{v.companyName}</div>
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{v.contactName} · {v.email} · portal code {v.portalCode}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {sc && (
                      <div className="text-right">
                        <div className="font-extrabold" style={{ color: scoreColor(sc.score) }}>{sc.score === null ? "No data yet" : sc.score}</div>
                        <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{sc.onTimePct === null ? `${sc.qualityIssues} issues` : `${sc.onTimePct}% on-time · ${sc.qualityIssues} issues`}</div>
                      </div>
                    )}
                    <button onClick={() => remove(v)} aria-label={`Remove ${v.companyName}`} className="p-1.5 rounded-lg hover:bg-white/10 text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => logEvent(v.id, "on_time")} className="px-2.5 py-1 rounded-lg text-xs bg-emerald-500/10 text-emerald-400">+ On-time delivery</button>
                  <button onClick={() => logEvent(v.id, "late")} className="px-2.5 py-1 rounded-lg text-xs bg-amber-500/10 text-amber-400">+ Late delivery</button>
                  <button onClick={() => logEvent(v.id, "quality_issue")} className="px-2.5 py-1 rounded-lg text-xs bg-red-500/10 text-red-400">+ Quality issue</button>
                </div>
              </div>
            );
          })}
          {vendors.length === 0 && !error && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No vendors yet.</p>}
        </div>
      )}

      {quotes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
            <ShieldQuestion className="w-4 h-4" /> Quote requests
          </h3>
          <div className="space-y-2">
            {quotes.map((q) => (
              <div key={q.id} className="rounded-xl p-3 flex items-center justify-between gap-3" style={card}>
                <div>
                  <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{q.title}</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{q.itemsDescription} {q.quotedAmount ? `· ₹${q.quotedAmount}` : ""}</div>
                </div>
                {q.status === "pending" ? (
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => decide(q.id, true)} aria-label={`Approve quote: ${q.title}`} className="p-1.5 rounded-lg text-emerald-400 hover:bg-white/10"><CheckCircle2 className="w-4 h-4" /></button>
                    <button onClick={() => decide(q.id, false)} aria-label={`Reject quote: ${q.title}`} className="p-1.5 rounded-lg text-red-400 hover:bg-white/10"><XCircle className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: q.status === "approved" ? "#22c55e22" : "#ef444422", color: q.status === "approved" ? "#22c55e" : "#ef4444" }}>
                    {q.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><Award className="w-4 h-4" /> Invite vendor</h3>
              <button onClick={() => setForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button>
            </div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Company name" value={form.companyName || ""} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Contact name" value={form.contactName || ""} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Phone" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Categories (comma separated)" value={(form.categories || []).join(", ")} onChange={(e) => setForm({ ...form, categories: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              <button onClick={save} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Save vendor</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
