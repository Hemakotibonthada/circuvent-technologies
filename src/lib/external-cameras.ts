/**
 * External & phone cameras for Circuvent Home.
 *
 * Circuvent hardware cameras live on the control plane and post frames through
 * the existing camera-relay. This module covers everything else a household
 * wants on the same wall:
 *   - other-brand IP cameras (HLS / MJPEG / snapshot / RTSP URL),
 *   - a spare phone used as a CCTV source (browser getUserMedia → ingest).
 *
 * Metadata is per console user (same keying as user-prefs). Latest phone
 * frames reuse the camera_frames table when DATABASE_URL is set, and fall
 * back to an in-process map (+ JSON file) for local development.
 *
 * SERVER ONLY.
 */

import { createFileStore, shortId } from "./data-file";
import {
  dbArmCameraRelay,
  dbEnabled,
  dbLatestCameraFrame,
  dbStoreCameraFrameIfToken,
} from "./db";

export type ExternalCameraKind = "hls" | "mjpeg" | "snapshot" | "rtsp" | "phone";

export interface ExternalCamera {
  id: string;
  name: string;
  kind: ExternalCameraKind;
  /** Primary stream or RTSP URL. Empty for phone until paired. */
  streamUrl: string;
  /** Optional still URL when live play needs a relay. */
  snapshotUrl?: string;
  username?: string;
  /** Stored only for the owner's reconnect; never returned to other clients. */
  password?: string;
  roomName?: string;
  createdAt: string;
  updatedAt: string;
  /** Phone pairing / ingest (only for kind=phone). */
  pairToken?: string;
  pairExpires?: number;
  ingestToken?: string;
  ingestExpires?: number;
  lastFrameAt?: string;
  paired?: boolean;
}

interface CamerasDb {
  users: Record<string, ExternalCamera[]>;
}

const store = createFileStore<CamerasDb>(
  "external-cameras.json",
  () => ({ users: {} }),
  { durable: true }
);

/** In-memory latest frames when the DB path is unavailable (local/dev). */
const memFrames = new Map<string, { jpegB64: string; bytes: number; capturedAt: string }>();

const FRAME_STALE_MS = 15_000;
const PAIR_TTL_MS = 15 * 60_000;
const INGEST_TTL_MS = 24 * 60 * 60_000;
export const EXT_FRAME_MAX_B64 = 400_000;

function newToken(bytes = 24): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function hydrateCameras(): Promise<void> {
  await store.hydrate();
}

export async function flushCameras(): Promise<void> {
  await store.flush();
}

export function camerasDurable(): boolean {
  return store.isDurable() || dbEnabled();
}

function listRaw(userKey: string): ExternalCamera[] {
  return store.read().users[userKey] ?? [];
}

/** Public shape — never includes password or live ingest/pair secrets. */
export function toPublic(cam: ExternalCamera): Omit<ExternalCamera, "password" | "pairToken" | "ingestToken"> & {
  hasPassword: boolean;
  playUrl: string | null;
  online: boolean;
  needsRelay: boolean;
} {
  const { password: _p, pairToken: _pt, ingestToken: _it, ...rest } = cam;
  const playUrl = resolvePlayUrl(cam);
  const online =
    cam.kind === "phone"
      ? !!(cam.lastFrameAt && Date.now() - new Date(cam.lastFrameAt).getTime() < FRAME_STALE_MS)
      : !!(playUrl || cam.snapshotUrl);
  return {
    ...rest,
    hasPassword: !!cam.password,
    playUrl,
    online,
    needsRelay: cam.kind === "rtsp" && !playUrl && !cam.snapshotUrl,
  };
}

/**
 * Browser-playable URL for a registered camera.
 *
 * RTSP cannot play natively in the browser. When CAMERA_RELAY_BASE_URL points
 * at a go2rtc / MediaMTX style relay, we expose its HLS endpoint for this id.
 */
export function resolvePlayUrl(cam: ExternalCamera): string | null {
  if (cam.kind === "phone") return null;
  if (cam.kind === "hls" || cam.kind === "mjpeg" || cam.kind === "snapshot") {
    return cam.streamUrl || null;
  }
  if (cam.kind === "rtsp") {
    const relay = (process.env.CAMERA_RELAY_BASE_URL || "").trim().replace(/\/$/, "");
    if (relay && cam.streamUrl) {
      return `${relay}/stream.m3u8?src=${encodeURIComponent(cam.id)}`;
    }
    return cam.snapshotUrl || null;
  }
  return null;
}

export async function listCameras(userKey: string): Promise<ExternalCamera[]> {
  await hydrateCameras();
  return listRaw(userKey).slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getCamera(userKey: string, id: string): Promise<ExternalCamera | null> {
  await hydrateCameras();
  return listRaw(userKey).find((c) => c.id === id) ?? null;
}

export async function getCameraByPairToken(pairToken: string): Promise<{ userKey: string; cam: ExternalCamera } | null> {
  await hydrateCameras();
  const db = store.read();
  for (const [userKey, cams] of Object.entries(db.users)) {
    const cam = cams.find((c) => c.pairToken === pairToken);
    if (cam) return { userKey, cam };
  }
  return null;
}

export async function getCameraByIngestToken(
  cameraId: string,
  ingestToken: string
): Promise<{ userKey: string; cam: ExternalCamera } | null> {
  await hydrateCameras();
  const db = store.read();
  for (const [userKey, cams] of Object.entries(db.users)) {
    const cam = cams.find((c) => c.id === cameraId);
    if (cam && cam.ingestToken === ingestToken) return { userKey, cam };
  }
  return null;
}

export type AddCameraInput = {
  name: string;
  kind: Exclude<ExternalCameraKind, "phone">;
  streamUrl: string;
  snapshotUrl?: string;
  username?: string;
  password?: string;
  roomName?: string;
};

export async function addCamera(userKey: string, input: AddCameraInput): Promise<ExternalCamera> {
  await hydrateCameras();
  const now = new Date().toISOString();
  const cam: ExternalCamera = {
    id: shortId("cam"),
    name: input.name.trim() || "Camera",
    kind: input.kind,
    streamUrl: input.streamUrl.trim(),
    snapshotUrl: input.snapshotUrl?.trim() || undefined,
    username: input.username?.trim() || undefined,
    password: input.password || undefined,
    roomName: input.roomName?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  store.mutate((db) => {
    if (!db.users[userKey]) db.users[userKey] = [];
    db.users[userKey] = [cam, ...db.users[userKey]];
  });
  await flushCameras();
  return cam;
}

export async function updateCamera(
  userKey: string,
  id: string,
  patch: Partial<Pick<ExternalCamera, "name" | "streamUrl" | "snapshotUrl" | "username" | "password" | "roomName" | "kind">>
): Promise<ExternalCamera | null> {
  await hydrateCameras();
  let updated: ExternalCamera | null = null;
  store.mutate((db) => {
    const list = db.users[userKey] || [];
    const i = list.findIndex((c) => c.id === id);
    if (i < 0) return;
    const next = { ...list[i], ...patch, updatedAt: new Date().toISOString() };
    if (patch.password === "") delete next.password;
    list[i] = next;
    db.users[userKey] = list;
    updated = next;
  });
  await flushCameras();
  return updated;
}

export async function deleteCamera(userKey: string, id: string): Promise<boolean> {
  await hydrateCameras();
  let removed = false;
  store.mutate((db) => {
    const before = db.users[userKey] || [];
    const after = before.filter((c) => c.id !== id);
    removed = after.length !== before.length;
    db.users[userKey] = after;
  });
  memFrames.delete(id);
  await flushCameras();
  return removed;
}

/** Creates a phone camera slot and a short-lived pair token for the QR / link. */
export async function createPhonePair(
  userKey: string,
  opts: { name?: string; roomName?: string } = {}
): Promise<{ cam: ExternalCamera; pairToken: string; expires: number }> {
  await hydrateCameras();
  const now = Date.now();
  const pairToken = newToken(16);
  const expires = now + PAIR_TTL_MS;
  const iso = new Date(now).toISOString();
  const cam: ExternalCamera = {
    id: shortId("phone"),
    name: (opts.name || "Phone camera").trim(),
    kind: "phone",
    streamUrl: "",
    roomName: opts.roomName?.trim() || undefined,
    createdAt: iso,
    updatedAt: iso,
    pairToken,
    pairExpires: expires,
    paired: false,
  };
  store.mutate((db) => {
    if (!db.users[userKey]) db.users[userKey] = [];
    db.users[userKey] = [cam, ...db.users[userKey]];
  });
  await flushCameras();
  return { cam, pairToken, expires };
}

/** Phone presents pair token; receives a longer-lived ingest token. */
export async function claimPhonePair(
  pairToken: string
): Promise<{ userKey: string; cam: ExternalCamera; ingestToken: string; expires: number } | null> {
  await hydrateCameras();
  const hit = await getCameraByPairToken(pairToken);
  if (!hit) return null;
  if (!hit.cam.pairExpires || hit.cam.pairExpires < Date.now()) return null;

  const ingestToken = newToken(24);
  const expires = Date.now() + INGEST_TTL_MS;

  const claimed = store.mutate((db): ExternalCamera | null => {
    const list = db.users[hit.userKey] || [];
    const i = list.findIndex((c) => c.id === hit.cam.id);
    if (i < 0) return null;
    const next: ExternalCamera = {
      ...list[i],
      ingestToken,
      ingestExpires: expires,
      pairToken: undefined,
      pairExpires: undefined,
      paired: true,
      updatedAt: new Date().toISOString(),
    };
    list[i] = next;
    db.users[hit.userKey] = list;
    return next;
  });
  await flushCameras();
  if (!claimed) return null;

  // Arm DB row so frame upserts work (UPDATE path expects a row).
  if (dbEnabled()) {
    try {
      await dbArmCameraRelay(claimed.id, ingestToken, expires);
    } catch (e) {
      console.error("[external-cameras] arm phone relay failed:", e);
    }
  }

  return { userKey: hit.userKey, cam: claimed, ingestToken, expires };
}

export async function storePhoneFrame(
  cameraId: string,
  ingestToken: string,
  jpegB64: string,
  bytes: number
): Promise<{ ok: true } | { ok: false; reason: string; status: number }> {
  if (jpegB64.length > EXT_FRAME_MAX_B64) {
    return { ok: false, reason: "frame too large", status: 413 };
  }
  const hit = await getCameraByIngestToken(cameraId, ingestToken);
  if (!hit) return { ok: false, reason: "ingest token rejected", status: 403 };
  if (hit.cam.kind !== "phone") return { ok: false, reason: "not a phone camera", status: 400 };
  if (hit.cam.ingestExpires && hit.cam.ingestExpires < Date.now()) {
    return { ok: false, reason: "ingest window expired", status: 410 };
  }

  const capturedAt = new Date().toISOString();

  if (dbEnabled()) {
    try {
      // Re-arm if the row is missing (cold DB) so UPDATE can succeed.
      await dbArmCameraRelay(cameraId, ingestToken, hit.cam.ingestExpires || Date.now() + INGEST_TTL_MS);
      const ok = await dbStoreCameraFrameIfToken(cameraId, ingestToken, jpegB64, bytes);
      if (!ok) {
        // Fallback: write mem and still mark lastFrameAt so UI can work locally.
        memFrames.set(cameraId, { jpegB64, bytes, capturedAt });
      }
    } catch (e) {
      console.error("[external-cameras] db frame store failed:", e);
      memFrames.set(cameraId, { jpegB64, bytes, capturedAt });
    }
  } else {
    memFrames.set(cameraId, { jpegB64, bytes, capturedAt });
  }

  store.mutate((db) => {
    const list = db.users[hit.userKey] || [];
    const i = list.findIndex((c) => c.id === cameraId);
    if (i < 0) return;
    list[i] = { ...list[i], lastFrameAt: capturedAt, updatedAt: capturedAt };
    db.users[hit.userKey] = list;
  });
  // Best-effort flush; frame path should stay fast.
  void flushCameras();

  return { ok: true };
}

export async function latestPhoneFrame(
  userKey: string,
  cameraId: string
): Promise<{ jpegB64: string; bytes: number; capturedAt: string; ageMs: number } | null> {
  const cam = await getCamera(userKey, cameraId);
  if (!cam || cam.kind !== "phone") return null;

  if (dbEnabled()) {
    try {
      const row = await dbLatestCameraFrame(cameraId);
      if (row) {
        const ageMs = Date.now() - new Date(row.capturedAt).getTime();
        if (ageMs <= FRAME_STALE_MS) return { ...row, ageMs };
      }
    } catch {
      /* fall through to mem */
    }
  }

  const mem = memFrames.get(cameraId);
  if (!mem) return null;
  const ageMs = Date.now() - new Date(mem.capturedAt).getTime();
  if (ageMs > FRAME_STALE_MS) return null;
  return { ...mem, ageMs };
}

export async function revokePhone(userKey: string, id: string): Promise<boolean> {
  await hydrateCameras();
  let ok = false;
  store.mutate((db) => {
    const list = db.users[userKey] || [];
    const i = list.findIndex((c) => c.id === id);
    if (i < 0) return;
    const next = { ...list[i] };
    delete next.ingestToken;
    delete next.ingestExpires;
    delete next.pairToken;
    delete next.pairExpires;
    next.paired = false;
    next.updatedAt = new Date().toISOString();
    list[i] = next;
    db.users[userKey] = list;
    ok = true;
  });
  memFrames.delete(id);
  await flushCameras();
  return ok;
}
