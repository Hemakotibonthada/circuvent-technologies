// Browser client for the self-hosted Circuvent control plane (platform/api).
//
// Mirrors the mobile app's client (mobile/src/api.ts) so the web console and the
// mobile app share one backend, one auth scheme (JWT), and identical semantics.
// The base URL is configurable per-deployment; it defaults to the production
// control plane. Commands are published over MQTT server-side and reach the
// device in well under a second.

import { normalizeDevice, normalizeDevices } from "./device-normalize";

export const CONTROL_PLANE_URL = (
  process.env.NEXT_PUBLIC_CONTROL_PLANE_URL || "https://api.circuvent.com"
).replace(/\/$/, "");

/** wss URL for the live channel, derived from the REST base. */
export const CONTROL_PLANE_WS =
  CONTROL_PLANE_URL.replace(/^http/i, "ws") + "/ws";

import { issuedAtFromJwt, sessionExpired, sessionStartedAt } from "./session-expiry";

const TOKEN_KEY = "cv-console-token";
const REFRESH_KEY = "cv-console-refresh";
const USER_KEY = "cv-console-user";
const SIGNED_IN_AT_KEY = "cv-console-signed-in-at";

export interface ControlUser {
  id: number;
  email: string;
  name: string;
}

export interface Device {
  id: string;
  type: string;
  name: string;
  room?: string;
  favorite?: boolean;
  online: boolean;
  last_seen?: string | null;
  state: Record<string, unknown>;
  fw_version?: string;
}

export interface GatePass {
  id: number;
  device_id: string;
  code: string;
  label: string;
  valid_from: string;
  valid_to: string;
  max_uses: number;
  uses: number;
  revoked: boolean;
  last_used: string | null;
  created_at: string;
  status: string; // active | scheduled | expired | used | revoked
  qr: string;
}

/** One ANPR capture, after the plate was read (or found unreadable). */
export interface PlateRead {
  id: number;
  deviceId: string;
  deviceName: string;
  captureId: number;
  /** Normalised, e.g. "KA01AB1234". Null when nothing was read. */
  plate: string | null;
  /** Grouped for display, e.g. "KA 01 AB 1234". */
  pretty: string | null;
  /** Exactly what the recogniser returned, before correction. */
  raw: string | null;
  confidence: number;
  votes: number;
  samples: number;
  kind: string;
  status: "recognised" | "unrecognised";
  /** Why an unrecognised read failed — no_recogniser, no_plate, timeout… */
  reason: string | null;
  decision: "allow" | "deny" | "watch" | "unknown";
  ruleId: number | null;
  trigger: string;
  ms: number;
  at: string;
  hasImage: boolean;
  /** `in` or `out`, or null when the lane's direction could not be resolved. */
  direction: "in" | "out" | null;
  visitId: number | null;
}

export interface PlateSummary {
  days: number;
  total: number;
  recognised: number;
  denied: number;
  allowed: number;
  watched: number;
  uniquePlates: number;
  /** Which recogniser is configured; "none" explains a low read rate. */
  recogniser: string;
  byHour: { hour: number; count: number }[];
  frequent: { plate: string; pretty: string; count: number; lastAt: string }[];
}

/** Live site state: how many vehicles are here and whether it is full. */
export interface Occupancy {
  inside: number;
  /** Null when capacity is not managed — which is different from zero. */
  capacity: number | null;
  free: number | null;
  full: boolean;
  percent: number | null;
  overstays: {
    visitId: number;
    plate: string;
    pretty: string;
    entryAt: string;
    hours: number;
    deviceId: string | null;
  }[];
}

/** Per-account ANPR policy. Every limit is off by default. */
export interface AnprSettings {
  capacity: number | null;
  overstayHours: number | null;
  alertUnknown: boolean;
  alertFull: boolean;
  /** Where the daily report goes. Null means no report is sent. */
  reportEmail: string | null;
  /** Hour of day in IST, matching the automation scheduler's zone. */
  reportHour: number;
}

/* ---------------------------------------------------------------- */
/* Drone                                                             */
/* ---------------------------------------------------------------- */

export interface DroneLimits {
  maxAltM: number;
  maxRangeM: number;
  minBattPct: number;
}

export interface DroneSettings extends DroneLimits {
  /** Operator registration, required above toy weight in most jurisdictions. */
  operatorId: string | null;
  /** Where the daily flight report goes. Null means no report is sent. */
  reportEmail: string | null;
  /** Hour of day in IST, matching the automation scheduler's zone. */
  reportHour: number;
  alertFailsafe: boolean;
  alertFence: boolean;
  alertLowBatt: boolean;
}

/** Live state of one aircraft, as last published by its companion computer. */
export interface LiveAircraft {
  deviceId: string;
  name: string | null;
  online: boolean;
  state: Record<string, unknown>;
  /** The open flight, if it is flying now. */
  flightId: string | null;
  warnings: string[];
}

/**
 * One command. Every field is optional because the shape depends on `action`,
 * and the server validates the combination — a client-side union would have to
 * be kept in step with the Zod schema by hand.
 */
export interface DroneCommand {
  action:
    | "arm" | "disarm" | "takeoff" | "land" | "rtl" | "loiter"
    | "brake" | "goto" | "mission" | "mode" | "set" | "state";
  alt?: number;
  lat?: number;
  lon?: number;
  /** Required to disarm an airborne aircraft. Cuts the motors. */
  force?: boolean;
  op?: "start" | "pause" | "resume";
  mode?: string;
  allowArm?: boolean;
  trackHz?: number;
  maxAlt?: number;
  maxRange?: number;
  minBatt?: number;
  minSats?: number;
  requireHome?: boolean;
}

export interface Flight {
  id: string;
  deviceId: string;
  startedAt: string;
  endedAt: string | null;
  tookOffAt: string | null;
  /** Arm to disarm. Null while the flight is open. */
  durationSec: number | null;
  /** Take-off to landing. Null when the aircraft armed but never flew. */
  airborneSec: number | null;
  maxAltM: number;
  maxDistM: number;
  distanceM: number;
  maxSpeedMs: number;
  battStartPct: number | null;
  battEndPct: number | null;
  /** "open" | "landed" | "stale" | "aborted". Stale is never called landed. */
  outcome: string;
  failsafe: boolean;
  fenceBreach: boolean;
  samples: number;
  notes: string | null;
}

export interface FlightEvent {
  id?: string;
  flight_id?: string | null;
  device_id?: string;
  at: string;
  kind: string;
  detail: Record<string, unknown>;
  severity: string;
}

export interface TrackPoint {
  at: string;
  lat: number;
  lon: number;
  alt: number;
  speed: number | null;
  batt: number | null;
  mode: string | null;
}

export interface Waypoint {
  lat: number;
  lon: number;
  alt: number;
  action?: "waypoint" | "loiter" | "land" | "rtl";
  holdSec?: number;
}

export interface Mission {
  id: string;
  name: string;
  waypoints: Waypoint[];
  created_at: string;
  updated_at: string;
}

export interface Battery {
  id: string;
  label: string;
  cells: number;
  capacityMah: number;
  cycles: number;
  retireAt: number;
  firstUsed: string | null;
  lastUsed: string | null;
  retired: boolean;
  notes: string | null;
  /** Fraction of rated life used. */
  wear: number;
  health: "good" | "ageing" | "retire";
}

/** One vehicle, aggregated across every sighting. */
export interface Vehicle {
  plate: string;
  pretty: string;
  passes: number;
  entries: number;
  exits: number;
  firstSeen: string;
  lastSeen: string;
  /** True when it has an open visit — arrived and not yet seen leaving. */
  inside: boolean;
  visits: number;
  avgStaySec: number | null;
  totalStaySec: number;
  devices: string[];
  rule: "allow" | "deny" | "watch" | null;
  label: string | null;
  lastConfidence: number;
}

/** One stay: an arrival paired with the departure that ended it. */
export interface Visit {
  id: number;
  entryAt: string | null;
  exitAt: string | null;
  entryDevice: string | null;
  exitDevice: string | null;
  entryReadId: number | null;
  exitReadId: number | null;
  /**
   * `open` = inside now. `entry_missed` / `exit_missed` mean a read was lost,
   * which is normal for a gate camera and is shown rather than hidden.
   */
  status: "open" | "closed" | "entry_missed" | "exit_missed";
  /** Null unless both ends were observed — never zero for a missed read. */
  durationSec: number | null;
}

export interface VehicleProfile {
  plate: string;
  pretty: string;
  summary: {
    passes: number;
    entries: number;
    exits: number;
    visits: number;
    inside: boolean;
    firstSeen: string;
    lastSeen: string;
    totalStaySec: number;
    avgStaySec: number | null;
    longestStaySec: number | null;
    missedReads: number;
    cameras: string[];
    bestConfidence: number;
    truncated: boolean;
  };
  rule: PlateRule | null;
  visits: Visit[];
  reads: PlateRead[];
}

export interface PlateRule {  id: number;
  plate: string;
  pretty: string;
  kind: "allow" | "deny" | "watch";
  label: string;
  deviceId: string | null;
  validFrom: string | null;
  validTo: string | null;
  enabled: boolean;
  hits: number;
  lastHitAt: string | null;
  createdAt: string;
}

export interface AutomationTrigger {  type: "state" | "time" | "event";
  deviceId?: string;
  field?: string;
  op?: "<" | "<=" | ">" | ">=" | "==" | "!=" | "truthy" | "falsy";
  value?: number | string | boolean;
  at?: string;
  /**
   * Day filter for time triggers: 0=Sunday … 6=Saturday. Omitted or empty
   * means every day. Evaluated by the control plane in IST, the same zone as
   * `at` — not in the browser's zone.
   */
  days?: number[];
  /**
   * Event triggers match a telemetry event rather than a state change — a
   * face-door recognising someone, a gate reading an RFID tag, a doorbell
   * press. `eventType` is compared against the payload's `type`.
   */
  eventType?: string;
  /** Every key here must equal the same key in the event payload. */
  match?: Record<string, unknown>;
}

export interface AutomationAction {
  type: "command" | "notify" | "tts";
  deviceId?: string;
  command?: Record<string, unknown>;
  title?: string;
  body?: string;
  /** Spoken text for `tts`. `{name}` is filled from the triggering event. */
  text?: string;
  /**
   * Pause before this action runs, in milliseconds. The control plane caps it
   * at 30s per step, which is what makes "unlock, wait, announce, wait, lock"
   * expressible as one automation.
   */
  delayMs?: number;
}

/**
 * An automation runs either a single action or an ordered sequence.
 *
 * The control plane has always accepted both — `runActions` normalises with
 * `Array.isArray` — but the client only ever declared the single form, so
 * multi-step automations could be executed and never authored. Both shapes
 * are declared here so existing single-action rules keep their exact stored
 * form and are not rewritten into arrays on save.
 */
export type AutomationActions = AutomationAction | AutomationAction[];

/** Always view an automation's action as a list, whichever shape was stored. */
export function actionList(a: AutomationActions | undefined | null): AutomationAction[] {
  if (!a) return [];
  return Array.isArray(a) ? a : [a];
}

/** The action a summary line should describe: the first of a sequence. */
export function primaryAction(a: AutomationActions | undefined | null): AutomationAction | undefined {
  return actionList(a)[0];
}

export interface Automation {
  id: number;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  action: AutomationActions;
  created_at?: string;
  /**
   * Execution record. Present only on control planes new enough to report it —
   * an older one omits these entirely, which is why every consumer treats
   * `undefined` as "unknown" rather than "never ran".
   *
   * This exists because a switch timer could save correctly, show the right
   * next-run time, count down, and never move a relay, and nothing anywhere
   * distinguished that from working. "Last ran" either advances or it does not.
   */
  last_run_at?: string | null;
  last_run_ok?: boolean | null;
  last_error?: string | null;
  run_count?: number;
}

export interface AutomationBody {
  name?: string;
  enabled?: boolean;
  trigger?: AutomationTrigger;
  action?: AutomationActions;
}

export interface Room {
  id: number | null;
  name: string;
  icon: string;
  sort: number;
  count: number;
}
export interface SceneAction {
  deviceId: string;
  command: Record<string, unknown>;
}
export interface Scene {
  id: number;
  name: string;
  icon: string;
  actions: SceneAction[];
  favorite: boolean;
  created_at?: string;
}

/* ---- device registry ---------------------------------------------------- */

export interface AdminDeviceRecord {
  id: string;
  serial: string | null;
  name: string;
  type: string;
  room: string;
  online: boolean;
  last_seen: string | null;
  fw_version: string;
  created_at: string;
  batch: string;
  owner_email: string | null;
  owner_id: number | null;
}

/**
 * The full record for one device.
 *
 * Assembled server-side by device-report.ts and redacted there by audience,
 * so the owner's copy is genuinely missing the internal fields rather than
 * merely not rendering them.
 */
export interface DeviceReport {
  generatedAt: string;
  audience: "owner" | "admin";
  identity: {
    id: string;
    serial: string | null;
    name: string;
    type: string;
    room: string | null;
    firmware: string | null;
    registeredAt: string | null;
    hwid?: string | null;
    batch?: string | null;
    notes?: string | null;
  };
  ownership: { claimed: boolean; ownerId?: number | null; ownerEmail?: string | null; ownerName?: string | null };
  credentials: {
    issuedAt: string | null;
    lastRotatedAt: string | null;
    rotations: number;
    recoverable: false;
    note: string;
  };
  connectivity: {
    online: boolean;
    lastSeen: string | null;
    firstTelemetryAt: string | null;
    telemetryRecords: number;
    commandsIssued: number;
  };
  state: Record<string, unknown>;
  qr: { label: string; serialText: string; deviceId: string };
  telemetry: Array<{ at: string; data: Record<string, unknown> }>;
  controlLog: Array<{ at: string; by: string | null; command: Record<string, unknown> }>;
  events: Array<{ at: string; kind: string; title: string; body: string }>;
  auditLog: Array<{ at: string; actor: string; action: string; detail: Record<string, unknown>; note: string }>;
  summary: {
    historyLimit: number;
    telemetryReturned: number;
    commandsReturned: number;
    eventsReturned: number;
    auditReturned: number;
    truncated: boolean;
  };
}

/* ---- developer API ------------------------------------------------------ */

export interface ApiScopeInfo {
  scope: string;
  description: string;
}

export interface ApiKey {
  id: number;
  name: string;
  env: "live" | "test";
  /**
   * The only part of the secret we hold. The full key is returned once, at
   * creation, and stored as a SHA-256 hash — there is no endpoint that can
   * show it again.
   */
  prefix: string;
  scopes: string[];
  allowedOrigins: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  createdAt: string;
}

export interface Webhook {
  id: number;
  url: string;
  /** HMAC signing secret — the receiver needs it to verify our signature. */
  secret?: string;
  events: string[];
  deviceIds: string[];
  enabled: boolean;
  failures: number;
  lastStatus: number | null;
  lastError: string | null;
  lastAt: string | null;
  createdAt: string;
}
export interface SceneBody {
  name?: string;
  icon?: string;
  favorite?: boolean;
  actions?: SceneAction[];
}
export interface AppEvent {
  id: number;
  device_id: string | null;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  ts: string;
}
export interface EnergyByDevice {
  id: string;
  name: string;
  type: string;
  online: boolean;
  watts: number;
}
export interface EnergySummary {
  liveWatts: number;
  todayKwh: number;
  byDevice: EnergyByDevice[];
}
export interface EnergyPoint {
  t: string;
  avg: number;
  max: number;
}
export interface EnergySeries {
  metric: string;
  gran: string;
  series: EnergyPoint[];
  kwh: number;
}

export interface AdminStats {
  users: number;
  devices: number;
  online: number;
  events7d: number;
  pendingSignups: number;
  byType: { type: string; count: number }[];
}
export interface AdminUser {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  /** Disabled accounts cannot sign in, and their live sessions were revoked. */
  blocked: boolean;
  created_at: string;
  devices: number;
}
export interface AdminDevice {
  id: string;
  name: string;
  type: string;
  room: string;
  online: boolean;
  last_seen: string | null;
  fw_version: string;
  state: Record<string, unknown>;
  owner_email: string | null;
  owner_id: number | null;
}
export interface AdminEvent {
  id: number;
  owner_id: number | null;
  device_id: string | null;
  kind: string;
  title: string;
  body: string;
  ts: string;
  owner_email: string | null;
}
export interface AdminHealth {
  mqtt: boolean;
  db: boolean;
  uptimeSec: number;
  node: string;
}

interface AuthResp {
  token: string;
  /** Present from every sign-in path; absent only from an out-of-date server. */
  refreshToken?: string;
  user: ControlUser;
}

export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

// ------------------------------------------------------------- token store --

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null): void {
  if (typeof window === "undefined") return;
  if (t) window.localStorage.setItem(TOKEN_KEY, t);
  else window.localStorage.removeItem(TOKEN_KEY);
}
export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}
export function setRefreshToken(t: string | null): void {
  if (typeof window === "undefined") return;
  if (t) window.localStorage.setItem(REFRESH_KEY, t);
  else window.localStorage.removeItem(REFRESH_KEY);
}
export function getStoredUser(): ControlUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ControlUser;
  } catch {
    return null;
  }
}
export function setStoredUser(u: ControlUser | null): void {
  if (typeof window === "undefined") return;
  if (u) window.localStorage.setItem(USER_KEY, JSON.stringify(u));
  else window.localStorage.removeItem(USER_KEY);
}

/**
 * When credentials were last presented.
 *
 * Recorded separately from the token because the token is replaced on every
 * renewal and this must not be. Nothing reads it but the 24 hour cap.
 */
export function getSignInAt(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SIGNED_IN_AT_KEY);
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Starts the 24 hour clock. Called only where credentials were actually checked. */
export function markSignedInNow(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIGNED_IN_AT_KEY, String(Date.now()));
}

/**
 * Removes every trace of the session.
 *
 * One function rather than three calls at each site: the sign-in stamp was
 * added later than the tokens, and a place that forgot to clear it would leave
 * a stamp behind that outlives the session it described — which then caps the
 * NEXT sign-in early, from the previous one's clock.
 */
export function endSession(): void {
  setToken(null);
  setRefreshToken(null);
  setStoredUser(null);
  if (typeof window !== "undefined") window.localStorage.removeItem(SIGNED_IN_AT_KEY);
}

// -------------------------------------------------------------- core fetch --

/**
 * One in-flight refresh at a time.
 *
 * Several requests routinely fail with 401 together — a dashboard fires half a
 * dozen on mount. Without this they would each try to rotate, and because
 * rotation is single-use, all but one would present an already-spent token.
 * The server would read that as replay and destroy the family, signing the user
 * out for doing nothing wrong.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const stored = getRefreshToken();
  if (!stored) return false;

  /*
   * A renewal cannot outlive the sign-in it descends from.
   *
   * This is the reason the 24 hour cap is measured from the sign-in and not
   * from the token. Renewal happens automatically on any 401, so an expiry on
   * the access token alone would be renewed straight past — the session would
   * run for the refresh chain's sixty days across an unbounded number of
   * short-lived tokens, and shortening the token would have looked like a fix
   * while changing nothing.
   */
  if (sessionExpired(sessionStartedAt({ stamp: getSignInAt(), tokenIssuedAt: issuedAtFromJwt(getToken()), now: Date.now() }), Date.now())) {
    endSession();
    return false;
  }

  try {
    const res = await fetch(CONTROL_PLANE_URL + "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: stored }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      token?: string;
      refreshToken?: string;
      user?: ControlUser;
    };
    if (!res.ok || !data.token || !data.refreshToken) {
      // The chain is finished — expired, revoked, or torn down after a replay.
      // Clearing it stops every later request retrying a token that cannot work.
      setToken(null);
      setRefreshToken(null);
      return false;
    }
    setToken(data.token);
    setRefreshToken(data.refreshToken);
    if (data.user) setStoredUser(data.user);
    return true;
  } catch {
    // A network failure is not proof the chain is dead, so it is left in place
    // to try again rather than signing the user out over a flaky connection.
    return false;
  }
}

function withRefreshLock(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = refreshSession().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function req<T = unknown>(
  path: string,
  opts: RequestInit = {},
  auth = true,
  allowRetry = true
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (auth) {
    const t = getToken();
    if (t) headers["Authorization"] = "Bearer " + t;
  }
  try {
    const res = await fetch(CONTROL_PLANE_URL + path, { ...opts, headers });

    // A 401 on an authenticated call may just mean the access token aged out.
    // Rotate once and replay the request; `allowRetry` stops this recursing.
    if (res.status === 401 && auth && allowRetry && getRefreshToken()) {
      if (await withRefreshLock()) {
        return req<T>(path, opts, auth, false);
      }
    }

    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Network error" } as unknown as T };
  }
}

// ------------------------------------------------------------------- client --

/**
 * Fetches a binary response with the caller's bearer token.
 *
 * `req` assumes JSON, and an authenticated image cannot simply be handed to
 * an `<img src>`: the browser sends no Authorization header on an image
 * request, so the tag renders a broken icon that looks exactly like a missing
 * capture. Callers turn the blob into an object URL instead.
 */
export async function authedBlob(url: string): Promise<Blob> {
  const fetchOnce = async () => {
    const t = getToken();
    return fetch(url, { headers: t ? { Authorization: "Bearer " + t } : {} });
  };
  let res = await fetchOnce();
  // Same one-shot rotation as req(): an access token that aged out mid-page
  // must not turn every thumbnail into a broken image.
  if (res.status === 401 && getRefreshToken() && (await withRefreshLock())) {
    res = await fetchOnce();
  }
  if (!res.ok) throw new Error(`Image request failed (${res.status})`);
  return res.blob();
}

export const controlPlane = {
  authedBlob,
  login: (email: string, password: string) =>
    req<AuthResp>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, false),
  register: (name: string, email: string, password: string) =>
    req<{ pending: boolean; email: string; otpSent: boolean; expiresInMin: number; error?: string }>(
      "/auth/register",
      { method: "POST", body: JSON.stringify({ email, password, name }) },
      false
    ),
  verifyOtp: (email: string, otp: string) =>
    req<AuthResp>("/auth/verify-otp", { method: "POST", body: JSON.stringify({ email, otp }) }, false),
  resendOtp: (email: string) =>
    req<{ pending: boolean; otpSent: boolean; error?: string }>("/auth/resend-otp", { method: "POST", body: JSON.stringify({ email }) }, false),
  /**
   * End every session for the signed-in account — the recovery action after a
   * lost phone. Returns a fresh token so the browser making the request stays
   * signed in; callers must store it, or they sign themselves out too.
   */
  signOutEverywhere: () =>
    req<{ success: boolean; token: string; refreshToken?: string }>("/auth/sign-out-all", { method: "POST" }),
  /**
   * Change a known password. Also ends every other session, because revoking
   * sessions without changing the password is pointless if someone else knows
   * it. Returns a replacement token for this browser.
   */
  changePassword: (currentPassword: string, newPassword: string) =>
    req<{ success: boolean; token: string; refreshToken?: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  /**
   * Start a password reset. Always succeeds, whether or not the address has an
   * account — the response is deliberately not an account-existence oracle.
   */
  forgotPassword: (email: string) =>
    req<{ sent: boolean; message: string; expiresInMin: number }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }, false),
  /** Finish a reset with the emailed code. Ends every existing session. */
  resetPassword: (email: string, otp: string, newPassword: string) =>
    req<{ success: boolean; token: string; refreshToken?: string; user: { id: number; email: string; name: string } }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ email, otp, newPassword }),
    }, false),
  // Normalised at the boundary: this control-plane build leaves fw_version
  // empty and never clears a stale `online` flag, and both are recoverable from
  // what it does send. See device-normalize.ts.
  devices: async () => {
    const r = await req<{ devices: Device[] }>("/devices");
    if (r.ok && r.data?.devices) r.data.devices = normalizeDevices(r.data.devices);
    return r;
  },
  device: async (id: string) => {
    const r = await req<{ device: Device }>("/devices/" + encodeURIComponent(id));
    if (r.ok && r.data?.device) r.data.device = normalizeDevice(r.data.device);
    return r;
  },
  claim: (id: string, key: string, name: string) =>
    req<{ success: boolean; id?: string; error?: string }>("/devices/claim", {
      method: "POST",
      body: JSON.stringify({ id, key, name }),
    }),
  command: (id: string, cmd: Record<string, unknown>) =>
    req<{ success?: boolean; error?: string }>(
      "/devices/" + encodeURIComponent(id) + "/command",
      { method: "POST", body: JSON.stringify(cmd) }
    ),
  telemetry: (id: string, limit = 100) =>
    req<{ telemetry: { ts: string; payload: Record<string, unknown> }[] }>(
      "/devices/" + encodeURIComponent(id) + "/telemetry?limit=" + limit
    ),
  automations: () => req<{ automations: Automation[] }>("/automations"),
  createAutomation: (body: AutomationBody) =>
    req<{ automation: Automation }>("/automations", { method: "POST", body: JSON.stringify(body) }),
  updateAutomation: (id: number, body: AutomationBody) =>
    req<{ success?: boolean; automation?: Automation }>(
      "/automations/" + encodeURIComponent(String(id)),
      { method: "PATCH", body: JSON.stringify(body) }
    ),
  deleteAutomation: (id: number) =>
    req<{ success: boolean }>("/automations/" + encodeURIComponent(String(id)), { method: "DELETE" }),

  // ---- device metadata ----------------------------------------------------
  patchDevice: (id: string, body: { name?: string; room?: string; favorite?: boolean }) =>
    req<{ success: boolean }>("/devices/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(body) }),

  // ---- rooms --------------------------------------------------------------
  rooms: () => req<{ rooms: Room[] }>("/rooms"),
  createRoom: (name: string, icon?: string) =>
    req<{ room: Room }>("/rooms", { method: "POST", body: JSON.stringify({ name, icon }) }),
  updateRoom: (id: number, body: { name?: string; icon?: string; sort?: number }) =>
    req<{ success: boolean }>("/rooms/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  deleteRoom: (id: number) => req<{ success: boolean }>("/rooms/" + id, { method: "DELETE" }),

  // ---- ANPR: plate reads and the allow / deny / watch list ----------------
  plateReads: (q: { deviceId?: string; plate?: string; decision?: string; status?: string; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (q.deviceId) p.set("deviceId", q.deviceId);
    if (q.plate) p.set("plate", q.plate);
    if (q.decision) p.set("decision", q.decision);
    if (q.status) p.set("status", q.status);
    p.set("limit", String(q.limit ?? 100));
    return req<{ reads: PlateRead[] }>("/anpr/reads?" + p.toString());
  },
  plateSummary: (days = 7) => req<PlateSummary>("/anpr/summary?days=" + days),
  vehicles: (days = 30) => req<{ days: number; vehicles: Vehicle[]; insideNow: number }>("/anpr/vehicles?days=" + days),
  occupancy: () => req<Occupancy>("/anpr/occupancy"),
  anprSettings: () => req<{ settings: AnprSettings }>("/anpr/settings"),
  saveAnprSettings: (body: Partial<AnprSettings>) =>
    req<{ settings: AnprSettings }>("/anpr/settings", { method: "PATCH", body: JSON.stringify(body) }),
  /**
   * Send today's report immediately.
   *
   * Runs the same code the 07:00 scheduler runs, not a preview — the failures
   * worth catching are all in delivery, and a preview cannot see them.
   */
  sendTestReport: () =>
    req<{ sent: boolean; to: string; error?: string }>("/anpr/report/test", { method: "POST" }),
  vehicle: (plate: string) =>
    req<VehicleProfile>("/anpr/vehicles/" + encodeURIComponent(plate)),
  /**
   * The capture image lives behind an authenticated endpoint, so an <img src>
   * cannot fetch it — the browser would send no Authorization header. Callers
   * fetch the blob and hand it an object URL.
   */
  plateReadImageUrl: (id: number) => CONTROL_PLANE_URL + "/anpr/reads/" + id + "/image",
  plateRules: () => req<{ rules: PlateRule[] }>("/anpr/rules"),
  createPlateRule: (body: {
    plate: string;
    kind?: "allow" | "deny" | "watch";
    label?: string;
    deviceId?: string | null;
    validTo?: string | null;
  }) => req<{ rule: PlateRule; error?: string }>("/anpr/rules", { method: "POST", body: JSON.stringify(body) }),
  updatePlateRule: (id: number, body: { kind?: string; label?: string; enabled?: boolean }) =>
    req<{ rule: PlateRule }>("/anpr/rules/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  deletePlateRule: (id: number) => req<{ success: boolean }>("/anpr/rules/" + id, { method: "DELETE" }),
  addPlateRuleFromRead: (readId: number, kind: "allow" | "deny" | "watch", label = "") =>
    req<{ rule: PlateRule; error?: string }>("/anpr/rules/from-read/" + readId, {
      method: "POST",
      body: JSON.stringify({ kind, label }),
    }),
  anprCapture: (deviceId: string) =>
    req<{ success: boolean }>("/anpr/devices/" + encodeURIComponent(deviceId) + "/capture", { method: "POST" }),

  // ---- drone --------------------------------------------------------------
  droneLive: () => req<{ aircraft: LiveAircraft[]; limits: DroneLimits }>("/drone/live"),
  /**
   * Relays one command.
   *
   * A refusal comes back as HTTP 409 with a `code`, and the caller is expected
   * to show the reason rather than retry. Every command here is a whole intent
   * that is safe to complete on its own if the link dies immediately after —
   * there is deliberately no continuous manual control.
   */
  droneCommand: (deviceId: string, body: DroneCommand) =>
    req<{ ok: boolean }>("/drone/" + encodeURIComponent(deviceId) + "/command", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  flights: (opts: { device?: string; limit?: number } = {}) =>
    req<{ flights: Flight[] }>(
      "/drone/flights?limit=" + (opts.limit ?? 50) + (opts.device ? "&device=" + encodeURIComponent(opts.device) : "")
    ),
  flight: (id: string) => req<{ flight: Flight; events: FlightEvent[] }>("/drone/flights/" + id),
  flightTrack: (id: string, points = 2000) =>
    req<{ points: TrackPoint[] }>("/drone/flights/" + id + "/track?points=" + points),
  patchFlight: (id: string, body: { notes?: string; batteryId?: string | null }) =>
    req<{ ok: boolean }>("/drone/flights/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  flightsCsvUrl: () => CONTROL_PLANE_URL + "/drone/flights.csv",
  droneMissions: () => req<{ missions: Mission[] }>("/drone/missions"),
  createMission: (body: { name: string; waypoints: Waypoint[] }) =>
    req<{ mission: Mission; error?: string }>("/drone/missions", { method: "POST", body: JSON.stringify(body) }),
  deleteMission: (id: string) => req<{ ok: boolean }>("/drone/missions/" + id, { method: "DELETE" }),
  batteries: () => req<{ batteries: Battery[] }>("/drone/batteries"),
  addBattery: (body: { label: string; cells?: number; capacityMah?: number; retireAt?: number }) =>
    req<{ battery: Battery }>("/drone/batteries", { method: "POST", body: JSON.stringify(body) }),
  updateBattery: (id: string, body: { label?: string; retireAt?: number; retired?: boolean; cycles?: number }) =>
    req<{ battery: Battery }>("/drone/batteries/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  deleteBattery: (id: string) => req<{ ok: boolean }>("/drone/batteries/" + id, { method: "DELETE" }),
  droneSettings: () => req<{ settings: DroneSettings }>("/drone/settings"),
  saveDroneSettings: (body: Partial<DroneSettings>) =>
    req<{ settings: DroneSettings }>("/drone/settings", { method: "PUT", body: JSON.stringify(body) }),
  sendTestFlightReport: () =>
    req<{ ok: boolean; sentTo?: string; error?: string }>("/drone/report/test", { method: "POST" }),
  droneEvents: (limit = 100) => req<{ events: FlightEvent[] }>("/drone/events?limit=" + limit),

  // ---- gate guest passes (Zone 1) ----------------------------------------
  gatePasses: (deviceId?: string) =>
    req<{ passes: GatePass[] }>("/gate/passes" + (deviceId ? "?deviceId=" + encodeURIComponent(deviceId) : "")),
  createGatePass: (body: { deviceId: string; label?: string; validToMinutes?: number; maxUses?: number }) =>
    req<{ pass: GatePass }>("/gate/passes", { method: "POST", body: JSON.stringify(body) }),
  revokeGatePass: (id: number) => req<{ success: boolean }>("/gate/passes/" + id + "/revoke", { method: "POST" }),
  redeemGatePass: (code: string) =>
    req<{ ok: boolean; opened?: boolean; label?: string; usesLeft?: number; error?: string }>("/gate/redeem", { method: "POST", body: JSON.stringify({ code }) }),

  // ---- scenes -------------------------------------------------------------
  scenes: () => req<{ scenes: Scene[] }>("/scenes"),
  createScene: (body: SceneBody) => req<{ scene: Scene }>("/scenes", { method: "POST", body: JSON.stringify(body) }),
  updateScene: (id: number, body: SceneBody) => req<{ scene: Scene }>("/scenes/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  deleteScene: (id: number) => req<{ success: boolean }>("/scenes/" + id, { method: "DELETE" }),
  activateScene: (id: number) => req<{ success: boolean; sent: number }>("/scenes/" + id + "/activate", { method: "POST" }),

  // ---- events / notifications --------------------------------------------
  events: (limit = 100, unread = false) =>
    req<{ events: AppEvent[] }>("/events?limit=" + limit + (unread ? "&unread=1" : "")),
  unreadCount: () => req<{ count: number }>("/events/unread-count"),
  markEventsRead: (ids?: number[]) => req<{ success: boolean }>("/events/read", { method: "POST", body: JSON.stringify({ ids }) }),
  deleteEvent: (id: number) => req<{ success: boolean }>("/events/" + id, { method: "DELETE" }),
  clearEvents: () => req<{ success: boolean }>("/events", { method: "DELETE" }),

  // ---- energy -------------------------------------------------------------
  energySummary: () => req<EnergySummary>("/energy/summary"),
  deviceEnergy: (id: string, hours = 24, metric = "watts") =>
    req<EnergySeries>("/devices/" + encodeURIComponent(id) + "/energy?hours=" + hours + "&metric=" + metric),

  // ---- admin (control-plane, requires is_admin) --------------------------
  adminMe: () => req<{ admin: boolean; uid: number; email: string }>("/admin/me"),
  adminStats: () => req<AdminStats>("/admin/stats"),
  adminUsers: () => req<{ users: AdminUser[] }>("/admin/users"),
  adminSetRole: (id: number, is_admin: boolean) =>
    req<{ success: boolean }>("/admin/users/" + id, { method: "PATCH", body: JSON.stringify({ is_admin }) }),
  /** Disable or re-enable an account. Disabling also ends its live sessions. */
  adminSetBlocked: (id: number, blocked: boolean) =>
    req<{ success: boolean }>("/admin/users/" + id, { method: "PATCH", body: JSON.stringify({ blocked }) }),
  /**
   * End every session for an account without disabling it — the right action
   * when a device is lost but the account itself is fine.
   */
  adminRevokeSessions: (id: number) =>
    req<{ success: boolean }>("/admin/users/" + id + "/revoke-sessions", { method: "POST" }),
  adminDeleteUser: (id: number) => req<{ success: boolean }>("/admin/users/" + id, { method: "DELETE" }),
  adminDevices: async () => {
    const r = await req<{ devices: AdminDevice[] }>("/admin/devices");
    if (r.ok && r.data?.devices) r.data.devices = normalizeDevices(r.data.devices);
    return r;
  },
  adminCommand: (id: string, cmd: Record<string, unknown>) =>
    req<{ success: boolean }>("/admin/devices/" + encodeURIComponent(id) + "/command", { method: "POST", body: JSON.stringify(cmd) }),
  adminOta: (id: string, url: string, version?: string) =>
    req<{ success: boolean }>("/admin/devices/" + encodeURIComponent(id) + "/ota", { method: "POST", body: JSON.stringify({ url, version }) }),
  adminDeleteDevice: (id: string) =>
    req<{ success: boolean }>("/admin/devices/" + encodeURIComponent(id), { method: "DELETE" }),
  adminEvents: (limit = 100) => req<{ events: AdminEvent[] }>("/admin/events?limit=" + limit),
  adminHealth: () => req<AdminHealth>("/admin/health"),
  adminDevice: async (id: string) => {
    const r = await req<{ device: AdminDevice }>("/admin/devices/" + encodeURIComponent(id));
    if (r.ok && r.data?.device) r.data.device = normalizeDevice(r.data.device);
    return r;
  },
  adminDeviceTelemetry: (id: string, limit = 100) =>
    req<{ telemetry: { ts: string; payload: Record<string, unknown> }[] }>(
      "/admin/devices/" + encodeURIComponent(id) + "/telemetry?limit=" + limit
    ),
  adminPatchDevice: (id: string, body: { name?: string; room?: string; owner_id?: number | null }) =>
    req<{ success: boolean }>("/admin/devices/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(body) }),
  adminProvision: (body: { type: string; name?: string; owner_id?: number }) =>
    req<{ id: string; key: string; mqttUsername: string; mqttPassword: string; error?: string }>("/admin/devices/provision", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminBroadcast: (body: { type?: string; online?: boolean; command: Record<string, unknown> }) =>
    req<{ success: boolean; sent: number }>("/admin/broadcast", { method: "POST", body: JSON.stringify(body) }),
  // ---- OTA -----------------------------------------------------------------
  adminOtaBroadcast: (body: { type?: string; url: string; version?: string }) =>
    req<{ success: boolean; sent: number }>("/admin/ota-broadcast", { method: "POST", body: JSON.stringify(body) }),

  // ---- device registry (internal team) ------------------------------------
  adminDeviceLookup: (q: string) =>
    req<{ matchedBy: "serial" | "search"; normalized: string | null; devices: AdminDeviceRecord[]; error?: string; code?: string }>(
      "/admin/devices/lookup?q=" + encodeURIComponent(q)
    ),
  adminDeviceReport: (id: string, limit = 100) =>
    req<{ report: DeviceReport }>("/admin/devices/" + encodeURIComponent(id) + "/report?limit=" + limit),
  /**
   * Reissues a device key. The old one cannot be recovered — only a bcrypt
   * hash is stored — so this replaces it, and the device must be set up again
   * with the new key. The returned secret is shown once.
   */
  adminReissueKey: (id: string, note: string) =>
    req<{ success: boolean; key: string; mqttUsername: string; mqttPassword: string; error?: string }>(
      "/admin/devices/" + encodeURIComponent(id) + "/reissue-key",
      { method: "POST", body: JSON.stringify({ note }) }
    ),
  adminAssignDevice: (id: string, ownerEmail: string | null, note: string) =>
    req<{ success: boolean; ownerEmail: string | null; error?: string }>(
      "/admin/devices/" + encodeURIComponent(id) + "/assign",
      { method: "POST", body: JSON.stringify({ ownerEmail, note }) }
    ),
  adminClaimForUser: (body: { device: string; key: string; ownerEmail: string; note?: string }) =>
    req<{ success: boolean; deviceId: string; ownerEmail: string; error?: string; code?: string }>(
      "/admin/devices/claim-for-user",
      { method: "POST", body: JSON.stringify(body) }
    ),
  adminUpdateDevice: (id: string, body: { name?: string; room?: string; notes?: string; batch?: string }) =>
    req<{ success: boolean }>("/admin/devices/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  /** The owner's own report for their own device — no secrets, no internal data. */
  deviceReport: (id: string, limit = 100) =>
    req<{ report: DeviceReport }>("/devices/" + encodeURIComponent(id) + "/report?limit=" + limit),

  // ---- developer: API keys + webhooks -------------------------------------
  // Deliberately session-authenticated. The control plane refuses these
  // endpoints to API keys so a leaked key cannot mint itself a broader one.
  devScopes: () => req<{ scopes: ApiScopeInfo[]; webhookEvents: string[] }>("/developer/scopes"),
  apiKeys: () => req<{ keys: ApiKey[] }>("/developer/keys"),
  createApiKey: (body: {
    name: string;
    env?: "live" | "test";
    scopes: string[];
    allowedOrigins?: string[];
    expiresInDays?: number | null;
  }) => req<{ key: ApiKey; secret: string }>("/developer/keys", { method: "POST", body: JSON.stringify(body) }),
  updateApiKey: (id: number, body: { name?: string; scopes?: string[]; allowedOrigins?: string[] }) =>
    req<{ key: ApiKey }>("/developer/keys/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  revokeApiKey: (id: number) => req<{ success: boolean }>("/developer/keys/" + id, { method: "DELETE" }),

  webhooks: () => req<{ webhooks: Webhook[] }>("/developer/webhooks"),
  createWebhook: (body: { url: string; events?: string[]; deviceIds?: string[] }) =>
    req<{ webhook: Webhook }>("/developer/webhooks", { method: "POST", body: JSON.stringify(body) }),
  updateWebhook: (id: number, body: { enabled?: boolean; events?: string[]; deviceIds?: string[] }) =>
    req<{ webhook: Webhook }>("/developer/webhooks/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  deleteWebhook: (id: number) => req<{ success: boolean }>("/developer/webhooks/" + id, { method: "DELETE" }),
  testWebhook: (id: number) =>
    req<{ delivered: boolean; status?: number; ms: number; error?: string }>("/developer/webhooks/" + id + "/test", {
      method: "POST",
    }),
};

export type { AuthResp };
