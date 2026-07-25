"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Radio, RadioTower } from "lucide-react";
import { controlPlane, type Device } from "@/lib/control-plane";
import { useConsole } from "../ConsoleProvider";
import { deviceMeta } from "../DeviceControls";
import { Toggle } from "../ui";

type Zone = { id: string; label: string; x: number; y: number; w: number; h: number };
const ZONES: Zone[] = [
  { id: "gate", label: "1 · Gate & Driveway", x: 20, y: 20, w: 250, h: 150 },
  { id: "entry", label: "2 · Entry / Foyer", x: 290, y: 20, w: 180, h: 150 },
  { id: "living", label: "3 · Living Room", x: 490, y: 20, w: 290, h: 300 },
  { id: "bath", label: "4 · Bathroom", x: 290, y: 190, w: 180, h: 130 },
  { id: "water", label: "5 · Water / Utility", x: 20, y: 190, w: 250, h: 130 },
];

function zoneOf(d: Device): string {
  const room = (d.room || "").toLowerCase();
  if (room.includes("bath")) return "bath";
  switch (d.type) {
    case "rfid-gate": return "gate";
    case "facedoor":
    case "smart-lock": return "entry";
    case "watertank":
    case "aquaguard":
    case "agri-starter": return "water";
    default: return "living";
  }
}

interface Status { color: string; label: string; active: boolean; alert: boolean }
function statusOf(d: Device): Status {
  const s = d.state || {};
  if (d.online === false) return { color: "#64748b", label: "offline", active: false, alert: false };
  if (s.dryRun || s.overflow || s.sos) return { color: "#ef4444", label: "alert", active: true, alert: true };
  if (s.motion) return { color: "#f59e0b", label: "motion", active: true, alert: false };
  switch (d.type) {
    case "rfid-gate": return String(s.barrier) === "open" ? { color: "#22c55e", label: "open", active: true, alert: false } : { color: "#38bdf8", label: "closed", active: false, alert: false };
    case "facedoor":
    case "smart-lock": return s.locked ? { color: "#38bdf8", label: "locked", active: false, alert: false } : { color: "#22c55e", label: "unlocked", active: true, alert: false };
    case "watertank": return s.pump ? { color: "#06b6d4", label: `${Number(s.ohPct ?? 0)}% ▲`, active: true, alert: false } : { color: "#38bdf8", label: `${Number(s.ohPct ?? 0)}%`, active: false, alert: false };
    case "aquaguard": return { color: "#38bdf8", label: `${Number(s.level ?? 0)}%`, active: !!s.pump, alert: false };
    case "touchboard": {
      const on = [s.g1, s.g2, s.g3].filter(Boolean).length;
      return on ? { color: "#22c55e", label: `${on}/3 on`, active: true, alert: false } : { color: "#475569", label: "off", active: false, alert: false };
    }
    default: {
      const on = !!(s.power ?? s.pump ?? s.on);
      return on ? { color: "#22c55e", label: "on", active: true, alert: false } : { color: "#475569", label: "off", active: false, alert: false };
    }
  }
}

// A vivid demo fleet so the floorplan renders + animates with zero hardware.
function demoFleet(): Device[] {
  const mk = (id: string, type: string, room: string, state: Record<string, unknown>): Device =>
    ({ id, type, name: id, room, online: true, state } as unknown as Device);
  return [
    mk("gate-01", "rfid-gate", "Driveway", { barrier: "closed", vehiclePresent: false, tagCount: 4, lastTag: 830142, lastAllowed: true, scanCount: 12, mode: "auto" }),
    mk("door-01", "facedoor", "Foyer", { locked: true, lastMethod: "face", lastName: "Hema", accessCount: 37, bellCount: 5, autoLockSec: 8 }),
    mk("board-01", "touchboard", "Living Room", { g1: true, g2: false, g3: false, watts: 184, volts: 232, amps: 0.82, pf: 0.96, kwh: 42.6, backlight: 60 }),
    mk("ac-01", "thermostat", "Living Room", { power: true, target: 24 }),
    mk("pir-01", "motion-sensor", "Living Room", { motion: false, armed: true }),
    mk("energy-01", "energy-monitor", "Living Room", { watts: 1240, amps: 5.4, kwh: 812 }),
    mk("pir-bath", "motion-sensor", "Bathroom", { motion: false, armed: false }),
    mk("fan-bath", "smart-fan", "Bathroom", { power: false }),
    mk("tank-01", "watertank", "Utility", { ohPct: 64, sumpPct: 78, ohLitres: 640, sumpLitres: 1560, pump: false, auto: true, dryRun: false, overflow: false, amps: 0, startPct: 20, stopPct: 95, sumpMinPct: 15 }),
  ];
}

// Advance the demo fleet one tick — realistic drift so the UI visibly updates.
function tickFleet(fleet: Device[]): Device[] {
  return fleet.map((d) => {
    const s = { ...(d.state as Record<string, unknown>) };
    if (d.type === "watertank") {
      let oh = Number(s.ohPct ?? 60), sump = Number(s.sumpPct ?? 70);
      let pump = !!s.pump;
      if (pump) { oh = Math.min(100, oh + 3); sump = Math.max(0, sump - 2); if (oh >= Number(s.stopPct ?? 95)) pump = false; }
      else { oh = Math.max(0, oh - 1); if (oh <= Number(s.startPct ?? 20) && sump > Number(s.sumpMinPct ?? 15)) pump = true; }
      s.ohPct = oh; s.sumpPct = sump; s.pump = pump; s.amps = pump ? 4.2 + Math.random() : 0;
      s.ohLitres = Math.round(oh * 10); s.sumpLitres = Math.round(sump * 20);
    } else if (d.type === "touchboard") {
      const base = (s.g1 ? 60 : 0) + (s.g2 ? 40 : 0) + (s.g3 ? 90 : 0);
      s.watts = Math.max(0, base + (Math.random() * 20 - 10));
      s.volts = 228 + Math.random() * 8; s.amps = Number(s.watts) / Number(s.volts);
      s.pf = 0.92 + Math.random() * 0.07; s.kwh = Number(s.kwh ?? 0) + 0.002;
      if (Math.random() < 0.08) s.g2 = !s.g2;
    } else if (d.type === "motion-sensor") {
      if (Math.random() < 0.15) s.motion = !s.motion;
    } else if (d.type === "rfid-gate") {
      if (Math.random() < 0.06) { s.barrier = String(s.barrier) === "open" ? "closed" : "open"; s.vehiclePresent = String(s.barrier) === "open"; s.scanCount = Number(s.scanCount ?? 0) + 1; s.lastAllowed = Math.random() > 0.2; }
    } else if (d.type === "facedoor") {
      if (Math.random() < 0.05) { s.locked = !s.locked; if (!s.locked) s.accessCount = Number(s.accessCount ?? 0) + 1; }
    } else if (d.type === "energy-monitor") {
      s.watts = 900 + Math.round(Math.random() * 800);
    } else if (Math.random() < 0.05) {
      s.power = !s.power;
    }
    return { ...d, state: s } as Device;
  });
}

export default function FloorplanPage() {
  const { subscribe } = useConsole();
  const [real, setReal] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [simOn, setSimOn] = useState(false);
  const [fleet, setFleet] = useState<Device[]>(demoFleet());
  const [selected, setSelected] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const d = await controlPlane.devices();
    if (d.ok) setReal(d.data.devices ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Live updates for real devices.
  useEffect(() => {
    return subscribe((u) => {
      if (u.kind !== "state") return;
      setReal((prev) => prev.map((d) => (d.id === u.deviceId ? { ...d, state: u.payload as Record<string, unknown>, online: true } : d)));
    });
  }, [subscribe]);

  // Simulator loop.
  useEffect(() => {
    if (simOn) {
      timer.current = setInterval(() => setFleet((f) => tickFleet(f)), 1200);
    } else if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [simOn]);

  // When the simulator is on it drives the map; otherwise real devices do
  // (falling back to a static demo fleet if the account has none yet).
  const devices = simOn ? fleet : real.length ? real : demoFleet();

  const byZone = useMemo(() => {
    const m: Record<string, Device[]> = {};
    for (const z of ZONES) m[z.id] = [];
    for (const d of devices) (m[zoneOf(d)] ||= []).push(d);
    return m;
  }, [devices]);

  const active = devices.find((d) => d.id === selected) || null;
  const activeStatus = active ? statusOf(active) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Home floorplan</h1>
          <p className="mt-0.5 text-sm text-slate-400">Live device map across all five zones. {simOn ? "Simulating telemetry — no hardware needed." : real.length ? `${real.length} devices` : "Showing a demo layout."}</p>
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-200">
          {simOn ? <RadioTower className="h-4 w-4 text-cyan-400" /> : <Radio className="h-4 w-4 text-slate-400" />}
          Live simulator
          <Toggle checked={simOn} onChange={setSimOn} label="Live simulator" />
        </label>
      </div>

      {loading && !simOn ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <svg viewBox="0 0 800 340" className="w-full" style={{ maxHeight: 460 }}>
            <defs>
              <linearGradient id="fpwall" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#0b1220" />
                <stop offset="1" stopColor="#0a0f1c" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="800" height="340" rx="16" fill="url(#fpwall)" />
            {ZONES.map((z) => (
              <g key={z.id}>
                <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="12" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.12)" />
                <text x={z.x + 12} y={z.y + 22} fill="#64748b" fontSize="12" fontWeight={700}>{z.label}</text>
                {(byZone[z.id] || []).map((d, i) => {
                  const cols = Math.max(1, Math.floor((z.w - 24) / 92));
                  const cx = z.x + 46 + (i % cols) * 92;
                  const cy = z.y + 58 + Math.floor(i / cols) * 66;
                  const st = statusOf(d);
                  const meta = deviceMeta(d.type);
                  const isSel = selected === d.id;
                  return (
                    <g key={d.id} onClick={() => setSelected(d.id)} style={{ cursor: "pointer" }}>
                      {st.active && <circle cx={cx} cy={cy} r="22" fill={st.color} opacity="0.18" className="animate-pulse" />}
                      <circle cx={cx} cy={cy} r="16" fill={st.color} opacity={st.active ? 0.9 : 0.5} stroke={isSel ? "#fff" : "rgba(255,255,255,0.25)"} strokeWidth={isSel ? 2.5 : 1} />
                      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="13">{demoGlyph(meta.label, d.type)}</text>
                      <text x={cx} y={cy + 30} textAnchor="middle" fill="#cbd5e1" fontSize="9">{(d.name || d.id).slice(0, 12)}</text>
                      <text x={cx} y={cy + 41} textAnchor="middle" fill={st.color} fontSize="8" fontWeight={700}>{st.label}</text>
                    </g>
                  );
                })}
              </g>
            ))}
          </svg>
        </div>
      )}

      {active && activeStatus && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-white">{active.name || active.id}</div>
              <div className="text-sm text-slate-400">{deviceMeta(active.type).label} · <span style={{ color: activeStatus.color }}>{activeStatus.label}</span></div>
            </div>
            <a href={`/console/device/${encodeURIComponent(active.id)}`} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/10">Open controls</a>
          </div>
          <pre className="mt-3 max-h-40 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-300">{JSON.stringify(active.state, null, 2)}</pre>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-400">
        <Legend color="#22c55e" label="Active / on" />
        <Legend color="#38bdf8" label="Idle / secured" />
        <Legend color="#f59e0b" label="Motion" />
        <Legend color="#ef4444" label="Alert" />
        <Legend color="#64748b" label="Offline" />
      </div>
    </div>
  );
}

function demoGlyph(_label: string, type: string): string {
  const g: Record<string, string> = {
    "rfid-gate": "🚗", facedoor: "🚪", "smart-lock": "🔒", watertank: "🌊", aquaguard: "💧",
    touchboard: "🎛️", "motion-sensor": "🚶", "energy-monitor": "⚡", "smart-fan": "🌀",
    thermostat: "❄️", ac: "❄️", "smart-plug": "🔌", "smart-switch": "🎚️", "smart-light": "💡", "home-hub": "🏠", curtain: "🪟",
  };
  return g[type] || "📟";
}
function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}
