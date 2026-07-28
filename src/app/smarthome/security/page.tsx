"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, DoorClosed, Home, Loader2, Moon, ShieldCheck, ShieldOff, Sun } from "lucide-react";
import { controlPlane, type Device, type Scene } from "@/lib/control-plane";
import { getMode, setMode as persistMode, type SecurityMode } from "@/lib/smarthome-security";
import { useConsole } from "../ConsoleProvider";
import { Card } from "../ui";

const SECURITY_TYPES = new Set(["motion-sensor", "guardian", "smart-lock", "facedoor", "rfid-gate", "watertank", "aquaguard"]);

export default function SecurityCenterPage() {
  const { subscribe } = useConsole();
  const [devices, setDevices] = useState<Device[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [mode, setModeState] = useState<SecurityMode>("home");
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([controlPlane.devices(), controlPlane.scenes()]);
    if (d.ok) setDevices(d.data.devices ?? []);
    if (s.ok) setScenes(s.data.scenes ?? []);
    setModeState(getMode());
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

  const security = useMemo(() => devices.filter((d) => SECURITY_TYPES.has(d.type)), [devices]);
  const sos = security.filter((d) => (d.state as { sos?: boolean }).sos);
  const motion = security.filter((d) => d.type === "motion-sensor" && (d.state as { motion?: boolean }).motion);
  const unlocked = security.filter((d) => (d.type === "smart-lock" || d.type === "facedoor") && !(d.state as { locked?: boolean }).locked);
  const offline = security.filter((d) => !d.online);

  const applyMode = async (next: SecurityMode) => {
    setSwitching(true);
    persistMode(next);
    setModeState(next);
    // Best-effort: if a scene shares the mode's name (Home/Away/Night), trigger it too —
    // reuses the existing Scenes feature instead of re-implementing action lists here.
    const scene = scenes.find((s) => s.name.toLowerCase() === next);
    if (scene) await controlPlane.activateScene(scene.id);
    setSwitching(false);
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
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><ShieldCheck className="h-6 w-6" /> Security Center</h1>
        <p className="text-sm text-slate-400 mt-1">A single view of everything access- and safety-related.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {([
          { key: "home", label: "Home", icon: Home },
          { key: "away", label: "Away", icon: ShieldOff },
          { key: "night", label: "Night", icon: Moon },
        ] as const).map((m) => (
          <button
            key={m.key}
            onClick={() => applyMode(m.key)}
            disabled={switching}
            className={`rounded-2xl p-4 flex flex-col items-center gap-2 border transition ${mode === m.key ? "border-cyan-400/60 bg-white/10" : "border-white/10 bg-black/10 hover:bg-white/5"}`}
          >
            <m.icon className="h-6 w-6" style={{ color: mode === m.key ? "var(--cv-accent-hi)" : "#94a3b8" }} />
            <span className="text-sm font-semibold text-white">{m.label}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-4"><AlertTriangle className="h-5 w-5 text-red-400" /><div className="mt-2 text-2xl font-extrabold text-white">{sos.length}</div><div className="text-xs text-slate-500">Active SOS</div></Card>
        <Card className="p-4"><Sun className="h-5 w-5 text-amber-400" /><div className="mt-2 text-2xl font-extrabold text-white">{motion.length}</div><div className="text-xs text-slate-500">Motion detected</div></Card>
        <Card className="p-4"><DoorClosed className="h-5 w-5 text-cyan-400" /><div className="mt-2 text-2xl font-extrabold text-white">{unlocked.length}</div><div className="text-xs text-slate-500">Unlocked doors</div></Card>
        <Card className="p-4"><ShieldOff className="h-5 w-5 text-slate-400" /><div className="mt-2 text-2xl font-extrabold text-white">{offline.length}</div><div className="text-xs text-slate-500">Offline devices</div></Card>
      </div>

      <Card className="p-5">
        <h2 className="font-bold text-white mb-3">Security devices</h2>
        {security.length === 0 ? (
          <p className="text-sm text-slate-500">No security-relevant devices yet (motion sensors, locks, gates, guardian, tank sensors).</p>
        ) : (
          <div className="space-y-2">
            {security.map((d) => {
              const s = d.state as Record<string, unknown>;
              const alert = !!s.sos || !!s.dryRun || !!s.overflow;
              return (
                <div key={d.id} className={`rounded-xl px-4 py-3 flex items-center justify-between ${alert ? "bg-red-500/10" : "bg-black/20"}`}>
                  <div>
                    <div className="text-sm font-medium text-white">{d.name || d.id}</div>
                    <div className="text-xs text-slate-500">{d.type}{d.room ? ` · ${d.room}` : ""}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${d.online ? (alert ? "bg-red-500/20 text-red-300" : "bg-emerald-500/10 text-emerald-400") : "bg-slate-500/10 text-slate-400"}`}>
                    {!d.online ? "offline" : alert ? "alert" : "ok"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
