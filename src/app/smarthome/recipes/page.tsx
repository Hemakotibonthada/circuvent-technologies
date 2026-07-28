"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import { controlPlane, type Device } from "@/lib/control-plane";
import { RECIPES, listUsedRecipeIds, markUsed, type RecipeTemplate } from "@/lib/smarthome-recipes";
import { Card } from "../ui";

export default function RecipesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [used, setUsed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<RecipeTemplate | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await controlPlane.devices();
    if (r.ok) setDevices(r.data.devices ?? []);
    setUsed(listUsedRecipeIds());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const apply = async () => {
    if (!active || !deviceId) return;
    setBusy(true);
    const device = devices.find((d) => d.id === deviceId);
    const trigger = active.trigger.type === "state" ? { type: "state" as const, deviceId, field: active.trigger.field, op: active.trigger.op, value: active.trigger.value } : { type: "time" as const, at: active.trigger.at };
    const action =
      active.action.type === "command"
        ? { type: "command" as const, deviceId, command: active.action.command }
        : { type: "notify" as const, title: active.action.title, body: active.action.body };
    await controlPlane.createAutomation({ name: `${active.title} — ${device?.name || deviceId}`, enabled: true, trigger, action });
    markUsed(active.id);
    setUsed(listUsedRecipeIds());
    setBusy(false);
    setActive(null);
    setDeviceId("");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Sparkles className="h-6 w-6" /> Automation recipes</h1>
        <p className="text-sm text-slate-400 mt-1">One-click starting points — each one creates a real automation you can fine-tune later.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RECIPES.map((r) => (
          <Card key={r.id} className="p-5 flex flex-col">
            <div className="text-3xl mb-2">{r.icon}</div>
            <div className="font-bold text-white">{r.title}</div>
            <p className="text-xs text-slate-400 mt-1 flex-1">{r.description}</p>
            <button
              onClick={() => setActive(r)}
              className="mt-4 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold text-white"
              style={{ background: "var(--cv-gradient)" }}
            >
              {used.includes(r.id) ? <CheckCircle2 className="h-4 w-4" /> : null} {used.includes(r.id) ? "Add again" : "Use recipe"}
            </button>
          </Card>
        ))}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1629] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">{active.title}</h2>
              <button onClick={() => setActive(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <label className="block text-xs text-slate-400 mb-1">Apply to device</label>
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-4">
              <option value="">Select a device…</option>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}
            </select>
            <button onClick={apply} disabled={!deviceId || busy} className="w-full rounded-xl py-2.5 font-semibold text-white disabled:opacity-50" style={{ background: "var(--cv-gradient)" }}>
              {busy ? "Creating…" : "Create automation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
