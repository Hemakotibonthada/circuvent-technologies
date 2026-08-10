import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./config";

const TOKEN_KEY = "cv-token";
const REFRESH_KEY = "cv-refresh";

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function setToken(t: string | null): Promise<void> {
  if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}
export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_KEY);
}
export async function setRefreshToken(t: string | null): Promise<void> {
  if (t) await AsyncStorage.setItem(REFRESH_KEY, t);
  else await AsyncStorage.removeItem(REFRESH_KEY);
}

/** Stores whatever an auth response returned, tolerating an older server. */
export async function storeSession(data: { token?: string; refreshToken?: string } | null | undefined): Promise<void> {
  if (data?.token) await setToken(data.token);
  if (data?.refreshToken) await setRefreshToken(data.refreshToken);
}

type Res<T = any> = { ok: boolean; status: number; data: T };

/**
 * One in-flight refresh at a time.
 *
 * The home screen fires several requests at once, so an expired access token
 * produces a burst of 401s. Refresh tokens are single-use, so letting each
 * retry rotate independently would mean all but one present a spent token — and
 * the server reads a spent token as replay and tears the family down. The user
 * would be signed out for doing nothing wrong.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const stored = await getRefreshToken();
  if (!stored) return false;
  try {
    const res = await fetch(API_BASE + "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: stored }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.token || !data?.refreshToken) {
      // Expired, revoked, or destroyed after a replay. Clearing it stops every
      // later request retrying a chain that cannot work.
      await setToken(null);
      await setRefreshToken(null);
      return false;
    }
    await storeSession(data);
    return true;
  } catch {
    // A network failure is not proof the chain is dead; leave it for next time
    // rather than signing the user out over a dropped connection.
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

async function req<T = any>(path: string, opts: RequestInit = {}, auth = true, allowRetry = true): Promise<Res<T>> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers as any) };
  if (auth) {
    const t = await getToken();
    if (t) headers["Authorization"] = "Bearer " + t;
  }
  try {
    const res = await fetch(API_BASE + path, { ...opts, headers });

    // A 401 on an authenticated call may just mean the access token aged out.
    // Rotate once and replay the request; `allowRetry` stops this recursing.
    if (res.status === 401 && auth && allowRetry && (await getRefreshToken())) {
      if (await withRefreshLock()) {
        return req<T>(path, opts, auth, false);
      }
    }

    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Network error" } as any };
  }
}

export interface Device {
  id: string;
  type: string;
  name: string;
  room?: string;
  favorite?: boolean;
  online: boolean;
  last_seen?: string | null;
  state: Record<string, any>;
  fw_version?: string;
}

export interface AutomationTrigger {
  type: "state" | "time" | "event";
  deviceId?: string;
  field?: string;
  op?: "<" | "<=" | ">" | ">=" | "==" | "!=" | "truthy" | "falsy";
  value?: number | string | boolean;
  at?: string;
  /**
   * Day filter for time triggers: 0=Sunday … 6=Saturday. Omitted or empty
   * means every day. The control plane evaluates this in IST, the same zone
   * as `at` — not in the phone's zone.
   */
  days?: number[];
  /** Event triggers match a telemetry event: door access, RFID, doorbell. */
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
  /** Pause before this action runs, in milliseconds (control plane caps at 30s). */
  delayMs?: number;
}

/**
 * An automation runs either a single action or an ordered sequence.
 *
 * The control plane has always accepted both. The app declares both so a
 * multi-step rule authored in the web console is displayed honestly here
 * rather than being read as a single action.
 */
export type AutomationActions = AutomationAction | AutomationAction[];

/** Always view an automation's action as a list, whichever shape was stored. */
export function actionList(a: AutomationActions | undefined | null): AutomationAction[] {
  if (!a) return [];
  return Array.isArray(a) ? a : [a];
}

export interface Automation {
  id: number;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  action: AutomationActions;
  created_at?: string;
  /**
   * Execution record. Present only on control planes new enough to report it,
   * so `undefined` means "unknown", never "never ran".
   *
   * A switch timer used to save correctly, show the right next-run time, count
   * down, and never move the relay — and nothing in the app could tell that
   * apart from working. "Last ran" either advances or it does not.
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

/** One row of raw device telemetry (`/devices/:id/telemetry`). */
export interface TelemetryRow {
  ts: string;
  payload: Record<string, unknown>;
}

/**
 * A time-boxed gate pass, exactly as returned by `platform/api/src/routes/gate.ts`.
 * `status` and `qr` are computed server-side — never derive them on the client,
 * or a revoked pass could render as active.
 */
/** One ANPR sighting. */
export interface PlateRead {
  id: number;
  deviceId: string;
  deviceName: string;
  plate: string | null;
  pretty: string | null;
  confidence: number;
  votes: number;
  samples: number;
  status: "recognised" | "unrecognised";
  reason: string | null;
  decision: "allow" | "deny" | "watch" | "unknown";
  /** Null when the lane's direction could not be resolved — never guessed. */
  direction: "in" | "out" | null;
  trigger: string;
  at: string;
  hasImage: boolean;
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
  inside: boolean;
  visits: number;
  avgStaySec: number | null;
  totalStaySec: number;
  devices: string[];
  rule: "allow" | "deny" | "watch" | null;
  label: string | null;
}

/** One stay: an arrival paired with the departure that ended it. */
export interface Visit {
  id: number;
  entryAt: string | null;
  exitAt: string | null;
  status: "open" | "closed" | "entry_missed" | "exit_missed";
  /** Null, never 0, when a read was missed. */
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
  };
  visits: Visit[];
  reads: PlateRead[];
}

export interface Occupancy {
  inside: number;
  /** Null when capacity is not managed — which is different from zero. */
  capacity: number | null;
  free: number | null;
  full: boolean;
  percent: number | null;
  overstays: { visitId: number; plate: string; pretty: string; entryAt: string; hours: number }[];
}

export interface PlateRule {
  id: number;
  plate: string;
  pretty: string;
  kind: "allow" | "deny" | "watch";
  label: string;
  validTo: string | null;
  enabled: boolean;
  hits: number;
  lastHitAt: string | null;
}

export interface GatePass {  id: number;
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
  status: "active" | "scheduled" | "expired" | "used" | "revoked";
  qr: string;
}

export interface GatePassBody {
  deviceId: string;
  label?: string;
  validToMinutes?: number;
  validTo?: string;
  validFrom?: string;
  maxUses?: number;
}

/** Control-plane liveness (`/admin/health`). */
export interface AdminHealth {
  mqtt: boolean;
  db: boolean;
  uptimeSec: number;
  node: string;
}

/** Full device record from `/admin/devices/:id` (superset of AdminDevice). */
export interface AdminDeviceDetail extends AdminDevice {
  favorite: boolean;
  created_at: string;
}

/** Credentials minted by `/admin/devices/provision`. Shown once, never stored. */
export interface ProvisionResult {
  id: string;
  key: string;
  mqttUsername: string;
  mqttPassword: string;
}

interface AuthResp {
  token: string;
  user: { id: number; email: string; name: string };
}

// Self-hosted control-plane client (platform/api). JWT auth; commands publish
// over MQTT server-side and reach the device in <1s.
export const api = {
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
   * lost phone. Returns a fresh token so this device stays signed in; the
   * caller must persist it with setToken, or it signs itself out too.
   */
  signOutEverywhere: () =>
    req<{ success: boolean; token: string }>("/auth/sign-out-all", { method: "POST" }),
  /**
   * Change a known password. Also ends every other session, because revoking
   * sessions without changing the password is pointless if someone else knows
   * it. Returns a replacement token — persist it with setToken.
   */
  changePassword: (currentPassword: string, newPassword: string) =>
    req<{ success: boolean; token: string }>("/auth/change-password", {
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
    req<{ success: boolean; token: string; user: { id: number; email: string; name: string } }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ email, otp, newPassword }),
    }, false),
  devices: () => req<{ devices: Device[] }>("/devices"),
  device: (id: string) => req<{ device: Device }>("/devices/" + encodeURIComponent(id)),
  claim: (id: string, key: string, name: string) =>
    req<{ success: boolean; id?: string; error?: string }>("/devices/claim", {
      method: "POST",
      body: JSON.stringify({ id, key, name }),
    }),
  // Mint a brand-new device identity (owned by the caller) + broker access.
  provision: (id: string, type: string, name: string) =>
    req<{ id: string; key: string; type: string; name: string; error?: string }>("/devices/provision", {
      method: "POST",
      body: JSON.stringify({ id, type, name }),
    }),
  // A+B secure onboarding: mint a short-lived provisioning token (no secret in
  // it) for the app to hand a device; the device redeems it over TLS.
  provisioningToken: (type: string, name: string) =>
    req<{ token: string; error?: string }>("/provisioning/token", {
      method: "POST",
      body: JSON.stringify({ type, name }),
    }),
  // cmd is the raw command object, e.g. { action: "set", scene: "night" }.
  command: (id: string, cmd: Record<string, any>) =>
    req("/devices/" + encodeURIComponent(id) + "/command", { method: "POST", body: JSON.stringify(cmd) }),
  telemetry: (id: string, limit = 100) =>
    req<{ telemetry: { ts: string; payload: any }[] }>(
      "/devices/" + encodeURIComponent(id) + "/telemetry?limit=" + limit
    ),
  automations: () => req<{ automations: Automation[] }>("/automations"),
  createAutomation: (body: AutomationBody) =>
    req<{ automation: Automation }>("/automations", { method: "POST", body: JSON.stringify(body) }),
  updateAutomation: (id: number, body: AutomationBody) =>
    req<{ automation: Automation }>("/automations/" + encodeURIComponent(String(id)), {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteAutomation: (id: number) =>
    req<{ success: boolean }>("/automations/" + encodeURIComponent(String(id)), { method: "DELETE" }),
  registerPushToken: (token: string, platform: string) =>
    req<{ success: boolean }>("/account/push-token", {
      method: "POST",
      body: JSON.stringify({ token, platform }),
    }),
  removePushToken: (token: string) =>
    req<{ success: boolean }>("/account/push-token", { method: "DELETE", body: JSON.stringify({ token }) }),

  // ---- device metadata (name / room / favorite) --------------------------
  patchDevice: (id: string, body: { name?: string; room?: string; favorite?: boolean }) =>
    req<{ success: boolean }>("/devices/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(body) }),

  // ---- rooms --------------------------------------------------------------
  rooms: () => req<{ rooms: Room[] }>("/rooms"),
  createRoom: (name: string, icon?: string) =>
    req<{ room: Room }>("/rooms", { method: "POST", body: JSON.stringify({ name, icon }) }),
  updateRoom: (id: number, body: { name?: string; icon?: string; sort?: number }) =>
    req<{ success: boolean }>("/rooms/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  deleteRoom: (id: number) => req<{ success: boolean }>("/rooms/" + id, { method: "DELETE" }),

  // ---- scenes -------------------------------------------------------------
  scenes: () => req<{ scenes: Scene[] }>("/scenes"),
  createScene: (body: SceneBody) => req<{ scene: Scene }>("/scenes", { method: "POST", body: JSON.stringify(body) }),
  updateScene: (id: number, body: SceneBody) =>
    req<{ scene: Scene }>("/scenes/" + id, { method: "PATCH", body: JSON.stringify(body) }),
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

  // ---- system / admin -----------------------------------------------------
  health: () => req<{ ok?: boolean; [key: string]: unknown }>("/health", {}, false),
  adminMe: () => req<{ admin: boolean; uid: number; email: string }>("/admin/me"),
  adminStats: () => req<AdminStats>("/admin/stats"),
  adminUsers: () => req<{ users: AdminUser[] }>("/admin/users"),
  adminSetRole: (id: number, is_admin: boolean) =>
    req<{ success: boolean }>("/admin/users/" + id, { method: "PATCH", body: JSON.stringify({ is_admin }) }),
  /** Disable or re-enable an account. Disabling also ends its live sessions. */
  adminSetBlocked: (id: number, blocked: boolean) =>
    req<{ success: boolean }>("/admin/users/" + id, { method: "PATCH", body: JSON.stringify({ blocked }) }),
  /** End every session for an account without disabling it — for a lost phone. */
  adminRevokeSessions: (id: number) =>
    req<{ success: boolean }>("/admin/users/" + id + "/revoke-sessions", { method: "POST" }),
  adminDeleteUser: (id: number) => req<{ success: boolean }>("/admin/users/" + id, { method: "DELETE" }),
  adminDevices: () => req<{ devices: AdminDevice[] }>("/admin/devices"),
  adminCommand: (id: string, cmd: Record<string, unknown>) =>
    req<{ success: boolean }>("/admin/devices/" + encodeURIComponent(id) + "/command", { method: "POST", body: JSON.stringify(cmd) }),
  adminOta: (id: string, url: string, version?: string) =>
    req<{ success: boolean }>("/admin/devices/" + encodeURIComponent(id) + "/ota", { method: "POST", body: JSON.stringify({ url, version }) }),
  adminDeleteDevice: (id: string) =>
    req<{ success: boolean }>("/admin/devices/" + encodeURIComponent(id), { method: "DELETE" }),
  adminEvents: (limit = 100) => req<{ events: AdminEvent[] }>("/admin/events?limit=" + limit),

  // ---- gate access / guest passes -----------------------------------------
  // Backed by platform/api/src/routes/gate.ts.
  // ---- ANPR: vehicles, occupancy and the plate lists ---------------------
  plateReads: (limit = 100) => req<{ reads: PlateRead[] }>("/anpr/reads?limit=" + limit),
  vehicles: (days = 30) =>
    req<{ days: number; vehicles: Vehicle[]; insideNow: number }>("/anpr/vehicles?days=" + days),
  vehicle: (plate: string) => req<VehicleProfile>("/anpr/vehicles/" + encodeURIComponent(plate)),
  occupancy: () => req<Occupancy>("/anpr/occupancy"),
  plateRules: () => req<{ rules: PlateRule[] }>("/anpr/rules"),
  createPlateRule: (body: { plate: string; kind?: string; label?: string; validTo?: string | null }) =>
    req<{ rule: PlateRule; error?: string }>("/anpr/rules", { method: "POST", body: JSON.stringify(body) }),
  deletePlateRule: (id: number) => req<{ success: boolean }>("/anpr/rules/" + id, { method: "DELETE" }),
  addPlateRuleFromRead: (readId: number, kind: string) =>
    req<{ rule: PlateRule; error?: string }>("/anpr/rules/from-read/" + readId, {
      method: "POST",
      body: JSON.stringify({ kind }),
    }),

  gatePasses: (deviceId?: string) =>
    req<{ passes: GatePass[] }>("/gate/passes" + (deviceId ? "?deviceId=" + encodeURIComponent(deviceId) : "")),  createGatePass: (body: GatePassBody) =>
    req<{ pass: GatePass; error?: string }>("/gate/passes", { method: "POST", body: JSON.stringify(body) }),
  revokeGatePass: (id: number) => req<{ success: boolean }>("/gate/passes/" + id + "/revoke", { method: "POST" }),
  /**
   * Redeem a pass code. Deliberately unauthenticated — the unguessable code is
   * itself the credential, so a guard or guest can open the barrier without an
   * account. Passing `auth = false` keeps the caller's own token off the wire.
   */
  redeemGatePass: (code: string) =>
    req<{ ok: boolean; opened?: boolean; label?: string; usesLeft?: number; error?: string }>(
      "/gate/redeem",
      { method: "POST", body: JSON.stringify({ code }) },
      false
    ),

  // ---- fleet operations (admin) -------------------------------------------
  adminHealth: () => req<AdminHealth>("/admin/health"),
  adminDevice: (id: string) => req<{ device: AdminDeviceDetail; error?: string }>("/admin/devices/" + encodeURIComponent(id)),
  adminDeviceTelemetry: (id: string, limit = 100) =>
    req<{ telemetry: TelemetryRow[] }>("/admin/devices/" + encodeURIComponent(id) + "/telemetry?limit=" + limit),
  adminPatchDevice: (id: string, body: { name?: string; room?: string; owner_id?: number | null }) =>
    req<{ success: boolean }>("/admin/devices/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(body) }),
  adminProvision: (body: { type: string; name?: string; owner_id?: number }) =>
    req<ProvisionResult & { error?: string }>("/admin/devices/provision", { method: "POST", body: JSON.stringify(body) }),
  /** Fan a command out to every device, optionally narrowed by type / online state. */
  adminBroadcast: (body: { type?: string; online?: boolean; command: Record<string, unknown> }) =>
    req<{ success: boolean; sent: number; error?: string }>("/admin/broadcast", { method: "POST", body: JSON.stringify(body) }),
  /** Push an OTA pointer to a whole cohort. `sent` is the number addressed, not the number that applied it. */
  adminOtaBroadcast: (body: { type?: string; url: string; version?: string }) =>
    req<{ success: boolean; sent: number; error?: string }>("/admin/ota-broadcast", { method: "POST", body: JSON.stringify(body) }),

  // ---- device lifecycle ---------------------------------------------------
  deleteDevice: (id: string) => req<{ success: boolean }>("/devices/" + encodeURIComponent(id), { method: "DELETE" }),
};
