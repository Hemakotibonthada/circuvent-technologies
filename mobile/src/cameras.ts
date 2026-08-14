// Camera registry for the Cameras screen. Supports two kinds:
//  - "url":    an IP camera reachable by an HTTP snapshot/MJPEG URL (ESP32-CAM
//              /capture, RTSP-to-HTTP gateways, etc.) — rendered by polling the
//              snapshot into an <Image> (works without any native player).
//  - "device": a Circuvent camera device on the control-plane — the firmware is
//              asked to stream over MQTT and frames arrive on the app's live
//              WebSocket (see useCameraFrames in ./live).
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

/**
 * Is this control-plane device a camera the Cameras screen should show?
 *
 * Matched on the type name or on the device advertising a video source, so a
 * "camera", "cctv" or "doorbell" board and anything reporting hasCamera all
 * count. Shared so the camera list and the device detail screen can never
 * disagree about what a camera is.
 *
 * `anpr-cam` is excluded despite matching both tests. It reports
 * `hasCamera: true` — correctly, it has a sensor and can stream — but its live
 * view exists only to aim the lens during installation: the firmware drops to
 * a lower resolution while streaming and expires the lease after 20 s. Putting
 * it on a camera wall would give everyone watching a degraded picture *and*
 * degrade plate capture for as long as anyone had the wall open. It has its
 * own screen, under Vehicles.
 */
export function isCameraDevice(d: Device): boolean {
  if (d.type === "anpr-cam") return false;
  return /cam|cctv|doorbell/i.test(d.type) || d.state?.hasCamera === true;
}

// Control-plane devices that are cameras (type contains "cam" or reports frames).
export function deviceCameras(devices: Device[]): Camera[] {
  return devices
    .filter(isCameraDevice)
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

/**
 * The size the picture on screen is actually at.
 *
 * From firmware 1.13.0 the sensor runs smaller while streaming than the
 * resolution chosen for stills, because a 1600x1200 frame cannot be read out,
 * encoded and published twenty-four times a second. `state.resolution` is
 * therefore the wrong caption for live video — printing it labels an 800x600
 * stream "UXGA", which is the one claim somebody measuring the picture would
 * believe over their own eyes.
 *
 * Older firmware does not publish `streamResolution`. Absence is not evidence
 * that a stream is downscaled, so it falls back to the chosen resolution and
 * every camera already in the field reads exactly as it did before.
 *
 * This deliberately duplicates `effectiveResolution` in the console's
 * DeviceControls.tsx — the app and the site are separate TypeScript projects
 * and cannot import each other. tests/camera-fps-parity.test.ts fails if only
 * one of the two copies learns something.
 */
export function effectiveResolution(
  state: Record<string, unknown>,
  live: boolean
): string {
  const chosen = typeof state.resolution === "string" ? state.resolution : "VGA";
  if (!live) return chosen;
  const streamed = state.streamResolution;
  return typeof streamed === "string" && streamed ? streamed : chosen;
}
