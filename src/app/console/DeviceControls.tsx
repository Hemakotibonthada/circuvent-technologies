"use client";

import {
  Droplets,
  Home,
  Plug,
  ToggleRight,
  Gauge,
  ShieldAlert,
  ScanLine,
  Sprout,
  Cpu,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import type { Device } from "@/lib/control-plane";
import { ControlRow, SectionLabel, Toggle, Stepper, StatTile, ScenePill } from "./ui";

export interface DeviceTypeMeta {
  label: string;
  icon: LucideIcon;
  accent: string;
  blurb: string;
}

export const DEVICE_META: Record<string, DeviceTypeMeta> = {
  aquaguard: { label: "AquaGuard", icon: Droplets, accent: "#06b6d4", blurb: "Water tank & pump" },
  "home-hub": { label: "Home Hub", icon: Home, accent: "#8b5cf6", blurb: "Multi-channel + scenes" },
  "smart-plug": { label: "Smart Plug", icon: Plug, accent: "#06b6d4", blurb: "Metered outlet" },
  "smart-switch": { label: "Smart Switch", icon: ToggleRight, accent: "#8b5cf6", blurb: "2-gang wall switch" },
  "energy-monitor": { label: "Energy Monitor", icon: Gauge, accent: "#f59e0b", blurb: "Whole-home metering" },
  guardian: { label: "Guardian", icon: ShieldAlert, accent: "#ef4444", blurb: "Personal safety" },
  "motion-sensor": { label: "Motion Sensor", icon: ScanLine, accent: "#22c55e", blurb: "PIR intrusion" },
  "agri-starter": { label: "Agri Starter", icon: Sprout, accent: "#22c55e", blurb: "Farm pump control" },
};

export function deviceMeta(type: string): DeviceTypeMeta {
  return DEVICE_META[type] ?? { label: type || "Device", icon: Cpu, accent: "#94a3b8", blurb: "Generic device" };
}

type SendFn = (params: Record<string, unknown>) => void;

export function DeviceControls({ device, send, busy }: { device: Device; send: SendFn; busy: boolean }) {
  const generic = <GenericCapabilities d={device} send={send} busy={busy} />;
  switch (device.type) {
    case "aquaguard":
      return <>{generic}<AquaGuard d={device} send={send} busy={busy} /></>;
    case "home-hub":
      return <HomeHub d={device} send={send} busy={busy} />;
    case "smart-plug":
      return <SmartPlug d={device} send={send} busy={busy} />;
    case "smart-switch":
      return <SmartSwitch d={device} send={send} busy={busy} />;
    case "energy-monitor":
      return <EnergyMonitor d={device} />;
    case "guardian":
      return <Guardian d={device} send={send} busy={busy} />;
    case "motion-sensor":
      return <MotionSensor d={device} send={send} busy={busy} />;
    case "agri-starter":
      return <>{generic}<AgriStarter d={device} send={send} busy={busy} /></>;
    default:
      return <>{generic}<RawState d={device} /></>;
  }
}

const n = (v: unknown, dflt = 0) => (v == null || Number.isNaN(Number(v)) ? dflt : Number(v));
const b = (v: unknown) => !!v;

export interface Capability {
  power?: { field: string; label: string };
  dimmer?: { field: string; label: string; min: number; max: number };
  fan?: { field: string; label: string; steps: number };
  color?: { field: string };
  thermostat?: { field: string; label: string; min: number; max: number };
}

export function capabilities(type: string): Capability {
  switch (type) {
    case "smart-plug":
      return { power: { field: "power", label: "Power" } };
    case "smart-switch":
      return { power: { field: "power", label: "Gang 1" } };
    case "home-hub":
      return { power: { field: "power", label: "Channel 1" } };
    case "aquaguard":
    case "agri-starter":
      return { power: { field: "pump", label: "Pump" } };
    case "light":
      return { power: { field: "power", label: "Power" }, dimmer: { field: "brightness", label: "Brightness", min: 0, max: 100 }, color: { field: "color" } };
    case "fan":
    case "ceiling-fan":
      return { power: { field: "power", label: "Power" }, fan: { field: "speed", label: "Speed", steps: 3 } };
    case "thermostat":
    case "ac":
      return { power: { field: "power", label: "Power" }, thermostat: { field: "target", label: "Target", min: 16, max: 30 } };
    default:
      return { power: { field: "power", label: "Power" } };
  }
}

export function primaryPowerField(type: string): string {
  return capabilities(type).power?.field ?? "power";
}

function GenericCapabilities({ d, send, busy }: { d: Device; send: SendFn; busy: boolean }) {
  const caps = capabilities(d.type);
  const genericTypes = ["light", "fan", "ceiling-fan", "thermostat", "ac"];
  if (!genericTypes.includes(d.type) && !caps.dimmer && !caps.fan && !caps.color && !caps.thermostat) return null;
  const colors = ["#ffffff", "#f87171", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#60a5fa", "#a78bfa"];
  return (
    <div className="mb-5">
      <SectionLabel>Smart controls</SectionLabel>
      {caps.power && (
        <ControlRow label={caps.power.label}>
          <Toggle checked={b(d.state[caps.power.field])} onChange={(v) => send({ [caps.power!.field]: v })} disabled={busy} label={caps.power.label} />
        </ControlRow>
      )}
      {caps.dimmer && (
        <ControlRow label={caps.dimmer.label} hint={`${n(d.state[caps.dimmer.field])}%`}>
          <input type="range" min={caps.dimmer.min} max={caps.dimmer.max} value={n(d.state[caps.dimmer.field])} onChange={(e) => send({ [caps.dimmer!.field]: Number(e.target.value) })} className="w-40 accent-cyan-400" />
        </ControlRow>
      )}
      {caps.fan && (
        <ControlRow label={caps.fan.label}>
          <div className="flex gap-2">
            {Array.from({ length: caps.fan.steps + 1 }, (_, i) => (
              <button key={i} onClick={() => send({ [caps.fan!.field]: i })} className={`h-9 w-9 rounded-lg border border-white/10 ${n(d.state[caps.fan!.field]) === i ? "text-white cv-gradient" : "text-slate-300 bg-white/5"}`}>{i}</button>
            ))}
          </div>
        </ControlRow>
      )}
      {caps.color && (
        <ControlRow label="Colour">
          <div className="flex gap-2">
            {colors.map((c) => (
              <button key={c} onClick={() => send({ [caps.color!.field]: c })} className="h-7 w-7 rounded-full border border-white/30" style={{ background: c }} aria-label={`Color ${c}`} />
            ))}
          </div>
        </ControlRow>
      )}
      {caps.thermostat && (
        <ControlRow label={caps.thermostat.label}>
          <Stepper value={n(d.state[caps.thermostat.field], 24)} onChange={(v) => send({ [caps.thermostat!.field]: v })} min={caps.thermostat.min} max={caps.thermostat.max} suffix="°" />
        </ControlRow>
      )}
    </div>
  );
}

function AlertBanner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-3 text-amber-300 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {text}
    </div>
  );
}

function AquaGuard({ d, send, busy }: { d: Device; send: SendFn; busy: boolean }) {
  const level = n(d.state.level);
  const startPct = n(d.state.startPct, 25);
  const stopPct = n(d.state.stopPct, 95);
  return (
    <div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6 flex flex-col items-center">
        <div className="text-6xl font-extrabold text-white">
          {level}
          <span className="text-2xl text-slate-400">%</span>
        </div>
        <div className="mt-4 h-3 w-full max-w-md rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, Math.max(0, level))}%`, background: "linear-gradient(90deg,#06b6d4,#22d3ee)" }}
          />
        </div>
        <div className="text-slate-500 text-sm mt-3">Tank level</div>
      </div>

      {b(d.state.dryRun) && <div className="mt-3"><AlertBanner text="Dry-run detected — pump stopped." /></div>}
      {b(d.state.overflow) && <div className="mt-3"><AlertBanner text="Overflow — pump stopped." /></div>}

      <SectionLabel>Controls</SectionLabel>
      <ControlRow label="Auto mode" hint="Start/stop the pump automatically by level">
        <Toggle checked={b(d.state.auto)} onChange={(v) => send({ auto: v })} disabled={busy} label="Auto mode" />
      </ControlRow>
      <ControlRow label="Pump" hint={b(d.state.auto) ? "Overridden by auto mode" : "Manual pump control"}>
        <Toggle checked={b(d.state.pump)} onChange={(v) => send({ pump: v })} disabled={busy} label="Pump" />
      </ControlRow>

      <SectionLabel>Auto thresholds</SectionLabel>
      <ControlRow label="Start at" hint="Turn pump on below this level">
        <Stepper value={startPct} onChange={(v) => send({ startPct: v })} min={5} max={90} suffix="%" />
      </ControlRow>
      <ControlRow label="Stop at" hint="Turn pump off at this level">
        <Stepper value={stopPct} onChange={(v) => send({ stopPct: v })} min={10} max={100} suffix="%" />
      </ControlRow>
    </div>
  );
}

function HomeHub({ d, send, busy }: { d: Device; send: SendFn; busy: boolean }) {
  const channels = [
    { key: "power", ch: 0, label: "Channel 1" },
    { key: "power2", ch: 1, label: "Channel 2" },
    { key: "power3", ch: 2, label: "Channel 3" },
    { key: "power4", ch: 3, label: "Channel 4" },
  ];
  const scenes = ["home", "away", "night", "movie"];
  const current = String(d.state.scene ?? "");
  return (
    <div>
      <SectionLabel>Channels</SectionLabel>
      {channels.map((c) => (
        <ControlRow key={c.key} label={c.label}>
          <Toggle
            checked={b(d.state[c.key])}
            onChange={(v) => send({ ch: c.ch, on: v })}
            disabled={busy}
            label={c.label}
          />
        </ControlRow>
      ))}
      <SectionLabel>Scenes</SectionLabel>
      <div className="flex flex-wrap gap-2.5">
        {scenes.map((sc) => (
          <ScenePill key={sc} label={sc} active={current === sc} onClick={() => send({ scene: sc })} />
        ))}
      </div>
    </div>
  );
}

function SmartPlug({ d, send, busy }: { d: Device; send: SendFn; busy: boolean }) {
  return (
    <div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6 flex flex-col items-center">
        <div className="text-5xl font-extrabold text-white">
          {n(d.state.watts).toFixed(1)}
          <span className="text-xl text-slate-400"> W</span>
        </div>
        <div className="text-slate-500 text-sm mt-2">Live power draw</div>
      </div>
      <SectionLabel>Controls</SectionLabel>
      <ControlRow label="Power">
        <Toggle checked={b(d.state.power)} onChange={(v) => send({ power: v })} disabled={busy} label="Power" />
      </ControlRow>
    </div>
  );
}

function SmartSwitch({ d, send, busy }: { d: Device; send: SendFn; busy: boolean }) {
  return (
    <div>
      <SectionLabel>Gangs</SectionLabel>
      <ControlRow label="Gang 1">
        <Toggle checked={b(d.state.power)} onChange={(v) => send({ power: v })} disabled={busy} label="Gang 1" />
      </ControlRow>
      <ControlRow label="Gang 2">
        <Toggle checked={b(d.state.power2)} onChange={(v) => send({ power2: v })} disabled={busy} label="Gang 2" />
      </ControlRow>
    </div>
  );
}

function EnergyMonitor({ d }: { d: Device }) {
  return (
    <div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6 flex flex-col items-center">
        <div className="text-6xl font-extrabold" style={{ color: "#f59e0b" }}>
          {n(d.state.watts).toFixed(0)}
          <span className="text-2xl text-slate-400"> W</span>
        </div>
        <div className="text-slate-500 text-sm mt-2">Instantaneous load</div>
      </div>
      <div className="flex gap-3 mt-4">
        <StatTile label="Current" value={`${n(d.state.amps).toFixed(2)} A`} />
        <StatTile label="Energy" value={`${n(d.state.kwh).toFixed(2)} kWh`} />
      </div>
      <p className="text-slate-500 text-sm mt-4 italic">Read-only meter — no controls.</p>
    </div>
  );
}

function Guardian({ d, send, busy }: { d: Device; send: SendFn; busy: boolean }) {
  const lat = d.state.lat != null ? n(d.state.lat) : null;
  const lng = d.state.lng != null ? n(d.state.lng) : null;
  return (
    <div>
      {b(d.state.sos) && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5 mb-4 flex flex-col items-center">
          <div className="text-red-400 font-extrabold text-lg mb-3">SOS TRIGGERED</div>
          <button
            onClick={() => send({ sos: false })}
            disabled={busy}
            className="rounded-xl bg-red-500 px-5 py-2.5 font-semibold text-white hover:bg-red-600 disabled:opacity-60"
          >
            Clear alert
          </button>
        </div>
      )}
      <SectionLabel>Controls</SectionLabel>
      <ControlRow label="Armed" hint="Arm the safety beacon">
        <Toggle checked={b(d.state.armed)} onChange={(v) => send({ armed: v })} disabled={busy} label="Armed" />
      </ControlRow>
      <div className="flex gap-3 mt-4">
        <StatTile label="Battery" value={`${n(d.state.battery)}%`} accent="#22c55e" />
        <StatTile label="Location" value={lat != null && lng != null ? `${lat.toFixed(3)}, ${lng.toFixed(3)}` : "—"} />
      </div>
    </div>
  );
}

function MotionSensor({ d, send, busy }: { d: Device; send: SendFn; busy: boolean }) {
  const motion = b(d.state.motion);
  return (
    <div>
      <div
        className="rounded-2xl border p-8 flex flex-col items-center"
        style={{
          borderColor: motion ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)",
          background: motion ? "rgba(239,68,68,0.12)" : "rgba(0,0,0,0.2)",
        }}
      >
        <div className="text-3xl font-extrabold" style={{ color: motion ? "#ef4444" : "#22c55e" }}>
          {motion ? "MOTION" : "CLEAR"}
        </div>
        <div className="text-slate-500 text-sm mt-2">{b(d.state.armed) ? "Armed" : "Disarmed"}</div>
      </div>
      <SectionLabel>Controls</SectionLabel>
      <ControlRow label="Armed" hint="Send alerts when motion is detected">
        <Toggle checked={b(d.state.armed)} onChange={(v) => send({ armed: v })} disabled={busy} label="Armed" />
      </ControlRow>
    </div>
  );
}

function AgriStarter({ d, send, busy }: { d: Device; send: SendFn; busy: boolean }) {
  const power = b(d.state.power_available);
  return (
    <div>
      <SectionLabel>Controls</SectionLabel>
      <ControlRow label="Pump" hint="Start / stop the irrigation pump">
        <Toggle checked={b(d.state.pump)} onChange={(v) => send({ pump: v })} disabled={busy} label="Pump" />
      </ControlRow>
      <div className="flex items-center gap-2 mt-3 text-sm">
        <span className="text-slate-400">Mains power:</span>
        <span className="font-semibold" style={{ color: power ? "#22c55e" : "#ef4444" }}>
          {power ? "Available" : "Unavailable"}
        </span>
      </div>
      {!power && <div className="mt-3"><AlertBanner text="No mains power — pump cannot start." /></div>}
    </div>
  );
}

function RawState({ d }: { d: Device }) {
  return (
    <div>
      <SectionLabel>Raw state</SectionLabel>
      <pre className="rounded-xl border border-white/10 bg-black/30 p-4 text-slate-300 text-sm overflow-auto">
        {JSON.stringify(d.state, null, 2)}
      </pre>
    </div>
  );
}
