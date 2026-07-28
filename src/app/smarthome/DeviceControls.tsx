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
  Waves,
  DoorOpen,
  LayoutGrid,
  Car,
  Lock,
  LockOpen,
  Pencil,
  Check,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import type { Device } from "@/lib/control-plane";
import type { FieldStatus } from "@/lib/smarthome-realtime";
import { haptic } from "@/lib/smarthome-realtime";
import { useChannelLabels } from "@/lib/smarthome-prefs";
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
  watertank: { label: "WaterTank Duo", icon: Waves, accent: "#06b6d4", blurb: "Sump + overhead auto-fill" },
  "rfid-gate": { label: "RFID Gate", icon: Car, accent: "#f59e0b", blurb: "Vehicle access barrier" },
  facedoor: { label: "Smart Door", icon: DoorOpen, accent: "#8b5cf6", blurb: "Face / fingerprint / PIN" },
  touchboard: { label: "Touch Board", icon: LayoutGrid, accent: "#06b6d4", blurb: "3-gang metered switch" },
};

export function deviceMeta(type: string): DeviceTypeMeta {
  return DEVICE_META[type] ?? { label: type || "Device", icon: Cpu, accent: "#94a3b8", blurb: "Generic device" };
}

type SendFn = (params: Record<string, unknown>) => void;
/** Per-field command lifecycle lookup, supplied by useLiveDevice. */
type StatusFn = (field: string) => FieldStatus;

/** Ring/pulse classes reflecting a field's command lifecycle on action buttons. */
function pendCls(s: FieldStatus): string {
  if (s === "pending") return "ring-2 ring-cyan-400/60 animate-pulse";
  if (s === "confirmed") return "ring-2 ring-green-400/60";
  if (s === "failed") return "ring-2 ring-red-400/70";
  return "";
}

/** Header control that flips a channel grid between control and rename mode. */
function RenameToggle({
  editing,
  onToggle,
  onReset,
}: {
  editing: boolean;
  onToggle: () => void;
  onReset?: () => void;
}) {
  return (
    <span className="flex items-center gap-2">
      {editing && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 transition hover:text-slate-200"
        >
          Reset names
        </button>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={editing}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
          editing
            ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
            : "border-white/10 bg-white/5 text-slate-300 hover:text-white"
        }`}
      >
        {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        {editing ? "Done" : "Rename"}
      </button>
    </span>
  );
}

export function DeviceControls({ device, send, st }: { device: Device; send: SendFn; st: StatusFn }) {
  const generic = <GenericCapabilities d={device} send={send} st={st} />;
  switch (device.type) {
    case "aquaguard":
      return <>{generic}<AquaGuard d={device} send={send} st={st} /></>;
    case "home-hub":
      return <HomeHub d={device} send={send} st={st} />;
    case "smart-plug":
      return <SmartPlug d={device} send={send} st={st} />;
    case "smart-switch":
      return <SmartSwitch d={device} send={send} st={st} />;
    case "energy-monitor":
      return <EnergyMonitor d={device} />;
    case "guardian":
      return <Guardian d={device} send={send} st={st} />;
    case "motion-sensor":
      return <MotionSensor d={device} send={send} st={st} />;
    case "agri-starter":
      return <>{generic}<AgriStarter d={device} send={send} st={st} /></>;
    case "watertank":
      return <WaterTank d={device} send={send} st={st} />;
    case "rfid-gate":
      return <RfidGate d={device} send={send} st={st} />;
    case "facedoor":
      return <FaceDoor d={device} send={send} st={st} />;
    case "touchboard":
      return <TouchBoard d={device} send={send} st={st} />;
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

function GenericCapabilities({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const caps = capabilities(d.type);
  const genericTypes = ["light", "fan", "ceiling-fan", "thermostat", "ac"];
  if (!genericTypes.includes(d.type) && !caps.dimmer && !caps.fan && !caps.color && !caps.thermostat) return null;
  const colors = ["#ffffff", "#f87171", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#60a5fa", "#a78bfa"];
  return (
    <div className="mb-5">
      <SectionLabel>Smart controls</SectionLabel>
      {caps.power && (
        <ControlRow label={caps.power.label}>
          <Toggle checked={b(d.state[caps.power.field])} onChange={(v) => send({ [caps.power!.field]: v })} status={st(caps.power!.field)} label={caps.power.label} />
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

function AquaGuard({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
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
        <Toggle checked={b(d.state.auto)} onChange={(v) => send({ auto: v })} status={st("auto")} label="Auto mode" />
      </ControlRow>
      <ControlRow label="Pump" hint={b(d.state.auto) ? "Overridden by auto mode" : "Manual pump control"}>
        <Toggle checked={b(d.state.pump)} onChange={(v) => send({ pump: v })} status={st("pump")} label="Pump" />
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

function HomeHub({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const { labelFor, setLabel, hasCustom, resetDevice } = useChannelLabels();
  const [editing, setEditing] = useState(false);
  const channels = [
    { key: "power", ch: 0, fallback: "Channel 1" },
    { key: "power2", ch: 1, fallback: "Channel 2" },
    { key: "power3", ch: 2, fallback: "Channel 3" },
    { key: "power4", ch: 3, fallback: "Channel 4" },
  ];
  const scenes = ["home", "away", "night", "movie"];
  const current = String(d.state.scene ?? "");
  const onCount = channels.filter((c) => b(d.state[c.key])).length;
  return (
    <div>
      <SectionLabel
        right={
          <span className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{onCount}/4 on</span>
            <RenameToggle
              editing={editing}
              onToggle={() => setEditing((v) => !v)}
              onReset={hasCustom(d.id) ? () => resetDevice(d.id) : undefined}
            />
          </span>
        }
      >
        Channels
      </SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {channels.map((c) => (
          <ChannelTile
            key={c.key}
            label={labelFor(d.id, c.key, c.fallback)}
            on={b(d.state[c.key])}
            status={st(c.key)}
            onToggle={(v) => send({ ch: c.ch, on: v })}
            editing={editing}
            onRename={(name) => setLabel(d.id, c.key, name === c.fallback ? "" : name)}
          />
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => send({ relays: [true, true, true, true] })}
          className="min-h-11 flex-1 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition"
        >
          All on
        </button>
        <button
          onClick={() => send({ relays: [false, false, false, false] })}
          className="min-h-11 flex-1 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition"
        >
          All off
        </button>
      </div>
      <SectionLabel>Scenes</SectionLabel>
      <div className="flex flex-wrap gap-2.5">
        {scenes.map((sc) => (
          <ScenePill key={sc} label={sc} active={current === sc} status={st("scene")} onClick={() => send({ scene: sc })} />
        ))}
      </div>
    </div>
  );
}

/** Large, thumb-friendly relay tile: the whole card is the hit target. */
function ChannelTile({
  label,
  on,
  status,
  onToggle,
  onRename,
  editing,
}: {
  label: string;
  on: boolean;
  status: FieldStatus;
  onToggle: (v: boolean) => void;
  onRename?: (name: string) => void;
  editing?: boolean;
}) {
  if (editing && onRename) {
    return (
      <div
        className={`flex min-h-[76px] items-center gap-3 rounded-2xl border px-4 py-3 ${
          on ? "border-cyan-400/40 bg-cyan-500/10" : "border-white/10 bg-black/20"
        }`}
      >
        <input
          className="cv-input py-2 text-[15px] font-semibold"
          defaultValue={label}
          maxLength={32}
          aria-label={`Name for ${label}`}
          placeholder="Switch name"
          onBlur={(e) => onRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              (e.target as HTMLInputElement).value = label;
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        haptic(on ? 8 : 14);
        onToggle(!on);
      }}
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-busy={status === "pending"}
      className={`group relative flex min-h-[76px] items-center justify-between gap-3 overflow-hidden rounded-2xl border px-4 py-3 text-left transition active:scale-[0.98] ${
        on ? "border-cyan-400/40 bg-cyan-500/10" : "border-white/10 bg-black/20 hover:bg-white/5"
      } ${status === "pending" ? "cv-pending" : ""} ${status === "confirmed" ? "cv-pop" : ""} ${
        status === "failed" ? "ring-2 ring-red-500/60" : ""
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold text-white">{label}</span>
        {/* The tile already shows the commanded state optimistically, so the
            caption keeps saying On/Off and pending is signalled by a dot —
            swapping the caption to "Switching…" made a completed action read
            as unfinished. */}
        <span className={`mt-0.5 flex items-center gap-1.5 text-xs font-medium ${on ? "text-cyan-300" : "text-slate-500"}`}>
          {status === "failed" ? (
            <span className="text-red-300">Failed — tap to retry</span>
          ) : (
            <>
              {on ? "On" : "Off"}
              {status === "pending" && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-70" aria-hidden />
              )}
            </>
          )}
        </span>
      </span>
      <span
        aria-hidden
        className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors ${
          on ? "border-cyan-300/50 bg-cyan-400" : "border-white/15 bg-white/10"
        }`}
      >
        <span
          className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow transition-all duration-150 ${
            on ? "left-[calc(100%-1.625rem)]" : "left-1"
          }`}
        />
      </span>
    </button>
  );
}

function SmartPlug({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
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
        <Toggle checked={b(d.state.power)} onChange={(v) => send({ power: v })} status={st("power")} label="Power" />
      </ControlRow>
    </div>
  );
}

function SmartSwitch({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const { labelFor, setLabel, hasCustom, resetDevice } = useChannelLabels();
  const [editing, setEditing] = useState(false);
  const gangs = [
    { key: "power", fallback: "Gang 1" },
    { key: "power2", fallback: "Gang 2" },
  ];
  const onCount = gangs.filter((g) => b(d.state[g.key])).length;
  return (
    <div>
      <SectionLabel
        right={
          <span className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{onCount}/{gangs.length} on</span>
            <RenameToggle
              editing={editing}
              onToggle={() => setEditing((v) => !v)}
              onReset={hasCustom(d.id) ? () => resetDevice(d.id) : undefined}
            />
          </span>
        }
      >
        Gangs
      </SectionLabel>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {gangs.map((g) => (
          <ChannelTile
            key={g.key}
            label={labelFor(d.id, g.key, g.fallback)}
            on={b(d.state[g.key])}
            status={st(g.key)}
            onToggle={(v) => send({ [g.key]: v })}
            editing={editing}
            onRename={(name) => setLabel(d.id, g.key, name === g.fallback ? "" : name)}
          />
        ))}
      </div>
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

function Guardian({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const lat = d.state.lat != null ? n(d.state.lat) : null;
  const lng = d.state.lng != null ? n(d.state.lng) : null;
  return (
    <div>
      {b(d.state.sos) && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5 mb-4 flex flex-col items-center">
          <div className="text-red-400 font-extrabold text-lg mb-3">SOS TRIGGERED</div>
          <button
            onClick={() => send({ sos: false })}
            className={`rounded-xl bg-red-500 px-5 py-2.5 font-semibold text-white hover:bg-red-600 active:scale-95 transition ${pendCls(st("sos"))}`}
          >
            Clear alert
          </button>
        </div>
      )}
      <SectionLabel>Controls</SectionLabel>
      <ControlRow label="Armed" hint="Arm the safety beacon">
        <Toggle checked={b(d.state.armed)} onChange={(v) => send({ armed: v })} status={st("armed")} label="Armed" />
      </ControlRow>
      <div className="flex gap-3 mt-4">
        <StatTile label="Battery" value={`${n(d.state.battery)}%`} accent="#22c55e" />
        <StatTile label="Location" value={lat != null && lng != null ? `${lat.toFixed(3)}, ${lng.toFixed(3)}` : "—"} />
      </div>
    </div>
  );
}

function MotionSensor({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
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
        <Toggle checked={b(d.state.armed)} onChange={(v) => send({ armed: v })} status={st("armed")} label="Armed" />
      </ControlRow>
    </div>
  );
}

function AgriStarter({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const power = b(d.state.power_available);
  return (
    <div>
      <SectionLabel>Controls</SectionLabel>
      <ControlRow label="Pump" hint="Start / stop the irrigation pump">
        <Toggle checked={b(d.state.pump)} onChange={(v) => send({ pump: v })} status={st("pump")} label="Pump" />
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

function TankGauge({ label, pct, litres, accent, fault }: { label: string; pct: number; litres: number; accent: string; fault?: boolean }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-48 w-24 overflow-hidden rounded-2xl border border-white/15 bg-black/30">
        {/* fluid */}
        <div
          className="absolute inset-x-0 bottom-0 transition-all duration-700"
          style={{ height: `${clamped}%`, background: `linear-gradient(180deg, ${accent}cc, ${accent}66)` }}
        >
          {/* animated wave crest */}
          <div className="animate-pulse absolute inset-x-0 top-0 h-3 opacity-70" style={{ background: accent }} />
        </div>
        {/* level ticks */}
        {[25, 50, 75].map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-white/10" style={{ bottom: `${t}%` }} />
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-extrabold text-white drop-shadow">{clamped}%</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className="text-xs text-slate-400">{litres.toLocaleString("en-IN")} L{fault ? " · sensor?" : ""}</div>
      </div>
    </div>
  );
}

function WaterTank({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const oh = n(d.state.ohPct);
  const sump = n(d.state.sumpPct);
  return (
    <div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
        <div className="flex items-end justify-center gap-10">
          <TankGauge label="Overhead" pct={oh} litres={n(d.state.ohLitres)} accent="#06b6d4" fault={b(d.state.ohFault)} />
          <div className="flex flex-col items-center pb-10">
            <div className={`text-xs font-bold ${b(d.state.pump) ? "text-cyan-400" : "text-slate-500"}`}>
              {b(d.state.pump) ? "▲ PUMPING" : "IDLE"}
            </div>
            <div className="my-1 h-16 w-0.5 bg-white/15" />
            <Droplets className="h-5 w-5" style={{ color: b(d.state.pump) ? "#06b6d4" : "#475569" }} />
          </div>
          <TankGauge label="Sump" pct={sump} litres={n(d.state.sumpLitres)} accent="#22d3ee" fault={b(d.state.sumpFault)} />
        </div>
      </div>

      {b(d.state.dryRun) && <div className="mt-3"><AlertBanner text="Dry-run detected — pump cut. Reset after checking the sump/motor." /></div>}
      {b(d.state.overflow) && <div className="mt-3"><AlertBanner text="Overflow float tripped — pump stopped." /></div>}

      <SectionLabel>Controls</SectionLabel>
      <ControlRow label="Auto-fill" hint="Fill the overhead tank automatically from the sump">
        <Toggle checked={b(d.state.auto)} onChange={(v) => send({ auto: v })} status={st("auto")} label="Auto-fill" />
      </ControlRow>
      <ControlRow label="Pump" hint={b(d.state.auto) ? "Overridden by auto-fill" : "Manual pump control"}>
        <Toggle checked={b(d.state.pump)} onChange={(v) => send({ pump: v })} status={st("pump")} label="Pump" />
      </ControlRow>
      {b(d.state.dryRun) && (
        <ControlRow label="Dry-run" hint="Clear the trip once the sump has water">
          <button onClick={() => send({ action: "resetDryRun" })} className={`rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/10 active:scale-95 transition ${pendCls(st("dryRun"))}`}>Reset trip</button>
        </ControlRow>
      )}

      <SectionLabel>Auto thresholds</SectionLabel>
      <ControlRow label="Start overhead at" hint="Fill when overhead drops to this">
        <Stepper value={n(d.state.startPct, 20)} onChange={(v) => send({ startPct: v })} min={5} max={90} suffix="%" />
      </ControlRow>
      <ControlRow label="Stop overhead at" hint="Stop when overhead reaches this">
        <Stepper value={n(d.state.stopPct, 95)} onChange={(v) => send({ stopPct: v })} min={10} max={100} suffix="%" />
      </ControlRow>
      <ControlRow label="Protect sump below" hint="Never run the pump below this sump level">
        <Stepper value={n(d.state.sumpMinPct, 15)} onChange={(v) => send({ sumpMinPct: v })} min={5} max={60} suffix="%" />
      </ControlRow>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatTile label="Pump current" value={`${n(d.state.amps).toFixed(1)} A`} />
        <StatTile label="Mode" value={b(d.state.auto) ? "Auto" : "Manual"} />
      </div>
    </div>
  );
}

function RfidGate({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const open = String(d.state.barrier ?? "closed") === "open";
  const allowed = b(d.state.lastAllowed);
  return (
    <div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6 flex flex-col items-center">
        <div className={`text-3xl font-extrabold ${open ? "text-green-400" : "text-slate-300"}`}>
          {open ? "BARRIER OPEN" : "BARRIER CLOSED"}
        </div>
        <div className="mt-2 text-sm text-slate-400">
          {b(d.state.vehiclePresent) ? "🚗 Vehicle at gate" : "No vehicle detected"} · {n(d.state.tagCount)} tags enrolled
        </div>
      </div>

      <SectionLabel>Barrier</SectionLabel>
      <div className="flex gap-2.5">
        <button onClick={() => send({ action: "open" })} className={`min-h-11 flex-1 rounded-xl border border-green-500/40 bg-green-500/10 py-2.5 font-semibold text-green-300 hover:bg-green-500/20 active:scale-95 transition ${pendCls(st("barrier"))}`}>Open</button>
        <button onClick={() => send({ action: "close" })} className={`min-h-11 flex-1 rounded-xl border border-white/15 bg-black/20 py-2.5 font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition ${pendCls(st("barrier"))}`}>Close</button>
      </div>

      <SectionLabel>Last scan</SectionLabel>
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 flex items-center justify-between">
        <div>
          <div className="font-mono text-white">Tag {n(d.state.lastTag) || "—"}</div>
          <div className="text-xs text-slate-400">{n(d.state.scanCount)} scans total</div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${allowed ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"}`}>
          {allowed ? "AUTHORISED" : "DENIED"}
        </span>
      </div>
      <ControlRow label="Mode" hint="Auto opens for authorised tags">
        <Toggle checked={String(d.state.mode ?? "auto") === "auto"} onChange={(v) => send({ mode: v ? "auto" : "manual" })} status={st("mode")} label="Auto mode" />
      </ControlRow>
    </div>
  );
}

function FaceDoor({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const locked = b(d.state.locked);
  const LockIcon = locked ? Lock : LockOpen;
  return (
    <div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6 flex flex-col items-center">
        <LockIcon className="h-12 w-12" style={{ color: locked ? "#8b5cf6" : "#22c55e" }} />
        <div className={`mt-3 text-2xl font-extrabold ${locked ? "text-slate-200" : "text-green-400"}`}>{locked ? "LOCKED" : "UNLOCKED"}</div>
        <div className="mt-1 text-sm text-slate-400">
          {String(d.state.lastMethod ?? "—")}{d.state.lastName ? ` · ${String(d.state.lastName)}` : ""}
        </div>
      </div>

      <SectionLabel>Controls</SectionLabel>
      <div className="flex gap-2.5">
        <button onClick={() => send({ action: "unlock", method: "app" })} className={`min-h-11 flex-1 rounded-xl border border-green-500/40 bg-green-500/10 py-2.5 font-semibold text-green-300 hover:bg-green-500/20 active:scale-95 transition flex items-center justify-center gap-2 ${pendCls(st("locked"))}`}><LockOpen className="h-4 w-4" /> Unlock</button>
        <button onClick={() => send({ action: "lock" })} className={`min-h-11 flex-1 rounded-xl border border-white/15 bg-black/20 py-2.5 font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition flex items-center justify-center gap-2 ${pendCls(st("locked"))}`}><Lock className="h-4 w-4" /> Lock</button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatTile label="Accesses" value={String(n(d.state.accessCount))} />
        <StatTile label="Bell presses" value={String(n(d.state.bellCount))} />
      </div>
      <ControlRow label="Auto-relock" hint="Seconds before the door re-locks">
        <Stepper value={n(d.state.autoLockSec, 8)} onChange={(v) => send({ autoLockSec: v })} min={0} max={120} suffix="s" />
      </ControlRow>
    </div>
  );
}

function TouchBoard({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const { labelFor, setLabel, hasCustom, resetDevice } = useChannelLabels();
  const [editing, setEditing] = useState(false);
  const gangs = [
    { key: "g1", fallback: "Gang 1" },
    { key: "g2", fallback: "Gang 2" },
    { key: "g3", fallback: "Gang 3" },
  ];
  const onCount = gangs.filter((g) => b(d.state[g.key])).length;
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Power" value={`${n(d.state.watts).toFixed(0)} W`} />
        <StatTile label="Voltage" value={`${n(d.state.volts).toFixed(0)} V`} />
        <StatTile label="Current" value={`${n(d.state.amps).toFixed(2)} A`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatTile label="Power factor" value={n(d.state.pf).toFixed(2)} />
        <StatTile label="Energy" value={`${n(d.state.kwh).toFixed(2)} kWh`} />
      </div>

      <SectionLabel
        right={
          <span className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{onCount}/{gangs.length} on</span>
            <RenameToggle
              editing={editing}
              onToggle={() => setEditing((v) => !v)}
              onReset={hasCustom(d.id) ? () => resetDevice(d.id) : undefined}
            />
          </span>
        }
      >
        Gangs
      </SectionLabel>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {gangs.map((g) => (
          <ChannelTile
            key={g.key}
            label={labelFor(d.id, g.key, g.fallback)}
            on={b(d.state[g.key])}
            status={st(g.key)}
            onToggle={(v) => send({ [g.key]: v })}
            editing={editing}
            onRename={(name) => setLabel(d.id, g.key, name === g.fallback ? "" : name)}
          />
        ))}
      </div>
      <div className="mt-3 flex gap-2.5">
        <button onClick={() => send({ all: true })} className={`min-h-11 flex-1 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition ${pendCls(st("g1"))}`}>All on</button>
        <button onClick={() => send({ all: false })} className={`min-h-11 flex-1 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition ${pendCls(st("g1"))}`}>All off</button>
      </div>
      <SectionLabel>Backlight</SectionLabel>
      <ControlRow label="Brightness">
        <Stepper value={n(d.state.backlight, 60)} onChange={(v) => send({ backlight: v })} min={0} max={100} step={10} suffix="%" />
      </ControlRow>
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