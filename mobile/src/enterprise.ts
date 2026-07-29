/**
 * Shared domain layer for the enterprise feature modules.
 *
 * Everything here is either derived from data the control plane actually
 * returns, or is an explicitly local-only preference persisted on the device.
 * The distinction matters: a tariff rate is something the operator types in and
 * we store locally, whereas kWh is measured. Anything presented as measured
 * must trace back to a real endpoint.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Device, TelemetryRow, AppEvent } from "./api";

/* ------------------------------------------------------------------ RBAC -- */

/**
 * Roles, ordered least → most privileged. The control plane currently models
 * only `is_admin`, so `owner`/`admin` map onto that flag and the finer grades
 * are enforced client-side for shared-household use. They are a UX affordance,
 * not a security boundary — never rely on them to protect a privileged call.
 */
export type Role = "guest" | "member" | "manager" | "admin" | "owner";

export const ROLE_ORDER: Role[] = ["guest", "member", "manager", "admin", "owner"];

export const ROLE_LABEL: Record<Role, string> = {
  guest: "Guest",
  member: "Member",
  manager: "Manager",
  admin: "Administrator",
  owner: "Owner",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  guest: "Can view shared devices and use passes issued to them.",
  member: "Can control devices and run scenes in permitted rooms.",
  manager: "Can edit automations, rooms and scenes for the whole home.",
  admin: "Can manage devices, firmware and other people's access.",
  owner: "Full control, including billing and transferring ownership.",
};

export type Permission =
  | "device.view"
  | "device.control"
  | "device.edit"
  | "device.provision"
  | "device.delete"
  | "scene.run"
  | "scene.edit"
  | "automation.view"
  | "automation.edit"
  | "energy.view"
  | "energy.configure"
  | "security.view"
  | "security.arm"
  | "gate.view"
  | "gate.issue"
  | "gate.revoke"
  | "fleet.view"
  | "fleet.ota"
  | "fleet.broadcast"
  | "user.view"
  | "user.manage"
  | "audit.view"
  | "settings.manage";

const GUEST: Permission[] = ["device.view", "gate.view"];
const MEMBER: Permission[] = [...GUEST, "device.control", "scene.run", "energy.view", "security.view", "automation.view"];
const MANAGER: Permission[] = [...MEMBER, "device.edit", "scene.edit", "automation.edit", "security.arm", "gate.issue", "energy.configure"];
const ADMIN: Permission[] = [
  ...MANAGER,
  "device.provision",
  "device.delete",
  "gate.revoke",
  "fleet.view",
  "fleet.ota",
  "fleet.broadcast",
  "user.view",
  "audit.view",
];
const OWNER: Permission[] = [...ADMIN, "user.manage", "settings.manage"];

const PERMISSIONS: Record<Role, Permission[]> = {
  guest: GUEST,
  member: MEMBER,
  manager: MANAGER,
  admin: ADMIN,
  owner: OWNER,
};

export function permissionsFor(role: Role): Permission[] {
  return PERMISSIONS[role] ?? GUEST;
}

export function can(role: Role, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

export function atLeast(role: Role, minimum: Role): boolean {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(minimum);
}

/* -------------------------------------------------------------- severity -- */

export type Severity = "critical" | "warning" | "info" | "success";

export const SEVERITY_ORDER: Severity[] = ["critical", "warning", "info", "success"];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
  success: "Resolved",
};

/**
 * Map a control-plane event kind onto a severity band.
 *
 * `recordEvent` on the server writes free-form kinds, so unknown values must
 * degrade to `info` rather than throwing or rendering blank.
 */
export function severityOf(kind: string): Severity {
  switch (kind) {
    case "alert":
    case "fault":
    case "error":
      return "critical";
    case "security":
    case "warning":
      return "warning";
    case "success":
      return "success";
    default:
      return "info";
  }
}

export function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

/** Sort newest-first, but always float unresolved criticals to the top. */
export function triageEvents(events: AppEvent[]): AppEvent[] {
  return [...events].sort((a, b) => {
    const sa = severityRank(severityOf(a.kind));
    const sb = severityRank(severityOf(b.kind));
    if (sa !== sb) return sa - sb;
    return new Date(b.ts).getTime() - new Date(a.ts).getTime();
  });
}

/* ------------------------------------------------------------- formatting -- */

export function formatWatts(w: number): string {
  if (!Number.isFinite(w)) return "—";
  if (Math.abs(w) >= 1000) return `${(w / 1000).toFixed(2)} kW`;
  return `${Math.round(w)} W`;
}

export function formatKwh(kwh: number): string {
  if (!Number.isFinite(kwh)) return "—";
  if (Math.abs(kwh) >= 1000) return `${(kwh / 1000).toFixed(2)} MWh`;
  return `${kwh.toFixed(2)} kWh`;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Compact duration, e.g. "3d 4h", "12m 30s". Used for uptime and pass validity. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function formatRelative(ts: string | number | Date | null | undefined): string {
  if (ts == null) return "never";
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  const future = diff < 0;
  const secs = Math.abs(diff) / 1000;
  if (secs < 45) return future ? "in a moment" : "just now";
  const out = formatDuration(secs).split(" ")[0];
  return future ? `in ${out}` : `${out} ago`;
}

export function formatDateTime(ts: string | number | Date): string {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Percentage clamped to 0-100, guarding against divide-by-zero. */
export function pct(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

/* ------------------------------------------------------------- tariffs ---- */

export type TariffKind = "flat" | "tou" | "slab";

export interface TouWindow {
  /** Inclusive start hour, 0-23. */
  from: number;
  /** Exclusive end hour, 1-24. Windows may wrap (from > to). */
  to: number;
  rate: number;
  label: string;
}

export interface Slab {
  /** Upper bound of this slab in kWh; the final slab should use Infinity. */
  upTo: number;
  rate: number;
}

export interface Tariff {
  kind: TariffKind;
  currency: string;
  /** Used when kind === "flat", and as the fallback for uncovered TOU hours. */
  flatRate: number;
  windows: TouWindow[];
  slabs: Slab[];
  /** Fixed monthly standing charge, added to the projected bill. */
  standingCharge: number;
  /** kg CO2e per kWh for the local grid. */
  carbonIntensity: number;
}

export const DEFAULT_TARIFF: Tariff = {
  kind: "flat",
  currency: "₹",
  flatRate: 7.5,
  windows: [
    { from: 6, to: 10, rate: 9.0, label: "Morning peak" },
    { from: 10, to: 18, rate: 6.5, label: "Day" },
    { from: 18, to: 22, rate: 11.0, label: "Evening peak" },
    { from: 22, to: 6, rate: 5.0, label: "Night" },
  ],
  slabs: [
    { upTo: 100, rate: 4.5 },
    { upTo: 300, rate: 7.0 },
    { upTo: 500, rate: 9.5 },
    { upTo: Number.POSITIVE_INFINITY, rate: 11.5 },
  ],
  standingCharge: 120,
  carbonIntensity: 0.71,
};

function hourInWindow(hour: number, w: TouWindow): boolean {
  return w.from <= w.to ? hour >= w.from && hour < w.to : hour >= w.from || hour < w.to;
}

/** The applicable unit rate at a given hour, for TOU tariffs. */
export function rateAtHour(t: Tariff, hour: number): number {
  if (t.kind !== "tou") return t.flatRate;
  const w = t.windows.find((x) => hourInWindow(hour, x));
  return w ? w.rate : t.flatRate;
}

export function windowAtHour(t: Tariff, hour: number): TouWindow | null {
  if (t.kind !== "tou") return null;
  return t.windows.find((x) => hourInWindow(hour, x)) ?? null;
}

/**
 * Cost of a consumption figure.
 *
 * Slab tariffs are cumulative and progressive: each band only charges the units
 * that fall inside it, which is why this walks the bands rather than picking
 * one. Getting that wrong overstates a large bill substantially.
 */
export function costOf(t: Tariff, kwh: number, hour = new Date().getHours()): number {
  if (!Number.isFinite(kwh) || kwh <= 0) return 0;
  if (t.kind === "flat") return kwh * t.flatRate;
  if (t.kind === "tou") return kwh * rateAtHour(t, hour);
  let remaining = kwh;
  let lower = 0;
  let total = 0;
  for (const s of t.slabs) {
    const band = Math.min(remaining, s.upTo - lower);
    if (band > 0) {
      total += band * s.rate;
      remaining -= band;
    }
    lower = s.upTo;
    if (remaining <= 0) break;
  }
  return total;
}

export function formatMoney(t: Tariff, amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return `${t.currency}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Grid carbon attributable to a consumption figure, in kg CO2e. */
export function carbonOf(t: Tariff, kwh: number): number {
  if (!Number.isFinite(kwh) || kwh <= 0) return 0;
  return kwh * t.carbonIntensity;
}

/**
 * Project a month-end bill from consumption so far.
 *
 * Naive linear extrapolation, which is honest for a steady household but will
 * overshoot if the sample covers only peak days — callers should label the
 * result as a projection, never as a bill.
 */
export function projectMonthly(t: Tariff, kwhSoFar: number, daysElapsed: number): { kwh: number; cost: number } {
  const days = Math.max(1, daysElapsed);
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const kwh = (kwhSoFar / days) * daysInMonth;
  return { kwh, cost: costOf(t, kwh) + t.standingCharge };
}

/* ------------------------------------------------------------ telemetry --- */

/**
 * Pull a numeric series for one field out of raw telemetry rows.
 *
 * Telemetry arrives newest-first from the API but charts read left-to-right in
 * time, so this reverses. Non-numeric and missing samples are dropped rather
 * than coerced to 0 — a zero would read as a real measurement of nothing.
 */
export function numericSeries(rows: TelemetryRow[], field: string): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const raw = rows[i]?.payload?.[field];
    const v = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (!Number.isFinite(v)) continue;
    const t = new Date(rows[i].ts).getTime();
    if (!Number.isFinite(t)) continue;
    out.push({ t, v });
  }
  return out;
}

/** Every numeric field present anywhere in a telemetry window. */
export function telemetryFields(rows: TelemetryRow[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.payload ?? {})) {
      if (typeof v === "number" || (typeof v === "string" && Number.isFinite(Number(v)))) seen.add(k);
    }
  }
  return [...seen].sort();
}

export interface SeriesStats {
  min: number;
  max: number;
  avg: number;
  last: number;
  count: number;
  /** Difference between the last sample and the one before it. */
  delta: number;
}

export function statsOf(points: { v: number }[]): SeriesStats {
  if (!points.length) return { min: 0, max: 0, avg: 0, last: 0, count: 0, delta: 0 };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const p of points) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
    sum += p.v;
  }
  const last = points[points.length - 1].v;
  const prev = points.length > 1 ? points[points.length - 2].v : last;
  return { min, max, avg: sum / points.length, last, count: points.length, delta: last - prev };
}

/**
 * Average samples into fixed-width time buckets.
 *
 * Charting several hundred raw points on a phone is both slow and unreadable;
 * bucketing keeps the shape while bounding the work. Empty buckets are omitted
 * so a gap in telemetry shows as a gap, not as a dip to zero.
 */
export function bucketSeries(points: { t: number; v: number }[], buckets: number): { t: number; v: number }[] {
  if (points.length <= buckets || buckets < 1) return points;
  const first = points[0].t;
  const span = points[points.length - 1].t - first;
  if (span <= 0) return points;
  const width = span / buckets;
  const acc = new Map<number, { sum: number; n: number; t: number }>();
  for (const p of points) {
    const idx = Math.min(buckets - 1, Math.floor((p.t - first) / width));
    const cur = acc.get(idx);
    if (cur) {
      cur.sum += p.v;
      cur.n += 1;
    } else {
      acc.set(idx, { sum: p.v, n: 1, t: first + idx * width });
    }
  }
  return [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, b]) => ({ t: b.t, v: b.sum / b.n }));
}

/* ------------------------------------------------------- device grouping -- */

export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const it of items) {
    const k = key(it);
    (out[k] ||= []).push(it);
  }
  return out;
}

export function countBy<T>(items: T[], key: (item: T) => string): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

/**
 * Fleet health rollup.
 *
 * "Stale" means the device still reports itself online but has not been heard
 * from recently — the interesting failure mode, because a hard offline is
 * obvious while a silently wedged device is not.
 */
export interface FleetHealth {
  total: number;
  online: number;
  offline: number;
  stale: number;
  onlinePct: number;
  byType: { key: string; count: number }[];
  firmwares: { key: string; count: number }[];
}

export function fleetHealth(devices: Device[], staleAfterMs = 15 * 60_000): FleetHealth {
  const now = Date.now();
  let online = 0;
  let stale = 0;
  for (const d of devices) {
    if (d.online) {
      online++;
      const seen = d.last_seen ? new Date(d.last_seen).getTime() : NaN;
      if (Number.isFinite(seen) && now - seen > staleAfterMs) stale++;
    }
  }
  return {
    total: devices.length,
    online,
    offline: devices.length - online,
    stale,
    onlinePct: pct(online, devices.length),
    byType: countBy(devices, (d) => d.type),
    firmwares: countBy(devices, (d) => d.fw_version || "unknown"),
  };
}

/**
 * Compare dotted firmware versions.
 *
 * Returns > 0 when `a` is newer. A plain string compare gets this wrong the
 * moment a build hits double digits ("1.10.0" < "1.9.0" lexically), which would
 * silently mark up-to-date devices as needing an update.
 */
export function compareVersions(a: string, b: string): number {
  const pa = String(a || "").split(/[.\-+]/).map((x) => parseInt(x, 10));
  const pb = String(b || "").split(/[.\-+]/).map((x) => parseInt(x, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export function isOutdated(current: string | undefined, target: string): boolean {
  if (!current || !target) return false;
  return compareVersions(current, target) < 0;
}

/* --------------------------------------------------------- local storage -- */

/**
 * A typed, versioned AsyncStorage slot.
 *
 * Feature modules keep operator-entered configuration (tariffs, thresholds,
 * dashboard layouts) here because the control plane has no endpoint for it.
 * `load` merges over the fallback so adding a field in a later release does not
 * strand users on a persisted object that lacks it.
 */
export function createStore<T extends object>(key: string, fallback: T) {
  const storageKey = `cv-ent:${key}`;
  return {
    key: storageKey,
    fallback,
    async load(): Promise<T> {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) return { ...fallback };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return { ...fallback };
        return { ...fallback, ...(parsed as T) };
      } catch {
        return { ...fallback };
      }
    },
    async save(value: T): Promise<void> {
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        /* storage full or unavailable — settings simply do not persist */
      }
    },
    async clear(): Promise<void> {
      try {
        await AsyncStorage.removeItem(storageKey);
      } catch {
        /* nothing to do */
      }
    },
  };
}

export const tariffStore = createStore<Tariff>("tariff", DEFAULT_TARIFF);

export interface EnergyBudget {
  monthlyKwh: number;
  monthlyCost: number;
  alertAtPct: number;
  enabled: boolean;
}
export const budgetStore = createStore<EnergyBudget>("budget", {
  monthlyKwh: 300,
  monthlyCost: 3000,
  alertAtPct: 80,
  enabled: false,
});

/* -------------------------------------------------------------- exports --- */

/**
 * Render rows as RFC 4180 CSV.
 *
 * Quoting is not optional here: device names and event bodies routinely contain
 * commas and newlines, which would otherwise shift every following column.
 */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return "";
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown): string => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.map(esc).join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\r\n");
  return `${head}\r\n${body}`;
}

export function slugifyFilename(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "export";
}
