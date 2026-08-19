// Storefront view of the real fleet.
//
// WHY THIS EXISTS
//
// There are two device registries, and they are both legitimate:
//
//   1. The shop's own table (lib/store.ts). Devices call POST /api/devices/sync
//      on circuvent.com directly and are claimed with the ID and key printed on
//      the enclosure. This is the original stack and still works.
//
//   2. The control plane at api.circuvent.com. Devices connect over MQTT, and
//      this is what the console and the mobile app use. It is where every unit
//      commissioned through the app ends up.
//
// "My devices" in the shop only ever read the first one. So a customer who
// bought hardware, set it up in the app, and had it running in their house
// opened /shop/devices and was told "No devices linked yet. Add one using the
// ID and key printed on your device." — on a page that advertises itself as
// "powered end-to-end by the Circuvent cloud". The devices were online the
// whole time; the shop was looking in the wrong drawer.
//
// HOW THE TWO IDENTITIES ARE JOINED
//
// The shop and the control plane keep separate user tables with different
// password schemes, so there is no shared session to reuse. The join is
// /auth/federated: the shop's backend, which has just verified this customer,
// asks the control plane for a session on their behalf and signs the request
// with FEDERATION_SECRET. That already existed for the "open the console"
// hand-off — this module points the device list at it too.
//
// The secret is server-to-server and must never reach a browser, which is why
// every function here is server-only and the browser keeps talking to
// /api/devices exactly as before.
//
// SERVER ONLY.

import { CONTROL_PLANE_URL, mintConsoleSession, federationConfigured } from "./sso";
import { logger } from "./logger";
import type { DeviceView } from "./store";

/** Shape the control plane returns from GET /devices. */
interface PlaneDevice {
  id: string;
  name?: string;
  type?: string;
  room?: string;
  online?: boolean;
  last_seen?: string;
  state?: Record<string, unknown>;
  fw_version?: string;
}

/*
 * Minting a session is an HMAC plus a round trip to the control plane, and the
 * devices page polls every five seconds. Without a cache, a single open tab
 * would mint a session twelve times a minute for a list that has not changed.
 *
 * Held per email and deliberately short: the point is to collapse a burst of
 * polls, not to keep a session alive. A token that stops working is dropped and
 * re-minted on the next call (see withSession), so a stale entry costs one
 * retry rather than a broken page.
 */
const SESSION_TTL_MS = 5 * 60_000;
const sessions = new Map<string, { token: string; at: number }>();

function cached(email: string): string | null {
  const hit = sessions.get(email);
  if (!hit) return null;
  if (Date.now() - hit.at > SESSION_TTL_MS) {
    sessions.delete(email);
    return null;
  }
  return hit.token;
}

async function sessionFor(email: string): Promise<string | null> {
  const hit = cached(email);
  if (hit) return hit;
  const minted = await mintConsoleSession(email);
  if (!minted) return null;
  sessions.set(email, { token: minted.token, at: Date.now() });
  return minted.token;
}

/**
 * Runs a control-plane call with this customer's session, retrying once on 401.
 *
 * The retry is what makes the cache safe. A cached token can expire or be
 * revoked between polls, and without this the page would show an empty device
 * list — the same symptom as owning no devices — until the TTL happened to
 * lapse. One forced re-mint turns that into a hiccup nobody sees.
 */
async function withSession<T>(
  email: string,
  run: (token: string) => Promise<Response>,
  read: (res: Response) => Promise<T>,
): Promise<T | null> {
  if (!federationConfigured()) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await sessionFor(email);
    if (!token) return null;
    try {
      const res = await run(token);
      if (res.status === 401 && attempt === 0) {
        sessions.delete(email);
        continue;
      }
      if (!res.ok) {
        logger.warn("shop.control_plane_refused", { status: res.status });
        return null;
      }
      return await read(res);
    } catch (err) {
      logger.error("shop.control_plane_unreachable", {}, err);
      return null;
    }
  }
  return null;
}

/**
 * The customer's devices as the control plane knows them.
 *
 * Returns null — not an empty array — when the bridge is unavailable, so
 * callers can tell "this customer owns nothing" apart from "we could not ask".
 * The difference matters: the first is a genuine empty state, the second must
 * not overwrite whatever the shop's own table knows.
 */
export async function listFleetDevices(email: string): Promise<DeviceView[] | null> {
  const rows = await withSession(
    email,
    (token) =>
      fetch(`${CONTROL_PLANE_URL}/devices`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }),
    async (res) => ((await res.json()) as { devices?: PlaneDevice[] }).devices ?? [],
  );
  if (!rows) return null;

  return rows.map((d) => ({
    id: String(d.id),
    type: String(d.type || "device"),
    name: String(d.name || d.id),
    online: d.online === true,
    lastSeen: d.last_seen,
    // fw_version sits beside state on the wire but the cards read everything
    // out of state, so it is folded in rather than dropped.
    state: { ...(d.state || {}), ...(d.fw_version ? { fw: d.fw_version } : {}) },
  }));
}

/** True if the control plane accepted the command. */
export async function sendFleetCommand(
  email: string,
  deviceId: string,
  action: string,
  params?: Record<string, unknown>,
): Promise<boolean> {
  const ok = await withSession(
    email,
    (token) =>
      fetch(`${CONTROL_PLANE_URL}/devices/${encodeURIComponent(deviceId)}/command`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ action, ...(params || {}) }),
        signal: AbortSignal.timeout(8000),
      }),
    async () => true,
  );
  return ok === true;
}

/**
 * Merges the two registries, control plane first.
 *
 * Both are real, and a device can legitimately appear in either. Where the same
 * id is in both, the control plane wins: it is the one holding a live MQTT
 * connection, so its online flag and state are the current ones, while the
 * shop's copy only advances when the device happens to POST to /sync.
 */
export function mergeDeviceLists(fleet: DeviceView[] | null, local: DeviceView[]): DeviceView[] {
  if (!fleet) return local;
  const seen = new Set(fleet.map((d) => d.id));
  return [...fleet, ...local.filter((d) => !seen.has(d.id))];
}
