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
    req<AuthResp>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) }, false),
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
};
