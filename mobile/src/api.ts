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
  online: boolean;
  last_seen?: string | null;
  state: Record<string, any>;
  fw_version?: string;
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
  // cmd is the raw command object, e.g. { action: "set", scene: "night" }.
  command: (id: string, cmd: Record<string, any>) =>
    req("/devices/" + encodeURIComponent(id) + "/command", { method: "POST", body: JSON.stringify(cmd) }),
  telemetry: (id: string, limit = 100) =>
    req<{ telemetry: { ts: string; payload: any }[] }>(
      "/devices/" + encodeURIComponent(id) + "/telemetry?limit=" + limit
    ),
};
