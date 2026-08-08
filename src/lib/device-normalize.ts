/**
 * Corrections applied to every device the control plane returns.
 *
 * Both of these are compensating for a control plane that predates the fixes
 * already written for it, and both are computed from data that build does send.
 * Neither invents anything.
 *
 * 1. `online` is a stored boolean whose only clearing path is the MQTT last
 *    will. No will, no clearing — so a device that vanishes without one reads
 *    as online forever. Three units in this fleet report `online: true` with
 *    `last_seen` two weeks old. Liveness is a claim about time and cannot be
 *    expressed by a flag alone, so it is derived: the flag must be set AND we
 *    must have heard from the device recently.
 *
 * 2. `fw_version` is only written by the newer control plane, so on this build
 *    it is empty for every device — while the firmware has been publishing its
 *    version inside `state.fw` on every single message all along. The column
 *    being blank was never the same thing as the version being unknown.
 *
 * Applied at the boundary rather than at each call site, because there are
 * dozens of the latter and the next one added would not know to do it. When the
 * control plane is updated both become no-ops: the server sends a derived
 * `online` that already agrees, and a populated `fw_version` that wins.
 */
import type { Device } from "./control-plane";

/**
 * Seconds of silence after which a device is not online, whatever the flag says.
 *
 * Devices publish state every 10s and the MQTT keepalive is 45s, so the broker
 * itself gives up at roughly 67s. 90s sits past both: one dropped publish cannot
 * trip it, and a will that never arrived cannot hide behind it. This mirrors
 * DEVICE_STALE_SECONDS in platform/api/src/device-online.ts deliberately — the
 * two must not disagree about what "online" means.
 */
export const DEVICE_STALE_SECONDS = 90;

type Loose = Device & { serial?: string | null };

/** True only if the flag is set and the device has been heard from recently. */
export function isDeviceLive(d: Pick<Device, "online" | "last_seen">, now = Date.now()): boolean {
  if (!d.online || !d.last_seen) return false;
  const seen = new Date(d.last_seen).getTime();
  if (Number.isNaN(seen)) return false;
  return now - seen <= DEVICE_STALE_SECONDS * 1000;
}

/** The version the device actually reports, preferring the column when set. */
export function deviceFirmware(d: Pick<Device, "fw_version" | "state">): string | undefined {
  if (d.fw_version) return d.fw_version;
  const fw = (d.state as Record<string, unknown> | undefined)?.fw;
  return typeof fw === "string" && fw ? fw : undefined;
}

/** Applies both corrections to one device. */
export function normalizeDevice<T extends Device>(d: T, now = Date.now()): T {
  if (!d || typeof d !== "object") return d;
  const online = isDeviceLive(d, now);
  const fw = deviceFirmware(d);
  if (online === d.online && fw === d.fw_version) return d;
  return { ...d, online, fw_version: fw } as T;
}

/** Applies both corrections to a list, preserving identity when nothing changes. */
export function normalizeDevices<T extends Device>(list: T[] | undefined | null): T[] {
  if (!Array.isArray(list)) return [];
  const now = Date.now();
  return list.map((d) => normalizeDevice(d, now));
}

export type { Loose as LooseDevice };
