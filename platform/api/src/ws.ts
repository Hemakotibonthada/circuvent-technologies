import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server } from "node:http";
import { verifyUserToken } from "./auth";
import { bus, watchedDevices, type DeviceUpdate, type DeviceFrame } from "./mqtt";
import { pool } from "./db";
import { logger } from "./logger";

interface Client {
  ws: WebSocket;
  uid: number;
  deviceIds: Set<string>;
  /** Cameras this socket is actively viewing. Empty for almost every client. */
  watching: Set<string>;
}

/** A socket may watch a small number of cameras at once — a grid view, not the
 *  whole estate. Caps the bandwidth any single client can ask the server for. */
const MAX_WATCHED = 8;

/**
 * How many sockets are watching each camera. Refcounted rather than a plain
 * set: with two phones on the same feed, one closing the view must not stop
 * decoding frames for the other.
 */
const watchRefs = new Map<string, number>();

function retainWatch(deviceId: string): void {
  const n = (watchRefs.get(deviceId) ?? 0) + 1;
  watchRefs.set(deviceId, n);
  watchedDevices.add(deviceId);
}

function releaseWatch(deviceId: string): void {
  const n = (watchRefs.get(deviceId) ?? 1) - 1;
  if (n <= 0) {
    watchRefs.delete(deviceId);
    watchedDevices.delete(deviceId);
  } else {
    watchRefs.set(deviceId, n);
  }
}

/**
 * Live channel for the mobile/web app. A client connects to
 * wss://api.circuvent.com/ws?token=<jwt>, and receives real-time
 * state/telemetry/status pushes for devices it owns (<1s end-to-end).
 */
export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients = new Set<Client>();

  const onUpdate = (u: DeviceUpdate) => {
    const msg = JSON.stringify({ type: "device:update", ...u });
    for (const c of clients) {
      if (c.deviceIds.has(u.deviceId) && c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(msg);
      }
    }
  };
  bus.on("device:update", onUpdate);

  /**
   * Frames go only to sockets actively watching that camera. Serialising is
   * deferred until we know at least one client wants it, so a camera streaming
   * with nobody watching costs a Set lookup per frame instead of base64 JSON.
   */
  const onFrame = (f: DeviceFrame) => {
    let msg: string | null = null;
    for (const c of clients) {
      if (!c.watching.has(f.deviceId)) continue;
      if (!c.deviceIds.has(f.deviceId)) continue;
      if (c.ws.readyState !== WebSocket.OPEN) continue;
      // Never queue video behind a slow consumer — a backed-up socket would
      // grow without bound and play frames late forever. Drop instead.
      if (c.ws.bufferedAmount > 1_000_000) continue;
      if (msg === null) msg = JSON.stringify({ type: "device:frame", ...f });
      c.ws.send(msg);
    }
  };
  bus.on("device:frame", onFrame);

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token") ?? "";
    const claims = verifyUserToken(token);
    if (!claims) {
      ws.close(4401, "Unauthorized");
      return;
    }

    const client: Client = { ws, uid: claims.uid, deviceIds: new Set(), watching: new Set() };
    clients.add(client);

    /**
     * The set of device ids a socket may receive is derived from the database
     * and never from the client. A `subscribe` frame is only a request to
     * re-read it, so a caller cannot widen its own fan-out scope.
     */
    const syncDeviceIds = async (): Promise<void> => {
      try {
        const { rows } = await pool.query<{ id: string }>(`SELECT id FROM devices WHERE owner_id = $1`, [claims.uid]);
        client.deviceIds = new Set(rows.map((r) => r.id));
        // Losing a device mid-session must also drop its feed, not just stop it
        // being delivered — otherwise the refcount pins the camera forever.
        for (const id of [...client.watching]) {
          if (!client.deviceIds.has(id)) {
            client.watching.delete(id);
            releaseWatch(id);
          }
        }
      } catch (err) {
        logger.error({ err }, "ws sync devices failed");
      }
    };

    /**
     * Start the first read, but do NOT await it before attaching the message
     * listener below.
     *
     * Clients send `{type:"watch"}` from their onopen handler, which fires the
     * instant the WebSocket handshake completes. Awaiting a Postgres round-trip
     * before `ws.on("message")` exists meant that message arrived at an
     * EventEmitter with no listener and was dropped with nothing logged — so a
     * camera's frames were never relayed while state, telemetry and status kept
     * flowing, because none of those need the client to say anything. The
     * device looked perfectly healthy and only the video never started.
     */
    const initialSync = syncDeviceIds();

    ws.on("message", (data) => {
      // Ownership is read asynchronously, so a message that arrives during the
      // first read has to wait for it rather than be judged against an empty
      // set. Queuing here rather than dropping is the whole fix.
      void initialSync.then(() => handleClientMessage(data));
    });

    await initialSync;
    ws.send(JSON.stringify({ type: "ready", devices: [...client.deviceIds] }));

    // Re-reading owned devices hits Postgres, so a client cannot spin it.
    let lastSync = Date.now();
    let syncing = false;

    function handleClientMessage(data: RawData): void {
      // Clients ask for a refresh after claiming or releasing a device, and
      // opt in/out of camera frames.
      let m: { type?: unknown; deviceId?: unknown };
      try {
        m = JSON.parse(data.toString()) as { type?: unknown; deviceId?: unknown };
      } catch {
        return; // malformed frame
      }

      // Camera viewing. Ownership is re-checked against the server-derived set
      // on every frame too, so a stale watch can never leak video after a
      // device is unclaimed.
      if (m?.type === "watch" || m?.type === "unwatch") {
        const id = typeof m.deviceId === "string" ? m.deviceId : "";
        if (!id) return;
        if (m.type === "unwatch") {
          if (client.watching.delete(id)) releaseWatch(id);
          return;
        }
        if (!client.deviceIds.has(id)) return;
        if (client.watching.has(id)) return;
        if (client.watching.size >= MAX_WATCHED) return;
        client.watching.add(id);
        retainWatch(id);
        return;
      }

      if (m?.type !== "subscribe") return;
      if (syncing || Date.now() - lastSync < 2000) return;
      syncing = true;
      lastSync = Date.now();
      void syncDeviceIds().finally(() => {
        syncing = false;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ready", devices: [...client.deviceIds] }));
        }
      });
    }

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30000);

    // Ownership can change out from under a long-lived socket (admin
    // reassignment, unclaim), so re-derive it periodically rather than
    // trusting the snapshot taken at connect time.
    const resync = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) void syncDeviceIds();
    }, 60000);

    const teardown = () => {
      clearInterval(ping);
      clearInterval(resync);
      // A dropped socket must release its cameras, or the server keeps
      // decoding frames for a viewer that no longer exists.
      for (const id of client.watching) releaseWatch(id);
      client.watching.clear();
      clients.delete(client);
    };
    ws.on("close", teardown);
    ws.on("error", teardown);
  });

  logger.info("WebSocket channel attached at /ws");
}
