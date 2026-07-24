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
  online: boolean;
  last_seen?: string | null;
  state: Record<string, unknown>;
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
    req<AuthResp>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) }, false),
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
};

export type { AuthResp };
