/**
 * Domain layer for the Gate access module.
 *
 * Nothing in this file talks to the network — the real data comes from
 * `api.gatePasses`, `api.devices`, `api.events` and `api.redeemGatePass`. This
 * layer only classifies, filters, sorts and formats what those endpoints hand
 * back, plus stores a small pile of operator preferences (default validity,
 * label suggestions, remembered gate) locally.
 *
 * Two things are worth calling out because getting them wrong is dangerous:
 *
 *   1. Pass status is authoritative on the server (`platform/api/src/routes/
 *      gate.ts:passStatus`). A revoked or already-used pass is functionally
 *      dead — we render `pass.status` as returned, never recompute it from
 *      `valid_from`/`valid_to` locally, because a stale client clock would
 *      then show a revoked pass as active.
 *
 *   2. The QR payload the server hands us in `pass.qr` is the canonical form.
 *      We do not synthesise `circuvent://gate?code=...` on the client because a
 *      future server change would silently ship the wrong URL.
 */
import type { AppEvent, Device, GatePass } from "../../../api";
import { createStore } from "../../../enterprise";

/* -------------------------------------------------------------- devices -- */

/**
 * Types the control plane models as physical gates or barriers. This is
 * conservative — it is safer to omit a gate-like device from the overview than
 * to send `grantOpen`/`open` commands to something that does not implement
 * them. New types should be added here rather than inferred from the name.
 */
export const GATE_DEVICE_TYPES: readonly string[] = ["rfid-gate", "facedoor", "smart-lock"] as const;

export type GateDeviceType = (typeof GATE_DEVICE_TYPES)[number];

/**
 * Whether the control plane treats this device as a barrier we can command.
 *
 * Matches by type first, then by the fact that a device exposed the same
 * command surface we send to a gate. The heuristic is intentionally lax on the
 * upside because the platform occasionally reports a bespoke sub-type, and
 * strict on the downside — an unrelated smart plug will never see a grantOpen.
 */
export function isGateDevice(device: Device): boolean {
  if (GATE_DEVICE_TYPES.includes(device.type)) return true;
  const state = device.state ?? {};
  return "locked" in state || "gate" in state || "barrier" in state;
}

/**
 * Real, observable, gate-position state. Returns `null` when we cannot tell —
 * a lock without a report is not "closed", it is unknown, and the UI must show
 * that honestly rather than pick a default that reads as authoritative.
 */
export function gateOpenState(device: Device): "open" | "closed" | "unknown" {
  const s = device.state ?? {};
  const raw = (s.gate ?? s.barrier ?? s.door ?? s.position) as unknown;
  if (typeof raw === "string") {
    const v = raw.toLowerCase();
    if (v === "open" || v === "opened" || v === "up") return "open";
    if (v === "closed" || v === "shut" || v === "down") return "closed";
  }
  if (typeof raw === "boolean") return raw ? "open" : "closed";
  if (typeof s.locked === "boolean") return s.locked ? "closed" : "open";
  return "unknown";
}

/** Whether the last command reached the device recently enough to trust it. */
export function isDeviceStale(device: Device, staleAfterMs = 5 * 60_000): boolean {
  if (!device.online) return false;
  const seen = device.last_seen ? new Date(device.last_seen).getTime() : NaN;
  return !Number.isFinite(seen) || Date.now() - seen > staleAfterMs;
}

/* ---------------------------------------------------------------- passes -- */

/** Server-returned pass statuses (mirrors `passStatus` in the backend). */
export type PassStatus = GatePass["status"];

export const PASS_STATUSES: readonly PassStatus[] = ["active", "scheduled", "expired", "used", "revoked"] as const;

export const PASS_STATUS_LABEL: Record<PassStatus, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  used: "Used up",
  revoked: "Revoked",
};

export const PASS_STATUS_HELP: Record<PassStatus, string> = {
  active: "Ready to redeem inside its validity window.",
  scheduled: "The validity window has not started yet.",
  expired: "The validity window has ended.",
  used: "Every allowed use has been claimed.",
  revoked: "Cancelled by an owner or administrator.",
};

/**
 * A revoked or used pass can never come back — anything else can transition on
 * a clock tick. Screens use this to decide whether to keep polling.
 */
export function isTerminalStatus(status: PassStatus): boolean {
  return status === "revoked" || status === "used" || status === "expired";
}

export function canRevoke(status: PassStatus): boolean {
  return status === "active" || status === "scheduled";
}

/** Uses remaining, clamped so a stale response never shows a negative count. */
export function usesRemaining(pass: GatePass): number {
  return Math.max(0, pass.max_uses - pass.uses);
}

/**
 * Seconds until a pass expires. Negative values mean it already expired. When
 * `valid_from` lies in the future the result is negative — callers who care
 * about the countdown to activation use `secondsUntilActive` instead.
 */
export function secondsUntilExpiry(pass: GatePass, now = Date.now()): number {
  const t = new Date(pass.valid_to).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((t - now) / 1000);
}

export function secondsUntilActive(pass: GatePass, now = Date.now()): number {
  const t = new Date(pass.valid_from).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((t - now) / 1000);
}

/**
 * A short natural-language description of the validity window. The server
 * hands us ISO strings, which are unreadable at a glance in a table cell.
 */
export function validityLabel(pass: GatePass, now = Date.now()): string {
  const startsIn = secondsUntilActive(pass, now);
  const endsIn = secondsUntilExpiry(pass, now);
  if (pass.status === "scheduled" && startsIn > 0) return `Starts in ${humanShortDuration(startsIn)}`;
  if (pass.status === "active" && endsIn > 0) return `${humanShortDuration(endsIn)} left`;
  if (pass.status === "expired") return `Expired ${humanShortDuration(-endsIn)} ago`;
  if (pass.status === "used") return `All ${pass.max_uses} uses claimed`;
  if (pass.status === "revoked") return "Revoked";
  return "";
}

/**
 * Very compact duration formatting for tight cells (e.g. "2h 5m", "3d",
 * "45s"). `formatDuration` in the shared layer is close but a hair verbose for
 * a table cell.
 */
export function humanShortDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d >= 1) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h >= 1) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m >= 1) return `${m}m`;
  return `${s}s`;
}

/**
 * Longer, calendar-style label — used in the pass detail panel where there is
 * room to be explicit about when the window opens and closes.
 */
export function fullValidityLabel(pass: GatePass): string {
  const from = new Date(pass.valid_from);
  const to = new Date(pass.valid_to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return "Unknown validity window";
  const sameDay = from.toDateString() === to.toDateString();
  const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
  const timeOnly: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  return sameDay ? `${from.toLocaleString(undefined, fmt)} → ${to.toLocaleTimeString(undefined, timeOnly)}` : `${from.toLocaleString(undefined, fmt)} → ${to.toLocaleString(undefined, fmt)}`;
}

/* ---------------------------------------------------------------- filter -- */

export type PassFilter = "all" | PassStatus;

export const PASS_FILTERS: readonly { value: PassFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "scheduled", label: "Scheduled" },
  { value: "expired", label: "Expired" },
  { value: "used", label: "Used" },
  { value: "revoked", label: "Revoked" },
];

export function matchesFilter(pass: GatePass, filter: PassFilter): boolean {
  return filter === "all" ? true : pass.status === filter;
}

/**
 * How many passes are in each bucket. This drives the badges next to the
 * filter chips, so a user can see at a glance whether there are any expired
 * or revoked passes without switching tabs.
 */
export function passCounts(passes: GatePass[]): Record<PassFilter, number> {
  const out: Record<PassFilter, number> = { all: passes.length, active: 0, scheduled: 0, expired: 0, used: 0, revoked: 0 };
  for (const p of passes) out[p.status] = (out[p.status] ?? 0) + 1;
  return out;
}

/** Newest first, but active passes always come to the top. */
export function sortPasses(passes: GatePass[]): GatePass[] {
  const priority: Record<PassStatus, number> = { active: 0, scheduled: 1, used: 2, expired: 3, revoked: 4 };
  return [...passes].sort((a, b) => {
    const pa = priority[a.status] ?? 5;
    const pb = priority[b.status] ?? 5;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/**
 * Case- and space-insensitive substring match against a pass's user-facing
 * fields. `code` is included because guards frequently search by the last few
 * digits of a code the visitor is reading out to them.
 */
export function searchMatches(pass: GatePass, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  const hay = [pass.label, pass.code, pass.device_id, pass.status].join(" ").toLowerCase();
  return hay.includes(q);
}

/* ----------------------------------------------------------------- events -- */

/**
 * Event kinds we treat as gate-related. The control plane records a broader
 * set, but the module screens are only interested in events that actually
 * involve the barrier — an unrelated router-offline warning would drown the
 * pass log.
 */
export const GATE_EVENT_KINDS: readonly string[] = ["security", "gate", "access", "activity"] as const;

/**
 * Whether an event is relevant to the gate module. Uses the device id as the
 * primary signal (a security event on a smart plug is not a gate event) and
 * falls back to the free-text title/body when no device is attached.
 */
export function isGateEvent(event: AppEvent, gateDeviceIds: Set<string>): boolean {
  if (event.device_id && gateDeviceIds.has(event.device_id)) return true;
  if (!event.device_id && GATE_EVENT_KINDS.includes(event.kind)) {
    const hay = `${event.title} ${event.body}`.toLowerCase();
    return /(gate|barrier|guest pass|redeem|open|entry|access)/i.test(hay);
  }
  return false;
}

/* ---------------------------------------------------------------- config -- */

/**
 * Locally-stored operator preferences. Nothing here is ever presented as a
 * measurement — these are pure UI defaults that make repeat use faster. The
 * screens that show these values label them as device-only preferences.
 */
export interface GateConfig {
  /** Device id the create screen preselects. Empty when nothing was chosen yet. */
  lastDeviceId: string;
  /** Suggested labels for guest passes, e.g. "Cleaner", "Delivery". */
  labelSuggestions: string[];
  /** Default validity window in minutes when the create form opens. */
  defaultMinutes: number;
  /** Default number of uses. Almost always 1 in practice. */
  defaultUses: number;
  /** Voice announce redemption outcomes for a hands-busy guard. */
  speakOutcome: boolean;
  /** Ask before revoking. Owners frequently disable this after the first tap. */
  confirmRevoke: boolean;
  /** Codes redeemed manually in the last session, newest first. Capped. */
  recentRedemptions: RedemptionLogEntry[];
}

export interface RedemptionLogEntry {
  code: string;
  ts: string;
  ok: boolean;
  message: string;
  label?: string;
}

export const DEFAULT_GATE_CONFIG: GateConfig = {
  lastDeviceId: "",
  labelSuggestions: ["Guest", "Cleaner", "Delivery", "Contractor", "Family"],
  defaultMinutes: 120,
  defaultUses: 1,
  speakOutcome: false,
  confirmRevoke: true,
  recentRedemptions: [],
};

export const gateConfigStore = createStore<GateConfig>("gate-config-v1", DEFAULT_GATE_CONFIG);

/** Cap the local redemption log so it never grows without bound. */
export function pushRedemption(config: GateConfig, entry: RedemptionLogEntry, cap = 20): GateConfig {
  return { ...config, recentRedemptions: [entry, ...config.recentRedemptions].slice(0, cap) };
}

/* -------------------------------------------------------------- validity -- */

/**
 * Quick presets a guard actually reaches for. Custom pickers are a
 * distant second — a one-tap "30 min" is what makes the create screen usable
 * during an actual delivery. Keep this list short.
 */
export interface ValidityPreset {
  minutes: number;
  label: string;
  hint?: string;
}

export const VALIDITY_PRESETS: readonly ValidityPreset[] = [
  { minutes: 15, label: "15 min", hint: "Package drop" },
  { minutes: 30, label: "30 min", hint: "Quick visit" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 240, label: "4 hours", hint: "Afternoon" },
  { minutes: 480, label: "8 hours", hint: "Workday" },
  { minutes: 1440, label: "1 day" },
  { minutes: 4320, label: "3 days" },
  { minutes: 10080, label: "1 week" },
];

/**
 * The server accepts up to 30 days (`43200` minutes). Mirroring the cap here
 * prevents the create form ever generating a request that will 400.
 */
export const MAX_VALIDITY_MINUTES = 43200;
export const MIN_VALIDITY_MINUTES = 5;
export const MIN_USES = 1;
export const MAX_USES = 999;

/** Clamp any user-entered value into what the server will accept. */
export function clampMinutes(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_GATE_CONFIG.defaultMinutes;
  return Math.max(MIN_VALIDITY_MINUTES, Math.min(MAX_VALIDITY_MINUTES, Math.floor(v)));
}

export function clampUses(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_GATE_CONFIG.defaultUses;
  return Math.max(MIN_USES, Math.min(MAX_USES, Math.floor(v)));
}

/* ------------------------------------------------------------ QR payload -- */

/** The exact scheme the backend embeds in `pass.qr`. */
export const QR_SCHEME = "circuvent://gate";

/**
 * Pull the code out of whatever a scanner returned. Accepts:
 *   - A raw code, e.g. "AB2P4RTV"
 *   - `circuvent://gate?code=AB2P4RTV`
 *   - `circuvent://gate?code=AB2P4RTV&hint=...`
 *   - Any URL with a `code` query parameter.
 *
 * Returns `null` when nothing plausible was found. Never invents a code: an
 * unparseable QR is a user error the UI must surface, not a wrong redeem.
 */
export function extractCode(payload: string): string | null {
  if (!payload) return null;
  const trimmed = payload.trim();
  if (!trimmed) return null;

  const scheme = trimmed.toLowerCase();
  if (scheme.startsWith("circuvent://gate")) {
    const qs = trimmed.split("?")[1] ?? "";
    for (const pair of qs.split("&")) {
      const [k, v] = pair.split("=");
      if ((k || "").toLowerCase() === "code" && v) return sanitiseCode(decodeURIComponent(v));
    }
    return null;
  }

  if (scheme.startsWith("http://") || scheme.startsWith("https://")) {
    const qs = trimmed.split("?")[1] ?? "";
    for (const pair of qs.split("&")) {
      const [k, v] = pair.split("=");
      if ((k || "").toLowerCase() === "code" && v) return sanitiseCode(decodeURIComponent(v));
    }
    return null;
  }

  const cleaned = sanitiseCode(trimmed);
  return cleaned.length >= 4 ? cleaned : null;
}

/** Sanitise to the unambiguous alphabet the server uses. */
export function sanitiseCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Whether a string is a candidate for `api.redeemGatePass`. */
export function isValidCodeShape(code: string): boolean {
  const c = sanitiseCode(code);
  return c.length >= 4 && c.length <= 32;
}

/* ------------------------------------------------------------- CSV rows -- */

/**
 * A flat row for `toCsv`. Includes the fields a spreadsheet reader will
 * actually want — the raw code is intentionally NOT included because a
 * spreadsheet is not a safe place to leak an unrevoked code.
 */
export interface PassCsvRow {
  id: number;
  label: string;
  status: string;
  device_id: string;
  valid_from: string;
  valid_to: string;
  uses: string;
  last_used: string;
  created_at: string;
}

export function passesToCsvRows(passes: GatePass[]): PassCsvRow[] {
  return passes.map((p) => ({
    id: p.id,
    label: p.label,
    status: p.status,
    device_id: p.device_id,
    valid_from: p.valid_from,
    valid_to: p.valid_to,
    uses: `${p.uses}/${p.max_uses}`,
    last_used: p.last_used ?? "",
    created_at: p.created_at,
  }));
}

export const PASS_CSV_COLUMNS: readonly (keyof PassCsvRow)[] = [
  "id",
  "label",
  "status",
  "device_id",
  "valid_from",
  "valid_to",
  "uses",
  "last_used",
  "created_at",
];

/* ------------------------------------------------------------ error shape -- */

/**
 * The gate endpoints always report failures through a stable `{ error: string }`
 * shape (see `platform/api/src/routes/gate.ts`). Wrapping the raw fetch response
 * keeps every screen using the same message extraction logic.
 */
export function apiErrorMessage(res: { ok: boolean; status: number; data: unknown }, fallback: string): string {
  if (res.ok) return "";
  const data = res.data as { error?: string } | null | undefined;
  if (data && typeof data.error === "string" && data.error.trim()) return data.error;
  if (res.status === 0) return "No connection to the control plane.";
  if (res.status === 401) return "Sign in again to continue.";
  if (res.status === 403) return "You do not have permission to do that.";
  if (res.status === 404) return "The server could not find that resource.";
  return `${fallback} (${res.status})`;
}
