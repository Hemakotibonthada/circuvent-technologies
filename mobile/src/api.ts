import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./config";

const TOKEN_KEY = "cv-token";

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function setToken(t: string | null): Promise<void> {
  if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

type Res<T = any> = { ok: boolean; status: number; data: T };

async function req<T = any>(path: string, opts: RequestInit = {}, auth = true): Promise<Res<T>> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers as any) };
  if (auth) {
    const t = await getToken();
    if (t) headers["Authorization"] = "Bearer " + t;
  }
  try {
    const res = await fetch(API_BASE + path, { ...opts, headers });
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
  type: "state" | "time";
  deviceId?: string;
  field?: string;
  op?: "<" | "<=" | ">" | ">=" | "==" | "!=" | "truthy" | "falsy";
  value?: number | string | boolean;
  at?: string;
}

export interface AutomationAction {
  type: "command" | "notify";
  deviceId?: string;
  command?: Record<string, unknown>;
  title?: string;
  body?: string;
}

export interface Automation {
  id: number;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  action: AutomationAction;
  created_at?: string;
}

export interface AutomationBody {
  name?: string;
  enabled?: boolean;
  trigger?: AutomationTrigger;
  action?: AutomationAction;
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
  gatePasses: (deviceId?: string) =>
    req<{ passes: GatePass[] }>("/gate/passes" + (deviceId ? "?deviceId=" + encodeURIComponent(deviceId) : "")),
  createGatePass: (body: GatePassBody) =>
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
