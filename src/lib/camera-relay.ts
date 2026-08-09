/**
 * Remote camera viewing that does not depend on the control plane.
 *
 * WHY THIS EXISTS
 *
 * Frames travel device -> broker -> control plane -> browser, and that relay
 * is opened by a `watch` message on the WebSocket. The deployed control plane
 * never reads inbound WebSocket messages — measured from two independent
 * client stacks: it answers protocol pings and pushes hundreds of state
 * updates a minute, but repeated `subscribe` frames over twenty seconds drew
 * no reply at all. The gate never opens, so no camera can show a picture no
 * matter how healthy it is.
 *
 * Firmware 1.9.0 added LAN viewing. That fixes it for someone standing in the
 * house and does nothing for the case that actually matters — checking on the
 * place while you are away from it.
 *
 * This is a third route, built only from parts known to work:
 *   - the control plane's *command* path (HTTP, deployed, verified),
 *   - the device's HTTPS client with a pinned root (already used for OTA),
 *   - this site, which deploys on push.
 * The device posts frames here; the browser reads them here. Neither the
 * broker nor the WebSocket relay is involved, so neither can break it.
 *
 * COST IS BOUNDED BY DESIGN
 *
 * Uploading around the clock would burn the device's bandwidth and this
 * database on behalf of nobody. So a camera posts only while a viewer has
 * armed it, the arming expires on its own, and only the newest frame is kept.
 * The table stays the size of the fleet, not the size of the footage.
 */
import {
  dbArmCameraRelay,
  dbCameraRelayToken,
  dbStoreCameraFrame,
  dbLatestCameraFrame,
  dbEnabled,
} from "./db";

/** How long an arming lasts before the camera stops posting on its own. */
export const RELAY_ARM_MS = 120_000;

/** Frames older than this are not served: a stale still is worse than none. */
export const RELAY_FRAME_STALE_MS = 30_000;

/**
 * Upload ceiling. A VGA JPEG at this firmware's quality runs 20-45 kB and
 * base64 adds a third. Generous enough for SVGA, small enough that a
 * misbehaving client cannot post megabytes.
 */
export const RELAY_MAX_B64 = 200_000;

export interface RelayFrame {
  jpegB64: string;
  bytes: number;
  capturedAt: string;
  ageMs: number;
}

export function newRelayToken(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function armRelay(deviceId: string): Promise<{ token: string; expires: number } | null> {
  if (!dbEnabled()) return null;
  const token = newRelayToken();
  const expires = Date.now() + RELAY_ARM_MS;
  await dbArmCameraRelay(deviceId, token, expires);
  return { token, expires };
}

export type StoreResult = { ok: true } | { ok: false; reason: string; status: number };

/**
 * Stores a frame if the presented token is valid and unexpired.
 *
 * Reports *why* it was refused rather than a bare false. "Your window expired"
 * and "that camera was never armed" need completely different fixes, and one
 * undifferentiated failure is how someone ends up reflashing firmware to chase
 * a timing problem.
 */
export async function storeFrame(
  deviceId: string,
  presented: string,
  jpegB64: string,
  bytes: number
): Promise<StoreResult> {
  if (!dbEnabled()) return { ok: false, reason: "no database configured", status: 503 };
  const { token, expires } = await dbCameraRelayToken(deviceId);
  if (!token) return { ok: false, reason: "camera is not armed for upload", status: 409 };
  if (token !== presented) return { ok: false, reason: "upload token rejected", status: 403 };
  if (expires != null && expires < Date.now()) {
    return { ok: false, reason: "upload window expired", status: 410 };
  }
  await dbStoreCameraFrame(deviceId, jpegB64, bytes);
  return { ok: true };
}

/** The newest frame, or null when there is nothing fresh enough to show. */
export async function latestFrame(deviceId: string): Promise<RelayFrame | null> {
  if (!dbEnabled()) return null;
  const row = await dbLatestCameraFrame(deviceId);
  if (!row) return null;
  const ageMs = Date.now() - new Date(row.capturedAt).getTime();
  if (ageMs > RELAY_FRAME_STALE_MS) return null;
  return { ...row, ageMs };
}

const CONTROL_PLANE = process.env.NEXT_PUBLIC_CONTROL_PLANE_URL || "https://api.circuvent.com";

/**
 * Confirms this caller may view this camera, by asking the control plane.
 *
 * Ownership lives in the control plane's database, not this one. Answering
 * locally would be a guess with security consequences, so the authoritative
 * service is asked directly using the caller's own token — a route that is
 * deployed and verified working.
 */
export async function callerOwnsDevice(deviceId: string, cpToken: string): Promise<boolean> {
  try {
    const r = await fetch(`${CONTROL_PLANE}/devices/${encodeURIComponent(deviceId)}`, {
      headers: { authorization: `Bearer ${cpToken}` },
      cache: "no-store",
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Asks the control plane to tell a camera to start or stop posting frames. */
export async function commandCloudPush(
  deviceId: string,
  cpToken: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  try {
    const r = await fetch(`${CONTROL_PLANE}/devices/${encodeURIComponent(deviceId)}/command`, {
      method: "POST",
      headers: { authorization: `Bearer ${cpToken}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "cloudpush", ...payload }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
