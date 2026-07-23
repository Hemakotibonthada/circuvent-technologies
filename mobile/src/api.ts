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
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  try {
    const res = await fetch(API_BASE + path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { message: "Network error" } as any };
  }
}

export interface Device {
  id: string;
  type: string;
  name: string;
  online: boolean;
  lastSeen?: string;
  state: Record<string, any>;
}

export const api = {
  login: (email: string, password: string) =>
    req("/api/account/login", { method: "POST", body: JSON.stringify({ email, password }) }, false),
  register: (name: string, email: string, password: string) =>
    req("/api/account/register", { method: "POST", body: JSON.stringify({ name, email, password }) }, false),
  verifyOtp: (email: string, otp: string) =>
    req("/api/account/verify-otp", { method: "POST", body: JSON.stringify({ email, otp }) }, false),
  devices: () => req<{ success: boolean; devices: Device[] }>("/api/devices"),
  claim: (deviceId: string, key: string, name: string) =>
    req("/api/devices/claim", { method: "POST", body: JSON.stringify({ deviceId, key, name }) }),
  command: (deviceId: string, action: string, params: Record<string, any>) =>
    req("/api/devices/command", { method: "POST", body: JSON.stringify({ deviceId, action, params }) }),
};
