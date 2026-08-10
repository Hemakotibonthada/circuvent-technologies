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
  // Extra redirect URIs allowed during account linking, comma-separated.
  // The built-in Alexa/Google endpoints are always allowed; this is for
  // vendor consoles and local testing. Prefixes are matched exactly.
  SMARTHOME_REDIRECT_URIS: z.string().default(""),
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
  // Shared secret for single sign-on with the storefront. The shop's Next.js
  // backend proves a customer is already authenticated by signing a request
  // with this, and gets back a console session for the same address. Empty
  // disables federation entirely, so a deployment that has not configured it
  // cannot be talked into minting sessions.
  FEDERATION_SECRET: z.string().default(""),
  /*
   * ANPR plate recognition.
   *
   * Optional by design. With none of this set the ANPR pipeline still runs
   * end to end — captures are received, vehicle arrivals are recorded, the
   * thumbnail is kept and automations fire — and every read is stored with
   * `status: "unrecognised"` and the reason `no_recogniser`. That is the same
   * bargain the AI assistant makes in Docs/16-ai-assistant.md: the
   * deterministic part always works, and the model only ever adds to it.
   *
   * The alternative, refusing to accept captures without a recogniser, would
   * mean a customer who has not bought OCR gets a camera that appears broken.
   */
  ANPR_PROVIDER: z.enum(["none", "platerecognizer", "openai", "http"]).default("none"),
  ANPR_BASE_URL: z.string().default(""),
  ANPR_API_KEY: z.string().default(""),
  ANPR_MODEL: z.string().default("gpt-4o-mini"),
  /** Two-letter region hint, e.g. `in`. Improves format disambiguation. */
  ANPR_REGION: z.string().default("in"),
  ANPR_TIMEOUT_MS: z.coerce.number().default(12000),
  /** Reads below this are stored but never drive a gate. 0-100. */
  ANPR_MIN_CONFIDENCE: z.coerce.number().min(0).max(100).default(70),
  /** Days of plate history to keep. The retention sweep runs daily. */
  ANPR_RETENTION_DAYS: z.coerce.number().min(1).max(3650).default(90),
  /*
   * Images expire before the metadata does, and that gap is the point.
   *
   * "A vehicle with this plate arrived at 19:42" is what a dispute or an
   * access review needs months later. The photograph of it — which also
   * contains whoever was walking past, and the inside of the car — is only
   * useful for the few weeks in which somebody might question a specific
   * read. Keeping both for the same period means keeping pictures of the
   * street for no reason anyone can state.
   */
  ANPR_IMAGE_RETENTION_DAYS: z.coerce.number().min(0).max(3650).default(30),
  /*
   * Largest capture kept as a stored thumbnail, in KB.
   *
   * The arithmetic that matters: a busy gate sees ~50 vehicles a day, and an
   * SVGA capture is 60-100 KB, which base64 inflates by a third. At 30 days of
   * images that is roughly 200 MB — real, but survivable on the 20 GB minimum
   * disk in Docs/12-vm-runbook.md alongside telemetry. Anything over the cap is
   * recorded without its image rather than stored truncated, because a
   * half-written JPEG renders as a grey box and looks like a camera fault.
   */
  ANPR_THUMBNAIL_MAX_KB: z.coerce.number().min(0).max(2048).default(96),
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
  /**
   * Live video frames (cameras). Deliberately NOT `telemetry`: every telemetry
   * message is INSERTed into Postgres, so a 15fps camera would write ~54,000
   * rows an hour holding whole JPEGs. Frames are raw binary, QoS 0, never
   * retained and never persisted — they are fanned out to watching WebSocket
   * clients and then dropped.
   */
  frame: (deviceId: string) => `cv/${deviceId}/frame`,
  /**
   * ANPR vehicle captures. A separate topic from `frame` because the two have
   * opposite delivery rules: a frame is dropped unless somebody is watching
   * live, whereas a capture must be processed precisely when nobody is
   * watching — that is the entire point of an unattended gate camera. Reusing
   * `frame` would mean plates were only ever read while an operator happened
   * to have the live view open.
   *
   * Binary, QoS 0, never retained. The payload is a 16-byte header followed by
   * the JPEG; see `anpr/protocol.ts` and the `AnprHeader` struct in
   * firmware/anpr-cam/anpr-cam.ino.
   */
  anpr: (deviceId: string) => `cv/${deviceId}/anpr`,
  // Wildcards the control-plane subscribes to.
  allState: "cv/+/state",
  allTelemetry: "cv/+/telemetry",
  allStatus: "cv/+/status",
  allFrames: "cv/+/frame",
  allAnpr: "cv/+/anpr",
};

/** Extract the deviceId from an inbound topic like cv/<id>/state. */
export function deviceIdFromTopic(topic: string): string | null {
  const parts = topic.split("/");
  return parts.length === 3 && parts[0] === "cv" ? parts[1] : null;
}
