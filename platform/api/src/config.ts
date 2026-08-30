import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  MQTT_URL: z.string().default("mqtt://mosquitto:1883"),
  MQTT_USERNAME: z.string().default("control-plane"),
  MQTT_PASSWORD: z.string().min(1, "MQTT_PASSWORD is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  JWT_EXPIRES_IN: z.string().default("24h"),
  CORS_ORIGIN: z.string().default("*"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  // Smart-home (Alexa + Google) account-linking OAuth client.
  SMARTHOME_CLIENT_ID: z.string().default("circuvent-smarthome"),
  SMARTHOME_CLIENT_SECRET: z.string().default(""),
  // Extra redirect URIs allowed during account linking, comma-separated.
  // The built-in Alexa/Google endpoints are always allowed; this is for
  // vendor consoles and local testing. Prefixes are matched exactly.
  SMARTHOME_REDIRECT_URIS: z.string().default(""),
  /*
   * Pushing device changes to Google and Alexa.
   *
   * Both are optional in the same way ANPR is: unset, voice control still
   * works for every customer — they can say "turn on the lamp" and query
   * state — and only the *proactive* half is missing. What that costs is
   * worth being explicit about, because it is what a customer notices:
   * without it a device added today is invisible to the assistant until they
   * think to say "sync my devices", and a switch pressed on the wall leaves
   * the assistant showing a stale value.
   *
   * GOOGLE_HOMEGRAPH_KEY is a HomeGraph service-account JSON key, either raw
   * JSON or base64 of it — a private key pasted into an env file loses its
   * newlines often enough that base64 is the shape most deployments use.
   *
   * ALEXA_CLIENT_ID/SECRET come from the skill's Permissions page (they are
   * Login with Amazon credentials, and are NOT the account-linking client id
   * and secret above — using one for the other is the mistake this comment
   * exists to prevent).
   */
  GOOGLE_HOMEGRAPH_KEY: z.string().default(""),
  ALEXA_CLIENT_ID: z.string().default(""),
  ALEXA_CLIENT_SECRET: z.string().default(""),
  /** Regional Alexa event gateway. Sending to the wrong one looks like a bad token. */
  ALEXA_EVENT_GATEWAY: z.string().default("https://api.amazonalexa.com/v3/events"),
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
   * Single sign-on against the company identity provider.
   *
   * FEDERATION_SECRET above lets a trusted server assert an address; this
   * accepts a token the provider itself signed, which is a different and
   * stronger claim — a leaked client id cannot forge one.
   *
   * Both empty by default. A deployment that has configured neither cannot be
   * talked into minting a session, which is the behaviour to have when the
   * setting is missing rather than merely unset.
   */
  AUTH_ISSUER: z.string().default("https://myaccount.circuvent.com"),
  SSO_CLIENT_ID: z.string().default(""),
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
  /*
   * Face embedding for the FaceDoor lock.
   *
   * Optional, like ANPR above. With "none" everything works except enrolling
   * from a photograph: a hub with its own model still posts descriptors, and
   * enrolment at the door is unaffected. The embedder must be the same model
   * the recogniser uses, or the numbers are not comparable.
   */
  FACE_EMBEDDER: z.enum(["none", "http"]).default("none"),
  FACE_BASE_URL: z.string().default(""),
  FACE_API_KEY: z.string().default(""),
  FACE_TIMEOUT_MS: z.coerce.number().default(10000),

  ANPR_PROVIDER: z.enum(["none", "local", "platerecognizer", "openai", "http"]).default("none"),
  ANPR_BASE_URL: z.string().default(""),
  ANPR_API_KEY: z.string().default(""),
  ANPR_MODEL: z.string().default("gpt-4o-mini"),
  /*
   * The local recogniser: our own, on our own hardware.
   *
   * `local` runs Tesseract as a subprocess against a plate strip this codebase
   * locates and prepares itself. It exists because every hosted ANPR service
   * bills per read, and a gate camera reads continuously for as long as it is
   * mounted — a metered recogniser turns a camera somebody bought into a
   * subscription they did not agree to, and stops working the day a card
   * expires. It also keeps the photographs on the box, which is the whole
   * premise of the retention rules below.
   *
   * It is honestly worse than a purpose-built ANPR model on a moving, angled or
   * dirty plate, and Docs/20-anpr.md says so rather than implying parity.
   */
  ANPR_LOCAL_BINARY: z.string().default("tesseract"),
  ANPR_LOCAL_LANG: z.string().default("eng"),
  /** Per-image ceiling. A hung classifier must not hold an ANPR burst open. */
  ANPR_LOCAL_TIMEOUT_MS: z.coerce.number().default(15000),
  /**
   * Plate-shaped regions attempted per frame before falling back to the whole
   * frame. Each is a subprocess, so this is the CPU budget per frame.
   */
  ANPR_LOCAL_MAX_REGIONS: z.coerce.number().min(1).max(8).default(3),
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
  /*
   * ============================ OBJECT STORAGE =========================
   *
   * Where ANPR captures are kept. Optional, and unset is a supported state:
   * without a bucket the images stay in `plate_reads.thumb` exactly as they
   * always have, bounded by ANPR_THUMBNAIL_MAX_KB above.
   *
   * With a bucket configured the ceiling stops applying — the reason for it
   * was that the bytes were sitting in Postgres, inflated a third by base64,
   * carried by every dump and every replica. `ANPR_IMAGE_MAX_KB` is the
   * separate, much larger ceiling that applies to an object, and exists only
   * to stop a misconfigured camera filling a bucket.
   *
   * S3 and R2 are the same API here. For R2, `R2_ACCOUNT_ID` alone is enough
   * — the endpoint is derived from it — and the region is `auto`. For AWS,
   * set `S3_ENDPOINT` empty, `S3_REGION` to the real region, and
   * `S3_FORCE_PATH_STYLE=false`.
   *
   * THE BUCKET MUST BE PRIVATE, and is a different bucket from the public
   * `circuvent-firmware` one. Firmware has to be fetchable by a device holding
   * no credentials; a photograph of somebody's car must not be fetchable by
   * anyone at all without a session. There is no setting here that publishes
   * it, and `S3_PUBLIC_BASE_URL` is deliberately absent for that reason.
   */
  S3_BUCKET: z.string().default(""),
  S3_ACCESS_KEY_ID: z.string().default(""),
  S3_SECRET_ACCESS_KEY: z.string().default(""),
  /** Full endpoint, e.g. https://<account>.r2.cloudflarestorage.com. */
  S3_ENDPOINT: z.string().default(""),
  /** Cloudflare shorthand: the endpoint is derived when S3_ENDPOINT is empty. */
  R2_ACCOUNT_ID: z.string().default(""),
  /** `auto` for R2. A real region for AWS. */
  S3_REGION: z.string().default("auto"),
  /** R2 requires path-style. S3 accepts it. Set "false" for virtual-hosted. */
  S3_FORCE_PATH_STYLE: z.string().default("true"),
  S3_TIMEOUT_MS: z.coerce.number().default(10000),
  /*
   * Largest capture stored as an object, in KB.
   *
   * Ten times the database ceiling, because the constraint that produced that
   * number is gone. A UXGA capture from an OV2640 at quality 10 is ~250 KB, so
   * 1 MB holds the largest picture the hardware can produce with room to
   * spare, and still refuses a device publishing something that is not a
   * still frame.
   */
  ANPR_IMAGE_MAX_KB: z.coerce.number().min(0).max(16384).default(1024),
  /*
   * Serve captures by redirecting to a presigned URL instead of proxying.
   *
   * Off by default, and the default is the safer one rather than the cheaper
   * one: proxying keeps the image behind the same session check as every other
   * route and never puts a fetchable URL into a browser's history, a referrer
   * header or a screenshot. Turning it on moves the bytes off the VM's uplink,
   * which is worth having on a busy site — the link expires in five minutes,
   * but it is a link.
   */
  S3_PRESIGN_GET: z.string().default("false"),
  /*
   * Sender for the daily report.
   *
   * Separate from EMAIL_FROM, which signs OTP and password-reset mail. Those
   * are transactional and belong to a no-reply identity; a daily operations
   * report is something a facilities manager will hit reply on, and it should
   * arrive from a mailbox a person actually reads.
   *
   * The default matches the indigenous Postfix server in Mail.circuvent —
   * mail.circuvent.com signs circuvent.com with DKIM, so a From on that domain
   * is what passes SPF and DMARC. Setting this to an address on another domain
   * is the fastest way to have every report land in spam.
   */
  REPORT_FROM: z.string().default("Circuvent <info@circuvent.com>"),
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
  /*
   * Drone position batches. A separate topic from `telemetry` for the reason
   * documented on `frame`: every telemetry message is INSERTed into Postgres
   * as JSONB, and an aircraft sampling at 10 Hz would write 36,000 rows an
   * hour holding data that belongs in `flight_track` as columns.
   *
   * Binary, QoS 0, never retained. A retransmitted position from four seconds
   * ago is worth nothing to a moving aircraft, and the batching already
   * provides the redundancy QoS 1 would be buying. The payload is a 16-byte
   * header followed by fixed-size records; see `drone/track.ts` and the
   * `TrackHeader` struct in firmware/drone-link/drone-link.h.
   */
  track: (deviceId: string) => `cv/${deviceId}/track`,
  // Wildcards the control-plane subscribes to.
  allState: "cv/+/state",
  allTelemetry: "cv/+/telemetry",
  allStatus: "cv/+/status",
  allFrames: "cv/+/frame",
  allAnpr: "cv/+/anpr",
  allTrack: "cv/+/track",
};

/** Extract the deviceId from an inbound topic like cv/<id>/state. */
export function deviceIdFromTopic(topic: string): string | null {
  const parts = topic.split("/");
  return parts.length === 3 && parts[0] === "cv" ? parts[1] : null;
}
