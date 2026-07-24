import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  MQTT_URL: z.string().default("mqtt://mosquitto:1883"),
  MQTT_USERNAME: z.string().default("control-plane"),
  MQTT_PASSWORD: z.string().min(1, "MQTT_PASSWORD is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  JWT_EXPIRES_IN: z.string().default("30d"),
  CORS_ORIGIN: z.string().default("*"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

/** MQTT topic scheme — the single source of truth shared with firmware + app. */
export const topics = {
  cmd: (deviceId: string) => `cv/${deviceId}/cmd`,
  state: (deviceId: string) => `cv/${deviceId}/state`,
  telemetry: (deviceId: string) => `cv/${deviceId}/telemetry`,
  status: (deviceId: string) => `cv/${deviceId}/status`,
  // Wildcards the control-plane subscribes to.
  allState: "cv/+/state",
  allTelemetry: "cv/+/telemetry",
  allStatus: "cv/+/status",
};

/** Extract the deviceId from an inbound topic like cv/<id>/state. */
export function deviceIdFromTopic(topic: string): string | null {
  const parts = topic.split("/");
  return parts.length === 3 && parts[0] === "cv" ? parts[1] : null;
}
