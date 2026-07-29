import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { verifyUserToken } from "./auth";
import { bus, type DeviceUpdate } from "./mqtt";
import { pool } from "./db";
import { logger } from "./logger";

interface Client {
  ws: WebSocket;
  uid: number;
  deviceIds: Set<string>;
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

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token") ?? "";
    const claims = verifyUserToken(token);
    if (!claims) {
      ws.close(4401, "Unauthorized");
      return;
    }

    const client: Client = { ws, uid: claims.uid, deviceIds: new Set() };
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
      } catch (err) {
        logger.error({ err }, "ws sync devices failed");
      }
    };

    await syncDeviceIds();
    ws.send(JSON.stringify({ type: "ready", devices: [...client.deviceIds] }));

    // Re-reading owned devices hits Postgres, so a client cannot spin it.
    let lastSync = Date.now();
    let syncing = false;

    ws.on("message", (data) => {
      // Clients ask for a refresh after claiming or releasing a device.
      let m: { type?: unknown };
      try {
        m = JSON.parse(data.toString()) as { type?: unknown };
      } catch {
        return; // malformed frame
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
    });

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
      clients.delete(client);
    };
    ws.on("close", teardown);
    ws.on("error", teardown);
  });

  logger.info("WebSocket channel attached at /ws");
}
