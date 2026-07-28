"use client";

import { useCallback, useEffect, useState } from "react";
import { Beaker, FlaskConical, Loader2, Plus, ToggleLeft, ToggleRight, Trash2, X } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface FeatureFlag {
  id: string;
  key: string;
  label: string;
  description?: string;
  enabled: boolean;
  rolloutPct: number;
  updatedAt: string;
}
interface ExperimentVariant {
  name: string;
  weight: number;
  participants: number;
  conversions: number;
}
interface Experiment {
  id: string;
  name: string;
  metricName: string;
  status: "draft" | "running" | "completed";
  variants: ExperimentVariant[];
  createdAt: string;
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

export default function FeatureFlagsPanel() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [flagForm, setFlagForm] = useState<Partial<FeatureFlag> | null>(null);
  const [expForm, setExpForm] = useState<{ name: string; metricName: string; variants: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/flags", { headers: { "x-admin-token": tok() } });
    if (res.ok) {
      const d = await res.json();
      setFlags(d.flags || []);
      setExperiments(d.experiments || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveFlag = async () => {
    if (!flagForm?.key || !flagForm.label) return;
    await fetch("/api/admin/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify(flagForm),
    });
    setFlagForm(null);
    load();
  };

  const toggleFlag = async (f: FeatureFlag) => {
    setFlags((prev) => prev.map((x) => (x.id === f.id ? { ...x, enabled: !x.enabled } : x)));
    await fetch("/api/admin/flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id: f.id, key: f.key, label: f.label, enabled: !f.enabled, rolloutPct: f.rolloutPct }),
    });
  };

  const setRollout = async (f: FeatureFlag, pct: number) => {
    setFlags((prev) => prev.map((x) => (x.id === f.id ? { ...x, rolloutPct: pct } : x)));
    await fetch("/api/admin/flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id: f.id, key: f.key, label: f.label, enabled: f.enabled, rolloutPct: pct }),
    });
  };

  const removeFlag = async (id: string) => {
    await fetch(`/api/admin/flags?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  const saveExperiment = async () => {
    if (!expForm?.name) return;
    const variantNames = expForm.variants.split(",").map((v) => v.trim()).filter(Boolean);
    if (variantNames.length < 2) return;
    await fetch("/api/admin/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "experiment", name: expForm.name, metricName: expForm.metricName || "conversion", variantNames }),
    });
    setExpForm(null);
    load();
  };

  const setExpStatus = async (id: string, status: Experiment["status"]) => {
    await fetch("/api/admin/flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "experiment", id, status }),
    });
    load();
  };

  const removeExperiment = async (id: string) => {
    await fetch(`/api/admin/flags?kind=experiment&id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <FlaskConical className="w-5 h-5" /> Feature Flags & Experiments
        </h2>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Progressive rollouts and A/B experiment tracking.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>Flags</h3>
              <button onClick={() => setFlagForm({ enabled: false, rolloutPct: 100 })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
                <Plus className="w-3.5 h-3.5" /> New flag
              </button>
            </div>
            <div className="space-y-2">
              {flags.map((f) => (
                <div key={f.id} className="rounded-xl p-3 flex items-center justify-between gap-4" style={card}>
                  <div>
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{f.label} <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>{f.key}</span></div>
                    {f.description && <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{f.description}</div>}
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={100} value={f.rolloutPct} onChange={(e) => setRollout(f, Number(e.target.value))} className="w-24" />
                    <span className="text-xs w-9" style={{ color: "var(--text-tertiary)" }}>{f.rolloutPct}%</span>
                    <button onClick={() => toggleFlag(f)}>
                      {f.enabled ? <ToggleRight className="w-7 h-7 text-emerald-400" /> : <ToggleLeft className="w-7 h-7 text-slate-500" />}
                    </button>
                    <button onClick={() => removeFlag(f.id)} className="p-1 rounded hover:bg-white/10 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
              {flags.length === 0 && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No flags yet.</p>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>Experiments</h3>
              <button onClick={() => setExpForm({ name: "", metricName: "conversion", variants: "control, variant-a" })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
                <Plus className="w-3.5 h-3.5" /> New experiment
              </button>
            </div>
            <div className="space-y-3">
              {experiments.map((e) => (
                <div key={e.id} className="rounded-xl p-4" style={card}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                      <Beaker className="w-4 h-4" /> {e.name}
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={e.status} onChange={(ev) => setExpStatus(e.id, ev.target.value as Experiment["status"])} className="text-xs rounded-lg px-2 py-1" style={inputStyle}>
                        <option value="draft">Draft</option>
                        <option value="running">Running</option>
                        <option value="completed">Completed</option>
                      </select>
                      <button onClick={() => removeExperiment(e.id)} className="p-1 rounded hover:bg-white/10 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {e.variants.map((v) => {
                      const rate = v.participants ? ((v.conversions / v.participants) * 100).toFixed(1) : "0.0";
                      return (
                        <div key={v.name} className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bg-glass)" }}>
                          <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{v.name}</div>
                          <div style={{ color: "var(--text-tertiary)" }}>{v.participants} participants · {v.conversions} conversions · {rate}% on {e.metricName}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {experiments.length === 0 && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No experiments yet.</p>}
            </div>
          </div>
        </>
      )}

      {flagForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>New flag</h3>
              <button onClick={() => setFlagForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button>
            </div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Key (e.g. new-checkout)" value={flagForm.key || ""} onChange={(e) => setFlagForm({ ...flagForm, key: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Label" value={flagForm.label || ""} onChange={(e) => setFlagForm({ ...flagForm, label: e.target.value })} />
              <textarea className={field} style={inputStyle} rows={2} placeholder="Description" value={flagForm.description || ""} onChange={(e) => setFlagForm({ ...flagForm, description: e.target.value })} />
              <button onClick={saveFlag} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Save flag</button>
            </div>
          </div>
        </div>
      )}

      {expForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>New experiment</h3>
              <button onClick={() => setExpForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button>
            </div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Experiment name" value={expForm.name} onChange={(e) => setExpForm({ ...expForm, name: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Metric name" value={expForm.metricName} onChange={(e) => setExpForm({ ...expForm, metricName: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Variants (comma separated)" value={expForm.variants} onChange={(e) => setExpForm({ ...expForm, variants: e.target.value })} />
              <button onClick={saveExperiment} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Create experiment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
