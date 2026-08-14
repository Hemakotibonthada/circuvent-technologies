/**
 * Telling the assistants a customer's device list changed.
 *
 * "I bought another plug and Google can't see it" is the complaint this
 * prevents. Google and Alexa each hold their own copy of a home's devices, and
 * without being told they refresh it only when the customer thinks to say
 * "sync my devices" or opens the app and runs Discover — neither of which they
 * have any reason to know they must do.
 *
 * Debounced per user rather than sent per device. Claiming six devices during
 * setup is one list change as far as an assistant is concerned, and Google
 * rate-limits Request Sync per agent user — so firing six would have the last
 * one, the one that matters, rejected.
 */
import { pool } from "../db";
import { logger } from "../logger";
import { isLinked, markSynced } from "./links";
import { googlePushConfigured, requestSync } from "./homegraph";
import { alexaEventsConfigured, sendAddOrUpdateReport } from "./alexa-events";
import { alexaCategoryFor, brightness, fanSpeed, isExposed, type DeviceLike } from "./traits";
import { onlineColumn } from "../device-online";

/**
 * Longer than the state coalescing window.
 *
 * Nobody is watching for a new device to appear within a second — they are
 * still in the setup flow — and a longer window absorbs a whole multi-device
 * onboarding into one call.
 */
const DEBOUNCE_MS = 5_000;

const timers = new Map<number, NodeJS.Timeout>();

/** Whether either assistant can be told about anything. */
export function syncConfigured(): boolean {
  return googlePushConfigured() || alexaEventsConfigured();
}

/**
 * Notes that a user's device list changed — claimed, unclaimed, renamed or
 * moved to another room.
 *
 * Safe to call from a request handler: it returns immediately and does the
 * work on a timer.
 */
export function deviceListChanged(userId: number): void {
  if (!syncConfigured()) return;
  const existing = timers.get(userId);
  if (existing) clearTimeout(existing);
  timers.set(
    userId,
    setTimeout(() => {
      timers.delete(userId);
      void push(userId);
    }, DEBOUNCE_MS).unref()
  );
}

/** Builds the Alexa endpoint shape. Mirrors the Discover handler. */
function alexaEndpoint(d: DeviceLike & { room: string }) {
  const proactive = alexaEventsConfigured();
  const capabilities: Array<Record<string, unknown>> = [
    { type: "AlexaInterface", interface: "Alexa", version: "3" },
    {
      type: "AlexaInterface",
      interface: "Alexa.PowerController",
      version: "3",
      properties: { supported: [{ name: "powerState" }], retrievable: true, proactivelyReported: proactive },
    },
    {
      type: "AlexaInterface",
      interface: "Alexa.EndpointHealth",
      version: "3",
      properties: { supported: [{ name: "connectivity" }], retrievable: true, proactivelyReported: proactive },
    },
  ];
  if (brightness(d.type)) {
    capabilities.push({
      type: "AlexaInterface",
      interface: "Alexa.BrightnessController",
      version: "3",
      properties: { supported: [{ name: "brightness" }], retrievable: true, proactivelyReported: proactive },
    });
  }
  if (fanSpeed(d.type)) {
    capabilities.push({
      type: "AlexaInterface",
      interface: "Alexa.PercentageController",
      version: "3",
      properties: { supported: [{ name: "percentage" }], retrievable: true, proactivelyReported: proactive },
    });
  }
  return {
    endpointId: d.id,
    friendlyName: d.name || d.id,
    description: `Circuvent ${d.type}`,
    manufacturerName: "Circuvent",
    displayCategories: [alexaCategoryFor(d.type)],
    capabilities,
  };
}

async function push(userId: number): Promise<void> {
  try {
    const [google, alexa] = await Promise.all([isLinked(userId, "google"), isLinked(userId, "alexa")]);
    if (!google && !alexa) return;

    if (google && googlePushConfigured()) {
      /*
       * Google is told to come and ask, rather than being handed the list.
       * Request Sync makes it call SYNC, which is the same code path a fresh
       * link takes — so there is one description of a device rather than two
       * that can disagree.
       */
      if (await requestSync(userId)) await markSynced(userId, "google");
    }

    if (alexa && alexaEventsConfigured()) {
      /*
       * Alexa has no equivalent of "come and ask": AddOrUpdateReport carries
       * the endpoints. It also has no removal event that works reliably for
       * skills, so a deleted device lingers in the Alexa app until the
       * customer runs Discover — worth knowing when somebody reports it.
       */
      const { rows } = await pool.query<DeviceLike & { room: string }>(
        `SELECT id, name, type, room, ${onlineColumn()}, state FROM devices WHERE owner_id = $1 ORDER BY created_at`,
        [userId]
      );
      const endpoints = rows.filter((d) => isExposed(d.type)).map(alexaEndpoint);
      if (endpoints.length && (await sendAddOrUpdateReport(userId, endpoints))) {
        await markSynced(userId, "alexa");
      }
    }
  } catch (err) {
    logger.warn({ err, userId }, "assistant device-list sync failed");
  }
}

/** Test seam. */
export function resetSyncTimers(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}
