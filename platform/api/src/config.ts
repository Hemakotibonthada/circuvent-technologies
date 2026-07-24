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
  // Smart-home (Alexa + Google) account-linking OAuth client.
  SMARTHOME_CLIENT_ID: z.string().default("circuvent-smarthome"),
  SMARTHOME_CLIENT_SECRET: z.string().default(""),
  // Transactional email for OTP / alerts. SMTP is preferred; Resend is the
  // fallback (reuses the marketing site's RESEND_API_KEY). If neither is set,
  // OTP codes are logged (dev) so sign-up still works while email is configured.
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_SECURE: z.string().default("false"),
  RESEND_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().default("Circuvent <onboarding@resend.dev>"),
  OTP_TTL_MIN: z.coerce.number().default(10),
  OTP_DEBUG: z.string().default("false"),
  // Comma-separated emails auto-granted the admin role on login/verify.
  ADMIN_EMAILS: z.string().default(""),
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
