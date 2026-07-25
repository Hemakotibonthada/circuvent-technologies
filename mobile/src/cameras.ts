// Camera registry for the Cameras screen. Supports two kinds:
//  - "url":    an IP camera reachable by an HTTP snapshot/MJPEG URL (ESP32-CAM
//              /capture, RTSP-to-HTTP gateways, etc.) — rendered by polling the
//              snapshot into an <Image> (works without any native player).
//  - "device": a Circuvent camera device on the control-plane — live frames are
//              requested over MQTT (command) and read back from telemetry.
// User-added cameras persist locally; control-plane camera devices are merged in.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Device } from "./api";

export type CameraKind = "url" | "device";
export interface Camera {
  id: string;
  name: string;
  kind: CameraKind;
  url?: string;       // snapshot / MJPEG URL for kind "url"
  deviceId?: string;  // control-plane device id for kind "device"
  room?: string;
}

const KEY = "cv-cameras";

export async function getUserCameras(): Promise<Camera[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Camera[]) : [];
  } catch {
    return [];
  }
}
async function save(list: Camera[]): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, 64))); } catch { /* ignore */ }
}
export async function addCamera(cam: Omit<Camera, "id">): Promise<Camera[]> {
  const list = await getUserCameras();
  const next: Camera = { ...cam, id: `cam-${Date.now().toString(36)}` };
  const out = [...list, next];
  await save(out);
  return out;
}
export async function removeCamera(id: string): Promise<Camera[]> {
  const out = (await getUserCameras()).filter((c) => c.id !== id);
  await save(out);
  return out;
}
export async function updateCamera(id: string, patch: Partial<Camera>): Promise<Camera[]> {
  const out = (await getUserCameras()).map((c) => (c.id === id ? { ...c, ...patch, id } : c));
  await save(out);
  return out;
}

// Control-plane devices that are cameras (type contains "cam" or reports frames).
export function deviceCameras(devices: Device[]): Camera[] {
  return devices
    .filter((d) => /cam|cctv|doorbell/i.test(d.type) || d.state?.hasCamera === true)
    .map((d) => ({ id: `dev-${d.id}`, name: d.name || d.id, kind: "device" as const, deviceId: d.id, room: d.room }));
}

/** Merge user cameras + control-plane camera devices (device dupes removed). */
export function mergedCameras(devices: Device[], user: Camera[]): Camera[] {
  const devCams = deviceCameras(devices);
  const takenDeviceIds = new Set(user.filter((c) => c.deviceId).map((c) => c.deviceId));
  return [...user, ...devCams.filter((c) => !takenDeviceIds.has(c.deviceId))];
}

/** Build a cache-busted snapshot URL so <Image> reloads each poll. */
export function snapshotUrl(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_t=${Date.now()}`;
}
