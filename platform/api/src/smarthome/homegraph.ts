/**
 * Talking back to Google — Request Sync and Report State.
 *
 * WHAT THESE FIX, IN THE CUSTOMER'S WORDS
 *
 * "I bought another plug and Google can't see it." Without Request Sync,
 * Google's copy of a home's device list is only refreshed when the user thinks
 * to say "sync my devices" or re-links the account. Every device anyone adds
 * is invisible until then, and nothing tells them why.
 *
 * "The app says the lamp is off but it's on." Without Report State, Google
 * only learns a device's state when it asks. A switch pressed on the wall, a
 * schedule firing, an automation running — none of it reaches Google, so the
 * Home app shows a stale value and any routine keyed on state does the wrong
 * thing.
 *
 * OPTIONAL, AND SAYS SO
 *
 * Both need a HomeGraph service-account key, which is a deployment decision
 * rather than a code one. With no key configured this module does nothing and
 * reports that it is unconfigured, in the same shape as ANPR and the face
 * embedder — the alternative is a feature that appears to work and silently
 * never fires, which is the failure this codebase keeps finding.
 */
import { createSign } from "node:crypto";
import { config } from "../config";
import { logger } from "../logger";

const HOMEGRAPH = "https://homegraph.googleapis.com/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/homegraph";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let cachedAccount: ServiceAccount | null | undefined;

/**
 * The service-account key, parsed once.
 *
 * `undefined` means "not looked at yet", `null` means "looked and there isn't
 * one". Telling those apart stops a malformed key being re-parsed and
 * re-logged on every state change in the house.
 */
function serviceAccount(): ServiceAccount | null {
  if (cachedAccount !== undefined) return cachedAccount;
  const raw = config.GOOGLE_HOMEGRAPH_KEY.trim();
  if (!raw) {
    cachedAccount = null;
    return null;
  }
  try {
    /* Accepts the JSON itself or base64 of it. A private key pasted into an
       env file loses its newlines often enough that base64 is the shape most
       deployments end up using. */
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) throw new Error("missing client_email or private_key");
    cachedAccount = { ...parsed, private_key: parsed.private_key.replace(/\\n/g, "\n") };
  } catch (err) {
    logger.error({ err }, "GOOGLE_HOMEGRAPH_KEY is set but could not be parsed; Google sync/report disabled");
    cachedAccount = null;
  }
  return cachedAccount;
}

/** Whether Google can be pushed to at all. */
export function googlePushConfigured(): boolean {
  return serviceAccount() !== null;
}

/** Why it is not configured, in words meant for an operator. */
export function googlePushReason(): string {
  return googlePushConfigured()
    ? ""
    : "Set GOOGLE_HOMEGRAPH_KEY to a HomeGraph service-account JSON key to push device changes to Google.";
}

let token: { value: string; expiresAt: number } | null = null;

/** A HomeGraph access token, minted from the service account and cached. */
async function accessToken(): Promise<string | null> {
  const sa = serviceAccount();
  if (!sa) return null;
  /* Sixty seconds of slack: a token that expires in transit produces a 401
     that looks exactly like a bad key. */
  if (token && Date.now() < token.expiresAt - 60_000) return token.value;

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${signer.sign(sa.private_key, "base64url")}`;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !body.access_token) {
      logger.error({ status: res.status, body }, "HomeGraph token request failed");
      return null;
    }
    token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  } catch (err) {
    logger.error({ err }, "HomeGraph token request failed");
    return null;
  }
}

/**
 * Tells Google to re-read a user's device list.
 *
 * Called when devices are claimed, renamed, moved or removed. Google
 * rate-limits this per agent user, so callers debounce rather than firing once
 * per device in a bulk import.
 */
export async function requestSync(userId: number): Promise<boolean> {
  const t = await accessToken();
  if (!t) return false;
  try {
    const res = await fetch(`${HOMEGRAPH}/devices:requestSync`, {
      method: "POST",
      headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
      body: JSON.stringify({ agentUserId: String(userId), async: true }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      /*
       * 404 here means Google has no record of this agent user — they have not
       * linked, or have unlinked. Not an error worth alerting on: it is the
       * normal state for most accounts, and logging it at error level would
       * bury the real failures.
       */
      if (res.status === 404) {
        logger.debug({ userId }, "requestSync: user not linked to Google");
        return false;
      }
      logger.warn({ userId, status: res.status, text: text.slice(0, 200) }, "requestSync failed");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err, userId }, "requestSync failed");
    return false;
  }
}

export interface StateReport {
  deviceId: string;
  state: Record<string, unknown>;
}

/**
 * Pushes current device state to Google.
 *
 * Batched per user: one call carrying every changed device, because HomeGraph
 * counts requests rather than devices and a house turning off ten lamps at
 * once should not be ten calls.
 */
export async function reportState(userId: number, reports: StateReport[]): Promise<boolean> {
  if (!reports.length) return false;
  const t = await accessToken();
  if (!t) return false;

  const states: Record<string, unknown> = {};
  for (const r of reports) states[r.deviceId] = r.state;

  try {
    const res = await fetch(`${HOMEGRAPH}/devices:reportStateAndNotification`, {
      method: "POST",
      headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
      body: JSON.stringify({
        /* Google requires this to be unique per request and uses it to discard
           duplicates and to order reports that arrive out of sequence. */
        requestId: `cv-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        agentUserId: String(userId),
        payload: { devices: { states } },
      }),
    });
    if (!res.ok) {
      if (res.status === 404) return false; // not linked; see requestSync
      const text = await res.text().catch(() => "");
      logger.warn({ userId, status: res.status, text: text.slice(0, 200) }, "reportState failed");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err, userId }, "reportState failed");
    return false;
  }
}

/** Test seam: drops the parsed key and token so config changes take effect. */
export function resetHomegraphCache(): void {
  cachedAccount = undefined;
  token = null;
}
