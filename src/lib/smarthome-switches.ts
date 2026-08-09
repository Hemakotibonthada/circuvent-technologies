"use client";

/**
 * The "switch" model.
 *
 * A user does not think in devices — they think in switches. A 4-gang home hub
 * in the hallway is four things to them: the porch light, the geyser, the
 * garden pump and a spare. Scheduling, history and quick actions all need to
 * address *one relay channel*, not the board it happens to be soldered to.
 *
 * This module is the single place that answers "what can be switched here, and
 * what does the user call it". It is derived from `getCommandFields`, which is
 * itself derived from `projectCommand`, so a switch listed here is always one
 * the firmware actually reads — there is no way to offer a channel that
 * silently does nothing.
 */

import { useCallback, useMemo } from "react";
import type { Device } from "./control-plane";
import { getCommandFields } from "@/app/smarthome/automation/describe";
import { readFieldCommand } from "./smarthome-command-map";
import { useChannelLabels, useChannelConfig, type ChannelKind } from "./smarthome-prefs";

/** One independently switchable output on a device. */
export interface SwitchTarget {
  /** `${deviceId}::${field}` — stable, and safe to use as a React key. */
  key: string;
  deviceId: string;
  deviceName: string;
  deviceType: string;
  /** Command/state key the firmware reads, e.g. "power2" or "g1". */
  field: string;
  /** What the user calls it, falling back to the generic channel name. */
  label: string;
  /** The generic name, e.g. "Channel 2" — shown as a subtitle when renamed. */
  fallbackLabel: string;
  /** Presentation model chosen by the user (light, geyser, gate…). */
  kind: ChannelKind;
  /** Current on/off state, or undefined when the device has not reported. */
  on: boolean | undefined;
  online: boolean;
}

/**
 * Fields that are boolean but are *not* a switchable load — arming a sensor or
 * locking a door is a mode, not a relay, and grouping them under "switches"
 * would make a schedule list read as if the front door were a lamp.
 */
const NON_LOAD_FIELDS = new Set(["armed", "auto", "locked", "all", "away", "muted"]);

/**
 * Drops channels a *particular unit* does not have.
 *
 * `getCommandFields` is keyed on device type, but the Sentinel ships on two
 * boards: the camera build gives two of its four relays up to the sensor bus.
 * Listing r3/r4 for that unit would put two switches in the schedule list that
 * can never turn anything on. The firmware publishes `relays` on every boot so
 * this can be answered from data rather than assumed.
 */
function hasChannel(device: Device, field: string): boolean {
  if (device.type !== "sentinel") return true;
  const m = /^r(\d+)$/.exec(field);
  if (!m) return true;
  const n = device.state.relays;
  // Before the device has reported, show nothing rather than guess a board.
  if (typeof n !== "number" || !Number.isFinite(n)) return false;
  return Number(m[1]) <= n;
}

/** Splits a device into its individually switchable outputs. */
export function switchTargetsOf(
  device: Device,
  labelFor: (deviceId: string, field: string, fallback: string) => string,
  kindFor: (deviceId: string, field: string) => ChannelKind
): SwitchTarget[] {
  return getCommandFields(device.type)
    .filter((f) => f.kind === "bool" && !NON_LOAD_FIELDS.has(f.key) && hasChannel(device, f.key))
    .map((f) => {
      const raw = device.state[f.key];
      return {
        key: `${device.id}::${f.key}`,
        deviceId: device.id,
        deviceName: device.name || device.id,
        deviceType: device.type,
        field: f.key,
        label: labelFor(device.id, f.key, f.label),
        fallbackLabel: f.label,
        kind: kindFor(device.id, f.key),
        on: typeof raw === "boolean" ? raw : undefined,
        online: device.online,
      };
    });
}

export interface SwitchIndex {
  /** Every switch across the fleet, grouped device by device. */
  switches: SwitchTarget[];
  /** Lookup by `${deviceId}::${field}`. */
  byKey: Map<string, SwitchTarget>;
  /** Switches belonging to one device. */
  forDevice: (deviceId: string) => SwitchTarget[];
  /**
   * Best-effort name for whatever a stored command targets. Falls back to the
   * device name when the command is not a recognised single-switch command,
   * so a schedule created before per-switch support still reads sensibly.
   */
  describeCommand: (deviceId: string | undefined, command: Record<string, unknown> | undefined) => string;
}

/** Fleet-wide switch index, with the user's own names applied. */
export function useSwitchIndex(devices: Device[]): SwitchIndex {
  const { labelFor } = useChannelLabels();
  const { configFor } = useChannelConfig();

  const kindFor = useCallback(
    (deviceId: string, field: string) => configFor(deviceId, field).kind,
    [configFor]
  );

  const switches = useMemo(
    () => devices.flatMap((d) => switchTargetsOf(d, labelFor, kindFor)),
    [devices, labelFor, kindFor]
  );

  const byKey = useMemo(() => new Map(switches.map((s) => [s.key, s])), [switches]);

  const byDevice = useMemo(() => {
    const m = new Map<string, SwitchTarget[]>();
    for (const s of switches) {
      const list = m.get(s.deviceId);
      if (list) list.push(s);
      else m.set(s.deviceId, [s]);
    }
    return m;
  }, [switches]);

  const forDevice = useCallback((deviceId: string) => byDevice.get(deviceId) ?? [], [byDevice]);

  const deviceTypeById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of devices) m.set(d.id, d.type);
    return m;
  }, [devices]);

  /**
   * Names the switch a stored command addresses.
   *
   * Decoded rather than read off the first key: a Home Hub channel arrives as
   * `{ ch: 1, on: true }` and there is no `power2` anywhere in it. Guessing the
   * key made every switch timer's label go blank the moment commands started
   * being addressed the way the firmware actually reads them.
   */
  const describeCommand = useCallback(
    (deviceId: string | undefined, command: Record<string, unknown> | undefined) => {
      if (!deviceId || !command) return "";
      const type = deviceTypeById.get(deviceId) ?? "";
      const read = readFieldCommand(type, command);
      if (!read) return "";
      return byKey.get(`${deviceId}::${read.field}`)?.label ?? "";
    },
    [byKey, deviceTypeById]
  );

  return { switches, byKey, forDevice, describeCommand };
}

/* ------------------------------------------------------------------ */
/* Schedule helpers                                                    */
/* ------------------------------------------------------------------ */

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Presentation order — a week that starts on Monday reads better in a planner. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const EVERY_DAY: number[] = [0, 1, 2, 3, 4, 5, 6];

/** Human summary of a day filter. Empty / all seven both mean "every day". */
export function daysText(days: number[] | undefined): string {
  if (!days || days.length === 0 || days.length === 7) return "Every day";
  const set = new Set(days);
  const weekdays = [1, 2, 3, 4, 5].every((d) => set.has(d));
  const weekend = set.has(0) && set.has(6);
  if (weekdays && !weekend && set.size === 5) return "Weekdays";
  if (weekend && set.size === 2) return "Weekends";
  return WEEK_ORDER.filter((d) => set.has(d))
    .map((d) => WEEKDAY_LABELS[d])
    .join(", ");
}

/**
 * The control plane evaluates `at` in IST, so a browser in another zone must
 * be told what the schedule really means rather than being allowed to assume
 * its own clock. Returns an empty string when the browser is already on IST.
 */
export function istOffsetNote(): string {
  if (typeof Intl === "undefined") return "";
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (local === "Asia/Kolkata") return "";
  return `Times are India Standard Time (IST). Your browser is on ${local || "another timezone"}.`;
}

/** "HH:MM" in IST right now — the same clock the scheduler compares against. */
export function istNow(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/** Today's weekday in IST, 0=Sunday … 6=Saturday. */
export function istWeekday(): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(new Date());
  return (WEEKDAY_LABELS as readonly string[]).indexOf(name);
}

/**
 * Minutes until a daily HH:MM schedule next fires, honouring its day filter.
 * Everything is computed on the IST clock because that is what the server
 * uses — doing this in browser-local time is the classic way to show a user
 * in another zone a "next run" that is hours wrong.
 */
export function minutesUntilNextRun(at: string, days: number[] | undefined): number | null {
  const [h, m] = at.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;

  const nowText = istNow();
  const [nh, nm] = nowText.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(nh) || !Number.isFinite(nm)) return null;

  const target = h * 60 + m;
  const now = nh * 60 + nm;
  const allowed = days && days.length > 0 ? new Set(days) : null;
  const today = istWeekday();
  if (today < 0) return null;

  for (let offset = 0; offset < 8; offset++) {
    const day = (today + offset) % 7;
    if (allowed && !allowed.has(day)) continue;
    if (offset === 0 && target <= now) continue;
    return offset * 1440 + target - now;
  }
  return null;
}

/** "in 25m" / "in 6h" / "in 3d" for the next occurrence, or "—". */
export function nextRunLabel(at: string, days: number[] | undefined): string {
  const mins = minutesUntilNextRun(at, days);
  if (mins == null) return "—";
  if (mins < 60) return `in ${mins}m`;
  if (mins < 1440) return `in ${Math.round(mins / 60)}h`;
  return `in ${Math.round(mins / 1440)}d`;
}
