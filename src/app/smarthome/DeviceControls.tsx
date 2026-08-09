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
  Lightbulb,
  Fan,
  Flame,
  Tv,
  Wind,
  Blinds,
  Power,
  Zap,
  Video,
  VideoOff,
  Camera as CameraIcon,
  Flashlight,
  Play,
  Square,
  Radio,
  Download,
  RefreshCcw,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { controlPlane, type Device } from "@/lib/control-plane";
import type { FieldStatus } from "@/lib/smarthome-realtime";
import { haptic } from "@/lib/smarthome-realtime";
import { useCameraFrames, useNow } from "@/lib/control-plane-live";
import {
  useChannelLabels,
  useChannelConfig,
  type ChannelConfig,
  type ChannelKind,
  type ChannelStyle,
} from "@/lib/smarthome-prefs";
import { ControlRow, SectionLabel, Toggle, Stepper, StatTile, ScenePill } from "./ui";
import { effectiveDeviceType } from "./_data/device-type";

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
  sentinel: { label: "Sentinel", icon: ShieldAlert, accent: "#ef4444", blurb: "Gas, climate & relays" },
  camera: { label: "Camera", icon: CameraIcon, accent: "#8b5cf6", blurb: "Live video & motion" },
  cctv: { label: "CCTV Camera", icon: CameraIcon, accent: "#8b5cf6", blurb: "Live video & motion" },
  doorbell: { label: "Video Doorbell", icon: CameraIcon, accent: "#8b5cf6", blurb: "Live video & motion" },
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

/** Header control that flips a channel grid between control and edit mode. */
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
          Reset
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
        {editing ? "Done" : "Customize"}
      </button>
    </span>
  );
}

/**
 * Shared plumbing for every multi-relay device: per-channel names, the
 * user-selected control model, and the momentary pulse action.
 *
 * A relay is physically just on/off, so `momentary` is implemented here rather
 * than in firmware — close the relay, then release it after the configured
 * time. That keeps one firmware image working for lights, appliances and
 * gate triggers alike.
 */
function useChannelGrid(d: Device) {
  const labels = useChannelLabels();
  const cfg = useChannelConfig();
  const [editing, setEditing] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const header = (summary: string) => (
    <span className="flex items-center gap-3">
      <span className="text-xs text-slate-400">{summary}</span>
      <RenameToggle
        editing={editing}
        onToggle={() => setEditing((v) => !v)}
        onReset={
          labels.hasCustom(d.id) || cfg.hasCustom(d.id)
            ? () => {
                labels.resetDevice(d.id);
                cfg.resetDevice(d.id);
              }
            : undefined
        }
      />
    </span>
  );

  const tile = ({
    field,
    fallback,
    on,
    status,
    set,
  }: {
    field: string;
    fallback: string;
    on: boolean;
    status: FieldStatus;
    set: (v: boolean) => void;
  }) => {
    const label = labels.labelFor(d.id, field, fallback);
    const config = cfg.configFor(d.id, field);
    return (
      <ChannelTile
        key={field}
        label={label}
        on={on}
        status={status}
        config={config}
        onToggle={set}
        onPulse={(ms) => {
          set(true);
          timers.current.push(setTimeout(() => set(false), ms));
        }}
        editor={
          editing ? (
            <ChannelEditor
              key={field}
              label={label}
              fallback={fallback}
              config={config}
              onRename={(name) => labels.setLabel(d.id, field, name === fallback ? "" : name)}
              onConfig={(patch) => cfg.setConfig(d.id, field, patch)}
            />
          ) : undefined
        }
      />
    );
  };

  return { header, tile, editing };
}

export function DeviceControls({ device, send, st }: { device: Device; send: SendFn; st: StatusFn }) {
  const generic = <GenericCapabilities d={device} send={send} st={st} />;
  // Not device.type: a board registered as a camera that reports hasCamera:false
  // is a sentinel, and rendering it camera controls it cannot honour helps
  // nobody. See _data/device-type.ts.
  switch (effectiveDeviceType(device)) {
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
    case "sentinel":
      return <Sentinel d={device} send={send} st={st} />;
    case "camera":
    case "cctv":
    case "doorbell":
      return <CameraDevice d={device} send={send} st={st} />;
    default:
      return <>{generic}<RawState d={device} /></>;
  }
}

const n = (v: unknown, dflt = 0) => (v == null || Number.isNaN(Number(v)) ? dflt : Number(v));
const b = (v: unknown) => !!v;

/** Product IDs the OV sensor family reports over SCCB. */
function sensorName(pid: number): string {
  switch (pid) {
    case 0x26: return "an OV2640";
    case 0x36: return "an OV3660";
    case 0x56: return "an OV5640";
    case 0x76: return "an OV7670";
    case 0x77: return "an OV7725";
    default: return pid ? `sensor 0x${pid.toString(16)}` : "";
  }
}

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
        <ControlRow label={caps.fan.label} hint={`${n(d.state[caps.fan.field])} / ${caps.fan.steps}`}>
          <div className="flex gap-2">
            {Array.from({ length: caps.fan.steps + 1 }, (_, i) => {
              const active = n(d.state[caps.fan!.field]) === i;
              return (
                <button
                  key={i}
                  onClick={() => send({ [caps.fan!.field]: i })}
                  aria-pressed={active}
                  aria-label={i === 0 ? "Off" : `Speed ${i}`}
                  className="h-9 w-9 rounded-lg text-sm font-semibold transition"
                  // border-white/10 and bg-white/5 were hardcoded, which is a
                  // white outline on a white surface under any light theme —
                  // the off-state steps were invisible. Tokens follow the theme.
                  style={
                    active
                      ? { background: "var(--cv-gradient)", color: "#fff", boxShadow: "var(--cv-shadow-1)" }
                      : { background: "var(--cv-card-hi)", color: "var(--cv-muted)", border: "1px solid var(--cv-border)" }
                  }
                >
                  {i}
                </button>
              );
            })}
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
  const chan = useChannelGrid(d);
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
      <SectionLabel right={chan.header(`${onCount}/4 on`)}>Channels</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {channels.map((c) =>
          chan.tile({
            field: c.key,
            fallback: c.fallback,
            on: b(d.state[c.key]),
            status: st(c.key),
            set: (v) => send({ ch: c.ch, on: v }),
          })
        )}
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

/** Icon + default name for each selectable channel model. */
const CHANNEL_KINDS: { key: ChannelKind; label: string; icon: LucideIcon }[] = [
  { key: "generic", label: "Generic switch", icon: ToggleRight },
  { key: "light", label: "Light", icon: Lightbulb },
  { key: "fan", label: "Fan", icon: Fan },
  { key: "socket", label: "Socket", icon: Plug },
  { key: "geyser", label: "Geyser / heater", icon: Flame },
  { key: "pump", label: "Pump", icon: Droplets },
  { key: "tv", label: "TV / media", icon: Tv },
  { key: "ac", label: "Air conditioner", icon: Wind },
  { key: "curtain", label: "Curtain / blind", icon: Blinds },
  { key: "gate", label: "Gate / door", icon: DoorOpen },
];

const KIND_ICON = new Map(CHANNEL_KINDS.map((k) => [k.key, k.icon]));

/**
 * Per-kind accent and motion, mirroring the app's CHANNEL_KINDS so a home reads
 * the same on both.
 *
 * Every channel used to be cyan whatever it was wired to, which threw away the
 * one thing the user had already told us. Colour carries the kind now, and the
 * motion matches what the hardware does — a fan spins, a lamp breathes, a gate
 * does neither because a gate does not idle.
 *
 * Tailwind classes are written out in full rather than composed at runtime;
 * the JIT compiler only sees literals, and a template-built class name silently
 * produces no CSS at all.
 */
const KIND_STYLE: Record<string, { ring: string; fill: string; text: string; glow: string; motion: "spin" | "breathe" | "none" }> = {
  light:   { ring: "border-amber-400/50",   fill: "bg-amber-500/15",   text: "text-amber-300",   glow: "shadow-[0_0_22px_-4px_rgba(245,158,11,0.55)]", motion: "breathe" },
  fan:     { ring: "border-cyan-400/50",    fill: "bg-cyan-500/15",    text: "text-cyan-300",    glow: "shadow-[0_0_22px_-4px_rgba(34,211,238,0.55)]",  motion: "spin" },
  socket:  { ring: "border-sky-400/50",     fill: "bg-sky-500/15",     text: "text-sky-300",     glow: "shadow-[0_0_22px_-4px_rgba(56,189,248,0.55)]",  motion: "breathe" },
  geyser:  { ring: "border-red-400/50",     fill: "bg-red-500/15",     text: "text-red-300",     glow: "shadow-[0_0_22px_-4px_rgba(239,68,68,0.55)]",   motion: "breathe" },
  pump:    { ring: "border-blue-400/50",    fill: "bg-blue-500/15",    text: "text-blue-300",    glow: "shadow-[0_0_22px_-4px_rgba(59,130,246,0.55)]",  motion: "spin" },
  tv:      { ring: "border-violet-400/50",  fill: "bg-violet-500/15",  text: "text-violet-300",  glow: "shadow-[0_0_22px_-4px_rgba(139,92,246,0.55)]",  motion: "breathe" },
  ac:      { ring: "border-teal-400/50",    fill: "bg-teal-500/15",    text: "text-teal-300",    glow: "shadow-[0_0_22px_-4px_rgba(45,212,191,0.55)]",  motion: "none" },
  curtain: { ring: "border-purple-400/50",  fill: "bg-purple-500/15",  text: "text-purple-300",  glow: "shadow-[0_0_22px_-4px_rgba(168,85,247,0.55)]",  motion: "none" },
  gate:    { ring: "border-amber-400/50",   fill: "bg-amber-500/15",   text: "text-amber-300",   glow: "shadow-[0_0_22px_-4px_rgba(245,158,11,0.55)]",  motion: "none" },
  generic: { ring: "border-cyan-400/40",    fill: "bg-cyan-500/10",    text: "text-cyan-300",    glow: "shadow-[0_0_18px_-6px_rgba(34,211,238,0.5)]",   motion: "none" },
};

const kindStyle = (kind: string) => KIND_STYLE[kind] ?? KIND_STYLE.generic;

/**
 * One relay channel, rendered according to the model the user picked for it.
 *
 * `toggle` latches like a wall switch, `button` is an appliance-style power
 * key, and `momentary` closes the relay for `pulseMs` then releases — the
 * correct behaviour for a gate trigger or motor jog, where leaving the relay
 * held would be wrong.
 */
function ChannelTile({
  label,
  on,
  status,
  config,
  onToggle,
  onPulse,
  editor,
}: {
  label: string;
  on: boolean;
  status: FieldStatus;
  config: ChannelConfig;
  onToggle: (v: boolean) => void;
  onPulse: (ms: number) => void;
  editor?: ReactNode;
}) {
  if (editor) return <>{editor}</>;

  const Icon = KIND_ICON.get(config.kind) ?? ToggleRight;
  const momentary = config.style === "momentary";
  const active = momentary ? status === "pending" : on;
  const ks = kindStyle(config.kind);

  const shell = `group relative flex min-h-[76px] items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 text-left transition active:scale-[0.98] ${
    active ? `${ks.ring} ${ks.fill} ${ks.glow}` : "border-white/10 bg-black/20 hover:bg-white/5"
  } ${status === "pending" ? "cv-pending" : ""} ${status === "confirmed" ? "cv-pop" : ""} ${
    status === "failed" ? "ring-2 ring-red-500/60" : ""
  }`;

  const caption = (
    <span className={`mt-0.5 flex items-center gap-1.5 text-xs font-medium ${active ? ks.text : "text-slate-500"}`}>
      {status === "failed" ? (
        <span className="text-red-300">Failed — tap to retry</span>
      ) : momentary ? (
        <>
          {status === "pending" ? "Triggering…" : `Pulse ${(config.pulseMs / 1000).toFixed(1)}s`}
        </>
      ) : (
        <>
          {/* The tile already reflects the commanded state optimistically, so
              the caption keeps saying On/Off and a dot signals in-flight —
              swapping it to "Switching…" made a finished action read as stuck. */}
          {on ? "On" : "Off"}
          {status === "pending" && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-70" aria-hidden />
          )}
        </>
      )}
    </span>
  );

  const body = (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition ${
          active ? `${ks.ring} ${ks.fill} ${ks.text}` : "border-white/10 bg-white/5 text-slate-400"
        }`}
        aria-hidden
      >
        {/* Motion only while the output is actually on, and only where it
            mirrors the hardware. Both keyframes are disabled under
            prefers-reduced-motion in globals.css. */}
        <Icon
          className={`h-5 w-5 ${active && ks.motion === "spin" ? "cv-spin" : ""} ${
            active && ks.motion === "breathe" ? "cv-breathe" : ""
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold text-white">{label}</span>
        {caption}
      </span>
    </span>
  );

  if (momentary) {
    return (
      <button
        type="button"
        onClick={() => {
          haptic(18);
          onPulse(config.pulseMs);
        }}
        aria-label={`Trigger ${label}`}
        aria-busy={status === "pending"}
        className={shell}
      >
        {body}
        <span
          aria-hidden
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition ${
            active ? "border-cyan-300/50 bg-cyan-400 text-slate-900" : "border-white/15 bg-white/10 text-slate-300"
          }`}
        >
          <Zap className="h-4 w-4" />
        </span>
      </button>
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
      className={shell}
    >
      {body}
      {config.style === "button" ? (
        <span
          aria-hidden
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 transition ${
            on ? "border-cyan-300 bg-cyan-400/20 text-cyan-200" : "border-white/20 bg-white/5 text-slate-400"
          }`}
        >
          <Power className="h-5 w-5" />
        </span>
      ) : (
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
      )}
    </button>
  );
}

/** Inline editor shown in place of a tile while the grid is in edit mode. */
function ChannelEditor({
  label,
  fallback,
  config,
  onRename,
  onConfig,
}: {
  label: string;
  fallback: string;
  config: ChannelConfig;
  onRename: (name: string) => void;
  onConfig: (patch: Partial<ChannelConfig>) => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-cyan-400/30 bg-cyan-500/[0.06] p-3">
      <input
        className="cv-input py-2 text-[15px] font-semibold"
        defaultValue={label}
        maxLength={32}
        aria-label={`Name for ${fallback}`}
        placeholder={fallback}
        onBlur={(e) => onRename(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            (e.target as HTMLInputElement).value = label;
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-slate-500">Type</span>
          <select
            className="cv-input py-1.5 text-sm"
            value={config.kind}
            onChange={(e) => onConfig({ kind: e.target.value as ChannelKind })}
            aria-label={`Type for ${label}`}
          >
            {CHANNEL_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-slate-500">Control</span>
          <select
            className="cv-input py-1.5 text-sm"
            value={config.style}
            onChange={(e) => onConfig({ style: e.target.value as ChannelStyle })}
            aria-label={`Control style for ${label}`}
          >
            <option value="toggle">Toggle switch</option>
            <option value="button">Power button</option>
            <option value="momentary">Momentary pulse</option>
          </select>
        </label>
      </div>
      {config.style === "momentary" && (
        <label className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2">
          <span className="text-xs text-slate-400">Pulse length</span>
          <span className="flex items-center gap-2">
            <input
              type="range"
              min={200}
              max={5000}
              step={100}
              value={config.pulseMs}
              onChange={(e) => onConfig({ pulseMs: Number(e.target.value) })}
              aria-label={`Pulse length for ${label}`}
              className="w-28"
            />
            <span className="w-12 text-right text-xs font-semibold text-slate-200">
              {(config.pulseMs / 1000).toFixed(1)}s
            </span>
          </span>
        </label>
      )}
    </div>
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
  const chan = useChannelGrid(d);
  const gangs = [
    { key: "power", fallback: "Gang 1" },
    { key: "power2", fallback: "Gang 2" },
  ];
  const onCount = gangs.filter((g) => b(d.state[g.key])).length;
  return (
    <div>
      <SectionLabel right={chan.header(`${onCount}/${gangs.length} on`)}>Gangs</SectionLabel>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {gangs.map((g) =>
          chan.tile({
            field: g.key,
            fallback: g.fallback,
            on: b(d.state[g.key]),
            status: st(g.key),
            set: (v) => send({ [g.key]: v }),
          })
        )}
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
  const chan = useChannelGrid(d);
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

      <SectionLabel right={chan.header(`${onCount}/${gangs.length} on`)}>Gangs</SectionLabel>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {gangs.map((g) =>
          chan.tile({
            field: g.key,
            fallback: g.fallback,
            on: b(d.state[g.key]),
            status: st(g.key),
            set: (v) => send({ [g.key]: v }),
          })
        )}
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

// --------------------------------------------------------------------- sentinel --
// firmware/sentinel/sentinel.ino — gas + climate safety panel with relays.
// Gas is reported as raw ADC counts and a percentage of the device's own
// clean-air baseline. An MQ-2 cannot yield a calibrated ppm without a per-gas
// curve, a known load resistance and temperature compensation, so no ppm figure
// is shown here: it would be a fabricated number on a safety device.

function Sentinel({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const chan = useChannelGrid(d);
  const s = d.state;
  const relays = Math.max(0, Math.min(32, n(s.relays, 0)));
  const hasGas = b(s.hasGas);
  const hasCamera = b(s.hasCamera);
  const alarm = b(s.gasAlarm);
  const cutMask = n(s.safetyCutMask, 0);
  const exhaust = n(s.exhaustRelay, -1);
  const chans = Array.from({ length: relays }, (_, i) => ({ key: `r${i + 1}`, fallback: `Relay ${i + 1}` }));
  const onCount = chans.filter((cch) => b(s[cch.key])).length;

  return (
    <div>
      {alarm && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5 mb-4 flex flex-col items-center text-center">
          <div className="text-red-400 font-extrabold text-lg">GAS DETECTED</div>
          <p className="mt-2 text-sm text-slate-300">
            Ventilate the room and check for a leak before clearing. The alarm latches until someone dismisses it.
          </p>
          <div className="mt-4 flex gap-2.5">
            <button
              onClick={() => send({ muted: true })}
              className={`min-h-11 rounded-xl border border-white/15 bg-black/20 px-5 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition ${pendCls(st("muted"))}`}
            >
              Silence 5 min
            </button>
            <button
              onClick={() => send({ action: "clearAlarm" })}
              className={`min-h-11 rounded-xl bg-red-500 px-5 text-sm font-semibold text-white hover:bg-red-600 active:scale-95 transition ${pendCls(st("gasAlarm"))}`}
            >
              Clear alarm
            </button>
          </div>
        </div>
      )}

      {hasGas && b(s.gasWarmingUp) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-4 text-sm text-amber-200">
          Gas sensor is warming up. An MQ-2 reads high until its heater settles, so the alarm is held off for the first 90 seconds.
        </div>
      )}

      {/* A detector that is not connected is a safety fault, not a clean
          reading. The firmware distinguishes the two (raw pinned at zero
          against an established baseline means the module has lost power or
          its analog line), and this is where that has to be said plainly —
          otherwise the tiles below show a reassuring green 0% for a sensor
          that is not there at all. */}
      {hasGas && b(s.gasFault) && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 mb-4 text-sm text-red-200">
          <b>Gas detector not responding.</b> It is reading zero against a stored baseline of{" "}
          {n(s.gasBaseline) > 0 ? n(s.gasBaseline) : "—"}, which means the module has lost power or its
          signal wire is disconnected — not that the air is clean. Gas readings below are not
          meaningful and the alarm is suppressed until it is reconnected.
        </div>
      )}

      {b(s.climateOk) ? (
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Temperature" value={`${n(s.temp).toFixed(1)}°C`} accent="#f59e0b" />
          <StatTile label="Humidity" value={`${n(s.humidity).toFixed(0)}%`} accent="#06b6d4" />
          <StatTile label="Feels like" value={`${n(s.heatIndex).toFixed(1)}°C`} />
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
          No climate reading yet — the temperature and humidity sensor has not reported.
        </div>
      )}

      {hasGas && (
        <div className="mt-3 grid grid-cols-3 gap-3">
          <StatTile
            label="Gas level"
            // Not green when the sensor is absent: 0% would read as "clean air"
            // for a detector that is not measuring anything.
            value={b(s.gasFault) ? "No sensor" : b(s.gasReady) ? `${n(s.gasPct).toFixed(0)}%` : "—"}
            accent={b(s.gasFault) ? "#ef4444" : alarm ? "#ef4444" : "#22c55e"}
          />
          <StatTile label="Raw" value={b(s.gasFault) ? "—" : b(s.gasReady) ? String(n(s.gasRaw)) : "—"} />
          <StatTile label="Baseline" value={n(s.gasBaseline) > 0 ? String(n(s.gasBaseline)) : "Not set"} />
        </div>
      )}

      {relays > 0 && (
        <>
          <SectionLabel right={chan.header(`${onCount}/${relays} on`)}>Relays</SectionLabel>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {chans.map((cch) =>
              chan.tile({
                field: cch.key,
                fallback: cch.fallback,
                on: b(s[cch.key]),
                status: st(cch.key),
                set: (v) => send({ [cch.key]: v }),
              })
            )}
          </div>
          <div className="mt-3 flex gap-2.5">
            <button onClick={() => send({ all: true })} className={`min-h-11 flex-1 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition ${pendCls(st("r1"))}`}>All on</button>
            <button onClick={() => send({ all: false })} className={`min-h-11 flex-1 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition ${pendCls(st("r1"))}`}>All off</button>
          </div>
        </>
      )}

      <SectionLabel>Modes</SectionLabel>
      <ControlRow label="Away mode" hint="Switches every relay off. Does not disable the gas alarm.">
        <Toggle checked={b(s.away)} onChange={(v) => send({ away: v })} status={st("away")} label="Away mode" />
      </ControlRow>
      <ControlRow label="Buzzer muted" hint="Expires by itself after five minutes.">
        <Toggle checked={b(s.muted)} onChange={(v) => send({ muted: v })} status={st("muted")} label="Buzzer muted" />
      </ControlRow>

      {hasGas && relays > 0 && (
        <>
          <SectionLabel>On gas alarm</SectionLabel>
          <p className="mb-3 text-sm text-slate-400">
            Choose which appliances are cut when gas is detected, and which relay drives an exhaust fan.
          </p>
          {chans.map((cch, i) => (
            <ControlRow key={`cut-${cch.key}`} label={`Cut ${cch.fallback}`}>
              <Toggle
                checked={(cutMask & (1 << i)) !== 0}
                onChange={(v) => send({ safetyCutMask: v ? cutMask | (1 << i) : cutMask & ~(1 << i) })}
                status={st("safetyCutMask")}
                label={`Cut ${cch.fallback}`}
              />
            </ControlRow>
          ))}
          <ControlRow label="Exhaust fan relay">
            <div className="flex flex-wrap gap-2">
              {[-1, ...chans.map((_, i) => i)].map((r) => (
                <button
                  key={r}
                  onClick={() => send({ exhaustRelay: r })}
                  aria-pressed={exhaust === r}
                  className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition active:scale-95 ${
                    exhaust === r
                      ? "border-transparent bg-cyan-500 text-slate-950"
                      : "border-white/15 bg-black/20 text-slate-200 hover:bg-white/10"
                  }`}
                >
                  {r < 0 ? "None" : `Relay ${r + 1}`}
                </button>
              ))}
            </div>
          </ControlRow>
        </>
      )}

      {hasCamera && (
        <>
          <SectionLabel>Camera</SectionLabel>
          <ControlRow label="Live stream">
            <Toggle checked={b(s.streaming)} onChange={(v) => send({ streaming: v })} status={st("streaming")} label="Live stream" />
          </ControlRow>
          {!b(s.cameraReady) && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Camera did not initialise. Power-cycle the device; if it persists the module may be unseated.
            </div>
          )}
        </>
      )}

      <SectionLabel>Maintenance</SectionLabel>
      <div className="flex flex-wrap gap-2.5">
        <button onClick={() => send({ action: "test" })} className="min-h-11 rounded-xl border border-white/15 bg-black/20 px-4 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition">
          Test siren
        </button>
        {hasGas && (
          <button
            onClick={() => {
              // Calibration makes the current air the new "normal". Doing it
              // near a leak trains the sensor to ignore that leak, so this
              // asks first rather than making it a one-tap mistake.
              if (window.confirm("Only calibrate when the room is well ventilated. Whatever the sensor smells right now becomes its idea of normal. Continue?")) {
                send({ action: "calibrateGas" });
              }
            }}
            className="min-h-11 rounded-xl border border-white/15 bg-black/20 px-4 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition"
          >
            Calibrate gas sensor
          </button>
        )}
        <button onClick={() => send({ action: "recalibrateTouch" })} className="min-h-11 rounded-xl border border-white/15 bg-black/20 px-4 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition">
          Recalibrate touch pads
        </button>
      </div>
      {typeof s.lastSource === "string" && s.lastSource && (
        <p className="mt-3 text-xs text-slate-500">Last change by {SENTINEL_SOURCE[s.lastSource] ?? s.lastSource}</p>
      )}
    </div>
  );
}

/** How the firmware describes what last moved a relay. */
const SENTINEL_SOURCE: Record<string, string> = {
  touch: "the touch panel",
  cloud: "the app",
  schedule: "a schedule",
  "gas-alarm": "the gas alarm",
  "auto-off": "an auto-off timer",
  restore: "power being restored",
  "away-mode": "away mode",
};

// ---------------------------------------------------------------------- camera --
// ESP32-CAM (firmware/camera/camera.ino). Frames never touch telemetry — they
// ride a dedicated MQTT topic the API relays straight to watching WebSocket
// clients, so the viewport below is fed by useCameraFrames rather than by
// device state. Only the settings and counters come from state.

const RESOLUTIONS: { id: string; label: string; psram?: boolean }[] = [
  { id: "QQVGA", label: "160 × 120" },
  { id: "QVGA", label: "320 × 240" },
  { id: "CIF", label: "400 × 296" },
  { id: "VGA", label: "640 × 480" },
  { id: "SVGA", label: "800 × 600", psram: true },
  { id: "XGA", label: "1024 × 768", psram: true },
  { id: "SXGA", label: "1280 × 1024", psram: true },
  { id: "UXGA", label: "1600 × 1200", psram: true },
];

/** Seconds without a frame before a "streaming" camera is called stalled. */
const STALL_AFTER_MS = 5000;

/**
 * How often to re-arm a live stream. The firmware's window is 20 s
 * (STREAM_TTL_MS in firmware/camera/camera.ino); re-arming at 7 s survives two
 * lost commands before the picture drops.
 */
const STREAM_REARM_MS = 7000;

function uptimeLabel(sec: number): string {
  if (sec <= 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${Math.floor(sec)}s`;
}

function signalLabel(rssi: number): { text: string; accent: string } {
  if (rssi === 0) return { text: "—", accent: "var(--cv-muted)" };
  if (rssi >= -60) return { text: "Excellent", accent: "#22c55e" };
  if (rssi >= -70) return { text: "Good", accent: "#22c55e" };
  if (rssi >= -80) return { text: "Fair", accent: "#f59e0b" };
  return { text: "Weak", accent: "#ef4444" };
}

interface LiveFrame {
  src: string;
  at: number;
  bytes: number;
}

function CameraDevice({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const streaming = b(d.state.streaming);
  const ready = d.state.ready == null ? true : b(d.state.ready);
  const psram = b(d.state.psram);
  const motionOn = b(d.state.motion);
  const motionActive = b(d.state.motionActive);
  const flash = n(d.state.flash);

  /**
   * Whether this unit actually has a camera.
   *
   * A board flashed with sentinel firmware reports hasCamera:false — it is a
   * gas/relay unit with no sensor fitted. If it was registered as type
   * "camera" (a wrong pick in Add Device, which nothing validated), this panel
   * would sit on "Waiting for the first frame…" forever while the device
   * looked perfectly healthy, and every layer in between would be blamed
   * before the hardware was. The device tells us; we should listen.
   */
  const hasCamera = d.state.hasCamera == null ? true : b(d.state.hasCamera);

  const [frame, setFrame] = useState<LiveFrame | null>(null);
  const [fps, setFps] = useState(0);
  const stamps = useRef<number[]>([]);

  // Watch continuously rather than only while streaming: a snapshot is
  // published on the same frame topic, so a viewer that only subscribes during
  // a live stream would silently never receive one.
  useCameraFrames(d.online ? d.id : null, (f) => {
    const now = Date.now();
    stamps.current = [...stamps.current, now].filter((t) => now - t <= 2000);
    setFps(stamps.current.length > 1 ? Math.round((stamps.current.length - 1) / 2) : 0);
    setFrame({ src: `data:image/jpeg;base64,${f.jpeg}`, at: now, bytes: f.bytes });
  });

  // Drives the stall check and the "last frame" age without re-rendering on
  // every frame for the sake of a clock.
  const now = useNow(1000, d.online);
  const age = frame ? now - frame.at : Infinity;
  const stalled = streaming && age > STALL_AFTER_MS;
  const showingLive = streaming && !stalled && !!frame;

  // Keep-alive. The firmware arms the stream for STREAM_TTL_MS (20 s) and then
  // shuts it off on its own, deliberately, so a closed tab or a dead phone
  // cannot leave a board streaming until it browns out. That makes re-arming
  // the viewer's job: without this the picture simply stops after 20 seconds
  // and never comes back. Mobile has always done this; the web never did.
  useEffect(() => {
    if (!d.online || !streaming) return;
    const arm = () => {
      void controlPlane.command(d.id, { action: "stream", on: true });
    };
    arm();
    const t = setInterval(arm, STREAM_REARM_MS);
    return () => clearInterval(t);
  }, [d.online, d.id, streaming]);

  const download = () => {
    if (!frame) return;
    const a = document.createElement("a");
    a.href = frame.src;
    a.download = `${d.name || d.id}-${new Date(frame.at).toISOString().replace(/[:.]/g, "-")}.jpg`;
    a.click();
  };

  const setRes = (value: string) => send({ resolution: value });

  return (
    <div>
      {/* Viewport. Aspect ratio is reserved up front so switching resolution
          never reflows the page around it. */}
      <div
        className="relative w-full overflow-hidden rounded-2xl border"
        style={{
          aspectRatio: "4 / 3",
          background: "#000",
          borderColor: motionActive ? "rgba(239,68,68,0.55)" : "var(--cv-border)",
        }}
      >
        {frame ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={frame.src}
            alt={`Live view from ${d.name || d.id}`}
            className="h-full w-full object-contain"
            style={{ transform: n(d.state.rotation) === 180 ? "rotate(180deg)" : undefined }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <VideoOff className="h-10 w-10" style={{ color: "#475569" }} />
            <p className="text-sm font-medium" style={{ color: "#94a3b8" }}>
              {!d.online
                ? "Camera is offline"
                : !ready
                  ? "Camera sensor failed to initialise"
                  : streaming
                    ? "Waiting for the first frame…"
                    : "Live view is off"}
            </p>
            {d.online && ready && !streaming && (
              <button
                onClick={() => {
                  haptic();
                  send({ action: "stream", on: true });
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition active:scale-95"
                style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
              >
                <Play className="h-4 w-4" /> Start live view
              </button>
            )}
          </div>
        )}

        {/* Status overlay */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur"
            style={{
              background: showingLive ? "rgba(239,68,68,0.85)" : "rgba(15,23,42,0.75)",
              color: showingLive ? "#fff" : "#cbd5e1",
            }}
          >
            <Radio className="h-3 w-3" />
            {showingLive ? "Live" : stalled ? "Stalled" : frame ? "Still" : "Idle"}
          </span>
          {motionActive && (
            <span
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur"
              style={{ background: "rgba(239,68,68,0.85)", color: "#fff" }}
            >
              <ScanLine className="h-3 w-3" /> Motion
            </span>
          )}
        </div>

        {frame && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-medium"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)", color: "#e2e8f0" }}
          >
            <span>
              {String(d.state.resolution ?? "VGA")} · {(frame.bytes / 1024).toFixed(0)} KB
              {showingLive && fps > 0 ? ` · ${fps} fps` : ""}
            </span>
            <span>
              {age < 2000 ? "just now" : `${Math.round(age / 1000)}s ago`}
            </span>
          </div>
        )}
      </div>

      {!hasCamera && (
        <div className="mt-3">
          <AlertBanner text="This board reports that it has no camera fitted — it is running gas/relay firmware. It was most likely registered as the wrong device type; change the type in Settings and the correct controls will appear. No video will ever arrive from this unit." />
        </div>
      )}
      {hasCamera && stalled && ready && (
        <div className="mt-3">
          <AlertBanner text="Streaming is on but no frames are arriving. Check the camera's signal, then try Reboot." />
        </div>
      )}
      {hasCamera && !ready && d.online && (
        <div className="mt-3">
          {/* The firmware distinguishes two very different faults, so say which
              one it is. SCCB runs on SIOD/SIOC alone while frame data rides
              eleven other pins, so a sensor that still answers a register read
              while no frame ever completes localises the fault to the parallel
              bus — and that is a ribbon, not a module and not software. Telling
              someone "the sensor is not responding" when it demonstrably is
              sends them replacing the wrong part. */}
          <AlertBanner
            text={
              d.state.sccbOk === true
                ? `The sensor is alive — it answers on the control bus${
                    n(d.state.sensorPid) ? ` and identifies as ${sensorName(n(d.state.sensorPid))}` : ""
                  } — but no frame ever completes. That isolates the fault to the parallel data lines, so it is the ribbon rather than the module: power the board down, unlatch the connector, reseat the cable fully and latch it, then reboot. Frame size makes no difference to this, so lowering the resolution will not help.`
                : d.state.sccbOk === false
                  ? "The sensor does not answer at all, so the module is unpowered, unseated or dead. Reseat the ribbon; if that changes nothing the camera module needs replacing."
                  : "The camera sensor is not responding. Check the ribbon cable seating, then reboot."
            }
          />
        </div>
      )}

      {/* Primary actions */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          onClick={() => {
            haptic();
            send({ action: "stream", on: !streaming });
          }}
          disabled={!d.online || !ready}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40 ${pendCls(st("streaming"))}`}
          style={{
            background: streaming ? "rgba(239,68,68,0.15)" : "var(--cv-card-hi)",
            borderColor: streaming ? "rgba(239,68,68,0.45)" : "var(--cv-border)",
            color: streaming ? "#f87171" : "var(--cv-text)",
          }}
        >
          {streaming ? <Square className="h-4 w-4" /> : <Video className="h-4 w-4" />}
          {streaming ? "Stop" : "Live view"}
        </button>
        <button
          onClick={() => {
            haptic();
            send({ action: "snapshot" });
          }}
          disabled={!d.online || !ready}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
          style={{ background: "var(--cv-card-hi)", borderColor: "var(--cv-border)", color: "var(--cv-text)" }}
        >
          <CameraIcon className="h-4 w-4" /> Snapshot
        </button>
        <button
          onClick={download}
          disabled={!frame}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
          style={{ background: "var(--cv-card-hi)", borderColor: "var(--cv-border)", color: "var(--cv-text)" }}
        >
          <Download className="h-4 w-4" /> Save
        </button>
        <button
          onClick={() => {
            haptic();
            send({ action: "reboot" });
          }}
          disabled={!d.online}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
          style={{ background: "var(--cv-card-hi)", borderColor: "var(--cv-border)", color: "var(--cv-text)" }}
        >
          <RefreshCcw className="h-4 w-4" /> Reboot
        </button>
      </div>

      <SectionLabel>Image</SectionLabel>
      <ControlRow label="Resolution" hint={psram ? undefined : "Higher modes need PSRAM"}>
        <select
          className="cv-input min-h-11 w-[150px]"
          value={String(d.state.resolution ?? "VGA")}
          onChange={(e) => setRes(e.target.value)}
          aria-label="Camera resolution"
        >
          {RESOLUTIONS.map((r) => (
            <option key={r.id} value={r.id} disabled={r.psram && !psram}>
              {r.label}
              {r.psram && !psram ? " — needs PSRAM" : ""}
            </option>
          ))}
        </select>
      </ControlRow>
      <ControlRow label="Quality" hint="Lower is sharper but uses more bandwidth">
        <Stepper
          value={n(d.state.quality, 12)}
          onChange={(v) => send({ quality: v })}
          min={4}
          max={63}
          step={2}
        />
      </ControlRow>
      <ControlRow label="Frame rate">
        <Stepper
          value={n(d.state.fps, 8)}
          onChange={(v) => send({ fps: v })}
          min={1}
          max={15}
          step={1}
          suffix=" fps"
        />
      </ControlRow>
      <ControlRow label="Rotate 180°" hint="For ceiling-mounted cameras">
        <Toggle
          checked={n(d.state.rotation) === 180}
          onChange={(v) => send({ rotation: v ? 180 : 0 })}
          status={st("rotation")}
          label="Rotate 180 degrees"
        />
      </ControlRow>

      <SectionLabel>Illumination</SectionLabel>
      <ControlRow label="Flash" hint="On-board LED brightness">
        <Stepper
          value={flash}
          onChange={(v) => send({ action: "flash", level: v })}
          min={0}
          max={100}
          step={10}
          suffix="%"
        />
      </ControlRow>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => send({ action: "flash", level: 0 })}
          className="min-h-11 flex-1 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 active:scale-95"
        >
          Off
        </button>
        <button
          onClick={() => send({ action: "flash", level: 100 })}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 active:scale-95"
        >
          <Flashlight className="h-4 w-4" /> Full
        </button>
      </div>

      <SectionLabel>Motion detection</SectionLabel>
      <ControlRow label="Enabled" hint="Publishes an event and can trigger automations">
        <Toggle
          checked={motionOn}
          onChange={(v) => send({ motion: v })}
          status={st("motion")}
          label="Motion detection"
        />
      </ControlRow>
      {motionOn && (
        <ControlRow label="Sensitivity" hint="Higher reacts to smaller changes">
          <Stepper
            value={n(d.state.sensitivity, 45)}
            onChange={(v) => send({ sensitivity: v })}
            min={1}
            max={100}
            step={5}
          />
        </ControlRow>
      )}

      <SectionLabel>Health</SectionLabel>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Frames sent" value={n(d.state.frames).toLocaleString()} />
        <StatTile
          label="Dropped"
          value={n(d.state.dropped).toLocaleString()}
          accent={n(d.state.dropped) > 0 ? "#f59e0b" : undefined}
        />
        <StatTile label="Snapshots" value={n(d.state.snapshots).toLocaleString()} />
        <StatTile
          label="Motion events"
          value={n(d.state.motionCount).toLocaleString()}
          accent={motionActive ? "#ef4444" : undefined}
        />
        <StatTile label="Uptime" value={uptimeLabel(n(d.state.uptime))} />
        <StatTile
          label="Signal"
          value={signalLabel(n(d.state.rssi)).text}
          accent={signalLabel(n(d.state.rssi)).accent}
          hint={n(d.state.rssi) ? `${n(d.state.rssi)} dBm` : undefined}
        />
        <StatTile label="PSRAM" value={psram ? "Yes" : "No"} accent={psram ? "#22c55e" : "#f59e0b"} />
        <StatTile
          label="Sensor"
          value={ready ? "Ready" : "Fault"}
          accent={ready ? "#22c55e" : "#ef4444"}
        />
      </div>
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