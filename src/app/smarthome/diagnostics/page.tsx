"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Loader2, Save, Stethoscope } from "lucide-react";
import { controlPlane, type Device } from "@/lib/control-plane";
import { getThresholds, saveThresholds, healthScore, type DiagnosticsThresholds } from "@/lib/smarthome-diagnostics";
import { useConsole } from "../ConsoleProvider";
import { Card } from "../ui";

const LEVEL_COLOR: Record<string, string> = { good: "#22c55e", warning: "#f59e0b", critical: "#ef4444" };

export default function DiagnosticsPage() {
  const { subscribe } = useConsole();
  const [devices, setDevices] = useState<Device[]>([]);
  const [thresholds, setThresholds] = useState<DiagnosticsThresholds>(getThresholds());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await controlPlane.devices();
    if (r.ok) setDevices(r.data.devices ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return subscribe((u) => {
      setDevices((prev) =>
        prev.map((d) => {
          if (d.id !== u.deviceId) return d;
          if (u.kind === "status") return { ...d, online: !!(u.payload as { online?: boolean }).online };
          if (u.kind === "state") return { ...d, online: true, state: { ...d.state, ...u.payload } };
          return d;
        })
      );
    });
  }, [subscribe]);

  const save = () => saveThresholds(thresholds);

  const scored = devices.map((d) => ({ device: d, health: healthScore(d, thresholds) })).sort((a, b) => a.health.score - b.health.score);
  const critical = scored.filter((s) => s.health.level === "critical").length;
  const warning = scored.filter((s) => s.health.level === "warning").length;

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
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Stethoscope className="h-6 w-6" /> Device diagnostics</h1>
        <p className="text-sm text-slate-400 mt-1">Fleet-wide health — signal, freshness and online status at a glance.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-4"><div className="text-2xl font-extrabold text-white">{devices.length}</div><div className="text-xs text-slate-500">Devices</div></Card>
        <Card className="p-4"><div className="text-2xl font-extrabold text-amber-400">{warning}</div><div className="text-xs text-slate-500">Warnings</div></Card>
        <Card className="p-4"><div className="text-2xl font-extrabold text-red-400">{critical}</div><div className="text-xs text-slate-500">Critical</div></Card>
      </div>

      <Card className="p-5 mb-4">
        <h2 className="font-bold text-white mb-3 flex items-center gap-2"><Activity className="h-4 w-4" /> Thresholds</h2>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Weak signal (dBm)</label>
            <input type="number" value={thresholds.weakSignalDbm} onChange={(e) => setThresholds({ ...thresholds, weakSignalDbm: Number(e.target.value) })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Stale after (minutes)</label>
            <input type="number" value={thresholds.staleMinutes} onChange={(e) => setThresholds({ ...thresholds, staleMinutes: Number(e.target.value) })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none" />
          </div>
        </div>
        <button onClick={save} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--cv-gradient)" }}>
          <Save className="h-4 w-4" /> Save thresholds
        </button>
      </Card>

      <Card className="p-5">
        <h2 className="font-bold text-white mb-3">Fleet health</h2>
        <div className="space-y-2">
          {scored.map(({ device, health }) => (
            <div key={device.id} className="rounded-xl bg-black/20 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-white">{device.name || device.id}</div>
                <span className="text-xs font-bold" style={{ color: LEVEL_COLOR[health.level] }}>{health.score}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{health.reasons.length ? health.reasons.join(" · ") : "Nominal"}</div>
            </div>
          ))}
          {scored.length === 0 && <p className="text-sm text-slate-500">No devices yet.</p>}
        </div>
      </Card>
    </div>
  );
}
