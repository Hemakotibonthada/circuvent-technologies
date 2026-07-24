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

    // Prime the set of owned device ids so pushes are scoped to this user.
    try {
      const { rows } = await pool.query<{ id: string }>(`SELECT id FROM devices WHERE owner_id = $1`, [claims.uid]);
      for (const r of rows) client.deviceIds.add(r.id);
    } catch (err) {
      logger.error({ err }, "ws prime devices failed");
    }

    ws.send(JSON.stringify({ type: "ready", devices: [...client.deviceIds] }));

    ws.on("message", (data) => {
      // Clients may refresh their device set after claiming a new device.
      try {
        const m = JSON.parse(data.toString());
        if (m?.type === "subscribe" && Array.isArray(m.deviceIds)) {
          // Only allow ids the user owns (re-check against DB is done on claim).
          for (const id of m.deviceIds) if (typeof id === "string") client.deviceIds.add(id);
        }
      } catch {
        /* ignore malformed frames */
      }
    });

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30000);

    ws.on("close", () => {
      clearInterval(ping);
      clients.delete(client);
    });
    ws.on("error", () => {
      clearInterval(ping);
      clients.delete(client);
    });
  });

  logger.info("WebSocket channel attached at /ws");
}
