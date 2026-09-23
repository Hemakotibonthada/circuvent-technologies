/**
 * Client helpers for external + phone cameras.
 *
 * Server is authoritative (`/api/smarthome/cameras`). A localStorage cache keeps
 * the wall painted on first paint the same way user prefs do.
 */

import { getToken } from "./control-plane";

export type CameraKind = "hls" | "mjpeg" | "snapshot" | "rtsp" | "phone";

export interface CameraEntry {
  id: string;
  name: string;
  kind: CameraKind;
  streamUrl: string;
  snapshotUrl?: string;
  roomName?: string;
  createdAt: string;
  updatedAt?: string;
  playUrl?: string | null;
  online?: boolean;
  needsRelay?: boolean;
  hasPassword?: boolean;
  paired?: boolean;
  lastFrameAt?: string;
}

const CACHE_KEY = "cv-console-cameras-v2";
const LEGACY_KEY = "cv-console-cameras";

function readCache(): CameraEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as CameraEntry[];
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) return JSON.parse(legacy) as CameraEntry[];
  } catch {
    /* ignore */
  }
  return [];
}

function writeCache(cameras: CameraEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cameras));
  } catch {
    /* ignore */
  }
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** @deprecated Prefer fetchExternalCameras — kept for any leftover call sites. */
export function listCameras(): CameraEntry[] {
  return readCache();
}

export async function fetchExternalCameras(): Promise<{
  cameras: CameraEntry[];
  durable: boolean;
  relayConfigured: boolean;
}> {
  const token = getToken();
  if (!token) return { cameras: readCache(), durable: false, relayConfigured: false };
  try {
    const r = await fetch("/api/smarthome/cameras", {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!r.ok) return { cameras: readCache(), durable: false, relayConfigured: false };
    const d = await r.json();
    const cameras = (d.cameras || []) as CameraEntry[];
    writeCache(cameras);
    // One-time migrate of legacy local-only entries that never hit the server.
    const legacy = (() => {
      try {
        const raw = window.localStorage.getItem(LEGACY_KEY);
        return raw ? (JSON.parse(raw) as Array<{ name?: string; streamUrl?: string; kind?: string; roomName?: string }>) : [];
      } catch {
        return [];
      }
    })();
    if (legacy.length && cameras.length === 0) {
      for (const L of legacy) {
        if (!L.streamUrl || !L.kind || L.kind === "phone") continue;
        if (!["hls", "mjpeg", "snapshot", "rtsp"].includes(L.kind)) continue;
        await addExternalCamera({
          name: L.name || "Camera",
          kind: L.kind as "hls" | "mjpeg" | "snapshot" | "rtsp",
          streamUrl: L.streamUrl,
          roomName: L.roomName,
        });
      }
      try {
        window.localStorage.removeItem(LEGACY_KEY);
      } catch {
        /* ignore */
      }
      return fetchExternalCameras();
    }
    return {
      cameras,
      durable: !!d.durable,
      relayConfigured: !!d.relayConfigured,
    };
  } catch {
    return { cameras: readCache(), durable: false, relayConfigured: false };
  }
}

export async function addExternalCamera(input: {
  name: string;
  kind: "hls" | "mjpeg" | "snapshot" | "rtsp";
  streamUrl: string;
  snapshotUrl?: string;
  username?: string;
  password?: string;
  roomName?: string;
}): Promise<CameraEntry> {
  const r = await fetch("/api/smarthome/cameras", {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.error || "Could not add camera.");
  const cam = d.camera as CameraEntry;
  writeCache([cam, ...readCache().filter((c) => c.id !== cam.id)]);
  return cam;
}

/** Local-only helper kept for compatibility with the old scaffold. */
export function addCamera(input: Omit<CameraEntry, "id" | "createdAt">): CameraEntry {
  const camera: CameraEntry = {
    ...input,
    id: `cam_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
  };
  writeCache([camera, ...readCache()]);
  return camera;
}

export async function deleteExternalCamera(id: string): Promise<void> {
  const r = await fetch(`/api/smarthome/cameras/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || "Could not remove camera.");
  }
  writeCache(readCache().filter((c) => c.id !== id));
}

export function deleteCamera(id: string): void {
  writeCache(readCache().filter((c) => c.id !== id));
  void deleteExternalCamera(id).catch(() => {});
}

export async function pairPhoneCamera(opts: {
  name?: string;
  roomName?: string;
}): Promise<{ camera: CameraEntry; pairUrl: string; pairToken: string; expires: number }> {
  const r = await fetch("/api/smarthome/cameras/phone/pair", {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify(opts),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.error || "Could not start phone pairing.");
  const cam = d.camera as CameraEntry;
  writeCache([cam, ...readCache().filter((c) => c.id !== cam.id)]);
  return { camera: cam, pairUrl: d.pairUrl, pairToken: d.pairToken, expires: d.expires };
}

export async function revokePhoneCamera(id: string): Promise<void> {
  const r = await fetch(`/api/smarthome/cameras/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify({ revoke: true }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.error || "Could not revoke phone.");
  if (d.camera) {
    writeCache(readCache().map((c) => (c.id === id ? (d.camera as CameraEntry) : c)));
  }
}

export async function fetchPhoneFrame(
  id: string
): Promise<{ jpegB64: string; bytes: number; capturedAt: string; ageMs: number } | null> {
  const r = await fetch(`/api/smarthome/cameras/${encodeURIComponent(id)}/frame`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (r.status === 204) return null;
  if (!r.ok) return null;
  const d = await r.json();
  if (!d?.jpegB64) return null;
  return d;
}
