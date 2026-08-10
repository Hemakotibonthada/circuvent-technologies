/**
 * Web push.
 *
 * The mobile app has had real push for a while — expo-notifications, a
 * push_tokens table, a send path on the control plane. The web had a service
 * worker that cached pages and nothing else, so a browser could never be told
 * anything. An alert raised while nobody had a tab open reached nobody.
 *
 * WHY THE KEYS ARE NOT OPTIONAL AND NOT COMMITTED.
 *
 * VAPID is an identity: the private key is what proves a push came from this
 * application, and anyone holding it can send notifications to every
 * subscriber as us. It lives in the environment. If it is absent this module
 * says so plainly rather than degrading — a push system that silently does
 * nothing is worse than one that is obviously switched off, because the first
 * is discovered when somebody asks why they never got told their hub died.
 *
 * SUBSCRIPTIONS EXPIRE, AND THE ONLY SIGNAL IS A FAILED SEND.
 *
 * A browser discards a subscription when the user clears site data, the push
 * service rotates, or the app is uninstalled. There is no notification of
 * this; the endpoint simply starts returning 404 or 410. Anything that does
 * not delete on those codes accumulates dead endpoints forever and spends
 * longer failing to send with every passing month.
 *
 * SERVER ONLY.
 */
import webpush from "web-push";
import { createFileStore } from "./data-file";
import { logger } from "./logger";

export interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Which account this belongs to, so a push reaches the right person. */
  accountKey: string;
  createdAt: string;
  /** Last time a send to this endpoint succeeded. */
  lastOkAt?: string;
}

interface PushDB {
  subscriptions: StoredSubscription[];
}

const store = createFileStore<PushDB>("web-push.json", () => ({ subscriptions: [] }));

/** True when the keys are present and push can actually be sent. */
export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** The public key a browser needs to subscribe. Safe to serve. */
export function publicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!pushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@circuvent.com",
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string
  );
  configured = true;
  return true;
}

export function saveSubscription(accountKey: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }): void {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return;
  store.mutate((db) => {
    // The endpoint is the identity. Re-subscribing produces the same one, and
    // storing it twice would send every notification twice.
    const existing = db.subscriptions.findIndex((s) => s.endpoint === sub.endpoint);
    const record: StoredSubscription = {
      endpoint: sub.endpoint,
      keys: sub.keys,
      accountKey,
      createdAt: new Date().toISOString(),
    };
    if (existing >= 0) db.subscriptions[existing] = { ...db.subscriptions[existing], ...record };
    else db.subscriptions.push(record);
    return record;
  });
}

export function removeSubscription(endpoint: string): void {
  store.mutate((db) => {
    db.subscriptions = db.subscriptions.filter((s) => s.endpoint !== endpoint);
    return true;
  });
}

export function subscriptionsFor(accountKey: string): StoredSubscription[] {
  return store.read().subscriptions.filter((s) => s.accountKey === accountKey);
}

export interface PushMessage {
  title: string;
  body: string;
  /** Where a tap should land. */
  url?: string;
  /** Collapses repeats of the same underlying problem into one notification. */
  tag?: string;
  severity?: "critical" | "warning" | "info";
  /** Re-alert on a tag that already exists — for an escalation. */
  renotify?: boolean;
}

export interface PushResult {
  sent: number;
  failed: number;
  removed: number;
  configured: boolean;
}

/**
 * Send to every browser this account has registered.
 *
 * Dead endpoints are deleted rather than retried. 404 and 410 mean the
 * subscription is gone for good, and keeping it means every future send spends
 * time failing on it.
 */
export async function sendToAccount(accountKey: string, message: PushMessage): Promise<PushResult> {
  if (!ensureConfigured()) {
    logger.warn("push.web_unconfigured", {
      detail: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set, so no browser notification was sent.",
    });
    return { sent: 0, failed: 0, removed: 0, configured: false };
  }

  const subs = subscriptionsFor(accountKey);
  if (!subs.length) return { sent: 0, failed: 0, removed: 0, configured: true };

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url ?? "/smarthome",
    tag: message.tag,
    severity: message.severity ?? "info",
    renotify: Boolean(message.renotify),
  });

  let sent = 0;
  let failed = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          removeSubscription(s.endpoint);
          removed++;
        } else {
          failed++;
          logger.warn("push.web_send_failed", { status: status ?? 0 });
        }
      }
    })
  );

  return { sent, failed, removed, configured: true };
}
