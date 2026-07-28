"use client";

import { useCallback, useEffect, useState } from "react";
import { Code2, Copy, KeyRound, Loader2, Plus, Radio, Send, Trash2, X } from "lucide-react";
import { getToken } from "@/lib/control-plane";
import { Card } from "../ui";

interface DevToken {
  id: string;
  label: string;
  tokenPrefix: string;
  active: boolean;
  createdAt: string;
}
interface DevWebhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
}
interface DevDelivery {
  id: string;
  webhookId: string;
  event: string;
  status: "success" | "failed";
  responseCode?: number;
  durationMs: number;
  at: string;
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function DeveloperPortalPage() {
  const [tokens, setTokens] = useState<DevToken[]>([]);
  const [webhooks, setWebhooks] = useState<DevWebhook[]>([]);
  const [deliveries, setDeliveries] = useState<DevDelivery[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [mintedToken, setMintedToken] = useState<string | null>(null);
  const [whForm, setWhForm] = useState<{ url: string; events: string[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/smarthome/dev-portal", { headers: authHeaders() });
    if (res.ok) {
      const d = await res.json();
      setTokens(d.tokens || []);
      setWebhooks(d.webhooks || []);
      setDeliveries(d.deliveries || []);
      setEvents(d.availableEvents || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createToken = async () => {
    if (!newTokenLabel.trim()) return;
    const res = await fetch("/api/smarthome/dev-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ label: newTokenLabel }),
    });
    const d = await res.json();
    if (d.success) {
      setMintedToken(d.plaintext);
      setNewTokenLabel("");
      load();
    }
  };

  const revoke = async (id: string) => {
    await fetch("/api/smarthome/dev-portal", { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ id }) });
    load();
  };

  const createWebhook = async () => {
    if (!whForm?.url || !whForm.events.length) return;
    await fetch("/api/smarthome/dev-portal", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ kind: "webhook", url: whForm.url, events: whForm.events }) });
    setWhForm(null);
    load();
  };

  const toggleWebhook = async (w: DevWebhook) => {
    await fetch("/api/smarthome/dev-portal", { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ kind: "webhook", id: w.id, active: !w.active }) });
    load();
  };

  const removeWebhook = async (id: string) => {
    await fetch(`/api/smarthome/dev-portal?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
    load();
  };

  const sendTest = async (webhookId: string, event: string) => {
    await fetch("/api/smarthome/dev-portal", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ kind: "test-event", webhookId, event }) });
    load();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Code2 className="h-6 w-6" /> Developer Portal</h1>
        <p className="text-sm text-slate-400 mt-1">Personal API tokens and outbound webhooks for your own integrations and automations.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-24 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-bold text-white mb-3 flex items-center gap-2"><KeyRound className="h-4 w-4" /> API tokens</h2>
            <div className="flex gap-2 mb-3">
              <input value={newTokenLabel} onChange={(e) => setNewTokenLabel(e.target.value)} placeholder="Label (e.g. Home Assistant)" className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none" />
              <button onClick={createToken} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 font-semibold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
                <Plus className="h-4 w-4" /> Create
              </button>
            </div>
            {mintedToken && (
              <div className="rounded-xl p-3 mb-3 text-xs font-mono break-all bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center gap-2">
                <Copy className="h-3.5 w-3.5 shrink-0" /> Copy now — shown once: {mintedToken}
              </div>
            )}
            <div className="space-y-2">
              {tokens.map((t) => (
                <div key={t.id} className="rounded-xl bg-black/20 px-3.5 py-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white">{t.label}</div>
                    <div className="text-xs text-slate-500 font-mono">{t.tokenPrefix}••••••••</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${t.active ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"}`}>{t.active ? "active" : "revoked"}</span>
                    {t.active && <button onClick={() => revoke(t.id)} className="text-red-400 hover:bg-white/10 rounded-lg p-1"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                </div>
              ))}
              {tokens.length === 0 && <p className="text-sm text-slate-500">No tokens yet.</p>}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-white flex items-center gap-2"><Radio className="h-4 w-4" /> Webhooks</h2>
              <button onClick={() => setWhForm({ url: "", events: [] })} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
                <Plus className="h-3.5 w-3.5" /> New webhook
              </button>
            </div>
            <div className="space-y-2">
              {webhooks.map((w) => (
                <div key={w.id} className="rounded-xl bg-black/20 px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-mono text-white truncate">{w.url}</div>
                      <div className="text-xs text-slate-500">{w.events.join(", ")}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => toggleWebhook(w)} className={`text-xs px-2 py-0.5 rounded-full ${w.active ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"}`}>{w.active ? "active" : "paused"}</button>
                      <button onClick={() => removeWebhook(w.id)} className="text-red-400 hover:bg-white/10 rounded-lg p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {events.map((e) => (
                      <button key={e} onClick={() => sendTest(w.id, e)} className="flex items-center gap-1 text-[11px] rounded-lg border border-white/10 px-2 py-1 text-slate-300 hover:bg-white/5">
                        <Send className="h-3 w-3" /> test {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {webhooks.length === 0 && <p className="text-sm text-slate-500">No webhooks yet.</p>}
            </div>
          </Card>

          {deliveries.length > 0 && (
            <Card className="p-5">
              <h2 className="font-bold text-white mb-3">Recent deliveries</h2>
              <div className="space-y-1.5">
                {deliveries.map((d) => (
                  <div key={d.id} className="flex justify-between text-xs rounded-lg bg-black/20 px-3 py-1.5">
                    <span className={d.status === "success" ? "text-emerald-400" : "text-red-400"}>{d.event} — {d.status} {d.responseCode ? `(${d.responseCode})` : ""}</span>
                    <span className="text-slate-500">{d.durationMs}ms · {new Date(d.at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {whForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1629] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">New webhook</h2>
              <button onClick={() => setWhForm(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <input value={whForm.url} onChange={(e) => setWhForm({ ...whForm, url: e.target.value })} placeholder="https://example.com/hooks/circuvent" className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3" />
            <div className="space-y-1.5 mb-4">
              {events.map((e) => (
                <label key={e} className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={whForm.events.includes(e)} onChange={(ev) => setWhForm({ ...whForm, events: ev.target.checked ? [...whForm.events, e] : whForm.events.filter((x) => x !== e) })} />
                  {e}
                </label>
              ))}
            </div>
            <button onClick={createWebhook} className="w-full rounded-xl py-2.5 font-semibold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>Create webhook</button>
          </div>
        </div>
      )}
    </div>
  );
}
