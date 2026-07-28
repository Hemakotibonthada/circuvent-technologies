"use client";

import { useCallback, useEffect, useState } from "react";
import { Key, Link2, Loader2, Plus, Radio, Send, ShieldCheck, Trash2, X } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface ApiKeyRecord {
  id: string;
  label: string;
  keyPrefix: string;
  scopes: string[];
  active: boolean;
  createdAt: string;
  lastUsedAt?: string;
}
interface WebhookSub {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}
interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  status: "success" | "failed";
  responseCode?: number;
  durationMs: number;
  at: string;
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

export default function IntegrationsPanel() {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookSub[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [stats, setStats] = useState<{ apiKeys: number; activeKeys: number; webhooks: number; deliveries24h: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [mintedKey, setMintedKey] = useState<string | null>(null);
  const [whForm, setWhForm] = useState<{ url: string; events: string[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/integrations", { headers: { "x-admin-token": tok() } });
    if (res.ok) {
      const d = await res.json();
      setApiKeys(d.apiKeys || []);
      setWebhooks(d.webhooks || []);
      setDeliveries(d.deliveries || []);
      setEvents(d.availableEvents || []);
      setStats(d.stats || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createKey = async () => {
    if (!newKeyLabel.trim()) return;
    const res = await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ label: newKeyLabel, scopes: ["read"] }),
    });
    const d = await res.json();
    if (d.success) {
      setMintedKey(d.plaintext);
      setNewKeyLabel("");
      load();
    }
  };

  const revokeKey = async (id: string) => {
    await fetch("/api/admin/integrations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const createWebhook = async () => {
    if (!whForm?.url || !whForm.events.length) return;
    await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "webhook", url: whForm.url, events: whForm.events }),
    });
    setWhForm(null);
    load();
  };

  const toggleWebhook = async (w: WebhookSub) => {
    await fetch("/api/admin/integrations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "webhook", id: w.id, active: !w.active }),
    });
    load();
  };

  const removeWebhook = async (id: string) => {
    await fetch(`/api/admin/integrations?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  const sendTest = async (event: string) => {
    await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "test-event", event }),
    });
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <Link2 className="w-5 h-5" /> Integrations Hub
        </h2>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>API keys for external systems, and signed outbound webhooks with delivery logs.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "API keys", value: stats.apiKeys },
            { label: "Active keys", value: stats.activeKeys, color: "#22c55e" },
            { label: "Webhooks", value: stats.webhooks },
            { label: "Deliveries (24h)", value: stats.deliveries24h },
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
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}><Key className="w-4 h-4" /> API keys</h3>
            <div className="flex gap-2 mb-3">
              <input className={field} style={inputStyle} placeholder="Label (e.g. ERP integration)" value={newKeyLabel} onChange={(e) => setNewKeyLabel(e.target.value)} />
              <button onClick={createKey} className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
                <Plus className="w-4 h-4" /> Create
              </button>
            </div>
            {mintedKey && (
              <div className="rounded-xl p-3 mb-3 text-xs font-mono break-all" style={{ background: "#22c55e11", border: "1px solid #22c55e44", color: "#22c55e" }}>
                Copy this key now — it won&apos;t be shown again: {mintedKey}
              </div>
            )}
            <div className="space-y-2">
              {apiKeys.map((k) => (
                <div key={k.id} className="rounded-xl p-3 flex items-center justify-between" style={card}>
                  <div>
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{k.label}</div>
                    <div className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>{k.keyPrefix}••••••••</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: k.active ? "#22c55e22" : "#94a3b822", color: k.active ? "#22c55e" : "#94a3b8" }}>{k.active ? "active" : "revoked"}</span>
                    {k.active && <button onClick={() => revokeKey(k.id)} className="p-1 rounded hover:bg-white/10 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
              ))}
              {apiKeys.length === 0 && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No API keys yet.</p>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}><Radio className="w-4 h-4" /> Webhooks</h3>
              <button onClick={() => setWhForm({ url: "", events: [] })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
                <Plus className="w-3.5 h-3.5" /> New webhook
              </button>
            </div>
            <div className="space-y-2">
              {webhooks.map((w) => (
                <div key={w.id} className="rounded-xl p-3" style={card}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-mono truncate" style={{ color: "var(--text-primary)" }}>{w.url}</div>
                      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{w.events.join(", ")}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => toggleWebhook(w)} className="text-xs px-2 py-0.5 rounded-full" style={{ background: w.active ? "#22c55e22" : "#94a3b822", color: w.active ? "#22c55e" : "#94a3b8" }}>{w.active ? "active" : "paused"}</button>
                      <button onClick={() => removeWebhook(w.id)} className="p-1 rounded hover:bg-white/10 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              ))}
              {webhooks.length === 0 && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No webhooks yet.</p>}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Send a test event</h3>
            <div className="flex flex-wrap gap-2">
              {events.map((e) => (
                <button key={e} onClick={() => sendTest(e)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}>
                  <Send className="w-3 h-3" /> {e}
                </button>
              ))}
            </div>
          </div>

          {deliveries.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}><ShieldCheck className="w-4 h-4" /> Recent deliveries</h3>
              <div className="space-y-1.5">
                {deliveries.slice(0, 10).map((d) => (
                  <div key={d.id} className="text-xs flex justify-between rounded-lg px-3 py-1.5" style={{ background: "var(--bg-glass)" }}>
                    <span style={{ color: d.status === "success" ? "#22c55e" : "#ef4444" }}>{d.event} — {d.status} {d.responseCode ? `(${d.responseCode})` : ""}</span>
                    <span style={{ color: "var(--text-tertiary)" }}>{d.durationMs}ms · {new Date(d.at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {whForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>New webhook</h3>
              <button onClick={() => setWhForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button>
            </div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="https://example.com/hooks/circuvent" value={whForm.url} onChange={(e) => setWhForm({ ...whForm, url: e.target.value })} />
              <div className="space-y-1.5">
                {events.map((e) => (
                  <label key={e} className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    <input
                      type="checkbox"
                      checked={whForm.events.includes(e)}
                      onChange={(ev) => setWhForm({ ...whForm, events: ev.target.checked ? [...whForm.events, e] : whForm.events.filter((x) => x !== e) })}
                    />
                    {e}
                  </label>
                ))}
              </div>
              <button onClick={createWebhook} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Create webhook</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
