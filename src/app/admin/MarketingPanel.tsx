"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, Plus, Send, Target, Trash2, TrendingDown, Users, X } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface SegmentRules {
  minSpend?: number;
  maxSpend?: number;
  minOrders?: number;
  maxOrders?: number;
  inactiveDays?: number;
  includeBlocked?: boolean;
}
interface Segment {
  id: string;
  name: string;
  description?: string;
  rules: SegmentRules;
  createdAt: string;
}
interface Campaign {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  segmentId?: string;
  status: "draft" | "sending" | "sent";
  createdAt: string;
  sentAt?: string;
  stats: { recipients: number; delivered: number; failed: number };
}
interface AbandonedCheckout {
  orderNo: string;
  email: string;
  name: string;
  total: number;
  itemsCount: number;
  placedAt: string;
  hoursAgo: number;
}
interface MarketingStats {
  segments: number;
  campaigns: number;
  sent: number;
  abandoned: number;
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

type Tab = "campaigns" | "segments" | "recovery";

export default function MarketingPanel() {
  const [tab, setTab] = useState<Tab>("campaigns");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [abandoned, setAbandoned] = useState<AbandonedCheckout[]>([]);
  const [stats, setStats] = useState<MarketingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [segmentForm, setSegmentForm] = useState<Partial<Segment> | null>(null);
  const [campaignForm, setCampaignForm] = useState<Partial<Campaign> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/marketing", { headers: { "x-admin-token": tok() } });
      if (res.ok) {
        const d = await res.json();
        setSegments(d.segments || []);
        setCampaigns(d.campaigns || []);
        setAbandoned(d.abandoned || []);
        setStats(d.stats || null);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSegment = async () => {
    if (!segmentForm?.name) return;
    await fetch("/api/admin/marketing", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "segment", ...segmentForm }),
    });
    setSegmentForm(null);
    load();
  };

  const saveCampaign = async () => {
    if (!campaignForm?.name || !campaignForm.subject) return;
    await fetch("/api/admin/marketing", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "campaign", ...campaignForm }),
    });
    setCampaignForm(null);
    load();
  };

  const sendCampaign = async (id: string) => {
    if (!confirm("Send this campaign to everyone in its segment now?")) return;
    setBusyId(id);
    await fetch("/api/admin/marketing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ action: "send-campaign", id }),
    });
    setBusyId(null);
    load();
  };

  const sendRecovery = async (orderNo: string) => {
    setBusyId(orderNo);
    await fetch("/api/admin/marketing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ action: "send-recovery", orderNo }),
    });
    setBusyId(null);
    alert("Recovery email sent.");
  };

  const removeItem = async (kind: "segment" | "campaign", id: string) => {
    if (!confirm("Delete this item?")) return;
    await fetch(`/api/admin/marketing?kind=${kind}&id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <Target className="w-5 h-5" /> Marketing Center
        </h2>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          Segment customers, run email campaigns, and win back abandoned checkouts.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Segments", value: stats.segments, icon: Users },
            { label: "Campaigns", value: stats.campaigns, icon: Mail },
            { label: "Sent", value: stats.sent, icon: Send },
            { label: "Abandoned checkouts", value: stats.abandoned, icon: TrendingDown, color: "#f59e0b" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3 flex items-center gap-3" style={card}>
              <s.icon className="w-5 h-5" style={{ color: s.color || "var(--accent-cyan)" }} />
              <div>
                <div className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>
                  {s.value}
                </div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {s.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-b" style={{ borderColor: "var(--border-primary)" }}>
        {(["campaigns", "segments", "recovery"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 text-sm font-medium capitalize"
            style={{
              color: tab === t ? "var(--accent-cyan)" : "var(--text-tertiary)",
              borderBottom: tab === t ? "2px solid var(--accent-cyan)" : "2px solid transparent",
            }}
          >
            {t === "recovery" ? "Checkout recovery" : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} />
        </div>
      ) : tab === "campaigns" ? (
        <div className="space-y-3">
          <button
            onClick={() => setCampaignForm({ name: "", subject: "", bodyHtml: "" })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
          >
            <Plus className="w-4 h-4" /> New campaign
          </button>
          {campaigns.map((c) => (
            <div key={c.id} className="rounded-xl p-4 flex items-center justify-between gap-4" style={card}>
              <div className="min-w-0">
                <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {c.name}
                </div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {c.subject} · {segments.find((s) => s.id === c.segmentId)?.name || "All customers"}
                </div>
                {c.status === "sent" && (
                  <div className="text-xs mt-1 text-emerald-400">
                    Sent to {c.stats.recipients} · {c.stats.delivered} delivered · {c.stats.failed} failed
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    background: c.status === "sent" ? "#22c55e22" : c.status === "sending" ? "#f59e0b22" : "#94a3b822",
                    color: c.status === "sent" ? "#22c55e" : c.status === "sending" ? "#f59e0b" : "#94a3b8",
                  }}
                >
                  {c.status}
                </span>
                {c.status === "draft" && (
                  <button
                    onClick={() => sendCampaign(c.id)}
                    disabled={busyId === c.id}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-cyan-400"
                    title="Send now"
                  >
                    {busyId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                )}
                <button onClick={() => removeItem("campaign", c.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {campaigns.length === 0 && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No campaigns yet.</p>}
        </div>
      ) : tab === "segments" ? (
        <div className="space-y-3">
          <button
            onClick={() => setSegmentForm({ name: "", rules: {} })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
          >
            <Plus className="w-4 h-4" /> New segment
          </button>
          {segments.map((s) => (
            <div key={s.id} className="rounded-xl p-4 flex items-center justify-between gap-4" style={card}>
              <div>
                <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {s.name}
                </div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {Object.entries(s.rules)
                    .filter(([, v]) => v !== undefined)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ") || "Everyone"}
                </div>
              </div>
              <button onClick={() => removeItem("segment", s.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {segments.length === 0 && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No segments yet — campaigns without one target everyone.</p>}
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={card}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ borderBottom: "1px solid var(--border-primary)" }}>
                {["Order", "Customer", "Total", "Items", "Age", "Action"].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium" style={{ color: "var(--text-tertiary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {abandoned.map((a) => (
                <tr key={a.orderNo} style={{ borderBottom: "1px solid var(--border-primary)" }}>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--text-primary)" }}>
                    {a.orderNo}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>
                    {a.name} <span style={{ color: "var(--text-tertiary)" }}>({a.email})</span>
                  </td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-primary)" }}>
                    ₹{a.total.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>
                    {a.itemsCount}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-tertiary)" }}>
                    {a.hoursAgo}h ago
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => sendRecovery(a.orderNo)}
                      disabled={busyId === a.orderNo}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                      style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
                    >
                      {busyId === a.orderNo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Recover
                    </button>
                  </td>
                </tr>
              ))}
              {abandoned.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>
                    No abandoned checkouts right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {segmentForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>
                New segment
              </h3>
              <button onClick={() => setSegmentForm(null)}>
                <X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} />
              </button>
            </div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Segment name" value={segmentForm.name || ""} onChange={(e) => setSegmentForm({ ...segmentForm, name: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  className={field}
                  style={inputStyle}
                  placeholder="Min spend ₹"
                  onChange={(e) => setSegmentForm({ ...segmentForm, rules: { ...segmentForm.rules, minSpend: e.target.value ? Number(e.target.value) : undefined } })}
                />
                <input
                  type="number"
                  className={field}
                  style={inputStyle}
                  placeholder="Min orders"
                  onChange={(e) => setSegmentForm({ ...segmentForm, rules: { ...segmentForm.rules, minOrders: e.target.value ? Number(e.target.value) : undefined } })}
                />
                <input
                  type="number"
                  className={field}
                  style={inputStyle}
                  placeholder="Inactive days ≥"
                  onChange={(e) => setSegmentForm({ ...segmentForm, rules: { ...segmentForm.rules, inactiveDays: e.target.value ? Number(e.target.value) : undefined } })}
                />
                <input
                  type="number"
                  className={field}
                  style={inputStyle}
                  placeholder="Max orders"
                  onChange={(e) => setSegmentForm({ ...segmentForm, rules: { ...segmentForm.rules, maxOrders: e.target.value ? Number(e.target.value) : undefined } })}
                />
              </div>
              <button onClick={saveSegment} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
                Save segment
              </button>
            </div>
          </div>
        </div>
      )}

      {campaignForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>
                New campaign
              </h3>
              <button onClick={() => setCampaignForm(null)}>
                <X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} />
              </button>
            </div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Campaign name" value={campaignForm.name || ""} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Email subject" value={campaignForm.subject || ""} onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })} />
              <select className={field} style={inputStyle} value={campaignForm.segmentId || ""} onChange={(e) => setCampaignForm({ ...campaignForm, segmentId: e.target.value || undefined })}>
                <option value="">All customers</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <textarea
                className={field}
                style={inputStyle}
                rows={8}
                placeholder="HTML body"
                value={campaignForm.bodyHtml || ""}
                onChange={(e) => setCampaignForm({ ...campaignForm, bodyHtml: e.target.value })}
              />
              <button onClick={saveCampaign} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
                Save as draft
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
