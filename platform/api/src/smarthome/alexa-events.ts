/**
 * Talking back to Alexa — AcceptGrant and ChangeReport.
 *
 * Alexa's proactive path is more involved than Google's, and the shape is
 * worth stating because it is not guessable:
 *
 *   1. When a user enables the skill, Alexa sends `Alexa.Authorization/
 *      AcceptGrant` carrying an authorization *code*.
 *   2. We exchange that code, using the skill's LWA client id and secret, for
 *      a refresh token belonging to that user's Amazon account.
 *   3. From then on we mint access tokens from that refresh token and POST
 *      events to the regional Alexa event gateway.
 *
 * The refresh token from step 2 is issued once. Lose it and proactive updates
 * stop for that customer until they disable and re-enable the skill — there is
 * no way to ask for it again. That is why `links.saveAlexaGrant` is awaited
 * before the AcceptGrant response is sent rather than fired alongside it.
 *
 * The gateway is regional, and sending to the wrong one fails in a way that
 * looks like a bad token. It is configuration rather than something we can
 * derive, so it is a setting with the North America default.
 */
import { randomUUID } from "node:crypto";
import { config } from "../config";
import { logger } from "../logger";
import { alexaGrant, saveAlexaGrant, updateAlexaAccessToken } from "./links";

const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

/** Whether events can be sent to Alexa at all. */
export function alexaEventsConfigured(): boolean {
  return !!(config.ALEXA_CLIENT_ID && config.ALEXA_CLIENT_SECRET);
}

export function alexaEventsReason(): string {
  return alexaEventsConfigured()
    ? ""
    : "Set ALEXA_CLIENT_ID and ALEXA_CLIENT_SECRET (from the skill's Permissions page) to push device changes to Alexa.";
}

/**
 * Exchanges the AcceptGrant code for a refresh token and stores it.
 *
 * Returns false rather than throwing: a failed exchange must still produce a
 * well-formed AcceptGrant error response, because Alexa retries on a malformed
 * one and gives up on a proper error.
 */
export async function acceptGrant(userId: number, code: string): Promise<boolean> {
  if (!alexaEventsConfigured()) {
    logger.warn({ userId }, "AcceptGrant received but ALEXA_CLIENT_ID/SECRET are not set");
    return false;
  }
  try {
    const res = await fetch(LWA_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: config.ALEXA_CLIENT_ID,
        client_secret: config.ALEXA_CLIENT_SECRET,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!res.ok || !body.refresh_token || !body.access_token) {
      logger.error({ userId, status: res.status, error: body.error }, "AcceptGrant exchange failed");
      return false;
    }
    /* Awaited. See the note at the top: this token is issued once. */
    await saveAlexaGrant(userId, body.refresh_token, body.access_token, body.expires_in ?? 3600);
    return true;
  } catch (err) {
    logger.error({ err, userId }, "AcceptGrant exchange failed");
    return false;
  }
}

/** A usable access token for this user's Alexa account, refreshing if needed. */
async function tokenFor(userId: number): Promise<string | null> {
  if (!alexaEventsConfigured()) return null;
  const grant = await alexaGrant(userId);
  if (!grant) return null;

  const stillValid =
    grant.accessToken &&
    grant.expiresAt &&
    /* A minute of slack, so a token does not expire mid-flight and produce a
       401 indistinguishable from a revoked grant. */
    new Date(grant.expiresAt).getTime() - 60_000 > Date.now();
  if (stillValid) return grant.accessToken;

  try {
    const res = await fetch(LWA_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: grant.refreshToken,
        client_id: config.ALEXA_CLIENT_ID,
        client_secret: config.ALEXA_CLIENT_SECRET,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!res.ok || !body.access_token) {
      logger.warn({ userId, status: res.status, error: body.error }, "Alexa token refresh failed");
      return null;
    }
    await updateAlexaAccessToken(userId, body.access_token, body.expires_in ?? 3600);
    return body.access_token;
  } catch (err) {
    logger.warn({ err, userId }, "Alexa token refresh failed");
    return null;
  }
}

export interface AlexaChange {
  endpointId: string;
  properties: Array<Record<string, unknown>>;
}

/**
 * Sends a ChangeReport for one device.
 *
 * One endpoint per event: unlike Google's batch, Alexa's ChangeReport is
 * scoped to a single endpoint, so a house turning off ten lamps is ten events.
 * That is the protocol rather than a choice, and it is why the caller
 * coalesces rapid changes before getting here.
 *
 * `cause` matters to Alexa's UI. PHYSICAL_INTERACTION is what a wall switch
 * is, and reporting everything as APP_INTERACTION would tell the customer
 * their app did something they did by hand.
 */
export async function sendChangeReport(
  userId: number,
  change: AlexaChange,
  cause: "PHYSICAL_INTERACTION" | "APP_INTERACTION" | "RULE_TRIGGER" | "PERIODIC_POLL" = "PHYSICAL_INTERACTION"
): Promise<boolean> {
  const token = await tokenFor(userId);
  if (!token) return false;

  const event = {
    event: {
      header: {
        namespace: "Alexa",
        name: "ChangeReport",
        payloadVersion: "3",
        messageId: randomUUID(),
      },
      endpoint: {
        scope: { type: "BearerToken", token },
        endpointId: change.endpointId,
      },
      payload: {
        change: {
          cause: { type: cause },
          properties: change.properties,
        },
      },
    },
    /*
     * Alexa expects unchanged properties here rather than in `change`.
     * Repeating the changed ones would be reported as an inconsistency and the
     * event dropped, which is a silent failure — so this stays empty and the
     * caller puts everything it knows into `properties`.
     */
    context: { properties: [] },
  };

  try {
    const res = await fetch(config.ALEXA_EVENT_GATEWAY, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(event),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(
        { userId, status: res.status, text: text.slice(0, 200) },
        "Alexa ChangeReport failed"
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err, userId }, "Alexa ChangeReport failed");
    return false;
  }
}

/**
 * Tells Alexa a user's device list has changed.
 *
 * Alexa's answer to Google's Request Sync. Without it a new plug stays
 * invisible until the customer opens the app and runs Discover by hand, which
 * they have no reason to know they must do.
 */
export async function sendAddOrUpdateReport(
  userId: number,
  endpoints: Array<Record<string, unknown>>
): Promise<boolean> {
  if (!endpoints.length) return false;
  const token = await tokenFor(userId);
  if (!token) return false;

  const event = {
    event: {
      header: {
        namespace: "Alexa.Discovery",
        name: "AddOrUpdateReport",
        payloadVersion: "3",
        messageId: randomUUID(),
      },
      payload: { endpoints, scope: { type: "BearerToken", token } },
    },
  };

  try {
    const res = await fetch(config.ALEXA_EVENT_GATEWAY, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(event),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ userId, status: res.status, text: text.slice(0, 200) }, "Alexa AddOrUpdateReport failed");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err, userId }, "Alexa AddOrUpdateReport failed");
    return false;
  }
}
