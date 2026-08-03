import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { pool } from "./db";
import { bus, type DeviceUpdate } from "./mqtt";
import { logger } from "./logger";

/**
 * Outbound webhooks.
 *
 * Polling /v1/devices on a timer is the only alternative, and it is worse in
 * both directions: the developer learns about a tripped sensor up to a poll
 * interval late, and we serve a request per client per interval whether or not
 * anything changed. A webhook delivers the same fact once, when it happens.
 */

export const WEBHOOK_EVENTS = [
  "device.state",
  "device.telemetry",
  "device.online",
  "device.offline",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const EVENT_SET = new Set<string>(WEBHOOK_EVENTS);
export function isWebhookEvent(s: string): s is WebhookEvent {
  return EVENT_SET.has(s);
}

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("base64url")}`;
}

/**
 * Signs a delivery, Stripe-style: `t=<unix>,v1=<hex hmac of "t.body">`.
 *
 * The timestamp is inside the signed material, not merely alongside it, so a
 * captured delivery cannot be replayed later with a fresh timestamp — changing
 * t invalidates v1. Receivers should reject deliveries older than a few
 * minutes; the docs say so and show the check.
 */
export function signWebhook(secret: string, body: string, timestampSec: number): string {
  const mac = crypto.createHmac("sha256", secret).update(`${timestampSec}.${body}`).digest("hex");
  return `t=${timestampSec},v1=${mac}`;
}

/**
 * Rejects URLs that resolve to an address inside the infrastructure.
 *
 * A webhook URL is attacker-chosen by definition — any signed-up account can
 * set one — and the server fetches it. Without this check that is a
 * server-side request forgery primitive pointed at our own network: the
 * cloud metadata endpoint at 169.254.169.254, the Postgres and Mosquitto
 * containers on the private network, anything bound to localhost.
 *
 * DNS is resolved here and the resolved addresses are checked, not just the
 * hostname, because a hostname an attacker controls can simply have an A
 * record pointing at 127.0.0.1.
 *
 * This still leaves a DNS-rebinding window between this check and the fetch.
 * Closing that fully means pinning the connection to the address we validated,
 * which Node's fetch does not expose. The practical mitigations are that
 * deliveries are POST-only with a signed body and their responses are never
 * shown to the user — only the status code is stored — so a rebind yields a
 * blind request rather than a read primitive.
 */
export async function isPublicUrl(raw: string): Promise<{ ok: boolean; reason?: string }> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "Not a valid URL." };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "Webhook URLs must use https." };

  let addrs: string[];
  try {
    const res = await dns.lookup(u.hostname, { all: true });
    addrs = res.map((r) => r.address);
  } catch {
    return { ok: false, reason: "That hostname does not resolve." };
  }
  if (!addrs.length) return { ok: false, reason: "That hostname does not resolve." };
  for (const a of addrs) {
    if (isPrivateAddress(a)) return { ok: false, reason: "That address is not publicly routable." };
  }
  return { ok: true };
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true; // link-local + cloud metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    if (p[0] >= 224) return true; // multicast + reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    if (s === "::1" || s === "::") return true;
    if (s.startsWith("fe80")) return true; // link-local
    if (s.startsWith("fc") || s.startsWith("fd")) return true; // unique-local
    // IPv4-mapped (::ffff:10.0.0.1) must be judged as the IPv4 it contains.
    const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateAddress(m[1]);
    return false;
  }
  return true; // unparseable — refuse rather than guess
}

interface HookRow {
  id: string | number;
  url: string;
  secret: string;
  events: string[] | null;
  device_ids: string[] | null;
  failures: number;
}

/** Consecutive failures before a webhook is switched off. */
const DISABLE_AFTER = 20;
const DELIVERY_TIMEOUT_MS = 5_000;
const MAX_QUEUE = 500;

/**
 * Device owners, memoised. Every inbound MQTT message would otherwise cost a
 * lookup here even for the overwhelming majority of accounts that have no
 * webhooks at all.
 */
const ownerCache = new Map<string, { uid: number | null; expires: number }>();
const OWNER_TTL_MS = 30_000;

async function ownerOf(deviceId: string): Promise<number | null> {
  const hit = ownerCache.get(deviceId);
  if (hit && Date.now() < hit.expires) return hit.uid;
  const { rows } = await pool.query<{ owner_id: string | null }>(
    `SELECT owner_id FROM devices WHERE id = $1`,
    [deviceId]
  );
  const uid = rows[0]?.owner_id == null ? null : Number(rows[0].owner_id);
  ownerCache.set(deviceId, { uid, expires: Date.now() + OWNER_TTL_MS });
  return uid;
}

export function invalidateWebhookOwner(deviceId: string): void {
  ownerCache.delete(deviceId);
}

/**
 * Accounts known to have at least one enabled webhook.
 *
 * Refreshed on a timer rather than queried per message. Without this every
 * state publish from every device in the fleet would run a SELECT against
 * `webhooks` — thousands of queries a minute to discover, almost always, that
 * there is nothing to deliver.
 */
let hookOwners = new Set<number>();
let refreshTimer: ReturnType<typeof setInterval> | undefined;

async function refreshOwners(): Promise<void> {
  try {
    const { rows } = await pool.query<{ owner_id: string }>(
      `SELECT DISTINCT owner_id FROM webhooks WHERE enabled`
    );
    hookOwners = new Set(rows.map((r) => Number(r.owner_id)));
  } catch (err) {
    logger.error({ err }, "webhook owner refresh failed");
  }
}

/** Called after any webhook create/update/delete so changes take effect now. */
export function refreshWebhookOwners(): void {
  void refreshOwners();
}

let queue = 0;

function eventFor(u: DeviceUpdate): WebhookEvent | null {
  if (u.kind === "state") return "device.state";
  if (u.kind === "telemetry") return "device.telemetry";
  if (u.kind === "status") {
    return (u.payload as { online?: boolean }).online ? "device.online" : "device.offline";
  }
  return null;
}

async function dispatch(u: DeviceUpdate): Promise<void> {
  const event = eventFor(u);
  if (!event) return;

  const uid = await ownerOf(u.deviceId);
  if (uid == null || !hookOwners.has(uid)) return;

  const { rows } = await pool.query<HookRow>(
    `SELECT id, url, secret, events, device_ids, failures
       FROM webhooks WHERE owner_id = $1 AND enabled`,
    [uid]
  );

  for (const h of rows) {
    const events = h.events ?? [];
    if (events.length && !events.includes(event)) continue;
    const ids = h.device_ids ?? [];
    if (ids.length && !ids.includes(u.deviceId)) continue;
    void deliver(h, event, u);
  }
}

async function deliver(h: HookRow, event: WebhookEvent, u: DeviceUpdate): Promise<void> {
  // A burst from a chatty fleet must not queue unbounded deliveries and take
  // the process down with it. Dropping is the right failure here: webhooks are
  // best-effort notifications of a state that /v1/devices can always re-read.
  if (queue >= MAX_QUEUE) return;
  queue += 1;
  try {
    const body = JSON.stringify({
      id: `evt_${crypto.randomBytes(12).toString("base64url")}`,
      event,
      deviceId: u.deviceId,
      data: u.payload,
      at: u.at,
    });
    const ts = Math.floor(Date.now() / 1000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    let status = 0;
    let error = "";
    try {
      const res = await fetch(h.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Circuvent-Webhooks/1",
          "x-circuvent-event": event,
          "x-circuvent-signature": signWebhook(h.secret, body, ts),
        },
        body,
        signal: controller.signal,
        redirect: "error", // a 302 to 127.0.0.1 would defeat isPublicUrl
      });
      status = res.status;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message.slice(0, 200) : "delivery failed";
    } finally {
      clearTimeout(timer);
    }

    const ok = status >= 200 && status < 300;
    if (ok) {
      await pool.query(
        `UPDATE webhooks SET failures = 0, last_status = $2, last_error = '', last_at = now() WHERE id = $1`,
        [h.id, status]
      );
    } else {
      const failures = h.failures + 1;
      // Switching a broken endpoint off is not tidiness: a webhook pointed at
      // a dead host would otherwise burn a socket and five seconds per device
      // message, for every message, forever.
      const disable = failures >= DISABLE_AFTER;
      await pool.query(
        `UPDATE webhooks
            SET failures = $2, last_status = $3, last_error = $4, last_at = now(),
                enabled = CASE WHEN $5 THEN false ELSE enabled END
          WHERE id = $1`,
        [h.id, failures, status || null, error, disable]
      );
      if (disable) {
        logger.warn({ webhookId: h.id, url: h.url }, "webhook disabled after repeated failures");
        refreshWebhookOwners();
      }
    }
  } catch (err) {
    logger.error({ err }, "webhook delivery bookkeeping failed");
  } finally {
    queue -= 1;
  }
}

/** Wires webhook delivery to the device bus. Call once at boot. */
export function startWebhooks(): void {
  void refreshOwners();
  refreshTimer = setInterval(refreshOwners, 30_000);
  refreshTimer.unref?.();
  bus.on("device:update", (u: DeviceUpdate) => {
    void dispatch(u).catch((err) => logger.error({ err }, "webhook dispatch failed"));
  });
  logger.info("Webhook dispatcher started");
}
