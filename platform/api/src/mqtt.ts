import mqtt, { type MqttClient } from "mqtt";
import { EventEmitter } from "node:events";
import { config, topics, deviceIdFromTopic } from "./config";
import { pool } from "./db";
import { logger } from "./logger";
import { onStateChange } from "./automations";
import { sendPushToUser } from "./push";

/** In-process bus: MQTT messages -> WebSocket fan-out to app clients. */
export const bus = new EventEmitter();
bus.setMaxListeners(0);

export interface DeviceUpdate {
  deviceId: string;
  kind: "state" | "telemetry" | "status";
  payload: unknown;
  at: string;
}

let client: MqttClient | null = null;

// Dynamic Security control channel. The control-plane is the dynsec admin; it
// manages broker clients (one per device) and their topic permissions here.
const DYNSEC_CMD = "$CONTROL/dynamic-security/v1";
const DYNSEC_RES = "$CONTROL/dynamic-security/v1/response";

export function getMqtt(): MqttClient {
  if (!client) throw new Error("MQTT not connected");
  return client;
}

export function connectMqtt(): Promise<void> {
  return new Promise((resolve) => {
    client = mqtt.connect(config.MQTT_URL, {
      clientId: `control-plane-${Math.random().toString(16).slice(2, 10)}`,
      username: config.MQTT_USERNAME,
      password: config.MQTT_PASSWORD,
      reconnectPeriod: 2000,
      clean: true,
    });

    client.on("connect", () => {
      logger.info("MQTT connected");
      client!.subscribe(DYNSEC_RES, { qos: 1 });
      // Ensure the control-plane + device roles exist and the control-plane can
      // reach cv/#. Roles/ACLs applied here; subscribe to device topics just
      // after so the freshly-granted permission is in effect.
      bootstrapDynsec();
      setTimeout(() => {
        client!.subscribe([topics.allState, topics.allTelemetry, topics.allStatus], { qos: 1 }, (err) => {
          if (err) logger.error({ err }, "MQTT subscribe failed");
        });
      }, 1500);
      resolve();
    });

    client.on("reconnect", () => logger.warn("MQTT reconnecting"));
    client.on("error", (err) => logger.error({ err }, "MQTT error"));
    client.on("message", (topic, buf) => {
      if (topic === DYNSEC_RES) {
        logDynsecResponse(buf);
        return;
      }
      void handleMessage(topic, buf);
    });
  });
}

/** Publish a Dynamic Security command batch on the $CONTROL channel. */
function dynsec(commands: Array<Record<string, unknown>>): void {
  try {
    getMqtt().publish(DYNSEC_CMD, JSON.stringify({ commands }));
  } catch (err) {
    logger.error({ err }, "dynsec publish failed");
  }
}

/** Idempotently create the control-plane + device roles (safe on every boot). */
function bootstrapDynsec(): void {
  dynsec([
    { command: "createRole", rolename: "controlplane" },
    { command: "addRoleACL", rolename: "controlplane", acltype: "publishClientSend", topic: "cv/#", priority: 0, allow: true },
    { command: "addRoleACL", rolename: "controlplane", acltype: "publishClientReceive", topic: "cv/#", priority: 0, allow: true },
    { command: "addRoleACL", rolename: "controlplane", acltype: "subscribePattern", topic: "cv/#", priority: 0, allow: true },
    { command: "addClientRole", username: config.MQTT_USERNAME, rolename: "controlplane" },
    { command: "createRole", rolename: "device" },
    { command: "addRoleACL", rolename: "device", acltype: "publishClientSend", topic: "cv/%u/#", priority: 0, allow: true },
    { command: "addRoleACL", rolename: "device", acltype: "publishClientReceive", topic: "cv/%u/#", priority: 0, allow: true },
    { command: "addRoleACL", rolename: "device", acltype: "subscribePattern", topic: "cv/%u/#", priority: 0, allow: true },
  ]);
}

/** Create a broker client for a freshly-provisioned device (username=id, password=key). */
export function provisionBrokerClient(id: string, key: string): void {
  dynsec([
    { command: "createClient", username: id, password: key },
    { command: "addClientRole", username: id, rolename: "device" },
  ]);
}

/** Remove a device's broker client (on unclaim/delete). */
export function deprovisionBrokerClient(id: string): void {
  dynsec([{ command: "deleteClient", username: id }]);
}

function logDynsecResponse(buf: Buffer): void {
  try {
    const doc = JSON.parse(buf.toString("utf8")) as { responses?: Array<{ command: string; error?: string }> };
    for (const r of doc.responses ?? []) {
      if (r.error && !/already exists/i.test(r.error)) {
        logger.warn({ command: r.command, error: r.error }, "dynsec command error");
      }
    }
  } catch {
    /* ignore malformed dynsec response */
  }
}

async function handleMessage(topic: string, buf: Buffer): Promise<void> {
  const deviceId = deviceIdFromTopic(topic);
  if (!deviceId) return;
  const kind = topic.split("/")[2] as DeviceUpdate["kind"];
  const raw = buf.toString("utf8");
  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }
  const at = new Date().toISOString();

  try {
    if (kind === "state") {
      const prev = await pool.query<{ owner_id: number | null; name: string | null; state: Record<string, unknown> | null }>(
        `SELECT owner_id, name, state FROM devices WHERE id = $1`,
        [deviceId]
      );
      const row = prev.rows[0];
      const prevState = row?.state ?? null;
      await pool.query(
        `UPDATE devices SET state = $2, online = true, last_seen = now() WHERE id = $1`,
        [deviceId, payload as object]
      );
      if (row?.owner_id != null) {
        await notifyStateEvents(row.owner_id, row.name || deviceId, prevState, payload as Record<string, unknown>);
        await onStateChange(deviceId, prevState, payload as Record<string, unknown>);
      }
    } else if (kind === "telemetry") {
      await pool.query(
        `INSERT INTO telemetry (device_id, payload) SELECT $1, $2
         WHERE EXISTS (SELECT 1 FROM devices WHERE id = $1)`,
        [deviceId, payload as object]
      );
      await pool.query(`UPDATE devices SET online = true, last_seen = now() WHERE id = $1`, [deviceId]);
    } else if (kind === "status") {
      const online = (payload as { online?: boolean })?.online ?? raw.includes("online");
      const prev = await pool.query<{ owner_id: number | null; name: string | null; online: boolean | null }>(
        `SELECT owner_id, name, online FROM devices WHERE id = $1`,
        [deviceId]
      );
      const row = prev.rows[0];
      await pool.query(`UPDATE devices SET online = $2, last_seen = now() WHERE id = $1`, [deviceId, online]);
      if (row?.owner_id != null && row.online === true && online === false) {
        await sendPushToUser(row.owner_id, { title: "Device offline", body: `${row.name || deviceId} went offline.` });
      }
    }
  } catch (err) {
    logger.error({ err, deviceId, kind }, "Failed to persist device message");
  }

  const update: DeviceUpdate = { deviceId, kind, payload, at };
  bus.emit("device:update", update);
}

/** Push notifications for notable AquaGuard/Guardian state transitions (edge-triggered). */
async function notifyStateEvents(
  ownerId: number,
  name: string,
  prev: Record<string, unknown> | null,
  next: Record<string, unknown>
): Promise<void> {
  const rose = (f: string) => !!next?.[f] && !prev?.[f];
  if (rose("dryRun")) await sendPushToUser(ownerId, { title: "AquaGuard alert", body: `${name}: dry-run detected — pump stopped.` });
  if (rose("overflow")) await sendPushToUser(ownerId, { title: "AquaGuard alert", body: `${name}: tank overflow — pump stopped.` });
  if (rose("sos")) await sendPushToUser(ownerId, { title: "SOS alert", body: `${name}: SOS triggered!` });
}

/** Publish a command to a device. QoS 1 for reliable delivery. */
export function publishCommand(deviceId: string, payload: unknown): void {
  getMqtt().publish(topics.cmd(deviceId), JSON.stringify(payload), { qos: 1 });
}
