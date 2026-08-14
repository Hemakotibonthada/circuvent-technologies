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
  Sun,
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
  Circle,
  HardDrive,
  Trash2,
  Mic,
  Ear,
  Volume2,
  ScanBarcode,
  Plane,
  ScanSearch,
  Crosshair,
  ShieldCheck,
  Ban,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
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
import { Slider } from "./_kit/Slider";
import { FAN_STEP_LEVEL, levelToSpeed, buildFieldCommand } from "@/lib/smarthome-command-map";
import { effectiveDeviceType } from "./_data/device-type";
import { useRemoteCamera } from "./useRemoteCamera";
import { useFrameUrl } from "./useFrameUrl";
import { chooseTarget, startRecording, MEMORY_CLIP_MAX_BYTES, type Recorder } from "./recording";
import { useCameraListen, useCameraTalk } from "./useCameraAudio";
import { useControlPlaneCapability, stalePlaneAdvice } from "@/lib/control-plane-health";
import { readTankLink, tankLevelText, formatAge, type TankDeviceState } from "@/lib/tank-link";
import { LevelSlider, PowerDial, SlideToConfirm } from "./_kit/controls";
import FacePanel from "./FacePanel";

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
  /*
   * Four shipped products that the console did not know existed.
   *
   * All four are sold in the shop, have firmware, and are offered by Add
   * Device — but were absent here, so the console fell back to showing the raw
   * type slug as the name. A customer's Circuvent Smart Light appeared in their
   * own dashboard as "smart-light" with a generic chip icon. Icons match the
   * phone's (lightbulb, fan, curtains, lock) so the same device does not look
   * like two different things on two screens.
   */
  "smart-light": { label: "Smart Light", icon: Lightbulb, accent: "#f59e0b", blurb: "Dimmable, colour" },
  "smart-fan": { label: "Smart Fan", icon: Fan, accent: "#22d3ee", blurb: "Variable speed" },
  curtain: { label: "Curtain", icon: Blinds, accent: "#8b5cf6", blurb: "Motorised curtain" },
  "smart-lock": { label: "Smart Lock", icon: Lock, accent: "#10b981", blurb: "Keyless entry" },
  "smart-switch": { label: "Smart Switch", icon: ToggleRight, accent: "#8b5cf6", blurb: "2-gang wall switch" },
  "energy-monitor": { label: "Energy Monitor", icon: Gauge, accent: "#f59e0b", blurb: "Whole-home metering" },
  meter: { label: "Energy Meter", icon: Gauge, accent: "#f59e0b", blurb: "True-power metering, 1 or 3 phase" },
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
  "anpr-cam": { label: "ANPR Camera", icon: ScanBarcode, accent: "#0ea5e9", blurb: "Reads vehicle number plates" },
  "drone-link": { label: "Drone Link", icon: Plane, accent: "#6366f1", blurb: "Flight telemetry & mission bridge" },
  "drone-x1": { label: "Drone X1", icon: Plane, accent: "#6366f1", blurb: "Circuvent flight stack" },
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
    case "meter":
      return <EnergyMeter d={device} send={send} st={st} />;
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
    case "anpr-cam":
      return <AnprCamera d={device} send={send} st={st} />;
    case "drone-link":
    case "drone-x1":
      return <DroneLink d={device} send={send} st={st} />;
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
  fan?: { field: string; label: string; steps: number; legacyField?: string };
  color?: { field: string };
  thermostat?: { field: string; label: string; min: number; max: number };
  /** A bolt, not a switch: true is locked. */
  lock?: { field: string; label: string };
  /** How far open something is, 0 closed to 100 open. */
  position?: { field: string; label: string; min: number; max: number };
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
    case "smart-light":
    case "light":
      /*
       * Both spellings. Add Device registers lights as "smart-light" — the
       * name the firmware directory, the shop listing and the command map all
       * use — while this table listed only the bare alias, so every light
       * actually in the field fell through to the default and was given a
       * power button and nothing else. The dimmer and the colour picker were
       * built, the command map understood them, the hardware implemented them,
       * and no one could reach them.
       *
       * Deliberately no colour-temperature control: the command map will
       * happily build a `cct` command, but firmware/smart-light implements
       * only `brightness` and `color` and silently drops anything else, so a
       * CCT slider would move, report success and change nothing.
       */
      return { power: { field: "power", label: "Power" }, dimmer: { field: "brightness", label: "Brightness", min: 0, max: 100 }, color: { field: "color" } };
    case "smart-fan":
    case "fan":
    case "ceiling-fan":
      // `level` is the continuous 0..100 the hardware always had; `speed` is
      // the four-position table it used to be limited to. buildFieldCommand
      // sends both, so this slider works on a fan that has not been updated.
      return { power: { field: "power", label: "Power" }, fan: { field: "level", label: "Speed", steps: 3, legacyField: "speed" } };
    case "thermostat":
    case "ac":
      return { power: { field: "power", label: "Power" }, thermostat: { field: "target", label: "Target", min: 16, max: 30 } };
    /*
     * Deliberately no `power` on either of these.
     *
     * The command map refuses to build a power command for a lock or a
     * curtain, because neither has one — the lock has a bolt and the curtain
     * has a position. Declaring one anyway would render a toggle that builds
     * nothing: a switch that moves, reports success and does not touch the
     * hardware.
     */
    case "smart-lock":
      // `locked` true/false becomes action lock/unlock, both of which
      // firmware/smart-lock handles alongside a plain { locked } set.
      return { lock: { field: "locked", label: "Deadbolt" } };
    case "curtain":
      return { position: { field: "position", label: "Position", min: 0, max: 100 } };
    default:
      return { power: { field: "power", label: "Power" } };
  }
}

export function primaryPowerField(type: string): string {
  return capabilities(type).power?.field ?? "power";
}

/**
 * Where the slider sits for a fan.
 *
 * A fan running current firmware reports `level`. One that has not been
 * updated reports only `speed`, so the level is reconstructed from the same
 * step table both sides use — otherwise the slider would sit at zero on a fan
 * that is running, and the first touch would appear to jump it.
 */
export function fanLevel(d: Device, cap: { field: string; legacyField?: string }): number {
  const raw = d.state[cap.field];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const legacy = cap.legacyField ? d.state[cap.legacyField] : undefined;
  if (typeof legacy === "number" && Number.isFinite(legacy)) {
    return FAN_STEP_LEVEL[Math.max(0, Math.min(3, Math.round(legacy)))] ?? 0;
  }
  return 0;
}

/** "Off", or a percentage with the nearest named step, e.g. "48% · Low". */
export function fanHint(d: Device, cap: { field: string; legacyField?: string }): string {
  const level = fanLevel(d, cap);
  if (level <= 0) return "Off";
  const names = ["Off", "Low", "Medium", "High"];
  return `${level}% · ${names[levelToSpeed(level)]}`;
}

function GenericCapabilities({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const caps = capabilities(d.type);
  /*
   * Decided by capability, not by a second list of type names.
   *
   * There used to be a `genericTypes` whitelist beside this check. It named
   * "light" and "fan" but not "smart-light"/"smart-fan", the names devices are
   * actually registered under — the same omission that left the capability
   * table itself blind to them. Every type it listed already reports a rich
   * capability, so it decided nothing and only offered a second place to
   * forget a device.
   */
  if (!caps.dimmer && !caps.fan && !caps.color && !caps.thermostat && !caps.lock && !caps.position) return null;
  const colors = ["#ffffff", "#f87171", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#60a5fa", "#a78bfa"];
  const accent = DEVICE_META[d.type]?.accent || "var(--cv-accent)";
  const powerOn = caps.power ? b(d.state[caps.power.field]) : true;

  /*
   * Continuous things get a column you drag, not a rail with a thumb.
   *
   * These are grouped into one row so a lamp with brightness and a fan with
   * speed read as the same kind of object, and so the primary control is the
   * biggest thing on the panel rather than a 16px handle somewhere in it.
   */
  const columns: React.ReactNode[] = [];
  if (caps.dimmer) {
    columns.push(
      <LevelSlider
        key="dim"
        label={caps.dimmer.label}
        icon={Sun}
        accent={accent}
        value={n(d.state[caps.dimmer.field])}
        min={caps.dimmer.min}
        max={caps.dimmer.max}
        status={st(caps.dimmer.field)}
        off={caps.power ? !powerOn : false}
        // Streams while dragging so the lamp follows the finger, and commits
        // once on release. The command map coalesces the stream; what must not
        // happen is a hundred separate publishes from one gesture.
        onChange={(v) => send({ [caps.dimmer!.field]: v })}
        onCommit={(v) => send({ [caps.dimmer!.field]: v })}
      />,
    );
  }
  if (caps.fan) {
    columns.push(
      <LevelSlider
        key="fan"
        label={caps.fan.label}
        icon={Fan}
        accent={accent}
        value={fanLevel(d, caps.fan)}
        min={0}
        max={100}
        status={st(caps.fan.field)}
        off={caps.power ? !powerOn : false}
        // Named, because "Medium" is the setting somebody asked for where 66%
        // is a number they have to translate.
        valueText={(v) => (v <= 0 ? "Off" : v <= 33 ? "Low" : v <= 66 ? "Medium" : "High")}
        onChange={(v) => send({ [caps.fan!.field]: v })}
        onCommit={(v) => send({ [caps.fan!.field]: v })}
      />,
    );
  }
  if (caps.position) {
    columns.push(
      <LevelSlider
        key="pos"
        label={caps.position.label}
        icon={Blinds}
        accent={accent}
        value={n(d.state[caps.position.field])}
        min={caps.position.min}
        max={caps.position.max}
        status={st(caps.position.field)}
        valueText={(v) => (v <= 0 ? "Closed" : v >= 100 ? "Open" : `${Math.round(v)}% open`)}
        /*
         * Position commits only on release. A curtain takes seconds to travel,
         * so streaming would have the motor chasing a position the user left
         * long ago — the one case where following the finger is wrong.
         */
        onChange={() => {}}
        onCommit={(v) => send({ [caps.position!.field]: v })}
      />,
    );
  }

  return (
    <div className="mb-5">
      <SectionLabel>Smart controls</SectionLabel>

      {(caps.power || columns.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center justify-center gap-6 rounded-2xl border border-white/10 bg-black/20 p-5">
          {caps.power && (
            <PowerDial
              on={powerOn}
              onToggle={() => send({ [caps.power!.field]: !powerOn })}
              level={caps.dimmer ? n(d.state[caps.dimmer.field]) : caps.fan ? fanLevel(d, caps.fan) : null}
              label={d.name}
              accent={accent}
              status={st(caps.power.field)}
              disabled={!d.online}
            />
          )}
          {columns}
        </div>
      )}

      {caps.lock && (
        <div className="mb-4">
          {/*
            A gesture, not a switch.
            
            masterPower deliberately gives locks no one-tap control so an
            accidental tap in a list cannot open a front door — but the device
            page had a plain toggle, which is still one tap. Unlocking is not
            the same class of action as turning on a lamp, and it should not
            have the same control. Locking stays a single tap: making the safe
            direction harder helps nobody.
          */}
          {b(d.state[caps.lock.field]) ? (
            <SlideToConfirm
              label={`Slide to unlock ${d.name}`}
              hint="Deliberately harder than a tap"
              icon={LockOpen}
              accent="#f59e0b"
              disabled={!d.online}
              status={st(caps.lock.field)}
              onConfirm={() => send({ [caps.lock!.field]: false })}
            />
          ) : (
            <button
              type="button"
              disabled={!d.online}
              onClick={() => send({ [caps.lock!.field]: true })}
              className={`flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-45 ${pendCls(st(caps.lock.field))}`}
            >
              <Lock className="h-4 w-4" /> Lock {d.name}
            </button>
          )}
        </div>
      )}

      {caps.color && (
        <ControlRow label="Colour">
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => {
              const active = String(d.state[caps.color!.field] ?? "").toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  onClick={() => send({ [caps.color!.field]: c })}
                  aria-label={`Colour ${c}`}
                  aria-pressed={active}
                  // Explicit pixels, not a rem-based utility: globals.css
                  // rescales the root font below 640px, so a rem 44px target
                  // renders at about 42 on exactly the widths where it matters.
                  className="flex h-[44px] w-[44px] items-center justify-center rounded-full transition active:scale-90"
                  style={{ background: active ? "rgba(255,255,255,0.14)" : "transparent" }}
                >
                  <span
                    className={`block rounded-full border transition-all ${active ? "h-7 w-7 border-white" : "h-6 w-6 border-white/30"}`}
                    style={{ background: c }}
                  />
                </button>
              );
            })}
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
          className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition"
        >
          All on
        </button>
        <button
          onClick={() => send({ relays: [false, false, false, false] })}
          className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition"
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
          className={`grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full border-2 transition ${
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

/**
 * Circuvent Energy Meter (cv-em1 / cv-em3).
 *
 * Distinct from EnergyMonitor above, which reads a CT clamp and assumes 230 V
 * at a power factor of 0.95. This board measures voltage, current and true
 * active power, so the power factor is a reading rather than an assumption —
 * and on the loads people actually want measured, a fan on a triac or an LED
 * driver, that assumption is what makes the older device wrong.
 *
 * Which means the power factor is worth showing prominently: it is the number
 * that says whether the reading can be trusted, and it is the one an assuming
 * meter cannot produce at all.
 */
function EnergyMeter({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const channels = Math.max(1, Math.min(3, n(d.state.channels, 1)));
  const volts = n(d.state.volts);
  const total = n(d.state.wattsTotal, n(d.state.watts));

  /*
   * Channel keys are `watts`, `watts2`, `watts3` — not watts0/1/2.
   *
   * chKey() in the sketch writes the bare name for channel 0 and appends i+1
   * after that, so a one-channel board publishes exactly the same keys as an
   * older single-phase device. Reading `watts0` finds nothing on every board,
   * which is the shape of a panel that shows a working meter as reading zero.
   */
  const ch = (base: string, i: number) => n(d.state[i === 0 ? base : `${base}${i + 1}`]);

  const [calOpen, setCalOpen] = useState(false);
  const [trueWatts, setTrueWatts] = useState("");
  const [trueVolts, setTrueVolts] = useState("");
  const [trueAmps, setTrueAmps] = useState("");

  const calibrate = () => {
    /*
     * Built through buildFieldCommand rather than assembled here, so this
     * inherits the contract's refusals — a trim against zero or a non-number
     * would divide the multiplier into nothing, and the meter would come back
     * confidently wrong. One command per quantity, which is also how the
     * contract is specified and tested.
     */
    const trims: [string, string][] = [
      ["calibrateWatts", trueWatts],
      ["calibrateVolts", trueVolts],
      ["calibrateAmps", trueAmps],
    ];

    let sent = 0;
    for (const [field, raw] of trims) {
      const value = parseFloat(raw);
      if (!isFinite(value)) continue;
      const cmd = buildFieldCommand("meter", field, value);
      if (cmd) {
        send(cmd as Record<string, unknown>);
        sent += 1;
      }
    }

    /* Nothing usable typed means nothing sent, and the panel stays open rather
       than closing on a calibration that never happened. */
    if (sent === 0) return;

    setCalOpen(false);
    setTrueWatts("");
    setTrueVolts("");
    setTrueAmps("");
  };

  return (
    <div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6 flex flex-col items-center">
        <div className="text-6xl font-extrabold" style={{ color: "#f59e0b" }}>
          {total.toFixed(0)}
          <span className="text-2xl text-slate-400"> W</span>
        </div>
        <div className="text-slate-500 text-sm mt-2">
          {channels > 1 ? `Total across ${channels} channels` : "Active power"}
          {volts > 0 ? ` · ${volts.toFixed(1)} V` : ""}
        </div>
      </div>

      <SectionLabel>{channels > 1 ? "Channels" : "Reading"}</SectionLabel>
      <div className="space-y-2">
        {Array.from({ length: channels }, (_, i) => {
          const w = ch("watts", i);
          const a = ch("amps", i);
          const kwh = ch("kwh", i);
          const pf = ch("pf", i);
          return (
            <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-slate-300">
                  {channels > 1 ? `Channel ${i + 1}` : "Load"}
                </span>
                <span className="text-lg font-bold text-amber-300">{w.toFixed(0)} W</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-400">
                <span>{a.toFixed(3)} A</span>
                <span>{kwh.toFixed(3)} kWh</span>
                <span
                  title="Power factor. Below about 0.5 the load is heavily reactive — a motor starting, or a cheap driver."
                  style={{ color: pf > 0 && pf < 0.5 ? "#fbbf24" : undefined }}
                >
                  PF {pf > 0 ? pf.toFixed(2) : "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <SectionLabel>Calibration</SectionLabel>
      {!calOpen ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[12px] text-slate-400">
            A shunt is several percent out of tolerance on its own. Trimming against a load whose
            true consumption you know is the difference between a meter that is roughly right and
            one you could bill against.
          </p>
          <button
            onClick={() => setCalOpen(true)}
            className="mt-2 min-h-[40px] rounded-xl border border-white/15 bg-black/20 px-4 text-sm font-semibold text-slate-200 hover:bg-white/10"
          >
            Calibrate
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-3">
          <p className="text-[12px] text-amber-200">
            Run a load you know the true value of — a resistive heater is ideal, an incandescent
            lamp is close enough — then enter what it actually draws. Leave a box empty to leave
            that trim alone.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <label className="text-[11px] text-slate-400">
              True watts
              <input
                inputMode="decimal"
                value={trueWatts}
                onChange={(e) => setTrueWatts(e.target.value)}
                placeholder={total > 0 ? total.toFixed(0) : "1000"}
                className="mt-1 h-[38px] w-full rounded-lg border border-white/15 bg-black/30 px-2 text-sm text-white"
              />
            </label>
            <label className="text-[11px] text-slate-400">
              True volts
              <input
                inputMode="decimal"
                value={trueVolts}
                onChange={(e) => setTrueVolts(e.target.value)}
                placeholder={volts > 0 ? volts.toFixed(0) : "230"}
                className="mt-1 h-[38px] w-full rounded-lg border border-white/15 bg-black/30 px-2 text-sm text-white"
              />
            </label>
            <label className="text-[11px] text-slate-400">
              True amps
              <input
                inputMode="decimal"
                value={trueAmps}
                onChange={(e) => setTrueAmps(e.target.value)}
                placeholder={ch("amps", 0).toFixed(2)}
                className="mt-1 h-[38px] w-full rounded-lg border border-white/15 bg-black/30 px-2 text-sm text-white"
              />
            </label>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={calibrate}
              className={`min-h-[40px] flex-1 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white ${pendCls(st("wattsTotal"))}`}
            >
              Apply trim
            </button>
            <button
              onClick={() => setCalOpen(false)}
              className="min-h-[40px] rounded-xl border border-white/15 px-4 text-sm text-slate-300 hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-[11px] text-amber-200/70">
            Watts is trimmed against the pulse rate directly; volts and amps scale the existing
            trim. Calibrating at no load does nothing, because there is no rate to compare.
          </p>
        </div>
      )}

      <SectionLabel>Energy counter</SectionLabel>
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="text-[12px] text-slate-400">
          Clearing a running total is deliberate — a billing period ended, or the board moved to a
          different load. It cannot be undone.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => {
              if (confirm("Clear the energy total on every channel? This cannot be undone.")) {
                const cmd = buildFieldCommand("meter", "reset", -1);
                if (cmd) send(cmd as Record<string, unknown>);
              }
            }}
            className="min-h-[40px] rounded-xl border border-red-900/60 px-4 text-sm font-semibold text-red-300 hover:bg-red-950/40"
          >
            Reset all channels
          </button>
          {channels > 1 &&
            Array.from({ length: channels }, (_, i) => (
              <button
                key={i}
                onClick={() => {
                  if (confirm(`Clear the energy total on channel ${i + 1}?`)) {
                    const cmd = buildFieldCommand("meter", "reset", i);
                    if (cmd) send(cmd as Record<string, unknown>);
                  }
                }}
                className="min-h-[40px] rounded-xl border border-white/15 px-3 text-sm text-slate-300 hover:bg-white/10"
              >
                Reset {i + 1}
              </button>
            ))}
        </div>
      </div>
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

function TankGauge({ label, pct, litres, accent, fault, stale }: { label: string; pct: number; litres: number; accent: string; fault?: boolean; stale?: boolean }) {
  /*
   * A negative percentage means "no reading", not an empty tank. Drawing it as
   * empty would be the worst possible default here: an empty overhead tank is
   * exactly the condition that makes someone start the pump.
   */
  const unknown = pct < 0;
  const clamped = unknown ? 0 : Math.min(100, Math.max(0, pct));
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative h-48 w-24 overflow-hidden rounded-2xl border bg-black/30 ${stale && !unknown ? "border-amber-400/40" : "border-white/15"}`}>
        {/* fluid */}
        {!unknown && (
          <div
            className="absolute inset-x-0 bottom-0 transition-all duration-700"
            style={{
              height: `${clamped}%`,
              background: `linear-gradient(180deg, ${accent}cc, ${accent}66)`,
              // Stale water is drained of colour as well as labelled. Colour is
              // read before text, so a number that must not be acted on should
              // not look as confident as one that may be.
              opacity: stale ? 0.35 : 1,
            }}
          >
            {/* Motion means "being updated". A stale gauge must not keep moving,
                or it goes on signalling liveness that is no longer there. */}
            {!stale && <div className="animate-pulse absolute inset-x-0 top-0 h-3 opacity-70" style={{ background: accent }} />}
          </div>
        )}
        {/* level ticks */}
        {[25, 50, 75].map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-white/10" style={{ bottom: `${t}%` }} />
        ))}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-extrabold drop-shadow ${unknown ? "text-slate-500" : stale ? "text-amber-200" : "text-white"}`}>
            {unknown ? "—" : `${clamped}%`}
          </span>
          {stale && !unknown && <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300/90">last known</span>}
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className="text-xs text-slate-400">
          {unknown ? "no reading" : `${litres.toLocaleString("en-IN")} L`}{fault ? " · sensor?" : ""}
        </div>
      </div>
    </div>
  );
}

function WaterTank({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  /*
   * The overhead level arrives by radio from a battery unit on the tank, so it
   * can stop arriving. `readTankLink` is the single place that decides whether
   * the last reading may still be presented as the current one — the firmware
   * applies the same rule to the pump, and `tests/tank-link-parity.test.ts`
   * keeps the two thresholds from drifting apart.
   */
  const link = readTankLink(d.state as TankDeviceState);
  const oh = link.levelPct ?? -1;
  const sump = n(d.state.sumpPct);
  const toneCls =
    link.tone === "ok" ? "text-emerald-400"
      : link.tone === "warn" ? "text-amber-400"
        : link.tone === "bad" ? "text-red-400"
          : "text-slate-400";

  return (
    <div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
        <div className="flex items-end justify-center gap-10">
          <TankGauge
            label="Overhead"
            pct={oh}
            litres={n(d.state.ohLitres)}
            accent="#06b6d4"
            fault={b(d.state.ohFault)}
            stale={!link.levelIsCurrent}
          />
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

      {/*
        * The radio link gets a permanent row rather than only appearing when
        * broken. A level with no indication of where it came from is exactly
        * what makes a stale reading dangerous, and a status that only shows up
        * on failure teaches nobody what healthy looks like.
        */}
      <div className="mt-3 flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
        <Radio className={`mt-0.5 h-4 w-4 shrink-0 ${toneCls}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`text-sm font-semibold ${toneCls}`}>{link.label}</span>
            {link.ageS !== null && link.status !== "live" && (
              <span className="text-xs text-slate-400">· {formatAge(link.ageS)} ago</span>
            )}
            {link.batteryPct !== null && (
              <span className={`text-xs ${link.batteryLow ? "text-amber-400" : "text-slate-400"}`}>
                · sensor battery {link.batteryPct}%
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">{link.detail}</div>
        </div>
      </div>

      {b(d.state.dryRun) && <div className="mt-3"><AlertBanner text="Dry-run detected — pump cut. Reset after checking the sump/motor." /></div>}
      {b(d.state.overflow) && <div className="mt-3"><AlertBanner text="Overflow float tripped — pump stopped." /></div>}

      <SectionLabel>Controls</SectionLabel>
      <ControlRow
        label="Auto-fill"
        hint={
          link.blocksAutoFill
            ? "Paused — the controller will not pump without a current tank level"
            : "Fill the overhead tank automatically from the sump"
        }
      >
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

      <SectionLabel>Tank sensor</SectionLabel>
      <ControlRow
        label={link.status === "unpaired" ? "Pair sensor" : "Re-pair sensor"}
        hint="Opens a 60-second window, then press the button on the tank unit"
      >
        <div className="flex gap-2">
          <button
            onClick={() => send({ action: "pair" })}
            className={`rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/10 active:scale-95 transition ${pendCls(st("pairing"))}`}
          >
            {b(d.state.pairing) ? "Listening…" : "Pair"}
          </button>
          {link.status !== "unpaired" && (
            <button
              onClick={() => send({ action: "unpair" })}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 active:scale-95 transition"
            >
              Forget
            </button>
          )}
        </div>
      </ControlRow>
      {link.status !== "unpaired" && (
        <>
          <ControlRow
            label="Read the tank now"
            hint={
              link.downlinkPending
                ? "Queued — the sensor will be asked at its next report"
                : `The sensor sleeps between reports, so this is queued and takes up to ${link.intervalS}s`
            }
          >
            <div className="flex gap-2">
              <button
                onClick={() => send({ action: "readNow" })}
                className={`rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/10 active:scale-95 transition ${pendCls(st("downlinkPending"))}`}
              >
                {link.downlinkPending ? "Queued…" : "Read now"}
              </button>
              <button
                onClick={() => send({ action: "identifySensor" })}
                title="Blink the light on the tank unit, to tell it from another"
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 active:scale-95 transition"
              >
                Identify
              </button>
            </div>
          </ControlRow>
          <ControlRow
            label="Report every"
            hint="Less often lasts longer on a battery; more often reacts sooner"
          >
            <Stepper
              value={link.intervalS}
              onChange={(v) => send({ sensorIntervalS: v })}
              min={10}
              max={900}
              step={10}
              suffix="s"
            />
          </ControlRow>
        </>
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
        <StatTile label="Overhead" value={tankLevelText(link)} />
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
        <button onClick={() => send({ action: "open" })} className={`min-h-[44px] flex-1 rounded-xl border border-green-500/40 bg-green-500/10 py-2.5 font-semibold text-green-300 hover:bg-green-500/20 active:scale-95 transition ${pendCls(st("barrier"))}`}>Open</button>
        <button onClick={() => send({ action: "close" })} className={`min-h-[44px] flex-1 rounded-xl border border-white/15 bg-black/20 py-2.5 font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition ${pendCls(st("barrier"))}`}>Close</button>
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
  const enrolling = b(d.state.enrolling);
  return (
    <div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6 flex flex-col items-center">
        <LockIcon className="h-12 w-12" style={{ color: locked ? "#8b5cf6" : "#22c55e" }} />
        <div className={`mt-3 text-2xl font-extrabold ${locked ? "text-slate-200" : "text-green-400"}`}>{locked ? "LOCKED" : "UNLOCKED"}</div>
        <div className="mt-1 text-sm text-slate-400">
          {String(d.state.lastMethod ?? "—")}{d.state.lastName ? ` · ${String(d.state.lastName)}` : ""}
        </div>
      </div>

      {enrolling && (
        /*
         * Surfaced prominently because the door refuses to unlock while it is
         * enrolling. Somebody pressing Unlock and getting nothing would
         * reasonably conclude the lock is broken, so the reason is on screen
         * rather than only in the firmware's head.
         */
        <div className="mt-3 rounded-xl border border-violet-700/50 bg-violet-950/30 px-4 py-3 text-sm text-violet-200">
          <strong>Enrolling {String(d.state.enrolName || "a new face")}.</strong> The door will
          not unlock until this finishes
          {n(d.state.enrolSecondsLeft) > 0 ? ` — about ${n(d.state.enrolSecondsLeft)}s left` : ""}.
        </div>
      )}

      <SectionLabel>Controls</SectionLabel>
      <div className="flex gap-2.5">
        <button onClick={() => send({ action: "unlock", method: "app" })} disabled={enrolling} className={`min-h-[44px] flex-1 rounded-xl border border-green-500/40 bg-green-500/10 py-2.5 font-semibold text-green-300 hover:bg-green-500/20 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-40 ${pendCls(st("locked"))}`}><LockOpen className="h-4 w-4" /> Unlock</button>
        <button onClick={() => send({ action: "lock" })} className={`min-h-[44px] flex-1 rounded-xl border border-white/15 bg-black/20 py-2.5 font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition flex items-center justify-center gap-2 ${pendCls(st("locked"))}`}><Lock className="h-4 w-4" /> Lock</button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatTile label="Accesses" value={String(n(d.state.accessCount))} />
        <StatTile label="Bell presses" value={String(n(d.state.bellCount))} />
      </div>
      <ControlRow label="Auto-relock" hint="Seconds before the door re-locks">
        <Stepper value={n(d.state.autoLockSec, 8)} onChange={(v) => send({ autoLockSec: v })} min={0} max={120} suffix="s" />
      </ControlRow>

      <SectionLabel>Who this door opens for</SectionLabel>
      <FacePanel deviceId={d.id} deviceName={d.name} />
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
        <button onClick={() => send({ all: true })} className={`min-h-[44px] flex-1 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition ${pendCls(st("g1"))}`}>All on</button>
        <button onClick={() => send({ all: false })} className={`min-h-[44px] flex-1 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition ${pendCls(st("g1"))}`}>All off</button>
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
              className={`min-h-[44px] rounded-xl border border-white/15 bg-black/20 px-5 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition ${pendCls(st("muted"))}`}
            >
              Silence 5 min
            </button>
            <button
              onClick={() => send({ action: "clearAlarm" })}
              className={`min-h-[44px] rounded-xl bg-red-500 px-5 text-sm font-semibold text-white hover:bg-red-600 active:scale-95 transition ${pendCls(st("gasAlarm"))}`}
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
            <button onClick={() => send({ all: true })} className={`min-h-[44px] flex-1 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition ${pendCls(st("r1"))}`}>All on</button>
            <button onClick={() => send({ all: false })} className={`min-h-[44px] flex-1 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition ${pendCls(st("r1"))}`}>All off</button>
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
                  className={`min-h-[44px] rounded-xl border px-4 text-sm font-semibold transition active:scale-95 ${
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
        <button onClick={() => send({ action: "test" })} className="min-h-[44px] rounded-xl border border-white/15 bg-black/20 px-4 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition">
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
            className="min-h-[44px] rounded-xl border border-white/15 bg-black/20 px-4 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition"
          >
            Calibrate gas sensor
          </button>
        )}
        <button onClick={() => send({ action: "recalibrateTouch" })} className="min-h-[44px] rounded-xl border border-white/15 bg-black/20 px-4 text-sm font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition">
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
  /** Object URL for rendering. Revoked as soon as the next frame replaces it. */
  src: string;
  at: number;
  bytes: number;
  /**
   * The JPEG itself.
   *
   * Carried alongside the URL because recording needs the bytes, and reading
   * them back out of a blob URL would mean an async fetch per recorded frame —
   * for data this component already had in its hand.
   */
  data: Uint8Array;
}

/**
 * The size the picture on screen is actually at.
 *
 * From firmware 1.13.0 the sensor runs at a smaller size while streaming than
 * the resolution chosen for stills, because a 1600x1200 frame cannot be read
 * out, encoded and published twenty-four times a second. That means
 * `state.resolution` — the chosen one — is the wrong caption for live video,
 * and printing it would have the console label an 800x600 stream "UXGA".
 *
 * A caption that is confidently wrong is worse than no caption: it is the one
 * thing a person measuring the picture would trust over their own eyes.
 *
 * Older firmware does not publish `streamResolution` at all. Absence is not
 * evidence that the stream is downscaled, so it falls back to the chosen
 * resolution and reads exactly as it did before — no camera in the field
 * changes its caption until it is running firmware that means it.
 */
export function effectiveResolution(
  state: Record<string, unknown>,
  live: boolean
): string {
  const chosen = typeof state.resolution === "string" ? state.resolution : "VGA";
  if (!live) return chosen;
  const streamed = state.streamResolution;
  return typeof streamed === "string" && streamed ? streamed : chosen;
}

/**
 * Tells "the camera is not producing frames" apart from "the server is not
 * relaying them" — from evidence, not from a guess.
 *
 * The device publishes a monotonic `frames` counter, and the firmware only
 * advances it after a *successful* publish. So if that counter climbs while
 * this browser has received nothing on the frame channel, the video is being
 * produced and lost in transit.
 *
 * This distinction is not hypothetical. A camera here had published 20,522
 * frames with zero drops while this panel read "Waiting for the first frame…",
 * which points at the sensor, the ribbon and the firmware in turn — the three
 * things that were provably fine — and never at the relay, which was the one
 * thing actually broken. A viewer that can only say whether a frame arrived
 * cannot help but blame the last device in the chain.
 */
const RELAY_FAULT_FRAMES = 25;

function useRelayFault(published: number, received: number, active: boolean) {
  const baseline = useRef<number | null>(null);
  useEffect(() => {
    if (!active || received > 0) {
      baseline.current = null;
      return;
    }
    if (baseline.current == null && published > 0) baseline.current = published;
  }, [active, received, published]);
  if (!active || received > 0 || baseline.current == null) return 0;
  const advanced = published - baseline.current;
  return advanced >= RELAY_FAULT_FRAMES ? advanced : 0;
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
  const [received, setReceived] = useState(0);
  const [fps, setFps] = useState(0);
  const stamps = useRef<number[]>([]);
  const frameUrl = useFrameUrl();
  const lastFpsAt = useRef(0);

  // Watch continuously rather than only while streaming: a snapshot is
  // published on the same frame topic, so a viewer that only subscribes during
  // a live stream would silently never receive one.
  useCameraFrames(d.online ? d.id : null, (f) => {
    const now = Date.now();

    // Mutate the window in place: rebuilding this array per frame allocates a
    // new one sixty times a second for a number shown twice.
    const s = stamps.current;
    s.push(now);
    while (s.length && now - s[0] > 2000) s.shift();
    // The counter is read, not acted on, so recomputing it per frame only buys
    // extra renders during the part that has to stay smooth.
    if (now - lastFpsAt.current >= 500) {
      lastFpsAt.current = now;
      setFps(s.length > 1 ? Math.round(((s.length - 1) / (now - s[0])) * 1000) : 0);
    }
    setReceived((c) => c + 1);
    setFrame({ src: frameUrl(f.data), at: now, bytes: f.bytes, data: f.data });
  });

  /**
   * The device's own address, which it publishes so viewers do not have to
   * guess a DHCP lease. LAN video needs no broker and no relay, so it is the
   * route that still works when the relay does not.
   */
  const lanIp = typeof d.state.ip === "string" ? d.state.ip : "";
  const lanUrl = lanIp ? `http://${lanIp}:${n(d.state.lanPort) || 81}/` : "";
  const relayLost = useRelayFault(n(d.state.frames), received, d.online && ready && streaming);

  /*
   * When the relay is proven to be dropping frames, fall back automatically
   * rather than offering a button. The viewer's goal is to see the room; being
   * asked to choose a transport is this system's problem leaking into their
   * hands. The LAN link stays on offer because it is the better picture when
   * they happen to be home.
   */
  const remote = useRemoteCamera(d.id, relayLost > 0 && d.online && ready);
  const shownFrame = frame ?? remote.frame;

  /*
   * When frames are provably being produced and lost, ask the control plane
   * what it supports. The answer turns "the server is not relaying video" —
   * true but unactionable — into a specific instruction, and stops a working
   * camera being suspected of a fault that is not on the device at all.
   */
  const plane = useControlPlaneCapability("frameRelay", relayLost > 0);
  const planeAdvice = stalePlaneAdvice(plane.state, plane.build);

  /*
   * Recording. Every frame that reaches this panel is eligible, whichever
   * route delivered it, so footage does not stop the moment the transport
   * changes underneath the viewer.
   */
  const [rec, setRec] = useState<Recorder | null>(null);
  const [recCount, setRecCount] = useState(0);
  const [recNote, setRecNote] = useState("");
  const recBusy = useRef(false);
  const lastRecorded = useRef(0);

  useEffect(() => {
    if (!rec || !shownFrame || shownFrame.at <= lastRecorded.current) return;
    // Serialised: two concurrent writes to one directory handle can interleave
    // and truncate a file, and a dropped frame beats a corrupt one.
    if (recBusy.current) return;
    recBusy.current = true;
    lastRecorded.current = shownFrame.at;
    void rec
      .add(shownFrame.data, shownFrame.at)
      .then(() => setRecCount((c) => c + 1))
      .catch((e: unknown) => setRecNote(e instanceof Error ? e.message : "could not write frame"))
      .finally(() => {
        recBusy.current = false;
      });
  }, [rec, shownFrame]);

  const toggleRecording = async () => {
    haptic();
    if (rec) {
      const r = await rec.stop();
      setRec(null);
      setRecNote(
        r.frames === 0
          ? "Stopped before a readable frame arrived — nothing was saved."
          : `Saved ${r.clips} ${r.clips === 1 ? "video" : "videos"} · ` +
            `${r.frames.toLocaleString()} frames · ${(r.bytes / 1048576).toFixed(1)} MB` +
            (r.rolled
              ? ` — split at the ${Math.round(MEMORY_CLIP_MAX_BYTES / 1048576)} MB limit this browser has without folder access`
              : "")
      );
      return;
    }
    const target = await chooseTarget();
    lastRecorded.current = 0;
    setRecCount(0);
    setRecNote(target.kind === "folder" ? `Recording to ${target.label}` : target.label);
    setRec(startRecording(d.name || d.id, target));
  };

  // Drives the stall check and the "last frame" age without re-rendering on
  // every frame for the sake of a clock.
  const now = useNow(1000, d.online);
  const age = shownFrame ? now - shownFrame.at : Infinity;
  const stalled = streaming && age > STALL_AFTER_MS;
  const showingLive = !!shownFrame && !stalled && (streaming || remote.status === "live");

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
        {shownFrame ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={shownFrame.src}
            alt={`Live view from ${d.name || d.id}`}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <VideoOff className="h-10 w-10" style={{ color: "#475569" }} />
            <p className="text-sm font-medium" style={{ color: "#94a3b8" }}>
              {!d.online
                ? "Camera is offline"
                : !ready
                  ? "Camera sensor failed to initialise"
                  : relayLost
                    ? "This camera is working — the video is not reaching you"
                    : streaming
                      ? "Waiting for the first frame…"
                      : "Live view is off"}
            </p>
            {relayLost > 0 && (
              /* Say which link in the chain failed, and prove it with the
                 device's own counter, rather than leaving the camera under
                 suspicion for a fault upstream of it. */
              <p className="max-w-sm text-xs leading-relaxed" style={{ color: "#64748b" }}>
                {remote.status === "starting"
                  ? `It has sent ${relayLost.toLocaleString()} frames and none reached you through the server. Connecting a direct route…`
                  : remote.status === "unavailable"
                    ? `The server is not relaying video, and the direct route is unavailable: ${remote.detail}.`
                    : `It has sent ${relayLost.toLocaleString()} frames since this page opened and none arrived. The server is not relaying video.`}
              </p>
            )}
            {relayLost > 0 && lanUrl && (
              <a
                href={lanUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => haptic()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition active:scale-95"
                style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
              >
                <Play className="h-4 w-4" /> Open local view
              </a>
            )}
            {relayLost > 0 && !lanUrl && (
              <p className="max-w-sm text-xs" style={{ color: "#64748b" }}>
                Local view needs camera firmware 1.9.0 or newer.
              </p>
            )}
            {d.online && ready && !streaming && (
              <button
                onClick={() => {
                  haptic();
                  send({ action: "stream", on: true });
                }}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition active:scale-95"
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
            {showingLive
              ? remote.status === "live" && !frame
                ? "Remote"
                : "Live"
              : stalled
                ? "Stalled"
                : shownFrame
                  ? "Still"
                  : "Idle"}
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
              {effectiveResolution(d.state, showingLive)} · {(frame.bytes / 1024).toFixed(0)} KB
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
      {hasCamera && stalled && ready && !relayLost && (
        <div className="mt-3">
          <AlertBanner text="Streaming is on but no frames are arriving. Check the camera's signal, then try Reboot." />
        </div>
      )}
      {hasCamera && stalled && ready && relayLost > 0 && (
        /* Do not tell someone to reboot a camera that is provably capturing
           and publishing. The advice above is right for a signal fault and
           actively wrong here — it costs a working device an uptime for a
           problem that is not on the device at all. */
        <div className="mt-3">
          <AlertBanner
            text={
              planeAdvice ??
              "The camera is capturing and publishing normally — the server is not relaying its video. Rebooting will not help. Use local view at home, or the direct route from anywhere."
            }
          />
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
          className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40 ${pendCls(st("streaming"))}`}
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
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
          style={{ background: "var(--cv-card-hi)", borderColor: "var(--cv-border)", color: "var(--cv-text)" }}
        >
          <CameraIcon className="h-4 w-4" /> Snapshot
        </button>
        <button
          onClick={download}
          disabled={!shownFrame}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
          style={{ background: "var(--cv-card-hi)", borderColor: "var(--cv-border)", color: "var(--cv-text)" }}
        >
          <Download className="h-4 w-4" /> Save
        </button>
        <button
          onClick={() => void toggleRecording()}
          disabled={!d.online || !ready}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
          style={{
            background: rec ? "rgba(239,68,68,0.15)" : "var(--cv-card-hi)",
            borderColor: rec ? "rgba(239,68,68,0.55)" : "var(--cv-border)",
            color: rec ? "#ef4444" : "var(--cv-text)",
          }}
        >
          <Circle className={`h-4 w-4 ${rec ? "fill-current" : ""}`} />
          {rec ? `Stop · ${recCount.toLocaleString()}` : "Record"}
        </button>
        <button
          onClick={() => {
            haptic();
            send({ action: "reboot" });
          }}
          disabled={!d.online}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
          style={{ background: "var(--cv-card-hi)", borderColor: "var(--cv-border)", color: "var(--cv-text)" }}
        >
          <RefreshCcw className="h-4 w-4" /> Reboot
        </button>
      </div>
      {recNote && (
        <p className="mt-2 text-xs" style={{ color: "var(--cv-text-dim)" }}>
          {recNote}
        </p>
      )}

      <SectionLabel>Image</SectionLabel>
      <ControlRow label="Resolution" hint={psram ? undefined : "Higher modes need PSRAM"}>
        <select
          className="cv-input min-h-[44px] w-[150px]"
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
          value={n(d.state.fps, 24)}
          onChange={(v) => send({ fps: v })}
          min={1}
          max={60}
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
          className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 active:scale-95"
        >
          Off
        </button>
        <button
          onClick={() => send({ action: "flash", level: 100 })}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/20 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 active:scale-95"
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

      <SectionLabel>Camera storage</SectionLabel>
      <CameraStorage d={d} send={send} st={st} />

      <SectionLabel>Audio</SectionLabel>
      <CameraAudio d={d} />

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

/**
 * The camera's own microSD card.
 *
 * WHY THE CLIP LIST IS NOT FETCHED HERE
 *
 * The clips live on the device and are served by its own HTTP server on the
 * LAN. This page is loaded from circuvent.com over HTTPS, and a browser will
 * not let an HTTPS page fetch http://192.168.x.x — that is mixed content, and
 * it is blocked before any request is made. No amount of CORS on the firmware
 * changes it.
 *
 * The routes that matter are therefore offered as links the browser opens
 * directly, which works because the *page* at that address is plain HTTP. The
 * alternative — relaying hundreds of megabytes of footage from a device in the
 * user's house, out to a broker, into this server and back down — would be a
 * lot of engineering to make a worse version of a local file copy. The mobile
 * app has no such restriction and downloads clips in place; that is said here
 * rather than left for someone to discover.
 *
 * Recording itself is controlled through the normal command path, which works
 * from anywhere.
 */
function CameraStorage({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const card = b(d.state.sd);
  const fault = typeof d.state.sdFault === "string" ? d.state.sdFault : "";
  const recording = b(d.state.recording);
  const enabled = b(d.state.recEnabled);
  const motionOnly = b(d.state.recMotion);
  const freeMb = n(d.state.sdFreeMb);
  const totalMb = n(d.state.sdTotalMb);
  const lanIp = typeof d.state.ip === "string" ? d.state.ip : "";
  const lanBase = lanIp ? `http://${lanIp}:${n(d.state.lanPort) || 81}` : "";
  const supported = d.state.sd != null;

  if (!supported) {
    return (
      <p className="text-sm" style={{ color: "var(--cv-text-dim)" }}>
        This camera has not reported a card. Recording to microSD needs firmware 1.12.0 or newer —
        update it from Settings and this section will fill in.
      </p>
    );
  }

  const usedPct = totalMb > 0 ? Math.max(0, Math.min(100, ((totalMb - freeMb) / totalMb) * 100)) : 0;

  return (
    <div>
      <ControlRow
        label="Record to the card"
        hint={
          card
            ? "Keeps recording when the internet is down — the only route that needs nothing else"
            : fault || "No card detected in the camera"
        }
      >
        <Toggle
          checked={enabled}
          onChange={(v) => send({ action: "record", on: v })}
          status={st("recEnabled")}
          label="Record to the microSD card"
        />
      </ControlRow>

      {enabled && (
        <ControlRow label="Only while there is motion" hint="Saves the card for the moments that matter">
          <Toggle
            checked={motionOnly}
            onChange={(v) => send({ action: "record", motionOnly: v })}
            status={st("recMotion")}
            label="Record only on motion"
          />
        </ControlRow>
      )}
      {enabled && (
        <ControlRow label="Clip length" hint="A new file starts at this interval">
          <Stepper
            value={n(d.state.recSegment, 300)}
            onChange={(v) => send({ action: "record", segment: v })}
            min={30}
            max={3600}
            step={30}
            suffix=" s"
          />
        </ControlRow>
      )}

      {card && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-xs" style={{ color: "var(--cv-muted)" }}>
            <span>
              {freeMb.toLocaleString()} MB free of {totalMb.toLocaleString()} MB
            </span>
            <span>{n(d.state.recClips).toLocaleString()} clips</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--cv-card-hi)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${usedPct}%`,
                background: usedPct > 90 ? "#ef4444" : "linear-gradient(90deg,#06b6d4,#8b5cf6)",
              }}
            />
          </div>
          {usedPct > 90 && (
            <p className="mt-1.5 text-xs" style={{ color: "#f59e0b" }}>
              The card is nearly full. The camera deletes its oldest clip to make room, so the newest
              footage is safe — but anything older than about a day may not be.
            </p>
          )}
        </div>
      )}

      {recording && (
        <p className="mt-3 text-xs font-semibold" style={{ color: "#ef4444" }}>
          Recording now — {String(d.state.recFile ?? "")} · {n(d.state.recFrames).toLocaleString()} frames ·{" "}
          {n(d.state.recSecs).toLocaleString()}s
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {lanBase ? (
          <a
            href={`${lanBase}/rec/list`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => haptic()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition active:scale-95"
            style={{ background: "var(--cv-card-hi)", borderColor: "var(--cv-border)", color: "var(--cv-text)" }}
          >
            <HardDrive className="h-4 w-4" /> Browse clips on the card
          </a>
        ) : (
          <p className="text-xs" style={{ color: "var(--cv-text-dim)" }}>
            The camera has not published a local address yet, so its clips cannot be listed.
          </p>
        )}
        <button
          onClick={() => {
            haptic();
            if (confirm("Delete every clip on the camera's card? This cannot be undone.")) {
              send({ action: "sdclear" });
            }
          }}
          disabled={!card || !d.online}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
          style={{ background: "var(--cv-card-hi)", borderColor: "var(--cv-border)", color: "var(--cv-text)" }}
        >
          <Trash2 className="h-4 w-4" /> Clear card
        </button>
      </div>

      {lanBase && (
        <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--cv-text-dim)" }}>
          That link opens the camera directly and only works on the same network. This page is served
          over HTTPS and a browser will not let it fetch from a plain-HTTP address on your LAN, so the
          clips cannot be listed inline here. The mobile app has no such restriction and can download
          them straight to your phone.
        </p>
      )}
    </div>
  );
}

/**
 * Listening and talking.
 *
 * The controls only appear when the device says it has the parts. A stock
 * AI-Thinker ESP32-CAM has no microphone and no amplifier — not disabled ones,
 * absent ones — so a Talk button on that board would produce silence, and
 * every layer between here and the speaker would be suspected before the
 * hardware was. The firmware reports hasMic and hasSpeaker; this listens.
 */
function CameraAudio({ d }: { d: Device }) {
  const [listening, setListening] = useState(false);
  const hasMic = b(d.state.hasMic);
  const hasSpeaker = b(d.state.hasSpeaker);
  const fault = typeof d.state.audioFault === "string" ? d.state.audioFault : "";
  const reported = d.state.hasMic != null;

  const listen = useCameraListen(d.id, listening && d.online && hasMic);
  const talk = useCameraTalk(d.online && hasSpeaker ? d.id : null);

  /*
   * Stop listening when the device drops.
   *
   * Adjusted during render against the previous value rather than in an
   * effect, which is React's own guidance for reacting to a changed prop and
   * avoids the extra render an effect would cost. It has to be a transition
   * and not a plain `listening && d.online`: deriving it would silently
   * resume the microphone when the camera reconnected, for a listener who
   * stopped paying attention twenty minutes ago.
   */
  const [wasOnline, setWasOnline] = useState(d.online);
  if (wasOnline !== d.online) {
    setWasOnline(d.online);
    if (!d.online) setListening(false);
  }

  if (!reported) {
    return (
      <p className="text-sm" style={{ color: "var(--cv-text-dim)" }}>
        This camera has not reported whether it has audio hardware. Two-way audio needs firmware
        1.12.0 or newer — update it from Settings and this section will fill in.
      </p>
    );
  }

  if (!hasMic && !hasSpeaker) {
    return (
      <div>
        <AlertBanner
          text={
            "This board has no microphone and no amplifier fitted, so there is nothing to listen to or talk through. " +
            "The stock AI-Thinker ESP32-CAM ships without them: audio needs an I2S MEMS microphone (INMP441 or SPH0645) " +
            "and an I2S amplifier (MAX98357A) soldered on, and firmware built with CV_AUDIO=1. " +
            "See firmware/camera/platformio.ini for the wiring — it costs the status LED and the serial console's receive line." +
            (fault ? ` The device also reports: ${fault}.` : "")
          }
        />
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            haptic();
            setListening((v) => !v);
          }}
          disabled={!d.online || !hasMic}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
          style={{
            background: listening ? "rgba(6,182,212,0.15)" : "var(--cv-card-hi)",
            borderColor: listening ? "rgba(6,182,212,0.55)" : "var(--cv-border)",
            color: listening ? "#22d3ee" : "var(--cv-text)",
          }}
        >
          {listening ? <Volume2 className="h-4 w-4" /> : <Ear className="h-4 w-4" />}
          {listening ? "Stop listening" : "Listen"}
        </button>

        {/* Press and hold, on both pointer and touch. A tap-to-start,
            tap-to-stop toggle is how a microphone gets left open in someone's
            house, and holding makes the live state unambiguous. */}
        <button
          onPointerDown={() => {
            haptic();
            void talk.start();
          }}
          onPointerUp={() => void talk.stopAndSend()}
          onPointerLeave={() => {
            if (talk.status === "recording") void talk.stopAndSend();
          }}
          disabled={!d.online || !hasSpeaker || talk.status === "sending"}
          className="flex min-h-[44px] select-none items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
          style={{
            background: talk.status === "recording" ? "rgba(239,68,68,0.15)" : "var(--cv-card-hi)",
            borderColor: talk.status === "recording" ? "rgba(239,68,68,0.55)" : "var(--cv-border)",
            color: talk.status === "recording" ? "#f87171" : "var(--cv-text)",
            touchAction: "none",
          }}
        >
          <Mic className="h-4 w-4" />
          {talk.status === "recording"
            ? `Release to send · ${talk.seconds.toFixed(1)}s`
            : talk.status === "sending"
              ? "Sending…"
              : talk.status === "sent"
                ? "Sent"
                : "Hold to talk"}
        </button>
      </div>

      {listening && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-xs" style={{ color: "var(--cv-muted)" }}>
            <span>
              {listen.status === "live"
                ? "Listening"
                : listen.status === "starting"
                  ? "Connecting to the microphone…"
                  : listen.status === "unavailable"
                    ? `Cannot listen: ${listen.detail}`
                    : "Idle"}
            </span>
            <span>8 kHz mono</span>
          </div>
          {/* A level meter, because silence and a broken link look identical
              otherwise and one of them needs fixing. */}
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--cv-card-hi)" }}>
            <div
              className="h-full rounded-full transition-all duration-150"
              style={{
                width: `${Math.min(100, Math.round(listen.level * 140))}%`,
                background: "linear-gradient(90deg,#06b6d4,#8b5cf6)",
              }}
            />
          </div>
        </div>
      )}

      {talk.status === "error" && talk.detail && (
        <p className="mt-2 text-xs" style={{ color: "#f59e0b" }}>
          {talk.detail}
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--cv-text-dim)" }}>
        Listening stops on its own after two minutes and when this page closes — a microphone in your
        home should not stay open because a tab was left behind. Talking sends one clip at a time, up
        to 20 seconds; the camera fetches it and plays it once.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ANPR camera                                                         */
/* ------------------------------------------------------------------ */

const ANPR_RES = ["QVGA", "VGA", "SVGA", "XGA", "SXGA", "UXGA"] as const;

/** Phase -> what the lane is doing, in words an installer can act on. */
const ANPR_PHASE: Record<string, { label: string; tint: string }> = {
  idle: { label: "Watching", tint: "#64748b" },
  settle: { label: "Vehicle detected", tint: "#f59e0b" },
  burst: { label: "Capturing", tint: "#0ea5e9" },
  cooldown: { label: "Lane clearing", tint: "#8b5cf6" },
};

/** Decision -> badge. Kept next to the read so the two cannot be read apart. */
function DecisionBadge({ decision }: { decision: string }) {
  const map: Record<string, { label: string; bg: string; fg: string; Icon: LucideIcon }> = {
    allow: { label: "Allowed", bg: "rgba(34,197,94,0.15)", fg: "#22c55e", Icon: ShieldCheck },
    deny: { label: "Blocked", bg: "rgba(239,68,68,0.15)", fg: "#ef4444", Icon: Ban },
    watch: { label: "Watchlist", bg: "rgba(245,158,11,0.15)", fg: "#f59e0b", Icon: ScanSearch },
  };
  const m = map[decision];
  if (!m) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold"
      style={{ background: m.bg, color: m.fg }}
    >
      <m.Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}

/**
 * The ANPR camera panel.
 *
 * Two jobs, and they are deliberately not the same screen as the plate log:
 * this aims and tunes one camera, while /smarthome/traffic answers "what came
 * through". Mixing them produces a page that is wrong for both — an installer
 * on a ladder does not want a week of history, and somebody reviewing last
 * night does not want a sensitivity slider.
 *
 * Live view is present only because aiming a camera without seeing through it
 * is guesswork. The firmware drops to a lighter resolution while streaming and
 * expires the lease after 20 s, so leaving this open cannot degrade capture.
 */
function AnprCamera({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const armed = b(d.state.armed);
  const ready = d.state.ready == null ? true : b(d.state.ready);
  const streaming = b(d.state.streaming);
  const psram = b(d.state.psram);
  const phase = typeof d.state.phase === "string" ? d.state.phase : "idle";
  const lastPlate = typeof d.state.lastPlate === "string" ? d.state.lastPlate : "";
  const lastDecision = typeof d.state.lastDecision === "string" ? d.state.lastDecision : "";
  const lastConfidence = n(d.state.lastConfidence);
  const hasLoop = b(d.state.hasLoop);  const hasRelay = b(d.state.hasRelay);
  const resolution = typeof d.state.resolution === "string" ? d.state.resolution : "SVGA";
  const lane = d.state.direction === "in" || d.state.direction === "out" ? d.state.direction : "both";

  const roi = {
    x: n(d.state.roiX),
    y: n(d.state.roiY, 25),
    w: n(d.state.roiW, 100),
    h: n(d.state.roiH, 65),
  };

  const [frame, setFrame] = useState<LiveFrame | null>(null);
  const [capturing, setCapturing] = useState(false);

  /**
   * The ROI is always sent whole, never one edge at a time.
   *
   * The firmware applies x before clamping w against it, so a partial update
   * lets a half-applied rectangle — a new origin with the old width — exist
   * between two messages, and that rectangle is what motion is judged against.
   * Sending all four keeps the device's copy and this one identical at every
   * instant.
   */
  const setRoi = (patch: Partial<typeof roi>) => {
    const next = { ...roi, ...patch };
    next.w = Math.min(next.w, 100 - next.x);
    next.h = Math.min(next.h, 100 - next.y);
    send({ roi: next });
  };

  const anprFrameUrl = useFrameUrl();

  useCameraFrames(d.online ? d.id : null, (f) => {
    setFrame({ src: anprFrameUrl(f.data), at: Date.now(), bytes: f.bytes, data: f.data });
  });

  // Same keep-alive contract as the camera panel: the firmware arms the stream
  // for 20 s and then stops it by itself, so a viewer that does not re-arm
  // simply watches the picture die and never come back.
  useEffect(() => {
    if (!d.online || !streaming) return;
    const arm = () => void controlPlane.command(d.id, { action: "stream", on: true });
    arm();
    const t = setInterval(arm, STREAM_REARM_MS);
    return () => clearInterval(t);
  }, [d.online, d.id, streaming]);

  const capture = async () => {
    setCapturing(true);
    haptic();
    try {
      await controlPlane.command(d.id, { action: "capture" });
    } finally {
      // Long enough to cover settle + a default burst, so the button does not
      // re-arm before the frames it asked for have even been taken.
      setTimeout(() => setCapturing(false), 2500);
    }
  };

  const phaseMeta = ANPR_PHASE[phase] ?? ANPR_PHASE.idle;
  const busy = phase !== "idle";

  return (
    <div>
      {!ready && (
        <div
          className="mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm"
          style={{ borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)", color: "#fca5a5" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The camera sensor did not start. Plate capture cannot work until it does — check the ribbon
            cable seating and the 5 V supply, then reboot the device.
          </span>
        </div>
      )}

      {/* Viewport, with the region of interest drawn over it. Showing the ROI
          on the live picture is the only way an installer can tell whether the
          rectangle covers the lane rather than the hedge behind it. */}
      <div
        className="relative w-full overflow-hidden rounded-2xl border"
        style={{
          aspectRatio: "4 / 3",
          background: "#000",
          borderColor: busy ? phaseMeta.tint : "var(--cv-border)",
        }}
      >
        {frame ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={frame.src}
            alt={`Lane view from ${d.name || d.id}`}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center px-6">
            <ScanBarcode className="h-8 w-8" style={{ color: "var(--cv-text-dim)" }} />
            <p className="text-sm" style={{ color: "var(--cv-text-dim)" }}>
              {d.online
                ? "Start the live view to aim the camera. It is not needed for plate capture."
                : "Device is offline."}
            </p>
          </div>
        )}

        <div
          className="pointer-events-none absolute border-2 border-dashed"
          style={{
            left: `${roi.x}%`,
            top: `${roi.y}%`,
            width: `${roi.w}%`,
            height: `${roi.h}%`,
            borderColor: "rgba(14,165,233,0.85)",
            background: "rgba(14,165,233,0.07)",
          }}
        >
          <span
            className="absolute left-0 top-0 -translate-y-full rounded-t px-1.5 py-0.5 text-[11px] font-semibold"
            style={{ background: "rgba(14,165,233,0.85)", color: "#04202e" }}
          >
            Watched lane
          </span>
        </div>

        <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
          style={{ background: "rgba(0,0,0,0.6)", color: phaseMeta.tint }}
        >
          <Circle className="h-2.5 w-2.5 fill-current" />
          {phaseMeta.label}
        </div>
      </div>

      {/* Last read. Placed directly under the picture because it is the answer
          to the question the installer is asking while standing at the lens. */}
      <div
        className="mt-3 rounded-xl border px-4 py-3"
        style={{ borderColor: "var(--cv-border)", background: "var(--cv-card-hi)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-medium" style={{ color: "var(--cv-muted)" }}>
              Last plate read
            </div>
            <div className="cv-num truncate text-[24px] font-bold" style={{ color: "var(--cv-text)" }}>
              {lastPlate || "—"}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <DecisionBadge decision={lastDecision} />
            {lastPlate && (
              <span className="text-[12px]" style={{ color: "var(--cv-text-dim)" }}>
                {lastConfidence}% confidence
              </span>
            )}
          </div>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--cv-text-dim)" }}>
          Plates are read by the control plane, not on the device. The camera decides when a vehicle is
          present and sends the sharpest frames; the reading, the allow list and the decision all happen
          server-side. <Link href="/smarthome/security?tab=vehicles" className="underline">See the full log</Link>.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={capture}
          disabled={!d.online || !ready || capturing}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${pendCls(st("capture"))}`}
          style={{ background: "var(--cv-card-hi)", color: "var(--cv-text)" }}
        >
          <Crosshair className="h-4 w-4" />
          {capturing ? "Capturing…" : "Capture now"}
        </button>
        <button
          onClick={() => {
            haptic();
            void controlPlane.command(d.id, { action: "stream", on: !streaming });
          }}
          disabled={!d.online || !ready}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40"
          style={{ background: "var(--cv-card-hi)", color: "var(--cv-text)" }}
        >
          {streaming ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
          {streaming ? "Stop live view" : "Live view (aim)"}
        </button>
        {hasRelay && (
          <button
            onClick={() => {
              haptic();
              void controlPlane.command(d.id, { action: "open" });
            }}
            disabled={!d.online}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40"
            style={{ background: "var(--cv-card-hi)", color: "var(--cv-text)" }}
          >
            <LockOpen className="h-4 w-4" />
            Open barrier
          </button>
        )}
      </div>

      <SectionLabel>Detection</SectionLabel>

      <ControlRow
        label="Armed"
        hint={
          armed
            ? hasLoop
              ? "Triggered by the loop detector, falling back to image motion."
              : "Triggered by image motion inside the watched lane."
            : "Nothing is captured while disarmed."
        }
        status={st("armed")}
      >
        <Toggle checked={armed} onChange={(v) => send({ armed: v })} status={st("armed")} disabled={!d.online} />
      </ControlRow>

      <ControlRow
        label="Motion sensitivity"
        hint="Higher fires on smaller movement. Lower it if headlights, shadows or rain trigger captures."
        status={st("sensitivity")}
      >
        <Slider
          value={n(d.state.sensitivity, 55)}
          onCommit={(v) => send({ sensitivity: v })}
          label="Motion sensitivity"
          min={1}
          max={100}
          step={5}
          unit="%"
          disabled={!d.online || !armed}
        />
      </ControlRow>

      <ControlRow
        label="Frames per vehicle"
        hint="More frames read more reliably and cost more per arrival. Three is the sweet spot at a gate."
        status={st("burst")}
      >
        <Stepper
          value={n(d.state.burst, 3)}
          onChange={(v) => send({ burst: v })}
          min={1}
          max={8}
          step={1}
          disabled={!d.online}
        />
      </ControlRow>

      <ControlRow
        label="Capture delay"
        hint="How long to wait after a vehicle is detected before the first frame, so the plate is in shot rather than entering it."
        status={st("settleMs")}
      >
        <Stepper
          value={n(d.state.settleMs, 350)}
          onChange={(v) => send({ settleMs: v })}
          min={0}
          max={2000}
          step={50}
          suffix=" ms"
          disabled={!d.online}
        />
      </ControlRow>

      <ControlRow
        label="Re-trigger delay"
        hint="Quiet period after a capture. Raise it if one vehicle produces several reads."
        status={st("cooldownMs")}
      >
        <Stepper
          value={n(d.state.cooldownMs, 6000)}
          onChange={(v) => send({ cooldownMs: v })}
          min={1000}
          max={30000}
          step={1000}
          suffix=" ms"
          disabled={!d.online}
        />
      </ControlRow>

      <SectionLabel>Watched lane</SectionLabel>
      <p className="-mt-2 mb-3 text-xs leading-relaxed" style={{ color: "var(--cv-text-dim)" }}>
        Only movement inside this rectangle triggers a capture. Cover the road surface and nothing
        else — trees, sky, a footpath or next door&apos;s gate inside it will trigger captures all
        day. Values are a percentage of the picture, so they survive a resolution change.
      </p>

      <ControlRow
        label="Traffic direction"
        hint={
          lane === "both"
            ? "One camera covering both ways. Arrivals and departures are told apart by alternating against each vehicle's last movement — accurate, but a dedicated lane is more reliable."
            : lane === "in"
              ? "Every vehicle read here is treated as arriving."
              : "Every vehicle read here is treated as leaving."
        }
        status={st("direction")}
      >
        <div className="flex flex-wrap gap-1.5">
          <ScenePill label="Entry" active={lane === "in"} onClick={() => send({ direction: "in" })} status={st("direction")} />
          <ScenePill label="Exit" active={lane === "out"} onClick={() => send({ direction: "out" })} status={st("direction")} />
          <ScenePill label="Both ways" active={lane === "both"} onClick={() => send({ direction: "both" })} status={st("direction")} />
        </div>
      </ControlRow>

      <ControlRow label="Left edge" status={st("roiX")}>
        <Stepper value={roi.x} onChange={(v) => setRoi({ x: v })} min={0} max={95} step={5} suffix="%" disabled={!d.online} />
      </ControlRow>
      <ControlRow label="Top edge" status={st("roiY")}>
        <Stepper value={roi.y} onChange={(v) => setRoi({ y: v })} min={0} max={95} step={5} suffix="%" disabled={!d.online} />
      </ControlRow>
      <ControlRow label="Width" status={st("roiW")}>
        <Stepper value={roi.w} onChange={(v) => setRoi({ w: v })} min={5} max={100 - roi.x} step={5} suffix="%" disabled={!d.online} />
      </ControlRow>
      <ControlRow label="Height" status={st("roiH")}>
        <Stepper value={roi.h} onChange={(v) => setRoi({ h: v })} min={5} max={100 - roi.y} step={5} suffix="%" disabled={!d.online} />
      </ControlRow>

      <SectionLabel>Image</SectionLabel>

      <ControlRow
        label="Capture resolution"
        hint={
          psram
            ? "A plate needs roughly 100 px across its characters. SVGA is the practical floor at 4 m."
            : "No PSRAM on this board — anything above VGA is clamped automatically."
        }
        status={st("resolution")}
      >
        <div className="flex flex-wrap gap-1.5">
          {ANPR_RES.map((r) => (
            <ScenePill
              key={r}
              label={r}
              active={resolution.toUpperCase() === r}
              onClick={() => send({ resolution: r })}
              status={st("resolution")}
            />
          ))}
        </div>
      </ControlRow>

      <ControlRow
        label="JPEG quality"
        hint="Lower is sharper and larger. Plates need detail, so this sits far below the value a normal camera would use."
        status={st("quality")}
      >
        <Slider
          value={n(d.state.quality, 10)}
          onCommit={(v) => send({ quality: v })}
          label="JPEG quality"
          min={4}
          max={40}
          step={2}
          disabled={!d.online}
        />
      </ControlRow>

      <ControlRow label="Illuminator" hint="IR lamp brightness. Leave at 0 in daylight." status={st("illum")}>
        <Slider
          value={n(d.state.illum)}
          onCommit={(v) => send({ illum: v })}
          label="Illuminator"
          min={0}
          max={100}
          step={10}
          unit="%"
          disabled={!d.online}
        />
      </ControlRow>

      <ControlRow label="Rotation" hint="For a camera mounted upside down." status={st("rotation")}>
        <div className="flex gap-1.5">
          <ScenePill label="0°" active={n(d.state.rotation) !== 180} onClick={() => send({ rotation: 0 })} status={st("rotation")} />
          <ScenePill label="180°" active={n(d.state.rotation) === 180} onClick={() => send({ rotation: 180 })} status={st("rotation")} />
        </div>
      </ControlRow>

      <SectionLabel>Since boot</SectionLabel>
      <div className="flex flex-wrap gap-2">
        <StatTile label="Vehicles" value={String(n(d.state.captures))} accent="#0ea5e9" />
        <StatTile label="Plates read" value={String(n(d.state.reads))} accent="#22c55e" />
        <StatTile label="Frames sent" value={String(n(d.state.published))} />
        <StatTile
          label="Dropped"
          value={String(n(d.state.dropped))}
          accent={n(d.state.dropped) > 0 ? "#f59e0b" : undefined}
          hint={n(d.state.dropped) > 0 ? "Weak Wi-Fi at the gate" : undefined}
        />
      </div>

      <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--cv-text-dim)" }}>
        {hasLoop
          ? "A loop detector is wired to this unit. It is the more reliable trigger — it cannot be fooled by a shadow, a headlight sweep or rain — so image motion is only consulted while the loop reads clear."
          : "No loop detector is wired to this unit, so arrivals are detected from the picture alone. Fitting an inductive loop or IR beam is the single biggest improvement you can make to trigger reliability."}
      </p>
    </div>
  );
}

/**
 * Drone Link — the device tile.
 *
 * This is deliberately NOT a ground station. There is no arm, no take-off and
 * no mode change here: those live at /smarthome/drone, where the safety
 * envelope, the preflight verdict and the refusal reasons are all on screen
 * together. A flight command hidden in a device list, one row below a light
 * switch, is a flight command somebody sends by accident.
 *
 * What this tile offers is status, and the one control that is safe from
 * anywhere: grounding the aircraft.
 */
function DroneLink({ d, send, st }: { d: Device; send: SendFn; st: StatusFn }) {
  const armed = b(d.state.armed);
  const inAir = b(d.state.inAir);
  const linked = b(d.state.link);
  const ready = b(d.state.ready);
  const allowArm = d.state.allowArm == null ? true : b(d.state.allowArm);
  const mode = typeof d.state.mode === "string" ? d.state.mode : "—";
  const readyReason = typeof d.state.readyReason === "string" ? d.state.readyReason : "";
  const battPct = n(d.state.battPct, -1);
  const sats = n(d.state.sats);
  const alt = n(d.state.alt);
  const fix = typeof d.state.fix === "string" ? d.state.fix : "none";

  return (
    <div className="space-y-4">
      {!linked && (
        <AlertBanner text="No autopilot link. This companion computer is online but is not hearing a flight controller — check the TELEM wiring and baud rate." />
      )}

      {inAir && (
        <AlertBanner
          text={`Airborne in ${mode}${alt ? ` at ${alt.toFixed(0)} m` : ""}. Flight controls are on the Drone page.`}
        />
      )}

      <div className="flex gap-2">
        <StatTile
          label="State"
          value={inAir ? "Airborne" : armed ? "Armed" : "Grounded"}
          accent={inAir ? "#6366f1" : armed ? "#f59e0b" : undefined}
        />
        <StatTile label="Battery" value={battPct < 0 ? "—" : `${battPct}%`} />
        <StatTile label="GPS" value={fix === "none" ? "No fix" : `${sats}`} hint={fix} />
      </div>

      <div>
        <SectionLabel>Status</SectionLabel>
        <ControlRow label="Mode" hint="Reported by the flight controller">
          <span className="text-sm font-semibold">{mode}</span>
        </ControlRow>
        <ControlRow
          label="Preflight"
          hint={readyReason && readyReason !== "ready" ? readyReason : "All checks passed"}
        >
          <span className="text-sm font-semibold" style={{ color: ready ? "#16a34a" : "#b45309" }}>
            {ready ? "Ready" : "Not ready"}
          </span>
        </ControlRow>
      </div>

      <div>
        <SectionLabel>Safety</SectionLabel>
        {/*
          * Grounding is the one flight-related control that is safe to put
          * anywhere, because it only ever removes a capability. A fleet
          * manager can stop an airframe being flown without walking to it,
          * and no accidental tap can start anything.
          */}
        <ControlRow
          label="Allow arming"
          hint="Turn off to ground this aircraft. It cannot be armed until this is turned back on."
          status={st("allowArm")}
        >
          <Toggle
            checked={allowArm}
            onChange={(v) => send({ action: "set", allowArm: v })}
            status={st("allowArm")}
            disabled={inAir}
          />
        </ControlRow>
        {inAir && (
          <p className="px-1 text-[13px]" style={{ color: "var(--cv-muted)" }}>
            Grounding is disabled while the aircraft is flying — it would do nothing until the next
            arm, and offering it here would suggest it could stop a flight in progress.
          </p>
        )}
      </div>

      <p className="text-[13px]" style={{ color: "var(--cv-muted)" }}>
        Take-off, landing, return-to-home and missions are on the Drone page, where the flight
        envelope and preflight checks are shown with them.
      </p>
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
