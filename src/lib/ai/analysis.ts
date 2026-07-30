// Deterministic smart-home analytics.
//
// Everything in this file is arithmetic. No language model is involved, and
// that is the point: an assistant that tells you "your front door is unlocked"
// or "you used 40 kWh last week" must be *right*, and a model that predicts
// plausible text is the wrong tool for computing a fact.
//
// The division of labour across the AI layer is:
//   • this file decides WHAT IS TRUE  — thresholds, baselines, counts
//   • the model decides HOW TO SAY IT — phrasing, ordering, follow-up questions
//
// So a hallucinating model can produce an awkward sentence, but it cannot
// invent a device, a reading, or a problem that does not exist.
//
// Pure functions only: no I/O, no clock reads except where a timestamp is
// passed in. That keeps it testable and keeps the results reproducible.

import type { Device, AppEvent } from "../control-plane";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Severity = "critical" | "warning" | "info";

/**
 * One thing worth telling the user about.
 *
 * `evidence` is deliberately separate from `detail`: the model is allowed to
 * rewrite `detail`, but `evidence` carries the numbers that justified the
 * finding so a human can check the claim.
 */
export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  deviceIds: string[];
  evidence: Record<string, number | string | boolean>;
  /** A concrete next step, when there is an unambiguous one. */
  suggestion?: string;
}

export interface TelemetryPoint {
  ts: string;
  payload: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Small numeric helpers                                               */
/* ------------------------------------------------------------------ */

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Median absolute deviation, scaled to be comparable with a standard deviation.
 *
 * Used instead of stdDev for outlier detection because a single enormous
 * reading inflates a standard deviation enough to hide itself — the very
 * spike we are looking for would raise the threshold above its own value.
 */
export function mad(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = median(xs);
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)));
}

/** Extracts one numeric field from a telemetry series, dropping absent points. */
export function series(points: TelemetryPoint[], field: string): number[] {
  const out: number[] = [];
  for (const p of points) {
    const v = num(p.payload?.[field]);
    if (v !== null) out.push(v);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Device-level facts                                                  */
/* ------------------------------------------------------------------ */

/** Watts a device is drawing right now, if it reports power at all. */
export function deviceWatts(d: Device): number | null {
  const s = d.state ?? {};
  for (const key of ["power_w", "watts", "power", "activePower"]) {
    // `power` is overloaded: on a plug it is often a boolean on/off, not watts.
    const v = s[key];
    if (typeof v === "boolean") continue;
    const n = num(v);
    if (n !== null) return n;
  }
  return null;
}

/** True when the device exposes a primary on/off that is currently on. */
export function deviceIsOn(d: Device): boolean | null {
  const s = d.state ?? {};
  for (const key of ["on", "power", "pump", "relay", "streaming", "armed"]) {
    const v = s[key];
    if (typeof v === "boolean") return v;
  }
  if (Array.isArray(s.relays)) return (s.relays as unknown[]).some((r) => r === true);
  return null;
}

/** Minutes since the device was last heard from, or null if never. */
export function minutesSinceSeen(d: Device, now = Date.now()): number | null {
  if (!d.last_seen) return null;
  const t = Date.parse(d.last_seen);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (now - t) / 60000);
}

/* ------------------------------------------------------------------ */
/* Findings                                                            */
/* ------------------------------------------------------------------ */

/** A device that claims to be online but has not spoken in a long time. */
export function findStaleDevices(devices: Device[], now = Date.now(), staleMinutes = 30): Finding[] {
  const out: Finding[] = [];
  for (const d of devices) {
    if (!d.online) continue;
    const mins = minutesSinceSeen(d, now);
    if (mins === null || mins < staleMinutes) continue;
    out.push({
      id: `stale:${d.id}`,
      severity: mins > 24 * 60 ? "critical" : "warning",
      title: `${d.name || d.id} has gone quiet`,
      detail:
        `It is still marked online but has not reported for ${formatMinutes(mins)}. ` +
        `That usually means it lost Wi-Fi without a clean disconnect.`,
      deviceIds: [d.id],
      evidence: { minutesSinceLastReport: Math.round(mins), online: true },
      suggestion: "Power-cycle the device, or check the Wi-Fi signal where it is installed.",
    });
  }
  return out;
}

/** Devices that are offline right now. */
export function findOfflineDevices(devices: Device[]): Finding[] {
  const offline = devices.filter((d) => !d.online);
  if (offline.length === 0) return [];
  const many = offline.length >= 3 && offline.length >= devices.length / 2;
  return [
    {
      id: "offline",
      severity: many ? "critical" : "warning",
      title: many
        ? `${offline.length} of ${devices.length} devices are offline`
        : `${offline.length} device${offline.length === 1 ? " is" : "s are"} offline`,
      detail: many
        ? "So many at once usually points at the router or the internet connection rather than the devices."
        : `Offline: ${offline.map((d) => d.name || d.id).join(", ")}.`,
      deviceIds: offline.map((d) => d.id),
      evidence: { offlineCount: offline.length, totalDevices: devices.length },
      suggestion: many ? "Check the router first, then individual devices." : undefined,
    },
  ];
}

/**
 * Something drawing power while nominally off, or drawing a lot while idle.
 *
 * Only reported for devices that actually meter power, and only above a floor
 * — a couple of watts of standby is normal and flagging it is noise.
 */
export function findStandbyDrain(devices: Device[], floorWatts = 5): Finding[] {
  const out: Finding[] = [];
  for (const d of devices) {
    const w = deviceWatts(d);
    const on = deviceIsOn(d);
    if (w === null || w < floorWatts) continue;
    if (on !== false) continue;
    out.push({
      id: `standby:${d.id}`,
      severity: w >= 20 ? "warning" : "info",
      title: `${d.name || d.id} is drawing power while switched off`,
      detail: `It reports ${w.toFixed(1)} W with its switch off. Over a month that is about ${kWhPerMonth(w).toFixed(1)} kWh.`,
      deviceIds: [d.id],
      evidence: { watts: w, switchedOn: false, estimatedKWhPerMonth: Number(kWhPerMonth(w).toFixed(2)) },
      suggestion: "If nothing should be connected, unplug the appliance at the socket.",
    });
  }
  return out;
}

/**
 * A reading far outside its own recent history.
 *
 * Uses median + MAD rather than mean + standard deviation so one large spike
 * cannot raise the threshold past itself. Needs a reasonable amount of history
 * before it will say anything, because three points have no "normal".
 */
export function findAnomalies(
  deviceId: string,
  deviceName: string,
  points: TelemetryPoint[],
  field: string,
  opts: { minPoints?: number; sigma?: number } = {},
): Finding[] {
  const minPoints = opts.minPoints ?? 20;
  const sigma = opts.sigma ?? 4;
  const xs = series(points, field);
  if (xs.length < minPoints) return [];

  const history = xs.slice(0, -1);
  const latest = xs[xs.length - 1];
  const m = median(history);
  const spread = mad(history);

  // A perfectly flat history has zero spread; any change would be "infinite"
  // deviation, which is not a useful thing to tell someone.
  if (spread <= 0) return [];

  const deviation = Math.abs(latest - m) / spread;
  if (deviation < sigma) return [];

  const direction = latest > m ? "higher" : "lower";
  return [
    {
      id: `anomaly:${deviceId}:${field}`,
      severity: deviation >= sigma * 2 ? "warning" : "info",
      title: `${deviceName || deviceId}: ${field} is unusually ${direction}`,
      detail:
        `The latest ${field} is ${round(latest)}, against a typical ${round(m)} ` +
        `over the last ${history.length} readings.`,
      deviceIds: [deviceId],
      evidence: {
        field,
        latest: round(latest),
        typical: round(m),
        deviations: Number(deviation.toFixed(1)),
        samples: history.length,
      },
    },
  ];
}

/** Repeated failures or alerts in the event feed. */
export function findRecurringEvents(events: AppEvent[], now = Date.now(), windowHours = 24, threshold = 3): Finding[] {
  const cutoff = now - windowHours * 3600_000;
  const counts = new Map<string, { n: number; title: string; deviceId: string | null }>();

  for (const e of events) {
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t) || t < cutoff) continue;
    if (e.kind === "info") continue;
    const key = `${e.device_id ?? "-"}:${e.title}`;
    const prev = counts.get(key);
    counts.set(key, { n: (prev?.n ?? 0) + 1, title: e.title, deviceId: e.device_id });
  }

  const out: Finding[] = [];
  for (const [key, v] of counts) {
    if (v.n < threshold) continue;
    out.push({
      id: `recurring:${key}`,
      severity: v.n >= threshold * 3 ? "warning" : "info",
      title: `"${v.title}" has happened ${v.n} times`,
      detail: `That is ${v.n} occurrences in the last ${windowHours} hours. A repeating alert usually means the underlying cause was never fixed.`,
      deviceIds: v.deviceId ? [v.deviceId] : [],
      evidence: { occurrences: v.n, windowHours },
    });
  }
  return out;
}

/**
 * Automations that command the same device at the same minute.
 *
 * Two rules setting the same device at 07:00 will both run, and which one wins
 * depends on ordering nobody controls.
 */
export function findScheduleConflicts(
  automations: { id: number; name: string; enabled: boolean; trigger?: { type?: string; at?: string; days?: number[] }; action: unknown }[],
): Finding[] {
  const slots = new Map<string, { names: string[]; deviceId: string; at: string }>();

  for (const a of automations) {
    if (!a.enabled) continue;
    if (a.trigger?.type !== "time" || !a.trigger.at) continue;
    const steps = Array.isArray(a.action) ? a.action : [a.action];
    for (const s of steps as { type?: string; deviceId?: string }[]) {
      if (s?.type !== "command" || !s.deviceId) continue;
      // Rules on disjoint days cannot collide, so the day set is part of the key.
      const days = (a.trigger.days ?? []).slice().sort().join("") || "all";
      const key = `${s.deviceId}@${a.trigger.at}#${days}`;
      const prev = slots.get(key);
      if (prev) prev.names.push(a.name);
      else slots.set(key, { names: [a.name], deviceId: s.deviceId, at: a.trigger.at });
    }
  }

  const out: Finding[] = [];
  for (const [key, v] of slots) {
    if (v.names.length < 2) continue;
    out.push({
      id: `conflict:${key}`,
      severity: "warning",
      title: `Two rules command the same device at ${v.at}`,
      detail: `${v.names.join(" and ")} both act on this device at ${v.at}. Which one takes effect is not defined.`,
      deviceIds: [v.deviceId],
      evidence: { rules: v.names.length, at: v.at },
      suggestion: "Merge them into one rule with ordered steps, or move one to a different time.",
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Energy                                                              */
/* ------------------------------------------------------------------ */

export interface EnergyInsight {
  totalWatts: number;
  meteredDevices: number;
  estimatedKWhPerDay: number;
  estimatedKWhPerMonth: number;
  /** Highest first. */
  topConsumers: { id: string; name: string; watts: number; sharePct: number }[];
}

/**
 * Current draw and a naive projection.
 *
 * The projection assumes the present moment is representative, which it is not
 * — it is a "if things stayed like this" figure, and the wording downstream
 * says so rather than presenting it as a forecast.
 */
export function energyInsight(devices: Device[]): EnergyInsight {
  const metered = devices
    .map((d) => ({ id: d.id, name: d.name || d.id, watts: deviceWatts(d) }))
    .filter((x): x is { id: string; name: string; watts: number } => x.watts !== null && x.watts > 0);

  const total = metered.reduce((a, x) => a + x.watts, 0);

  return {
    totalWatts: Number(total.toFixed(1)),
    meteredDevices: metered.length,
    estimatedKWhPerDay: Number(((total * 24) / 1000).toFixed(2)),
    estimatedKWhPerMonth: Number(kWhPerMonth(total).toFixed(1)),
    topConsumers: metered
      .sort((a, b) => b.watts - a.watts)
      .slice(0, 5)
      .map((x) => ({
        ...x,
        watts: Number(x.watts.toFixed(1)),
        sharePct: total > 0 ? Number(((x.watts / total) * 100).toFixed(1)) : 0,
      })),
  };
}

/* ------------------------------------------------------------------ */
/* Top level                                                           */
/* ------------------------------------------------------------------ */

export interface HomeAnalysis {
  findings: Finding[];
  energy: EnergyInsight;
  counts: { total: number; online: number; offline: number };
  generatedAt: string;
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/**
 * The whole picture, computed from real data only.
 *
 * Everything optional is genuinely optional: a caller with nothing but a device
 * list still gets offline, stale and standby findings.
 */
export function analyseHome(input: {
  devices: Device[];
  events?: AppEvent[];
  automations?: Parameters<typeof findScheduleConflicts>[0];
  telemetry?: Record<string, TelemetryPoint[]>;
  now?: number;
}): HomeAnalysis {
  const now = input.now ?? Date.now();
  const devices = input.devices ?? [];

  const findings: Finding[] = [
    ...findOfflineDevices(devices),
    ...findStaleDevices(devices, now),
    ...findStandbyDrain(devices),
    ...findRecurringEvents(input.events ?? [], now),
    ...findScheduleConflicts(input.automations ?? []),
  ];

  for (const [deviceId, points] of Object.entries(input.telemetry ?? {})) {
    const dev = devices.find((d) => d.id === deviceId);
    const fields = numericFieldsIn(points);
    for (const f of fields) {
      findings.push(...findAnomalies(deviceId, dev?.name ?? deviceId, points, f));
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    findings,
    energy: energyInsight(devices),
    counts: {
      total: devices.length,
      online: devices.filter((d) => d.online).length,
      offline: devices.filter((d) => !d.online).length,
    },
    generatedAt: new Date(now).toISOString(),
  };
}

/** Numeric telemetry fields present in most of the series. */
function numericFieldsIn(points: TelemetryPoint[]): string[] {
  if (points.length === 0) return [];
  const counts = new Map<string, number>();
  for (const p of points) {
    for (const [k, v] of Object.entries(p.payload ?? {})) {
      if (num(v) !== null) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  // A field present in only a handful of points has no usable baseline.
  const need = Math.max(3, points.length * 0.6);
  return [...counts.entries()].filter(([, n]) => n >= need).map(([k]) => k);
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

function kWhPerMonth(watts: number): number {
  return (watts * 24 * 30) / 1000;
}

function round(n: number): number {
  return Math.abs(n) >= 100 ? Math.round(n) : Number(n.toFixed(2));
}

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${Math.round(mins)} minutes`;
  const h = mins / 60;
  if (h < 24) return `${h.toFixed(h < 10 ? 1 : 0)} hours`;
  return `${(h / 24).toFixed(h / 24 < 10 ? 1 : 0)} days`;
}

/**
 * Renders an analysis as compact text for a model prompt.
 *
 * Deliberately terse and factual. The model is told to explain these findings,
 * never to add to them, so anything not present here must not appear in an
 * answer.
 */
export function analysisToPromptContext(a: HomeAnalysis): string {
  const lines: string[] = [];
  lines.push(`Devices: ${a.counts.total} total, ${a.counts.online} online, ${a.counts.offline} offline.`);
  if (a.energy.meteredDevices > 0) {
    lines.push(
      `Power right now: ${a.energy.totalWatts} W across ${a.energy.meteredDevices} metered devices ` +
        `(~${a.energy.estimatedKWhPerDay} kWh/day if unchanged).`,
    );
    if (a.energy.topConsumers.length) {
      lines.push(
        "Top consumers: " +
          a.energy.topConsumers.map((c) => `${c.name} ${c.watts}W (${c.sharePct}%)`).join(", ") + ".",
      );
    }
  }
  if (a.findings.length === 0) {
    lines.push("No problems detected.");
  } else {
    lines.push("Findings:");
    for (const f of a.findings.slice(0, 12)) {
      lines.push(`- [${f.severity}] ${f.title} — ${f.detail}`);
    }
  }
  return lines.join("\n");
}
