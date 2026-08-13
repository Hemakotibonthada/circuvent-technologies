"use client";

/**
 * Circuvent Console — device presentation.
 *
 * The tile, the metric readout and the power control are shared by the Overview
 * dashboard, the Devices section and the Spaces section so a relay reads the
 * same everywhere. All values come from `device.state` as reported by firmware;
 * a field the device has not published renders as "—" rather than a zero.
 */

import Link from "next/link";
import { Star, type LucideIcon } from "lucide-react";
import type { Device } from "@/lib/control-plane";
import { masterPower } from "@/lib/smarthome-command-map";
import { haptic, type FieldStatus } from "@/lib/smarthome-realtime";
import { deviceMeta, capabilities, fanLevel } from "../DeviceControls";
import { StatusDot, formatRelative } from "./primitives";
import { Slider } from "./Slider";
import { tileVisual, ringDash, type TileVisual } from "./tile-visual";

/**
 * Primary readout for a device type, derived from published state.
 * Returns `null` when the device has not reported the field yet — callers show
 * a placeholder instead of implying a measurement of zero.
 */
export function deviceMetric(d: Device): string | null {
  const s = d.state ?? {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const onOf = (...keys: string[]) => {
    const present = keys.filter((k) => k in s);
    if (present.length === 0) return null;
    return `${present.filter((k) => Boolean(s[k])).length}/${keys.length} on`;
  };

  switch (d.type) {
    case "aquaguard": {
      const v = num(s.level);
      return v == null ? null : `${v}%`;
    }
    case "watertank": {
      const v = num(s.ohPct);
      return v == null ? null : `${v}%`;
    }
    case "smart-plug":
    case "energy-monitor": {
      const v = num(s.watts);
      return v == null ? null : `${v.toFixed(0)} W`;
    }
    case "guardian":
      if (!("armed" in s) && !("sos" in s)) return null;
      return s.sos ? "SOS" : s.armed ? "Armed" : "Disarmed";
    case "motion-sensor":
      if (!("motion" in s) && !("armed" in s)) return null;
      return s.motion ? "Motion" : s.armed ? "Armed" : "Clear";
    case "smart-switch":
      return onOf("power", "power2");
    case "home-hub":
      return onOf("power", "power2", "power3", "power4");
    case "touchboard":
      return onOf("g1", "g2", "g3");
    case "sentinel": {
      if (s.gasAlarm) return "Gas alarm";
      if (s.hasGas && s.gasWarmingUp) return "Warming up";
      const t = num(s.temp);
      const h = num(s.humidity);
      if (s.climateOk && t != null && h != null) return `${t.toFixed(0)}° · ${h.toFixed(0)}%`;
      // Relay count varies by board, so the denominator comes from what the
      // device reported — a two-relay panel must not read "1/4 on".
      const n = num(s.relays);
      if (n == null) return null;
      return onOf(...Array.from({ length: Math.max(0, Math.min(32, Math.round(n))) }, (_, i) => `r${i + 1}`));
    }
    case "facedoor":
    case "smart-lock":
      return "locked" in s ? (s.locked ? "Locked" : "Unlocked") : null;
    case "rfid-gate":
      return s.barrier == null ? null : String(s.barrier);
    case "drone-link":
    case "drone-x1": {
      /*
       * What the aircraft is doing, not a number.
       *
       * Battery would be the obvious tile readout and is the wrong one: a
       * parked aircraft on a charger reads 100% and a crashed one reads
       * whatever it read last, so the number is reassuring in exactly the two
       * cases where it should not be. "Airborne" is the fact that changes what
       * somebody does next.
       */
      if (s.inAir === true) {
        const alt = num(s.alt);
        return alt == null ? "Airborne" : `Airborne · ${alt.toFixed(0)} m`;
      }
      if (s.armed === true) return "Armed";
      if (s.link === false) return "No autopilot";
      if (s.allowArm === false) return "Grounded";
      if (s.ready === false) return "Not ready";
      if (s.ready === true) return "Ready";
      return null;
    }
    case "anpr-cam": {
      // to the phase rather than a count, because "Watching" tells you the
      // lane is being covered while "0 vehicles" reads like a fault.
      const plate = typeof s.lastPlate === "string" && s.lastPlate ? s.lastPlate : null;
      if (plate) return plate;
      if (s.armed === false) return "Disarmed";
      if (s.ready === false) return "No sensor";
      const ph = typeof s.phase === "string" ? s.phase : null;
      if (ph === "settle" || ph === "burst") return "Vehicle";
      return ph ? "Watching" : null;
    }
    case "agri-starter":
      return "pump" in s ? (s.pump ? "Pump on" : "Pump off") : null;
    default: {
      const w = num(s.watts);
      if (w != null) return `${w.toFixed(0)} W`;
      return null;
    }
  }
}

/** Instantaneous power draw, when the device actually reports it. */
export function deviceWatts(d: Device): number | null {
  const w = (d.state ?? {}).watts;
  return typeof w === "number" && Number.isFinite(w) ? w : null;
}

const RING: Record<FieldStatus, string> = {
  idle: "",
  pending: "ring-2 ring-cyan-400/60",
  confirmed: "ring-2 ring-emerald-400/70",
  failed: "ring-2 ring-red-400/70",
};

/** Compact on/off control that paints optimistically and rings on confirm. */
export function PowerButton({
  device,
  status,
  onSend,
  size = "md",
}: {
  device: Device;
  status: FieldStatus;
  onSend: (cmd: Record<string, unknown>) => void;
  size?: "sm" | "md";
}) {
  const mp = masterPower(device);
  if (!mp) return null;
  const dim = size === "sm" ? "h-9 w-9" : "h-[44px] w-[44px]";

  /*
   * The same reading the dashboard tile gives, on the control that appears
   * everywhere else.
   *
   * This button is what Rooms, Groups, the fleet list, the floorplan and the
   * device drawer all render, and it said only ON or OFF — so a lamp dimmed to
   * five percent and the same lamp at full were the same word in the same
   * colour on five screens. The ring and the colour are added around the text
   * rather than replacing it: "ON" is the state, and a ring is not a
   * substitute for a word somebody may be relying on.
   */
  const visual = tileVisual(device, { on: mp.on, online: device.online });
  const px = size === "sm" ? 36 : 44;
  const r = px / 2 - 2;
  const ring = visual.level !== null ? ringDash(visual.level, r) : null;
  const lit = mp.on && device.online;

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        haptic();
        onSend(mp.cmd(!mp.on) as Record<string, unknown>);
      }}
      disabled={!device.online}
      aria-label={`${mp.on ? "Turn off" : "Turn on"} ${device.name}`}
      title={device.online ? mp.label : "Device offline"}
      className={`${dim} ${RING[status]} relative flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase tracking-wide transition active:scale-90 disabled:opacity-40 disabled:active:scale-100`}
      style={
        mp.on
          ? {
              background: visual.tint || "var(--cv-gradient)",
              color: "#fff",
              boxShadow:
                lit && visual.glow > 0
                  ? `0 0 ${6 + 12 * visual.glow}px ${visual.tint || "var(--cv-accent)"}`
                  : "var(--cv-shadow-1)",
            }
          : { background: "var(--cv-input-bg)", border: "1px solid var(--cv-border)", color: "var(--cv-muted)" }
      }
    >
      {ring && (
        <svg
          className="pointer-events-none absolute inset-0"
          viewBox={`0 0 ${px} ${px}`}
          aria-hidden="true"
          style={{ transform: "rotate(-90deg)" }}
        >
          <circle
            cx={px / 2}
            cy={px / 2}
            r={r}
            fill="none"
            stroke={visual.tint || "var(--cv-accent)"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${ring.dash} ${ring.gap}`}
            style={{ transition: "stroke-dasharray 300ms ease-out" }}
          />
        </svg>
      )}
      {mp.on ? "ON" : "OFF"}
    </button>
  );
}

/**
 * Accessory tile.
 *
 * Modelled on the Home app's accessory grid: an active accessory inverts to a
 * bright fill with dark text so its state is readable at a glance across a wall
 * of tiles, while an inactive one recedes into the canvas. The circular icon
 * badge is the on/off target; the rest of the tile opens the device.
 *
 * Navigation is an absolutely-positioned overlay link rather than a wrapper
 * around the content, because the toggle is itself a button and a button nested
 * inside an anchor is invalid markup that screen readers announce incoherently.
 */
/**
 * The one continuous control worth putting on a tile, if the device has one.
 *
 * Brightness for a light, speed for a fan — the adjustment people actually
 * reach for. Anything richer (colour, thermostat setpoints) stays on the
 * device page, because a tile is 128px tall and a wall of controls there stops
 * being glanceable, which is the only thing a tile is for.
 *
 * Returns null when the type has nothing continuous to offer, so a plug or a
 * sensor tile is unchanged.
 */
export function inlineControl(device: Device): {
  field: string;
  label: string;
  value: number;
  min: number;
  max: number;
  ticks?: number[];
  tickLabels?: Record<number, string>;
} | null {
  const caps = capabilities(device.type);

  if (caps.fan) {
    return {
      field: caps.fan.field,
      label: caps.fan.label,
      // Reads `speed` when a fan predates `level`, so the handle starts where
      // the fan actually is rather than at zero on one that is running.
      value: fanLevel(device, caps.fan),
      min: 0,
      max: 100,
      ticks: [0, 33, 66, 100],
      tickLabels: { 0: "Off", 33: "Low", 66: "Med", 100: "High" },
    };
  }

  if (caps.dimmer) {
    const raw = device.state?.[caps.dimmer.field];
    return {
      field: caps.dimmer.field,
      label: caps.dimmer.label,
      value: typeof raw === "number" && Number.isFinite(raw) ? raw : 0,
      min: caps.dimmer.min,
      max: caps.dimmer.max,
    };
  }

  return null;
}

/**
 * The icon, with a level ring around it and the motion the hardware makes.
 *
 * A tile was an icon, a name and a switch — identical for a lamp at 5% and the
 * same lamp at full, and for a fan idling and a fan at maximum. Everything
 * needed to tell those apart was already published; none of it was visible
 * without opening the device.
 *
 * The ring is state, the spin and glow are motion. That distinction matters
 * under prefers-reduced-motion: globals.css neutralises animations globally, so
 * the fan stops turning and the lamp stops breathing, while the ring and the
 * colour stay exactly as they were. Reduced motion should remove motion, not
 * information.
 */
function TileIcon({
  Icon,
  visual,
  on,
  accent,
}: {
  Icon: LucideIcon;
  visual: TileVisual;
  on: boolean;
  accent: string;
}) {
  const colour = visual.tint || accent;
  const R = 20; // sits just outside a 44px control
  const ring = visual.level !== null ? ringDash(visual.level, R) : null;

  return (
    <>
      {ring && (
        <svg
          className="pointer-events-none absolute inset-0"
          viewBox="0 0 44 44"
          aria-hidden="true"
          /* Rotated so the arc starts at twelve o'clock; SVG circles begin at
             three, which reads as a level that is already a quarter along. */
          style={{ transform: "rotate(-90deg)" }}
        >
          <circle cx="22" cy="22" r={R} fill="none" stroke="var(--cv-border)" strokeWidth="2.5" />
          <circle
            cx="22"
            cy="22"
            r={R}
            fill="none"
            stroke={colour}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${ring.dash} ${ring.gap}`}
            style={{ transition: "stroke-dasharray 300ms ease-out" }}
          />
        </svg>
      )}
      <Icon
        className={`h-[22px] w-[22px] ${visual.spinSeconds ? "cv-spin" : ""} ${
          visual.motion === "glow" && on && visual.glow > 0 ? "cv-breathe" : ""
        }`}
        /* The shared keyframe turns at a fixed rate; the duration carries the
           level, so a fan at 30% and one at 100% do not look the same. */
        style={visual.spinSeconds ? { animationDuration: `${visual.spinSeconds}s` } : undefined}
      />
    </>
  );
}

export function DeviceTile({
  device,
  status,
  onSend,
  onFavorite,
  href,
}: {
  device: Device;
  status: FieldStatus;
  onSend: (cmd: Record<string, unknown>) => void;
  onFavorite?: () => void;
  href?: string;
}) {
  const meta = deviceMeta(device.type);
  const Icon = meta.icon;
  const readout = deviceMetric(device);
  const target = href ?? `/smarthome/device/${encodeURIComponent(device.id)}`;
  const mp = masterPower(device);
  const inline = inlineControl(device);
  const on = Boolean(mp?.on) && device.online;
  const visual = tileVisual(device, { on, online: device.online });
  const tint = meta.accent;

  // Secondary line. Offline devices report when they were last heard from
  // rather than a stale state, so a dark tile is never mistaken for "off".
  const statusLine = !device.online
    ? device.last_seen
      ? `No response · ${formatRelative(device.last_seen)}`
      : "Never seen"
    : mp
      ? mp.on
        ? "On"
        : "Off"
      : "Online";

  return (
    <div
      className={`cv-tile group relative flex min-h-[128px] flex-col justify-between p-4 ${
        on ? "cv-tile-on" : ""
      } ${status === "pending" ? "cv-pending" : ""} ${device.online ? "" : "opacity-65"}`}
    >
      <Link
        href={target}
        aria-label={`Open ${device.name}`}
        className="absolute inset-0 z-0 focus:outline-none focus-visible:ring-2"
        style={{ borderRadius: "inherit", "--tw-ring-color": "var(--cv-accent)" } as React.CSSProperties}
      />

      <div className="pointer-events-none relative z-10 flex items-start justify-between gap-2">
        {mp ? (
          <button
            type="button"
            onClick={() => {
              haptic();
              onSend(mp.cmd(!mp.on) as Record<string, unknown>);
            }}
            disabled={!device.online}
            aria-label={`${mp.on ? "Turn off" : "Turn on"} ${device.name}`}
            title={device.online ? mp.label : "Device offline"}
            className={`pointer-events-auto relative flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full transition active:scale-90 disabled:active:scale-100 ${RING[status]}`}
            style={
              on
                ? {
                    background: visual.tint || tint,
                    color: "#fff",
                    /* The lamp's own glow, at its own brightness. A fixed
                       shadow says "on"; this says how on. */
                    boxShadow:
                      visual.glow > 0
                        ? `0 0 ${8 + 14 * visual.glow}px ${(visual.tint || tint)}${Math.round(
                            visual.glow * 160
                          )
                            .toString(16)
                            .padStart(2, "0")}`
                        : "var(--cv-shadow-1)",
                  }
                : { background: "var(--cv-card-hi)", color: tint }
            }
          >
            <TileIcon Icon={Icon} visual={visual} on={on} accent={tint} />
          </button>
        ) : (
          <span
            className="relative flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--cv-card-hi)", color: tint }}
          >
            <TileIcon Icon={Icon} visual={visual} on={on} accent={tint} />
          </span>
        )}

        <div className="flex items-center gap-2">
          {readout && (
            <span className="cv-num text-[15px] font-semibold" style={{ color: "var(--cv-text)" }}>
              {readout}
            </span>
          )}
          {onFavorite && (
            <button
              type="button"
              onClick={onFavorite}
              aria-label={device.favorite ? "Remove from favourites" : "Add to favourites"}
              className="pointer-events-auto shrink-0 opacity-50 transition hover:opacity-100"
            >
              <Star
                className="h-4 w-4"
                fill={device.favorite ? "#f0a020" : "none"}
                style={{ color: device.favorite ? "#f0a020" : "var(--cv-muted)" }}
              />
            </button>
          )}
        </div>
      </div>

      <div className="pointer-events-none relative z-10 mt-3 min-w-0">
        <div className="truncate text-[15px] font-semibold leading-tight" style={{ color: "var(--cv-text)" }}>
          {device.name}
        </div>
        <div
          className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] leading-tight"
          style={{ color: "var(--cv-muted)" }}
        >
          <StatusDot online={device.online} pulse={false} />
          <span className="truncate">
            {statusLine}
            {device.room ? ` · ${device.room}` : ""}
          </span>
        </div>

        {/*
          * Dimming and fan speed, on the tile.
          *
          * The dashboard offered power and nothing else, so turning a light
          * down meant opening its page — two navigations to do the thing the
          * device exists for. The slider only commits when the gesture
          * settles, so a drag is one command rather than one per frame, and it
          * carries its own pointer events because the whole tile is covered by
          * a link to the device page that would otherwise swallow the drag.
          */}
        {inline && device.online && (
          <div className="pointer-events-auto mt-3">
            <Slider
              label={`${inline.label} — ${device.name}`}
              value={inline.value}
              min={inline.min}
              max={inline.max}
              step={1}
              unit="%"
              ticks={inline.ticks}
              tickLabels={inline.tickLabels}
              onCommit={(v) => {
                haptic();
                onSend({ [inline.field]: v });
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
