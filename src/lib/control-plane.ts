// Browser client for the self-hosted Circuvent control plane (platform/api).
//
// Mirrors the mobile app's client (mobile/src/api.ts) so the web console and the
// mobile app share one backend, one auth scheme (JWT), and identical semantics.
// The base URL is configurable per-deployment; it defaults to the production
// control plane. Commands are published over MQTT server-side and reach the
// device in well under a second.

export const CONTROL_PLANE_URL = (
  process.env.NEXT_PUBLIC_CONTROL_PLANE_URL || "https://api.circuvent.com"
).replace(/\/$/, "");

/** wss URL for the live channel, derived from the REST base. */
export const CONTROL_PLANE_WS =
  CONTROL_PLANE_URL.replace(/^http/i, "ws") + "/ws";

const TOKEN_KEY = "cv-console-token";
const USER_KEY = "cv-console-user";

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

export interface AutomationTrigger {
  type: "state" | "time" | "event";
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
export interface AdminHealth {
  mqtt: boolean;
  db: boolean;
  uptimeSec: number;
  node: string;
}

interface AuthResp {
  token: string;
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

// -------------------------------------------------------------- core fetch --

async function req<T = unknown>(
  path: string,
  opts: RequestInit = {},
  auth = true
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
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Network error" } as unknown as T };
  }
}

// ------------------------------------------------------------------- client --

export const controlPlane = {
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
    req<{ success: boolean; token: string }>("/auth/sign-out-all", { method: "POST" }),
  /**
   * Change a known password. Also ends every other session, because revoking
   * sessions without changing the password is pointless if someone else knows
   * it. Returns a replacement token for this browser.
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
  adminDevices: () => req<{ devices: AdminDevice[] }>("/admin/devices"),
  adminCommand: (id: string, cmd: Record<string, unknown>) =>
    req<{ success: boolean }>("/admin/devices/" + encodeURIComponent(id) + "/command", { method: "POST", body: JSON.stringify(cmd) }),
  adminOta: (id: string, url: string, version?: string) =>
    req<{ success: boolean }>("/admin/devices/" + encodeURIComponent(id) + "/ota", { method: "POST", body: JSON.stringify({ url, version }) }),
  adminDeleteDevice: (id: string) =>
    req<{ success: boolean }>("/admin/devices/" + encodeURIComponent(id), { method: "DELETE" }),
  adminEvents: (limit = 100) => req<{ events: AdminEvent[] }>("/admin/events?limit=" + limit),
  adminHealth: () => req<AdminHealth>("/admin/health"),
  adminDevice: (id: string) => req<{ device: AdminDevice }>("/admin/devices/" + encodeURIComponent(id)),
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
  adminOtaBroadcast: (body: { type?: string; url: string; version?: string }) =>
    req<{ success: boolean; sent: number }>("/admin/ota-broadcast", { method: "POST", body: JSON.stringify(body) }),
};

export type { AuthResp };
