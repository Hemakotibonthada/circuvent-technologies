import mqtt, { type MqttClient } from "mqtt";
import { EventEmitter } from "node:events";
import { config, topics, deviceIdFromTopic } from "./config";
import { pool } from "./db";
import { logger } from "./logger";

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
      client!.subscribe([topics.allState, topics.allTelemetry, topics.allStatus], { qos: 1 }, (err) => {
        if (err) logger.error({ err }, "MQTT subscribe failed");
      });
      resolve();
    });

    client.on("reconnect", () => logger.warn("MQTT reconnecting"));
    client.on("error", (err) => logger.error({ err }, "MQTT error"));
    client.on("message", (topic, buf) => void handleMessage(topic, buf));
  });
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
      await pool.query(
        `UPDATE devices SET state = $2, online = true, last_seen = now() WHERE id = $1`,
        [deviceId, payload as object]
      );
    } else if (kind === "telemetry") {
      await pool.query(
        `INSERT INTO telemetry (device_id, payload) SELECT $1, $2
         WHERE EXISTS (SELECT 1 FROM devices WHERE id = $1)`,
        [deviceId, payload as object]
      );
      await pool.query(`UPDATE devices SET online = true, last_seen = now() WHERE id = $1`, [deviceId]);
    } else if (kind === "status") {
      const online = (payload as { online?: boolean })?.online ?? raw.includes("online");
      await pool.query(`UPDATE devices SET online = $2, last_seen = now() WHERE id = $1`, [deviceId, online]);
    }
  } catch (err) {
    logger.error({ err, deviceId, kind }, "Failed to persist device message");
  }

  const update: DeviceUpdate = { deviceId, kind, payload, at };
  bus.emit("device:update", update);
}

/** Publish a command to a device. QoS 1 for reliable delivery. */
export function publishCommand(deviceId: string, payload: unknown): void {
  getMqtt().publish(topics.cmd(deviceId), JSON.stringify(payload), { qos: 1 });
}
