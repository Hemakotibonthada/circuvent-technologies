// Browser client for the self-hosted Circuvent control plane (platform/api).
//
// Mirrors the mobile app's client (mobile/src/api.ts) so the web console and the
// mobile app share one backend, one auth scheme (JWT), and identical semantics.
// The base URL is configurable per-deployment; it defaults to the production
// control plane. Commands are published over MQTT server-side and reach the
// device in well under a second.

import { normalizeDevice, normalizeDevices } from "./device-normalize";

import { emit } from "./telemetry-emit";

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
  /**
   * Profile picture asserted by the identity provider at sign-in. Optional
   * because password accounts and older stored sessions have none, and the
   * console must render an identity either way.
   */
  avatarUrl?: string;
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

/* -------------------------------------------------------- household sharing */

/**
 * What somebody can do in a home they were invited to.
 *
 * Mirrors the server's list exactly. Kept as a union rather than a string so
 * that a screen offering a role the server does not know fails to compile
 * instead of failing at the point somebody tries to use it.
 */
export type HomeRole = "owner" | "adult" | "limited" | "guest";

/**
 * What a role is allowed to do. Sent by the server rather than derived here —
 * see `useHomeAccess` for why a browser-side copy of the rules is a trap.
 */
export type HomeCapability =
  | "view"
  | "control"
  | "security"
  | "manage-devices"
  | "manage-automations"
  | "manage-members"
  | "account";

export interface HomeSummary {
  homeId: number;
  role: HomeRole;
  ownerName: string;
  ownerEmail: string;
}

export interface HomeMember {
  id: number;
  name: string;
  email: string;
  role: HomeRole;
  since?: string;
}

export interface HomeInvite {
  code: string;
  role: HomeRole;
  email: string | null;
  expiresAt: string;
  createdAt: string;
  /** One field rather than three booleans a screen has to combine — and get
      the same way in every screen. */
  status: "open" | "accepted" | "expired" | "revoked";
}

export interface HomeRoleInfo {
  role: Exclude<HomeRole, "owner">;
  label: string;
  description: string;
}

/** A voice assistant linked to this account. */
export interface LinkedAssistant {
  assistant: "google" | "alexa";
  linkedAt: string;
  lastSyncAt: string | null;
  /**
   * Whether we can push changes to it.
   *
   * False means the assistant only learns a device's state when it asks, so
   * its app can show a stale value after a wall switch. Worth surfacing rather
   * than hiding: it is the explanation for the thing a customer would
   * otherwise report as a bug.
   */
  receivesUpdates: boolean;
}

/** One ANPR capture, after the plate was read (or found unreadable). */export interface PlateRead {
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

/**
 * An ordinary camera driven as an ANPR lane.
 *
 * The trigger logic an `anpr-cam` runs in firmware, running in the control
 * plane instead: motion telemetry starts a burst, the burst is a run of
 * `snapshot` commands, and the frames that come back enter the same pipeline.
 */
export interface AnprLane {
  deviceId: string;
  enabled: boolean;
  /** The mounting decides this. `both` alternates against the vehicle's state. */
  direction: "in" | "out" | "both";
  /** Frames per trigger. Two give agreement, three break a tie. */
  burst: number;
  burstGapMs: number;
  /** Minimum gap between motion triggers. Never applies to a manual capture. */
  cooldownMs: number;
  /** Illuminator level pulsed for the burst, 0-100. 0 leaves it alone. */
  illuminate: number;
  triggers: number;
  lastTriggerAt: string | null;
}

/** A camera that could become a lane, or is one already. */
export interface AnprLaneCandidate {
  deviceId: string;
  name: string;
  type: string;
  room: string | null;
  /** False for an `anpr-cam`: it reads plates itself and needs no lane. */
  eligible: boolean;
  reason: string | null;
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
    | "brake" | "goto" | "mission" | "mode" | "set" | "state"
    /* Bench tools — refused by the control plane and again by the firmware on
       anything that might be airborne. See platform/api/src/drone/safety.ts. */
    | "beep" | "motorTest" | "turtle" | "benchStop";
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
  /** Bench tools: which motor to spin, at what throttle, and turtle on/off. */
  motor?: number;
  throttle?: number;
  on?: boolean;
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
/**
 * One app install signed in to an account.
 *
 * `lastCity` and `lastCountry` come from the reverse proxy's IP geolocation
 * where it provides one and are empty where it does not — nothing looks them
 * up, because an invented city is worse than an absent one. There are
 * deliberately no coordinates; see platform/api/src/app-installs.ts.
 */
export interface AppInstall {
  id: number;
  userId: number;
  installId: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  model: string;
  lastIp: string;
  lastCity: string;
  lastCountry: string;
  firstSeen: string;
  lastSeen: string;
  revokedAt: string | null;
  email: string;
  name: string;
}

export interface AppInstallStats {
  total: number;
  android: number;
  ios: number;
  activeDay: number;
  versions: { appVersion: string; n: number }[];
}

export interface AdminDevice {
  id: string;
  name: string;  type: string;
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
/**
 * The TLS certificate the MQTT broker presents, as reported by the control
 * plane's `GET /admin/health`.
 *
 * Mirrors `BrokerCertInfo` in `platform/api/src/broker-cert.ts`. The two are
 * separate TypeScript projects and cannot import each other, so
 * `tests/broker-cert-surface.test.ts` fails the build if they disagree.
 *
 * This matters more than a normal health field. The certificate is issued for
 * 825 days, and devices verify it on every connection — when it lapses the
 * entire fleet fails the handshake at once. The renewal is cheap (devices
 * trust the CA, not this certificate, so no OTA is needed), which is exactly
 * why the expiry has to be visible somewhere an operator already looks rather
 * than remembered.
 */
export interface BrokerCertInfo {
  subject: string;
  issuer: string;
  /** ISO-8601. */
  validTo: string;
  daysRemaining: number;
  /** Set by the server at 60 days. Read it rather than re-deriving the
   *  threshold here — a second copy would drift from the one that matters. */
  expiringSoon: boolean;
}

export interface AdminHealth {
  mqtt: boolean;
  db: boolean;
  uptimeSec: number;
  node: string;
  /**
   * Absent when the API could not reach the broker to inspect it, and on any
   * control plane older than this field. Optional rather than defaulted, so a
   * console can tell "not checked" apart from "checked and fine" — defaulting
   * would report a healthy certificate for a broker nobody managed to reach.
   */
  brokerCert?: BrokerCertInfo | null;
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
  setActiveHome(null);
  if (typeof window !== "undefined") window.localStorage.removeItem(SIGNED_IN_AT_KEY);
}

// ------------------------------------------------------------- shared homes --

const ACTIVE_HOME_KEY = "cv_active_home";

/**
 * The home the console is currently looking at.
 *
 * Null means the signed-in account's own, which is what every session was
 * before households existed — so nothing has to be set for the common case.
 *
 * Held in localStorage rather than in React state because it must survive a
 * reload: somebody checking on their mother's house, who refreshes the page
 * and silently lands back in their own, would read their own meter and
 * conclude hers was fine.
 */
export function getActiveHome(): number | null {
  if (typeof window === "undefined") return null;
  const v = Number(window.localStorage.getItem(ACTIVE_HOME_KEY));
  return Number.isInteger(v) && v > 0 ? v : null;
}

export function setActiveHome(homeId: number | null): void {
  if (typeof window === "undefined") return;
  if (homeId === null) window.localStorage.removeItem(ACTIVE_HOME_KEY);
  else window.localStorage.setItem(ACTIVE_HOME_KEY, String(homeId));
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

/**
 * Collapses a control-plane path into an operation name.
 *
 * "/devices/cv-abc123/command" is one operation, not one per device. Without
 * this the busiest dependency is whichever device is used most, and the call
 * that is actually slow is spread across a thousand rows of one call each.
 * Query strings are dropped entirely, because they carry tokens.
 */
function dependencyName(path: string): string {
  return (
    path
      .split("?")[0]
      .split("/")
      .map((seg) => {
        if (!seg) return seg;
        if (/^[0-9]+$/.test(seg)) return "[id]";
        if (/^[0-9a-fA-F-]{16,}$/.test(seg)) return "[id]";
        if (seg.length > 10 && /[0-9]/.test(seg) && /[a-zA-Z]/.test(seg)) return "[id]";
        return seg;
      })
      .join("/") || "/"
  );
}

async function req<T = unknown>(  path: string,
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
    /*
     * Which home this call is about.
     *
     * Set here rather than at each call site so that every existing request is
     * scoped by the switcher without being touched. Omitted when it is the
     * caller's own home, so a session that never switches sends exactly what
     * it always did.
     */
    const home = getActiveHome();
    if (home) headers["x-circuvent-home"] = String(home);
  }
  try {
    const startedAt = Date.now();
    const res = await fetch(CONTROL_PLANE_URL + path, { ...opts, headers });

    /*
     * Recorded per network call, not per logical request. The 401 retry below
     * recurses, so a token rotation shows as two dependency calls — which is
     * what actually happened, and the reason a route occasionally reports
     * double the latency somebody expects.
     */
    emit({
      kind: "dependency",
      target: "control-plane",
      path: dependencyName(path),
      method: (opts.method ?? "GET").toUpperCase(),
      status: res.status,
      ok: res.ok,
      durationMs: Date.now() - startedAt,
    });

    // A 401 on an authenticated call may just mean the access token aged out.
    // Rotate once and replay the request; `allowRetry` stops this recursing.
    if (res.status === 401 && auth && allowRetry && getRefreshToken()) {
      if (await withRefreshLock()) {
        return req<T>(path, opts, auth, false);
      }
    }

    const data = (await res.json().catch(() => ({}))) as T;

    /*
     * The home we were acting in is gone — access revoked, or the account
     * deleted. Drop the selection and replay against our own home.
     *
     * Without this the console is bricked rather than merely wrong: the stale
     * header is sent on every request, so even the call that lists the homes
     * you could switch back to is refused, and there is no path out of it from
     * the screen. Narrowed to the one code the server sends for this, so an
     * ordinary "guests cannot unlock doors" refusal does not silently move
     * somebody out of the house they are looking at.
     */
    if (
      res.status === 403 &&
      auth &&
      allowRetry &&
      getActiveHome() &&
      (data as { code?: string } | null)?.code === "home_unavailable"
    ) {
      setActiveHome(null);
      return req<T>(path, opts, auth, false);
    }

    return { ok: res.ok, status: res.status, data };
  } catch {
    emit({
      kind: "dependency",
      target: "control-plane",
      path: dependencyName(path),
      method: (opts.method ?? "GET").toUpperCase(),
      // No status, because there was no response. Recorded as a failure rather
      // than omitted: an unreachable control plane is the single most useful
      // thing this table can show.
      status: 0,
      ok: false,
      errorType: "NetworkError",
    });
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

/* ------------------------------------------------------------------ face --
 * FaceDoor roster.
 *
 * A profile is a person; samples are that person's face under different
 * conditions. Several per person is the point — one face is a lock that stops
 * recognising somebody the day they shave.
 */
export interface FaceProfile {
  id: number;
  name: string;
  role: string;
  enabled: boolean;
  allowFrom: string | null;
  allowTo: string | null;
  expiresAt: string | null;
  samples: number;
  lastEnrolled?: string | null;
  createdAt?: string;
}

export interface FaceAttempt {
  id: number;
  name: string;
  outcome: string;
  distance: number | null;
  granted: boolean;
  reason: string;
  at: string;
}

/** A camera acting as the eyes of a door lock. */
export interface FaceDoorCamera {
  deviceId: string;
  ownerId: number;
  /** The lock this camera unlocks. Null while no lock is fitted yet. */
  lockId: string | null;
  enabled: boolean;
  burst: number;
  burstGapMs: number;
  cooldownMs: number;
  illuminate: number;
  triggers: number;
  lastTriggerAt: string | null;
}

/* ------------------------------------------------------------------ */
/* Attendance                                                          */
/* ------------------------------------------------------------------ */

export interface AttendanceSite {
  id: number;
  name: string;
  kind: "school" | "office" | "facility";
  timezone: string;
  graceMinutes: number;
  halfDayAfterMinutes: number;
  absentAfterMinutes: number;
  autoOut: boolean;
  dedupeSeconds: number;
  notifyGuardians: boolean;
  notifyAbsence: boolean;
  /**
   * Whether an approved access request is a condition of the door opening.
   *
   * Defaults to false so that turning the feature on is a deliberate act. A
   * default of true would have stopped every card at every existing site the
   * moment it shipped.
   */
  requireAccessRequest: boolean;
  people: number;
  terminals: number;
}

export interface AttendanceGroup {
  id: number;
  name: string;
  kind: string;
  parentId: number | null;
  scheduleId: number | null;
  leadName: string;
  leadEmail: string;
  people: number;
}

export interface AttendancePerson {
  id: number;
  code: string;
  name: string;
  role: string;
  groupId: number | null;
  groupName: string | null;
  scheduleId: number | null;
  email: string;
  phone: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
  photoUrl: string;
  notes: string;
  cards: number;
}

export interface AttendanceCredential {
  id: number;
  personId: number;
  personName: string;
  personCode: string;
  kind: string;
  cardNumber: number;
  label: string;
  active: boolean;
  issuedAt: string;
  revokedAt: string | null;
  revokedReason: string;
  lastSeenAt: string | null;
}

export interface AttendanceTerminal {
  deviceId: string;
  deviceName: string | null;
  online: boolean;
  zoneId: number | null;
  zoneName: string | null;
  name: string;
  mode: string;
  direction: string;
  enabled: boolean;
  aclVersion: number;
  aclCount: number;
  aclPushedAt: string | null;
  lastPunchAt: string | null;
  /** What the terminal says it holds, so a push that never landed is visible. */
  deviceAclVersion: number | null;
  deviceAclCount: number | null;
  queued: number;
  readerPresent: boolean | null;
}

export interface AttendanceZone {
  id: number;
  name: string;
  kind: string;
  countsForAttendance: boolean;
}

export interface AttendanceSchedule {
  id: number;
  name: string;
  kind: "fixed" | "flexible";
  windows: Record<string, Array<{ in: string; out: string }>>;
  graceMinutes: number | null;
  minMinutes: number;
}

export interface AttendanceRule {
  id: number;
  zoneId: number | null;
  zoneName: string | null;
  groupId: number | null;
  groupName: string | null;
  personId: number | null;
  personName: string | null;
  scheduleId: number | null;
  scheduleName: string | null;
  allow: boolean;
  priority: number;
  validFrom: string | null;
  validTo: string | null;
  note: string;
}

export interface AttendanceLeave {
  id: number;
  personId: number | null;
  personName: string | null;
  groupId: number | null;
  groupName: string | null;
  kind: string;
  fromDay: string;
  toDay: string;
  countsAsPresent: boolean;
  note: string;
  approvedBy: string;
}

/**
 * Somebody asking to come into the building, and the answer.
 *
 * `decidedBy` is either "auto" — the rule agreed on the spot — or the email of
 * whoever answered. Keeping the two apart is the whole point of recording it:
 * after an incident, "a rule let them in" and "a person let them in" are very
 * different answers.
 */
export interface AttendanceAccessRequest {
  id: number;
  personId: number;
  personName: string | null;
  personCode: string | null;
  status: "pending" | "approved" | "rejected" | "revoked";
  /**
   * What is being asked for.
   *
   * A replacement shares this table with an access request because they share
   * their whole machinery, but they answer different questions and must never
   * be counted together — an approved replacement is not permission to enter a
   * building, it is permission to be issued another badge.
   */
  kind: "office-access" | "card-replacement";
  decidedBy: string;
  reason: string;
  /** Null means open-ended; a date pair is how a visitor gets one day only. */
  validFrom: string | null;
  validTo: string | null;
  requestedAt: string;
  decidedAt: string | null;
}

/**
 * A reader held open for one card, so it can be bound to a person.
 *
 * `expiresAt` is on the row rather than counted down in the browser: a tab left
 * open, a laptop that slept, or a clock that drifted would each otherwise show
 * a window that had long since closed as though it were still live.
 */
export interface AttendanceEnrolment {
  id: number;
  siteId: number;
  personId: number;
  deviceId: string;
  state: "waiting" | "done" | "expired" | "cancelled" | "failed";
  cardNumber: number | null;
  message: string;
  expiresAt: string;
}

export interface RegisterRow {
  personId: number;
  name: string;
  code: string;
  role: string;
  groupName: string | null;
  status: string;
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  punches: number;
  assumedOut: boolean;
  note: string;
  manual: boolean;
}

export interface AttendancePunch {
  id: number;
  at: string;
  deviceAt: string | null;
  direction: string;
  granted: boolean;
  reason: string;
  method: string;
  cardNumber: number | null;
  offline: boolean;
  deviceId: string | null;
  personName: string | null;
  personCode: string | null;
  zoneName: string | null;
  terminalName: string | null;
}

export interface AttendanceLive {
  day: string;
  timezone: string;
  totals: Record<string, number>;
  onSite: Array<{ personId: number; name: string; code: string; groupName: string | null; since: string }>;
  recent: Array<{
    at: string; direction: string; granted: boolean; reason: string;
    cardNumber: number | null; personName: string | null; personCode: string | null;
    terminalName: string | null;
  }>;
  terminals: Array<{
    deviceId: string; name: string; online: boolean;
    lastPunchAt: string | null; aclCount: number; queued: number;
  }>;
}

export interface AttendanceSummaryRow {
  personId: number;
  name: string;
  code: string;
  groupName: string | null;
  present: number;
  late: number;
  absent: number;
  half: number;
  leave: number;
  workedMinutes: number;
  lateMinutes: number;
  expected: number;
  percent: number | null;
}

/* ---------------------------------------------------------------- *
 * Guardian personal safety beacon                                    *
 * ---------------------------------------------------------------- */

export interface GuardianContact {
  id: number;
  name: string;
  /** E.164. The modem will not infer a country code the way a dialler does. */
  phone: string;
  relation: string;
  position: number;
  notifyPush: boolean;
}

export type GuardianContactInput = {
  name: string;
  phone: string;
  relation?: string;
  notifyPush?: boolean;
};

export interface GuardianIncident {
  id: string;
  deviceId: string;
  deviceName: string;
  /** button | app | test — a test must never be counted as an emergency. */
  source: string;
  /** open | acknowledged | resolved | false_alarm */
  status: string;
  openedAt: string;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string;
  closedAt?: string | null;
  /** Null when the device had no fix. Never zero — 0,0 is a real place. */
  lat: number | null;
  lng: number | null;
  stationKm: number | null;
  stationName: string | null;
  stationPhone?: string | null;
}

export interface GuardianTrackPoint {
  at: string;
  lat: number;
  lng: number;
  /** How old the GPS fix was. A stale point must not be drawn as a live one. */
  fixAgeSec: number;
  battery: number | null;
}

export interface GuardianNotification {
  target: string;
  targetName: string;
  channel: string;
  ok: boolean;
  sentBy: string;
  detail: string;
  at: string;
}

export interface GuardianStation {
  id: number;
  name: string;
  phone: string;
  country: string;
  district: string;
  lat: number;
  lng: number;
}

export interface GuardianZone {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  notifyEnter: boolean;
  notifyExit: boolean;
  /** Where the wearer was last seen relative to this zone; null = never seen. */
  presence: "inside" | "outside" | null;
}

export interface GuardianJourney {
  id: string;
  destination: string;
  startedAt: string;
  dueAt: string;
  /** running | arrived | overdue | cancelled */
  status: string;
  nudgedAt: string | null;
}

/* ---------------------------------------------------------------- *
 * RFID gate                                                         *
 * ---------------------------------------------------------------- */

export interface GateTag {
  id: number;
  /** The number the reader reports, after parity and format decoding. */
  tag: number;
  label: string;
  vehicle: string;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
  /** 0 = Sunday. Empty means every day. */
  days: number[];
  /** Minutes from local midnight; both null means any time. */
  fromMinute: number | null;
  toMinute: number | null;
  note: string;
  createdAt: string;
}

export type GateTagInput = {
  /** Either the decoded number, or the facility/card pair printed on the tag. */
  tag?: number;
  facility?: number;
  card?: number;
  label?: string;
  vehicle?: string;
  active?: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  days?: number[];
  fromMinute?: number | null;
  toMinute?: number | null;
  note?: string;
};

export interface GateEvent {
  id: string;
  tag: number | null;
  label: string;
  allowed: boolean;
  /** allowed | unknown-tag | revoked | expired | wrong-day | wrong-time | manual */
  reason: string;
  at: string;
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
  /**
   * Asks a device to raise its setup hotspot for a while.
   *
   * The firmware no longer opens that AP on its own when Wi-Fi is unreachable
   * — it waits for the network instead — so this is how a device offers its
   * setup link without somebody walking over and holding the button. Sent over
   * the authenticated command topic, so it reaches the device only if the
   * caller owns it.
   *
   * The device closes the window on its own when the time is up, and comes
   * back on the network it already had.
   */
  setupMode: (id: string, minutes = 10) =>
    req<{ success?: boolean; error?: string }>(
      "/devices/" + encodeURIComponent(id) + "/command",
      { method: "POST", body: JSON.stringify({ action: "setup", minutes }) }
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
    req<{ success: boolean; captureId?: number; via?: "lane" | "device" }>(
      "/anpr/devices/" + encodeURIComponent(deviceId) + "/capture",
      { method: "POST" }
    ),

  // ---- ANPR on an ordinary camera (lanes) ---------------------------------
  /**
   * A lane turns a `camera` into a plate reader.
   *
   * `anpr-cam` firmware decides when a vehicle is worth photographing and
   * publishes a burst itself. An ordinary camera cannot, but it does detect
   * motion and it does answer `snapshot` — so the control plane supplies the
   * trigger, the burst and the lane direction, and the read that comes out is
   * the same kind of read. See Docs/20-anpr.md §2a.
   *
   * The list comes back with the account's cameras alongside it, because the
   * question the screen is asking is "which of my cameras can do this, and
   * which are doing it" — building the first half from a separate device call
   * would mean filtering by device type in the browser.
   */
  anprLanes: () => req<{ lanes: AnprLane[]; cameras: AnprLaneCandidate[]; recogniser: string }>("/anpr/lanes"),
  saveAnprLane: (deviceId: string, body: Partial<Omit<AnprLane, "deviceId" | "triggers" | "lastTriggerAt">>) =>
    req<{ lane: AnprLane; prepared?: string[]; error?: string }>("/anpr/lanes/" + encodeURIComponent(deviceId), {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteAnprLane: (deviceId: string) =>
    req<{ success: boolean }>("/anpr/lanes/" + encodeURIComponent(deviceId), { method: "DELETE" }),

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
  // ---- FaceDoor faces -----------------------------------------------------
  faceProfiles: (deviceId: string) =>
    req<{
      profiles: FaceProfile[];
      limits: { maxSamples: number; maxProfiles: number };
      capabilities?: { photoEnrolment: boolean; reason: string };
    }>(
      "/face/profiles?deviceId=" + encodeURIComponent(deviceId)
    ),
  createFaceProfile: (body: {
    deviceId: string;
    name: string;
    role?: "resident" | "guest" | "staff";
    allowFrom?: string | null;
    allowTo?: string | null;
    expiresAt?: string | null;
  }) => req<{ profile: FaceProfile }>("/face/profiles", { method: "POST", body: JSON.stringify(body) }),
  updateFaceProfile: (id: number, body: Record<string, unknown>) =>
    req<{ profile: FaceProfile }>("/face/profiles/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  deleteFaceProfile: (id: number) =>
    req<{ ok: boolean }>("/face/profiles/" + id, { method: "DELETE" }),
  deleteFaceSample: (id: number) => req<{ ok: boolean }>("/face/samples/" + id, { method: "DELETE" }),
  /**
   * Enrol from an image chosen or captured in the browser.
   *
   * The picture is sent as the raw body and never stored — the server embeds it
   * and drops it. The embedding must come from the model the door matches
   * against, which is why the browser does not compute one itself.
   */
  enrolFaceImage: (profileId: number, image: Blob) =>
    req<{ total: number; remaining: number; embedMs: number }>(
      "/face/profiles/" + profileId + "/samples/image",
      { method: "POST", body: image, headers: { "content-type": image.type || "image/jpeg" } }
    ),
  startFaceEnrolment: (body: { deviceId: string; profileId?: number; name?: string }) =>
    req<{ ok: boolean; profileId: number; name: string; seconds: number; expiresAt: string }>(
      "/face/enrol/start",
      { method: "POST", body: JSON.stringify(body) }
    ),
  stopFaceEnrolment: (deviceId: string) =>
    req<{ ok: boolean }>("/face/enrol/stop", { method: "POST", body: JSON.stringify({ deviceId }) }),
  faceAttempts: (deviceId: string, limit = 50) =>
    req<{ attempts: FaceAttempt[] }>(
      "/face/attempts?deviceId=" + encodeURIComponent(deviceId) + "&limit=" + limit
    ),

  /*
   * A camera doing the looking for a lock.
   *
   * FaceDoor's original design expected "the hub's AI node" to watch a camera
   * and post descriptors. Nothing plays that part in a Circuvent home, so the
   * control plane drives an ordinary camera instead — these are the controls
   * for that arrangement.
   */
  faceDoors: () => req<{ doors: FaceDoorCamera[] }>("/face/doors"),
  saveFaceDoor: (
    deviceId: string,
    body: {
      lockId?: string | null;
      enabled?: boolean;
      burst?: number;
      burstGapMs?: number;
      cooldownMs?: number;
      illuminate?: number;
    }
  ) =>
    req<{ door: FaceDoorCamera; changed: string[] }>(
      "/face/doors/" + encodeURIComponent(deviceId),
      { method: "PUT", body: JSON.stringify(body) }
    ),
  deleteFaceDoor: (deviceId: string) =>
    req<{ success: boolean }>("/face/doors/" + encodeURIComponent(deviceId), { method: "DELETE" }),
  captureFaceDoor: (deviceId: string) =>
    req<{ ok: boolean; captureId: number; frames: number }>(
      "/face/doors/" + encodeURIComponent(deviceId) + "/capture",
      { method: "POST" }
    ),

  /* ---------------------------------------------------------------- *
   * Attendance and RFID access control
   * ---------------------------------------------------------------- */

  attendanceSites: () => req<{ sites: AttendanceSite[] }>("/attendance/sites"),
  createAttendanceSite: (body: { name: string; kind?: string; timezone?: string }) =>
    req<{ site: AttendanceSite }>("/attendance/sites", { method: "POST", body: JSON.stringify(body) }),
  updateAttendanceSite: (id: number, body: Record<string, unknown>) =>
    req<{ site: AttendanceSite }>("/attendance/sites/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  deleteAttendanceSite: (id: number) =>
    req<{ success: boolean }>("/attendance/sites/" + id, { method: "DELETE" }),

  attendanceGroups: (siteId: number) =>
    req<{ groups: AttendanceGroup[] }>("/attendance/groups?siteId=" + siteId),
  createAttendanceGroup: (body: Record<string, unknown>) =>
    req<{ group: { id: number } }>("/attendance/groups", { method: "POST", body: JSON.stringify(body) }),
  updateAttendanceGroup: (id: number, body: Record<string, unknown>) =>
    req<{ success: boolean }>("/attendance/groups/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  deleteAttendanceGroup: (id: number) =>
    req<{ success: boolean }>("/attendance/groups/" + id, { method: "DELETE" }),

  attendancePeople: (siteId: number, opts: { groupId?: number; q?: string } = {}) =>
    req<{ people: AttendancePerson[] }>(
      "/attendance/people?siteId=" + siteId +
      (opts.groupId ? "&groupId=" + opts.groupId : "") +
      (opts.q ? "&q=" + encodeURIComponent(opts.q) : "")
    ),
  createAttendancePerson: (body: Record<string, unknown>) =>
    req<{ person: AttendancePerson }>("/attendance/people", { method: "POST", body: JSON.stringify(body) }),
  updateAttendancePerson: (id: number, body: Record<string, unknown>) =>
    req<{ person: AttendancePerson }>("/attendance/people/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  deleteAttendancePerson: (id: number) =>
    req<{ success: boolean }>("/attendance/people/" + id, { method: "DELETE" }),
  importAttendancePeople: (siteId: number, people: Record<string, unknown>[]) =>
    req<{ created: number; updated: number; failed: number; errors: string[] }>(
      "/attendance/people/import",
      { method: "POST", body: JSON.stringify({ siteId, people }) }
    ),
  attendancePerson: (id: number, from?: string, to?: string) =>
    req<{
      person: AttendancePerson; groupName: string | null; timezone: string;
      days: Array<{ day: string; status: string; firstIn: string | null; lastOut: string | null;
                    workedMinutes: number; lateMinutes: number; earlyMinutes: number;
                    assumedOut: boolean; note: string; manual: boolean }>;
      punches: AttendancePunch[];
      cards: Array<{ id: number; cardNumber: number; kind: string; label: string;
                     active: boolean; issuedAt: string; revokedAt: string | null }>;
    }>("/attendance/person/" + id + (from ? "?from=" + from + "&to=" + to : "")),

  attendanceCredentials: (siteId: number, personId?: number) =>
    req<{ credentials: AttendanceCredential[] }>(
      "/attendance/credentials?siteId=" + siteId + (personId ? "&personId=" + personId : "")
    ),
  createAttendanceCredential: (body: { personId: number; cardNumber: number; kind?: string; label?: string }) =>
    req<{ credential: { id: number; cardNumber: number } }>(
      "/attendance/credentials", { method: "POST", body: JSON.stringify(body) }
    ),
  revokeAttendanceCredential: (id: number, reason?: string) =>
    req<{ success: boolean }>("/attendance/credentials/" + id + "/revoke",
      { method: "POST", body: JSON.stringify({ reason: reason ?? "" }) }),

  attendanceZones: (siteId: number) =>
    req<{ zones: AttendanceZone[] }>("/attendance/zones?siteId=" + siteId),
  createAttendanceZone: (body: Record<string, unknown>) =>
    req<{ zone: { id: number } }>("/attendance/zones", { method: "POST", body: JSON.stringify(body) }),
  deleteAttendanceZone: (id: number) =>
    req<{ success: boolean }>("/attendance/zones/" + id, { method: "DELETE" }),

  attendanceTerminals: (siteId: number) =>
    req<{ terminals: AttendanceTerminal[] }>("/attendance/terminals?siteId=" + siteId),
  saveAttendanceTerminal: (deviceId: string, body: Record<string, unknown>) =>
    req<{ success: boolean; cards: number }>(
      "/attendance/terminals/" + encodeURIComponent(deviceId),
      { method: "PUT", body: JSON.stringify(body) }
    ),
  deleteAttendanceTerminal: (deviceId: string) =>
    req<{ success: boolean }>("/attendance/terminals/" + encodeURIComponent(deviceId), { method: "DELETE" }),
  syncAttendanceTerminal: (deviceId: string) =>
    req<{ success: boolean; cards: number; version: number }>(
      "/attendance/terminals/" + encodeURIComponent(deviceId) + "/sync", { method: "POST" }
    ),
  openAttendanceDoor: (deviceId: string) =>
    req<{ success: boolean }>(
      "/attendance/terminals/" + encodeURIComponent(deviceId) + "/open", { method: "POST" }
    ),

  attendanceSchedules: (siteId: number) =>
    req<{ schedules: AttendanceSchedule[] }>("/attendance/schedules?siteId=" + siteId),
  createAttendanceSchedule: (body: Record<string, unknown>) =>
    req<{ schedule: { id: number } }>("/attendance/schedules", { method: "POST", body: JSON.stringify(body) }),
  updateAttendanceSchedule: (id: number, body: Record<string, unknown>) =>
    req<{ success: boolean }>("/attendance/schedules/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  deleteAttendanceSchedule: (id: number) =>
    req<{ success: boolean }>("/attendance/schedules/" + id, { method: "DELETE" }),

  attendanceRules: (siteId: number) =>
    req<{ rules: AttendanceRule[] }>("/attendance/rules?siteId=" + siteId),
  createAttendanceRule: (body: Record<string, unknown>) =>
    req<{ rule: { id: number } }>("/attendance/rules", { method: "POST", body: JSON.stringify(body) }),
  deleteAttendanceRule: (id: number) =>
    req<{ success: boolean }>("/attendance/rules/" + id, { method: "DELETE" }),

  attendanceLeaves: (siteId: number) =>
    req<{ leaves: AttendanceLeave[] }>("/attendance/leaves?siteId=" + siteId),  createAttendanceLeave: (body: Record<string, unknown>) =>
    req<{ leave: { id: number } }>("/attendance/leaves", { method: "POST", body: JSON.stringify(body) }),
  deleteAttendanceLeave: (id: number) =>
    req<{ success: boolean }>("/attendance/leaves/" + id, { method: "DELETE" }),

  attendanceAccessRequests: (siteId: number, status?: string, kind?: string) =>
    req<{ requests: AttendanceAccessRequest[]; pending: number }>(
      "/attendance/access-requests?siteId=" + siteId +
      (status ? "&status=" + status : "") + (kind ? "&kind=" + kind : "")
    ),
  createAttendanceAccessRequest: (body: Record<string, unknown>) =>
    req<{ request: AttendanceAccessRequest; existing?: boolean }>(
      "/attendance/access-requests", { method: "POST", body: JSON.stringify(body) }
    ),
  decideAttendanceAccessRequest: (id: number, body: Record<string, unknown>) =>
    req<{ request: AttendanceAccessRequest; revokedCards?: number }>(
      "/attendance/access-requests/" + id, { method: "PATCH", body: JSON.stringify(body) }
    ),

  startCardEnrolment: (body: { siteId: number; personId: number; deviceId: string }) =>
    req<{ enrolment: AttendanceEnrolment }>(
      "/attendance/enrolments", { method: "POST", body: JSON.stringify(body) }
    ),
  cardEnrolment: (id: number) =>
    req<{ enrolment: AttendanceEnrolment }>("/attendance/enrolments/" + id),
  cancelCardEnrolment: (id: number) =>
    req<{ success: boolean }>("/attendance/enrolments/" + id, { method: "DELETE" }),

  attendanceRegister: (siteId: number, day?: string, groupId?: number) =>
    req<{ day: string; timezone: string; people: RegisterRow[]; totals: Record<string, number> }>(
      "/attendance/register?siteId=" + siteId +
      (day ? "&day=" + day : "") + (groupId ? "&groupId=" + groupId : "")
    ),
  recomputeAttendance: (siteId: number, from: string, to?: string) =>
    req<{ success: boolean; days: number; rows: number }>(
      "/attendance/register/recompute", { method: "POST", body: JSON.stringify({ siteId, from, to }) }
    ),
  markAttendance: (personId: number, day: string, status: string, note?: string) =>
    req<{ success: boolean }>("/attendance/register/" + personId,
      { method: "PATCH", body: JSON.stringify({ day, status, note: note ?? "" }) }),
  clearAttendanceOverride: (personId: number, day: string) =>
    req<{ success: boolean }>("/attendance/register/" + personId + "?day=" + day, { method: "DELETE" }),

  attendanceSummary: (siteId: number, from: string, to: string, groupId?: number) =>
    req<{ from: string; to: string; people: AttendanceSummaryRow[] }>(
      "/attendance/summary?siteId=" + siteId + "&from=" + from + "&to=" + to +
      (groupId ? "&groupId=" + groupId : "")
    ),
  attendancePunches: (siteId: number, opts: { limit?: number; refusedOnly?: boolean } = {}) =>
    req<{ punches: AttendancePunch[] }>(
      "/attendance/punches?siteId=" + siteId +
      "&limit=" + (opts.limit ?? 100) + (opts.refusedOnly ? "&granted=false" : "")
    ),
  createAttendancePunch: (body: Record<string, unknown>) =>
    req<{ stored: boolean; reason: string; personId: number | null }>(
      "/attendance/punches", { method: "POST", body: JSON.stringify(body) }
    ),
  attendanceLive: (siteId: number) =>
    req<AttendanceLive>("/attendance/live?siteId=" + siteId),
  /**
   * Download an attendance export.
   *
   * Not a URL, because a URL cannot carry a bearer token. The previous version
   * handed one to an `<a href>`, the browser navigated there with no
   * Authorization header, and the API answered `{"error":"Unauthorized"}` in a
   * blank tab — which reads as broken permissions rather than a missing header,
   * and sends whoever hit it looking in the wrong place entirely.
   *
   * So the file is fetched with credentials like every other call, turned into
   * a blob and saved from memory. The object URL is revoked afterwards; without
   * that, every export leaks its own bytes for the life of the tab, which on a
   * year of punches is not a rounding error.
   */
  downloadAttendanceExport: async (
    siteId: number,
    what: string,
    from: string,
    to: string
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    const token = getToken();
    if (!token) return { ok: false, error: "You are signed out. Sign in and try again." };
    const home = getActiveHome();
    try {
      const res = await fetch(
        `${CONTROL_PLANE_URL}/attendance/export?siteId=${siteId}&what=${encodeURIComponent(what)}` +
          `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        {
          headers: {
            Authorization: "Bearer " + token,
            ...(home ? { "x-circuvent-home": String(home) } : {}),
          },
        }
      );
      if (!res.ok) {
        return {
          ok: false,
          error:
            res.status === 401
              ? "Your session has expired. Sign in again."
              : `The export failed (${res.status}).`,
        };
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${what}-${from}-to-${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not reach the server for that export." };
    }
  },

  gatePasses: (deviceId?: string) =>
    req<{ passes: GatePass[] }>("/gate/passes" + (deviceId ? "?deviceId=" + encodeURIComponent(deviceId) : "")),  createGatePass: (body: { deviceId: string; label?: string; validToMinutes?: number; maxUses?: number }) =>
    req<{ pass: GatePass }>("/gate/passes", { method: "POST", body: JSON.stringify(body) }),
  revokeGatePass: (id: number) => req<{ success: boolean }>("/gate/passes/" + id + "/revoke", { method: "POST" }),
  redeemGatePass: (code: string) =>
    req<{ ok: boolean; opened?: boolean; label?: string; usesLeft?: number; error?: string }>("/gate/redeem", { method: "POST", body: JSON.stringify({ code }) }),

  // ---- voice assistants ---------------------------------------------------
  /** Which assistants can control this home, and since when. */
  assistants: () => req<{ assistants: LinkedAssistant[] }>("/account/assistants"),
  /**
   * Cuts an assistant off.
   *
   * Revokes rather than forgetting, so this also signs out every other device
   * on the account — the response says so, and the UI must repeat it.
   */
  unlinkAssistant: (assistant: "google" | "alexa") =>
    req<{ success: boolean; removed: boolean; signedOutEverywhere: boolean; message: string }>(
      "/account/assistants/" + assistant,
      { method: "DELETE" }
    ),

  // ---- household sharing --------------------------------------------------
  /**
   * Every home this account can act in, their own first.
   *
   * The active-home header rides along like it does on everything else, and is
   * ignored here on purpose: the server answers this for the person, so the
   * switcher can still list the homes you could move to while you are inside
   * one of them.
   */
  homes: () => req<{ homes: HomeSummary[] }>("/home/mine"),
  homeMembers: () =>
    req<{
      owner: HomeMember | null;
      members: HomeMember[];
      you: { id: number; role: HomeRole; capabilities: HomeCapability[] };
      limits: { maxMembers: number };
    }>("/home/members"),
  homeRoles: () => req<{ roles: HomeRoleInfo[] }>("/home/roles"),
  inviteToHome: (body: { role: Exclude<HomeRole, "owner">; email?: string }) =>
    req<{ code: string; role: HomeRole; expiresAt: string; link: string }>("/home/invites", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  homeInvites: () => req<{ invites: HomeInvite[] }>("/home/invites"),
  revokeHomeInvite: (code: string) =>
    req<{ ok: boolean }>("/home/invites/" + encodeURIComponent(code) + "/revoke", { method: "POST" }),
  joinHome: (code: string) =>
    req<{ ok: boolean; homeId: number; role: HomeRole }>("/home/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  setMemberRole: (id: number, role: Exclude<HomeRole, "owner">) =>
    req<{ ok: boolean; role: HomeRole }>("/home/members/" + id, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  removeMember: (id: number) => req<{ ok: boolean }>("/home/members/" + id, { method: "DELETE" }),

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
  adminMe: () =>
    req<{ admin: boolean; uid: number; email: string; name?: string; avatarUrl?: string }>("/admin/me"),
  adminStats: () => req<AdminStats>("/admin/stats"),
  adminUsers: () => req<{ users: AdminUser[] }>("/admin/users"),
  /**
   * Which app installs are signed in, and from where.
   *
   * No coordinates — see platform/api/src/app-installs.ts. City and country are
   * whatever the reverse proxy's IP geolocation supplied, and blank when it
   * supplied nothing, because an invented city is worse than an absent one.
   */
  adminAppInstalls: (opts: { platform?: string; q?: string; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.platform) p.set("platform", opts.platform);
    if (opts.q) p.set("q", opts.q);
    if (opts.limit) p.set("limit", String(opts.limit));
    const qs = p.toString();
    return req<{ installs: AppInstall[]; stats: AppInstallStats }>(
      "/admin/app-installs" + (qs ? `?${qs}` : "")
    );
  },
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

  /* ---------------------------------------------------------------- *
   * Guardian personal safety beacon
   * ---------------------------------------------------------------- */

  guardianContacts: (deviceId: string) =>
    req<{ contacts: GuardianContact[] }>(
      "/guardian/devices/" + encodeURIComponent(deviceId) + "/contacts",
    ),
  saveGuardianContacts: (deviceId: string, contacts: GuardianContactInput[]) =>
    req<{ ok: boolean; count: number }>(
      "/guardian/devices/" + encodeURIComponent(deviceId) + "/contacts",
      { method: "PUT", body: JSON.stringify({ contacts }) },
    ),
  /**
   * Writes the whole configuration into the device's NVS.
   *
   * This is the step that makes the phone unnecessary afterwards: once it has
   * returned, the beacon can raise an alarm with no app, no Wi-Fi and no
   * platform, using only its own SIM.
   */
  provisionGuardian: (
    deviceId: string,
    body: { national?: string; apn?: string; holdSec?: number; silent?: boolean },
  ) =>
    req<{ ok: boolean; contacts: number }>(
      "/guardian/devices/" + encodeURIComponent(deviceId) + "/provision",
      { method: "POST", body: JSON.stringify(body) },
    ),
  testGuardian: (deviceId: string) =>
    req<{ ok: boolean }>("/guardian/devices/" + encodeURIComponent(deviceId) + "/test", {
      method: "POST",
    }),
  panicGuardian: (deviceId: string) =>
    req<{ ok: boolean }>("/guardian/devices/" + encodeURIComponent(deviceId) + "/panic", {
      method: "POST",
    }),
  guardianIncidents: (limit = 25) =>
    req<{ incidents: GuardianIncident[] }>("/guardian/incidents?limit=" + limit),
  guardianIncident: (id: string) =>
    req<{
      incident: GuardianIncident;
      track: GuardianTrackPoint[];
      notifications: GuardianNotification[];
    }>("/guardian/incidents/" + encodeURIComponent(id)),
  ackGuardianIncident: (id: string) =>
    req<{ ok: boolean }>("/guardian/incidents/" + encodeURIComponent(id) + "/ack", {
      method: "POST",
    }),
  closeGuardianIncident: (id: string, falseAlarm: boolean) =>
    req<{ ok: boolean }>("/guardian/incidents/" + encodeURIComponent(id) + "/close", {
      method: "POST",
      body: JSON.stringify({ falseAlarm }),
    }),
  guardianStations: (at?: { lat: number; lng: number }) =>
    req<{ stations: GuardianStation[]; nearest?: { station: GuardianStation; km: number } | null }>(
      "/guardian/stations" + (at ? `?lat=${at.lat}&lng=${at.lng}` : ""),
    ),

  guardianZones: (deviceId: string) =>
    req<{ zones: GuardianZone[] }>(
      "/guardian/devices/" + encodeURIComponent(deviceId) + "/zones",
    ),
  addGuardianZone: (
    deviceId: string,
    body: { name: string; lat: number; lng: number; radiusM: number; notifyEnter?: boolean; notifyExit?: boolean },
  ) =>
    req<{ ok: boolean; id: number }>(
      "/guardian/devices/" + encodeURIComponent(deviceId) + "/zones",
      { method: "POST", body: JSON.stringify(body) },
    ),
  deleteGuardianZone: (deviceId: string, zoneId: number) =>
    req<{ ok: boolean }>(
      "/guardian/devices/" + encodeURIComponent(deviceId) + "/zones/" + zoneId,
      { method: "DELETE" },
    ),

  /** "Walk me home" — armed on the device too, so it survives losing coverage. */
  startGuardianJourney: (deviceId: string, minutes: number, destination?: string) =>
    req<{ ok: boolean; dueAt: string; minutes: number }>(
      "/guardian/devices/" + encodeURIComponent(deviceId) + "/journey",
      { method: "POST", body: JSON.stringify({ minutes, destination }) },
    ),
  guardianArrived: (deviceId: string) =>
    req<{ ok: boolean }>("/guardian/devices/" + encodeURIComponent(deviceId) + "/arrived", {
      method: "POST",
    }),
  guardianJourney: (deviceId: string) =>
    req<{ journey: GuardianJourney | null }>(
      "/guardian/devices/" + encodeURIComponent(deviceId) + "/journey",
    ),

  /* ---------------------------------------------------------------- *
   * RFID gate access
   * ---------------------------------------------------------------- */

  gateTags: (deviceId: string) =>
    req<{ tags: GateTag[] }>("/gate/devices/" + encodeURIComponent(deviceId) + "/tags"),
  saveGateTag: (deviceId: string, body: GateTagInput) =>
    req<{ ok: boolean; id: number; tag: number }>(
      "/gate/devices/" + encodeURIComponent(deviceId) + "/tags",
      { method: "POST", body: JSON.stringify(body) },
    ),
  deleteGateTag: (deviceId: string, tagId: number) =>
    req<{ ok: boolean }>(
      "/gate/devices/" + encodeURIComponent(deviceId) + "/tags/" + tagId,
      { method: "DELETE" },
    ),
  gateEvents: (deviceId: string, opts: { limit?: number; deniedOnly?: boolean } = {}) =>
    req<{ events: GateEvent[] }>(
      "/gate/devices/" +
        encodeURIComponent(deviceId) +
        "/events?limit=" +
        (opts.limit ?? 50) +
        (opts.deniedOnly ? "&denied=1" : ""),
    ),
  /** Push the list now — for somebody standing at a barrier that will not open. */
  syncGate: (deviceId: string) =>
    req<{ ok: boolean }>("/gate/devices/" + encodeURIComponent(deviceId) + "/sync", {
      method: "POST",
    }),
  /** Opens the barrier and records it, so the log matches what happened. */
  openGate: (deviceId: string) =>
    req<{ ok: boolean }>("/gate/devices/" + encodeURIComponent(deviceId) + "/open", {
      method: "POST",
    }),
};

export type { AuthResp };
