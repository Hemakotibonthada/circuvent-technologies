// What a device tile should *look* like, derived from what the device reports.
//
// A tile used to be an icon, a name and a switch: identical for a lamp at 5%
// and the same lamp at full, and identical for a fan idling and a fan at
// maximum. Everything the device published about how hard it was working was on
// the tile already, as a number, and none of it was visible at a glance — which
// is the only thing a grid of tiles is for.
//
// Kept pure and free of React so the rules can be tested without rendering, and
// so the console and anything else that draws a device agree on them.

import { capabilities, fanLevel } from "@/app/smarthome/DeviceControls";
import { masterPower } from "@/lib/smarthome-command-map";
import type { Device } from "@/lib/control-plane";

export type TileMotion = "spin" | "glow" | "none";

export interface TileVisual {
  /** 0..100 when the device has a continuous level, else null. */
  level: number | null;
  /** What the hardware physically does, for the icon treatment. */
  motion: TileMotion;
  /** The colour to render the device in — its own, when it has one. */
  tint: string;
  /** Seconds per revolution for a spinning icon; null when it should not spin. */
  spinSeconds: number | null;
  /** 0..1 glow strength; 0 when it should not glow. */
  glow: number;
}

/** A fan at full speed, in seconds per revolution, and at its slowest. */
const SPIN_FASTEST = 0.45;
const SPIN_SLOWEST = 2.6;

const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/**
 * How a tile should present a device right now.
 *
 * `on` and `online` are passed in rather than re-derived: the tile already
 * knows both, and a second opinion about whether a device is on is exactly the
 * kind of disagreement that shows a lamp glowing on a tile that says "Off".
 */
export function tileVisual(device: Device, opts: { on: boolean; online: boolean }): TileVisual {
  const caps = capabilities(device.type);
  const state = (device.state ?? {}) as Record<string, unknown>;
  const live = opts.on && opts.online;

  let level: number | null = null;
  let motion: TileMotion = "none";

  if (caps.fan) {
    level = fanLevel(device, caps.fan);
    motion = "spin";
  } else if (caps.dimmer) {
    const raw = state[caps.dimmer.field];
    level = typeof raw === "number" && Number.isFinite(raw) ? clamp(raw, 0, 100) : null;
    motion = "glow";
  } else if (masterPower(device)) {
    /*
     * A plug or a relay has no level, but it does visibly do something.
     *
     * masterPower, not capabilities().power — the capability table hands every
     * unrecognised type a default power field, so keying on that made motion
     * sensors, meters and cameras glow as though they were switched on. This is
     * the function that already decides whether the tile draws a switch at all,
     * so the icon and the button now agree by construction.
     */
    motion = "glow";
  }

  /*
   * A light renders in its own colour.
   *
   * The tile accent is a per-type brand colour, which is right for a plug and
   * wrong for an RGB bulb: a lamp set to red should not appear amber on the
   * dashboard just because that is the colour we chose for lights.
   */
  const reported = caps.color ? state[caps.color.field] : undefined;
  const tint = live && isHex(reported) ? reported : "";

  /*
   * Speed carries the level. A fixed rotation looks the same at 30% and 100%,
   * which throws away the one thing the animation could have said. Inverted
   * because a higher level means less time per revolution.
   */
  const spinSeconds =
    motion === "spin" && live && level !== null && level > 0
      ? SPIN_SLOWEST - (SPIN_SLOWEST - SPIN_FASTEST) * (clamp(level, 0, 100) / 100)
      : null;

  /*
   * Glow follows brightness, floored well above zero: a lamp dimmed to 5% is
   * still on, and a tile that renders it identically to off is wrong about the
   * one thing it is being asked.
   */
  const glow = motion === "glow" && live ? (level === null ? 1 : 0.35 + 0.65 * (clamp(level, 0, 100) / 100)) : 0;

  return { level, motion, tint, spinSeconds, glow };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Stroke offset for a progress ring of a given radius.
 *
 * Returned rather than computed in the component so the arc maths is covered
 * by tests: an off-by-one here is a ring that reads 90% when the device is at
 * 100%, which is worse than no ring at all.
 */
export function ringDash(level: number, radius: number): { dash: number; gap: number } {
  const circumference = 2 * Math.PI * radius;
  const filled = (clamp(level, 0, 100) / 100) * circumference;
  return { dash: filled, gap: circumference - filled };
}
