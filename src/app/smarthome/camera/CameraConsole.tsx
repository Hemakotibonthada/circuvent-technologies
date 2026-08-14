"use client";

// ═══════════════════════════════════════════════════════════════
// Camera console
// ═══════════════════════════════════════════════════════════════
// A monitoring wall plus one deep control surface, for people watching several
// cameras at once. The per-device page already controls a single camera well;
// what it cannot do is let somebody watch six at a time and act on the one that
// just moved without navigating away and losing the other five.
//
// Every control here maps to a command the camera firmware actually implements
// (firmware/camera/camera.ino): stream, snapshot, flash, record, sdclear,
// listen, speak, reboot and set. Nothing here offers an ability the hardware
// does not have.
//
// In particular there is no pan/tilt/zoom. These are fixed-lens ESP32 boards
// with no motors, and a PTZ cross that moved nothing would be worse than its
// absence — it would make every operator who tried it doubt the camera rather
// than the console.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Camera as CameraIcon,
  VideoOff,
  Radio,
  Sun,
  Disc,
  Aperture,
  Mic,
  RotateCw,
  Settings2,
  Trash2,
  Power,
  ExternalLink,
} from "lucide-react";
import {
  Surface,
  SectionTitle,
  Kpi,
  KpiGrid,
  EmptyState,
  ErrorState,
  LoadingState,
  Callout,
  DetailRow,
  RelativeTime,
  SwitchRow,
  SelectInput,
} from "../_kit/primitives";
import { useFleet } from "../_data/hooks";
import { useCameraFrames, useNow } from "@/lib/control-plane-live";
import { isCameraDevice } from "../_data/device-type";
import { controlPlane } from "@/lib/control-plane";

/**
 * The live-frame relay refuses more than eight subscriptions per socket
 * (MAX_WATCHED in platform/api/src/ws.ts). A nine-tile grid would therefore
 * have a permanently black tile and no explanation for it, so the layouts stop
 * at eight and the wall says why when there are more cameras than slots.
 */
const MAX_LIVE_TILES = 8;

const LAYOUTS = [
  { key: "1", label: "Single", cols: 1, tiles: 1 },
  { key: "4", label: "2 × 2", cols: 2, tiles: 4 },
  { key: "6", label: "3 × 2", cols: 3, tiles: 6 },
  { key: "8", label: "4 × 2", cols: 4, tiles: 8 },
] as const;

type LayoutKey = (typeof LAYOUTS)[number]["key"];

/**
 * Sensor modes the firmware accepts. Anything above VGA needs PSRAM for the
 * frame buffer; on a board without it the driver's allocation fails and hands
 * back nothing at all, which looks exactly like a dead camera — so the firmware
 * clamps to VGA. The labels say so, rather than letting someone pick UXGA and
 * quietly receive VGA.
 */
const RESOLUTION_OPTIONS = [
  { value: "QQVGA", label: "QQVGA · 160×120" },
  { value: "QVGA", label: "QVGA · 320×240" },
  { value: "CIF", label: "CIF · 400×296" },
  { value: "VGA", label: "VGA · 640×480" },
  { value: "SVGA", label: "SVGA · 800×600 (needs PSRAM)" },
  { value: "XGA", label: "XGA · 1024×768 (needs PSRAM)" },
  { value: "SXGA", label: "SXGA · 1280×1024 (needs PSRAM)" },
  { value: "UXGA", label: "UXGA · 1600×1200 (needs PSRAM)" },
];

type FleetDevice = {
  id: string;
  name: string;
  type: string;
  room?: string;
  online: boolean;
  last_seen?: string | null;
  state: Record<string, unknown>;
};

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown): boolean => v === true;
const str = (v: unknown, fallback: string): string =>
  typeof v === "string" && v.length > 0 ? v : fallback;

// ─────────────────────────────────────────────────────────── live tile ──

function TileButton({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="rounded-md border border-white/20 bg-black/50 p-1.5 transition hover:bg-white/15 active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * One camera in the wall.
 *
 * Subscribes to the frame relay only while `live`, so shrinking the layout
 * actually releases the subscription rather than leaving cameras streaming to
 * nobody — the firmware stops the sensor when its last watcher goes away, and
 * releasing here is what makes that happen.
 */
function CameraTile({
  device,
  live,
  selected,
  onSelect,
  onCommand,
}: {
  device: FleetDevice;
  live: boolean;
  selected: boolean;
  onSelect: () => void;
  onCommand: (cmd: Record<string, unknown>) => void;
}) {
  const [frame, setFrame] = useState<{ src: string; at: number } | null>(null);
  const frames = useRef(0);
  const [fps, setFps] = useState(0);

  useCameraFrames(live && device.online ? device.id : null, (f) => {
    frames.current += 1;
    setFrame({ src: `data:image/jpeg;base64,${f.jpeg}`, at: Date.now() });
  });

  // Measured, not reported. The rate the firmware was asked for is a target,
  // and the gap between that and what arrives is the reason to show it at all.
  useEffect(() => {
    if (!live) {
      setFps(0);
      return;
    }
    const t = setInterval(() => {
      setFps(frames.current);
      frames.current = 0;
    }, 1000);
    return () => clearInterval(t);
  }, [live]);

  const now = useNow(1000, device.online && frame != null);
  const streaming = bool(device.state.streaming);
  const isLive = streaming && frame != null && now - frame.at < 5000;
  const recording = bool(device.state.recording);
  const motion = bool(device.state.motionActive);
  const rotated = num(device.state.rotation, 0) === 180;

  return (
    <div
      className="relative overflow-hidden rounded-xl transition"
      style={{
        aspectRatio: "4/3",
        background: "#000",
        border: selected ? "2px solid #06b6d4" : "1px solid var(--cv-border)",
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        className="absolute inset-0 h-full w-full"
        aria-label={`Select ${device.name || device.id}`}
      >
        {frame ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={frame.src}
            alt={`Live view from ${device.name || device.id}`}
            className="h-full w-full object-contain"
            style={{ transform: rotated ? "rotate(180deg)" : undefined }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
            <VideoOff className="h-6 w-6" style={{ color: "#475569" }} />
            <span className="text-[11px]" style={{ color: "#94a3b8" }}>
              {!device.online
                ? "Offline"
                : !live
                  ? "Not in this layout"
                  : streaming
                    ? "Waiting for frames"
                    : "Idle — press play"}
            </span>
          </div>
        )}
      </button>

      <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
        <span
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{
            background: isLive ? "rgba(239,68,68,0.85)" : "rgba(15,23,42,0.75)",
            color: isLive ? "#fff" : "#cbd5e1",
          }}
        >
          <Radio className="h-2.5 w-2.5" />
          {isLive ? `Live ${fps}fps` : frame ? "Still" : "Idle"}
        </span>
        {recording && (
          <span
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: "rgba(220,38,38,0.9)", color: "#fff" }}
          >
            <Disc className="h-2.5 w-2.5" /> Rec
          </span>
        )}
      </div>

      {motion && (
        <span
          className="pointer-events-none absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase"
          style={{ background: "rgba(239,68,68,0.85)", color: "#fff" }}
        >
          Motion
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent px-2 py-1.5">
        <span className="truncate text-[11px] font-semibold text-white">
          {device.name || device.id}
        </span>
        <div className="flex shrink-0 gap-1">
          <TileButton
            title={streaming ? "Stop live view" : "Start live view"}
            disabled={!device.online}
            onClick={() => onCommand({ action: "stream", on: !streaming })}
          >
            <Power className="h-3.5 w-3.5" style={{ color: streaming ? "#f87171" : "#4ade80" }} />
          </TileButton>
          <TileButton
            title="Take a snapshot"
            disabled={!device.online}
            onClick={() => onCommand({ action: "snapshot" })}
          >
            <Aperture className="h-3.5 w-3.5 text-slate-200" />
          </TileButton>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────── detail panel ──

/**
 * A slider that commits on release.
 *
 * Committing on every change would publish one MQTT command per pixel of
 * travel, which the camera would spend its time parsing instead of capturing.
 */
function Slider({
  label,
  value,
  min,
  max,
  suffix,
  hint,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  hint?: string;
  disabled?: boolean;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  return (
    <div className="py-2">
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span style={{ color: "var(--cv-muted)" }}>{label}</span>
        <span className="font-semibold" style={{ color: "var(--cv-text)" }}>
          {local}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={() => onCommit(local)}
        onKeyUp={() => onCommit(local)}
        className="w-full accent-cyan-400 disabled:opacity-40"
        aria-label={label}
      />
      {hint && (
        <p className="mt-1 text-[11px]" style={{ color: "var(--cv-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function CameraDetail({
  device,
  onCommand,
}: {
  device: FleetDevice;
  onCommand: (cmd: Record<string, unknown>) => void;
}) {
  const s = device.state;
  const streaming = bool(s.streaming);
  const recording = bool(s.recording);
  const motion = bool(s.motion);
  const offline = !device.online;
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="space-y-4">
      <Surface>
        <SectionTitle>Live</SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={offline}
            onClick={() => onCommand({ action: "stream", on: !streaming })}
            className="rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-40"
            style={{
              borderColor: streaming ? "rgba(248,113,113,0.4)" : "rgba(74,222,128,0.4)",
              background: streaming ? "rgba(248,113,113,0.1)" : "rgba(74,222,128,0.1)",
              color: streaming ? "#fca5a5" : "#86efac",
            }}
          >
            {streaming ? "Stop live view" : "Start live view"}
          </button>
          <button
            type="button"
            disabled={offline}
            onClick={() => onCommand({ action: "snapshot" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
          >
            <Aperture className="h-4 w-4" /> Snapshot
          </button>
          <Link
            href={`/smarthome/device/${encodeURIComponent(device.id)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            <ExternalLink className="h-4 w-4" /> Device page
          </Link>
        </div>

        {/*
          * max must match FPS_MAX in firmware/camera/camera.ino, which is 30.
          * This said 15, so the one screen dedicated to cameras was the one
          * screen that could not ask for the frame rate the firmware supports —
          * and because the device silently constrains whatever it is sent, the
          * slider looked like it was doing its job at every position.
          * tests/camera-fps-parity.test.ts fails if the two drift again.
          */}
        <Slider
          label="Live frame rate"
          value={num(s.fps, 24)}
          min={1}
          max={30}
          suffix=" fps"
          disabled={offline}
          onCommit={(v) => onCommand({ action: "stream", fps: v, on: streaming })}
        />
      </Surface>

      <Surface>
        <SectionTitle>Illuminator</SectionTitle>
        <Slider
          label="Brightness"
          value={num(s.flash, 0)}
          min={0}
          max={100}
          suffix="%"
          disabled={offline}
          hint="The firmware caps the LED duty below full power: the bare illuminator has no thermal headroom, so 100% here is the safe maximum rather than the electrical one."
          onCommit={(v) => onCommand({ action: "flash", level: v })}
        />
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            disabled={offline}
            onClick={() => onCommand({ action: "flash", level: 0 })}
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-40"
          >
            Off
          </button>
          <button
            type="button"
            disabled={offline}
            onClick={() => onCommand({ action: "flash", level: 100 })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-40"
          >
            <Sun className="h-3.5 w-3.5" /> Full
          </button>
        </div>
      </Surface>

      <Surface>
        <SectionTitle>Recording</SectionTitle>
        <SwitchRow
          label="Record to card"
          checked={recording}
          disabled={offline}
          onChange={(v) => onCommand({ action: "record", on: v })}
        />
        <SwitchRow
          label="Only while motion is detected"
          hint="Turning this on also enables the detector — recording nothing is the worst way to discover it was off."
          checked={bool(s.recMotion)}
          disabled={offline}
          onChange={(v) => onCommand({ action: "record", motionOnly: v })}
        />
        <Slider
          label="Recording frame rate"
          value={num(s.recFps, 5)}
          min={1}
          max={15}
          suffix=" fps"
          disabled={offline}
          onCommit={(v) => onCommand({ action: "record", fps: v })}
        />
        <Slider
          label="Clip length"
          value={num(s.recSegment, 60)}
          min={10}
          max={600}
          suffix=" s"
          disabled={offline}
          onCommit={(v) => onCommand({ action: "record", segment: v })}
        />

        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--cv-separator)" }}>
          {!confirmClear ? (
            <button
              type="button"
              disabled={offline}
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> Erase all clips
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs" style={{ color: "var(--cv-text)" }}>
                Delete every clip on the card? This cannot be undone.
              </span>
              <button
                type="button"
                onClick={() => {
                  onCommand({ action: "sdclear" });
                  setConfirmClear(false);
                }}
                className="rounded-lg border border-red-500/40 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-200"
              >
                Erase
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </Surface>

      <Surface>
        <SectionTitle>Image</SectionTitle>
        <div className="py-2">
          <span className="mb-1 block text-[13px]" style={{ color: "var(--cv-muted)" }}>
            Resolution
          </span>
          <SelectInput
            value={str(s.resolution, "VGA")}
            disabled={offline}
            options={RESOLUTION_OPTIONS}
            onChange={(v) => onCommand({ action: "set", resolution: v })}
          />
          <p className="mt-1 text-[11px]" style={{ color: "var(--cv-muted)" }}>
            Modes above VGA need PSRAM for the frame buffer. Without it the camera clamps to
            VGA rather than failing to allocate — which would look like a dead camera.
          </p>
        </div>

        <Slider
          label="JPEG quality"
          value={num(s.quality, 12)}
          min={4}
          max={63}
          disabled={offline}
          hint="Lower is better quality and a larger frame."
          onCommit={(v) => onCommand({ action: "set", quality: v })}
        />

        <SwitchRow
          label="Rotate 180°"
          hint="For a camera mounted upside down."
          checked={num(s.rotation, 0) === 180}
          disabled={offline}
          onChange={(v) => onCommand({ action: "set", rotation: v ? 180 : 0 })}
        />
      </Surface>

      <Surface>
        <SectionTitle>Motion</SectionTitle>
        <SwitchRow
          label="Motion detection"
          checked={motion}
          disabled={offline}
          onChange={(v) => onCommand({ action: "set", motion: v })}
        />
        <Slider
          label="Sensitivity"
          value={num(s.sensitivity, 50)}
          min={1}
          max={100}
          disabled={offline || !motion}
          onCommit={(v) => onCommand({ action: "set", sensitivity: v })}
        />
      </Surface>

      <Surface>
        <SectionTitle>Audio</SectionTitle>
        <button
          type="button"
          disabled={offline}
          onClick={() => onCommand({ action: "listen", on: !bool(s.mic) })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-40"
        >
          <Mic className="h-4 w-4" style={{ color: bool(s.mic) ? "#f87171" : undefined }} />
          {bool(s.mic) ? "Stop listening" : "Listen"}
        </button>
        <p className="mt-2 text-[11px]" style={{ color: "var(--cv-muted)" }}>
          Listening arms a lease that expires by itself, so a closed tab cannot leave a
          microphone in someone&apos;s home switched on. That expiry is a privacy property
          rather than an optimisation, which is why this needs re-arming instead of latching on.
        </p>
        <Slider
          label="Speaker volume"
          value={num(s.volume, 60)}
          min={0}
          max={100}
          suffix="%"
          disabled={offline}
          onCommit={(v) => onCommand({ action: "speak", volume: v })}
        />
      </Surface>

      <Surface>
        <SectionTitle>Status</SectionTitle>
        <DetailRow label="Device">{device.id}</DetailRow>
        <DetailRow label="Type">{device.type}</DetailRow>
        <DetailRow label="Last seen">
          {device.last_seen ? <RelativeTime iso={device.last_seen} /> : "—"}
        </DetailRow>
        <DetailRow label="Card">{bool(s.sd) ? "Present" : "Not detected"}</DetailRow>
        <div className="mt-3">
          <button
            type="button"
            disabled={offline}
            onClick={() => onCommand({ action: "reboot" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-40"
          >
            <RotateCw className="h-3.5 w-3.5" /> Reboot camera
          </button>
          <p className="mt-1 text-[11px]" style={{ color: "var(--cv-muted)" }}>
            A clip being written is closed first, so a reboot cannot leave a truncated file on
            the card.
          </p>
        </div>
      </Surface>
    </div>
  );
}

// ────────────────────────────────────────────────────────────── page ──

export function CameraConsole() {
  const { devices, loading, error, refresh } = useFleet();
  const [layout, setLayout] = useState<LayoutKey>("4");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const cameras = useMemo(
    () => (devices as unknown as FleetDevice[]).filter((d) => isCameraDevice(d as never)),
    [devices]
  );

  const chosen = LAYOUTS.find((l) => l.key === layout) ?? LAYOUTS[1];

  /*
   * Which cameras hold a live subscription. The selected camera is sorted to
   * the front so that choosing one can never fail to show it, and online
   * cameras take the remaining slots ahead of offline ones, which cannot
   * produce a frame anyway.
   */
  const liveIds = useMemo(() => {
    const ordered = [...cameras].sort((a, b) => {
      if (a.id === selectedId) return -1;
      if (b.id === selectedId) return 1;
      if (a.online !== b.online) return a.online ? -1 : 1;
      return 0;
    });
    return new Set(
      ordered.slice(0, Math.min(chosen.tiles, MAX_LIVE_TILES)).map((d) => d.id)
    );
  }, [cameras, chosen.tiles, selectedId]);

  const selected = cameras.find((d) => d.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && cameras.length > 0) setSelectedId(cameras[0].id);
  }, [cameras, selectedId]);

  const send = useCallback(
    async (deviceId: string, cmd: Record<string, unknown>) => {
      setNote(null);
      try {
        const res = await controlPlane.command(deviceId, cmd);
        if (res && typeof res === "object" && "error" in res && res.error) {
          setNote(String(res.error));
          return;
        }
        // The wall renders device state, which arrives by its own path, so this
        // refresh is what makes a toggle look like it did something.
        refresh();
      } catch (e) {
        setNote(e instanceof Error ? e.message : "The camera did not accept that command.");
      }
    },
    [refresh]
  );

  if (loading && devices.length === 0) return <LoadingState label="Loading cameras" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const online = cameras.filter((d) => d.online).length;
  const streaming = cameras.filter((d) => bool(d.state.streaming)).length;
  const recording = cameras.filter((d) => bool(d.state.recording)).length;
  const motionNow = cameras.filter((d) => bool(d.state.motionActive)).length;
  const hidden = Math.max(0, cameras.length - chosen.tiles);

  return (
    <div className="space-y-5">
      <KpiGrid cols={4}>
        <Kpi label="Cameras" value={cameras.length} icon={CameraIcon} />
        <Kpi label="Online" value={online} tone={online > 0 ? "ok" : undefined} />
        <Kpi label="Streaming" value={streaming} />
        <Kpi
          label="Motion now"
          value={motionNow}
          tone={motionNow > 0 ? "warning" : undefined}
        />
      </KpiGrid>

      {note && <Callout tone="warning">{note}</Callout>}

      {cameras.length === 0 ? (
        <EmptyState
          icon={CameraIcon}
          title="No cameras yet"
          body="Add a Circuvent camera, or a device that reports a video source, and it will appear here."
        />
      ) : (
        <>
          <Surface>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <SectionTitle>
                Wall{recording > 0 ? ` — ${recording} recording` : ""}
              </SectionTitle>
              <div className="flex gap-1">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    onClick={() => setLayout(l.key)}
                    aria-pressed={layout === l.key}
                    className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition"
                    style={{
                      borderColor: layout === l.key ? "rgba(6,182,212,0.6)" : "var(--cv-border)",
                      background: layout === l.key ? "rgba(6,182,212,0.15)" : "transparent",
                      color: layout === l.key ? "#67e8f9" : "var(--cv-muted)",
                    }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {cameras.length > MAX_LIVE_TILES && (
              <Callout tone="info">
                The live relay carries {MAX_LIVE_TILES} cameras at once. Beyond that, tiles show
                their last known state rather than moving pictures — select a camera to give it
                a slot.
              </Callout>
            )}

            <div
              className="mt-3 grid gap-3"
              style={{ gridTemplateColumns: `repeat(${chosen.cols}, minmax(0, 1fr))` }}
            >
              {cameras.slice(0, chosen.tiles).map((d) => (
                <CameraTile
                  key={d.id}
                  device={d}
                  live={liveIds.has(d.id)}
                  selected={d.id === selectedId}
                  onSelect={() => setSelectedId(d.id)}
                  onCommand={(cmd) => void send(d.id, cmd)}
                />
              ))}
            </div>

            {hidden > 0 && (
              <p className="mt-2 text-[11px]" style={{ color: "var(--cv-muted)" }}>
                {hidden} more camera{hidden === 1 ? "" : "s"} — choose a larger layout to see
                {hidden === 1 ? " it" : " them"}.
              </p>
            )}
          </Surface>

          {selected && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Settings2 className="h-4 w-4" style={{ color: "var(--cv-muted)" }} />
                <h2 className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
                  {selected.name || selected.id}
                </h2>
                {!selected.online && (
                  <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-400">
                    Offline
                  </span>
                )}
              </div>
              <CameraDetail device={selected} onCommand={(cmd) => void send(selected.id, cmd)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
