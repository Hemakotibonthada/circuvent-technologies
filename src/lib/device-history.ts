/**
 * The history predictive maintenance needs, which does not currently exist.
 *
 * The fleet retains 151 telemetry rows in total — 150 of them from one camera
 * over about two hours, and one from a hub. Devices publish state constantly
 * and almost none of it is kept, so there is nothing to fit a trend to. That
 * is not a modelling problem and no amount of statistics fixes it: a forecast
 * needs a past.
 *
 * This records one small sample per device per sweep — the handful of numbers
 * that actually precede a failure — so that in a few weeks there is something
 * to forecast from. Deliberately narrow:
 *
 *   rssi        a radio that is slowly losing signal drops off before it dies
 *   watts       standby creep is a relay welding or a supply ageing
 *   uptimeS     a falling uptime means it rebooted; frequency is the signal
 *   temperature the most direct precursor there is
 *   battery     the only one where the projection is unambiguous
 *   runtimeS    drives scheduled servicing rather than prediction
 *
 * Sampling on the alert sweep rather than streaming everything is the point.
 * Writing every state change would fill the disk with the value of a light
 * switch, and none of that predicts anything; one reading every half hour is
 * plenty to see a week-long drift and cheap enough to keep for a year.
 *
 * SERVER ONLY.
 */
import { createFileStore } from "./data-file";
import type { Sample } from "./predictive-maintenance";

/** The fields worth keeping. Anything not here is not retained. */
export const TRACKED_FIELDS = ["rssi", "watts", "uptimeS", "temperature", "battery", "runtimeS"] as const;
export type TrackedField = (typeof TRACKED_FIELDS)[number];

/** How long a sample is useful for. A year covers seasonal drift. */
export const RETENTION_DAYS = 365;

/** Cap per device+field, so one chatty device cannot crowd out the rest. */
export const MAX_SAMPLES_PER_SERIES = 2000;

interface HistoryDB {
  /** accountKey -> deviceId -> field -> samples */
  series: Record<string, Record<string, Partial<Record<TrackedField, Sample[]>>>>;
}

const store = createFileStore<HistoryDB>("device-history.json", () => ({ series: {} }));

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export interface DeviceStateLike {
  id: string;
  state?: Record<string, unknown>;
}

/**
 * Record one reading per tracked field for each device.
 *
 * Returns how many samples were written, so a caller can log that collection
 * is happening — a silent collector that has quietly stopped is the reason a
 * forecast is still saying "not enough data" six months later.
 */
export function recordSamples(accountKey: string, devices: DeviceStateLike[], now = Date.now()): number {
  if (!accountKey || !Array.isArray(devices) || !devices.length) return 0;

  return store.mutate((db) => {
    const forAccount = (db.series[accountKey] ??= {});
    const cutoff = now - RETENTION_DAYS * 86_400_000;
    let written = 0;

    for (const d of devices) {
      if (!d?.id) continue;
      const state = d.state ?? {};
      const forDevice = (forAccount[d.id] ??= {});

      for (const field of TRACKED_FIELDS) {
        const value = state[field];
        if (!isNum(value)) continue;

        const list = (forDevice[field] ??= []);
        list.push({ at: now, value });
        written++;

        // Trim by age first, then by count. Age is the meaningful limit; the
        // count is only there so a device reporting every second cannot fill
        // the store between cleanups.
        let trimmed = list.filter((s) => s.at >= cutoff);
        if (trimmed.length > MAX_SAMPLES_PER_SERIES) {
          trimmed = trimmed.slice(trimmed.length - MAX_SAMPLES_PER_SERIES);
        }
        forDevice[field] = trimmed;
      }
    }
    return written;
  });
}

/** The retained series for one device field, oldest first. */
export function readSeries(accountKey: string, deviceId: string, field: TrackedField): Sample[] {
  const list = store.read().series[accountKey]?.[deviceId]?.[field] ?? [];
  return [...list].sort((a, b) => a.at - b.at);
}

/** Which fields have any history for this device. */
export function fieldsWithHistory(accountKey: string, deviceId: string): TrackedField[] {
  const forDevice = store.read().series[accountKey]?.[deviceId] ?? {};
  return TRACKED_FIELDS.filter((f) => (forDevice[f]?.length ?? 0) > 0);
}

/** Total samples held for an account, for a "collecting since…" line. */
export function historyStats(accountKey: string): { devices: number; samples: number; oldestAt: string | null } {
  const forAccount = store.read().series[accountKey] ?? {};
  let samples = 0;
  let oldest = Infinity;
  for (const device of Object.values(forAccount)) {
    for (const list of Object.values(device)) {
      if (!list) continue;
      samples += list.length;
      for (const s of list) if (s.at < oldest) oldest = s.at;
    }
  }
  return {
    devices: Object.keys(forAccount).length,
    samples,
    oldestAt: Number.isFinite(oldest) ? new Date(oldest).toISOString() : null,
  };
}
