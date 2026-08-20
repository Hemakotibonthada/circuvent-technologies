"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Globe2, Loader2, Plus, Search, Trash2, X } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface SeoOverride { id: string; path: string; title?: string; description?: string; noindex?: boolean }
interface RedirectRule { id: string; from: string; to: string; statusCode: 301 | 302; hits: number }

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

export default function SeoManagerPanel() {
  const [overrides, setOverrides] = useState<SeoOverride[]>([]);
  const [redirects, setRedirects] = useState<RedirectRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overrideForm, setOverrideForm] = useState<Partial<SeoOverride> | null>(null);
  const [redirectForm, setRedirectForm] = useState<{ from: string; to: string; statusCode: 301 | 302 } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/seo", { headers: { "x-admin-token": tok() } });
      if (res.ok) {
        const d = await res.json();
        setOverrides(d.overrides || []);
        setRedirects(d.redirects || []);
      } else {
        setError("Could not load SEO settings. This is a loading failure, not an empty list.");
      }
    } catch {
      setError("Could not load SEO settings. This is a loading failure, not an empty list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveOverride = async () => {
    if (!overrideForm?.path) return;
    await fetch("/api/admin/seo", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": tok() }, body: JSON.stringify(overrideForm) });
    setOverrideForm(null);
    load();
  };

  const saveRedirect = async () => {
    if (!redirectForm?.from || !redirectForm.to) return;
    await fetch("/api/admin/seo", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": tok() }, body: JSON.stringify({ kind: "redirect", ...redirectForm }) });
    setRedirectForm(null);
    load();
  };

  const removeOverride = async (id: string) => {
    const o = overrides.find((x) => x.id === id);
    if (!confirm(`Remove the SEO override for "${o?.path ?? "this page"}"? It will revert to the default title and description.`)) return;
    await fetch(`/api/admin/seo?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };
  const removeRedirect = async (id: string) => {
    const r = redirects.find((x) => x.id === id);
    if (!confirm(`Delete the redirect from "${r?.from ?? "this path"}"? Visitors will stop being redirected to ${r?.to ?? "its target"}.`)) return;
    await fetch(`/api/admin/seo?kind=redirect&id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><Globe2 className="w-5 h-5" /> SEO &amp; Redirects Manager</h2>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Per-page meta overrides and a 301/302 redirect table.</p>
      </div>

      {/*
        * Said out loud because the panel otherwise reads as a live control
        * surface: rules save, appear in the table, and show a hits counter.
        * Nothing consults them on a real request — the counter is pinned at
        * zero because the only thing that would increment it is never called.
        *
        * The reason is structural, not an oversight. These rules live in a
        * node:fs-backed store, and Next middleware runs on the Edge runtime,
        * which cannot reach it. Applying them needs either Node-runtime
        * middleware or a lookup at the 404 boundary, and that is a deployment
        * decision rather than a patch.
        */}
      <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
        <strong>Not yet applied to live traffic.</strong> Rules saved here are stored and listed, but nothing on the
        site consults them yet, so no redirect fires and the hit counts stay at zero. Treat this as a staging list
        rather than a live routing table.
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}><Search className="w-4 h-4" /> Meta overrides</h3>
              <button onClick={() => setOverrideForm({})} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}><Plus className="w-3.5 h-3.5" /> New override</button>
            </div>
            <div className="space-y-2">
              {overrides.map((o) => (
                <div key={o.id} className="rounded-xl p-3 flex items-center justify-between" style={card}>
                  <div>
                    <div className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{o.path}</div>
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{o.title || "no title override"} {o.noindex ? "· noindex" : ""}</div>
                  </div>
                  <button onClick={() => removeOverride(o.id)} aria-label={`Delete override for ${o.path}`} className="p-1.5 rounded-lg hover:bg-white/10 text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              {overrides.length === 0 && !error && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No overrides yet.</p>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}><ArrowRightLeft className="w-4 h-4" /> Redirects</h3>
              <button onClick={() => setRedirectForm({ from: "", to: "", statusCode: 301 })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}><Plus className="w-3.5 h-3.5" /> New redirect</button>
            </div>
            <div className="space-y-2">
              {redirects.map((r) => (
                <div key={r.id} className="rounded-xl p-3 flex items-center justify-between" style={card}>
                  <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{r.from} → {r.to} ({r.statusCode}) · {r.hits} hits</span>
                  <button onClick={() => removeRedirect(r.id)} aria-label={`Delete redirect ${r.from} to ${r.to}`} className="p-1.5 rounded-lg hover:bg-white/10 text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              {redirects.length === 0 && !error && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No redirects yet.</p>}
            </div>
          </div>
        </>
      )}

      {overrideForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-bold" style={{ color: "var(--text-primary)" }}>New override</h3><button onClick={() => setOverrideForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button></div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="/path" value={overrideForm.path || ""} onChange={(e) => setOverrideForm({ ...overrideForm, path: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Title override" value={overrideForm.title || ""} onChange={(e) => setOverrideForm({ ...overrideForm, title: e.target.value })} />
              <textarea className={field} style={inputStyle} rows={2} placeholder="Description override" value={overrideForm.description || ""} onChange={(e) => setOverrideForm({ ...overrideForm, description: e.target.value })} />
              <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}><input type="checkbox" checked={!!overrideForm.noindex} onChange={(e) => setOverrideForm({ ...overrideForm, noindex: e.target.checked })} /> noindex this page</label>
              <button onClick={saveOverride} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Save override</button>
            </div>
          </div>
        </div>
      )}

      {redirectForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-bold" style={{ color: "var(--text-primary)" }}>New redirect</h3><button onClick={() => setRedirectForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button></div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="From path" value={redirectForm.from} onChange={(e) => setRedirectForm({ ...redirectForm, from: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="To path/URL" value={redirectForm.to} onChange={(e) => setRedirectForm({ ...redirectForm, to: e.target.value })} />
              <select className={field} style={inputStyle} value={redirectForm.statusCode} onChange={(e) => setRedirectForm({ ...redirectForm, statusCode: Number(e.target.value) as 301 | 302 })}>
                <option value={301}>301 (permanent)</option>
                <option value={302}>302 (temporary)</option>
              </select>
              <button onClick={saveRedirect} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Save redirect</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
