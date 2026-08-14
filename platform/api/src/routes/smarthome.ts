/**
 * Google Home and Alexa fulfilment.
 *
 * ONE PUBLISHED INTEGRATION, EVERY CUSTOMER
 *
 * There is a single Google Action and a single Alexa skill. A customer links
 * their own Circuvent account, and their OAuth token resolves to their user
 * id, so the same endpoints serve everybody while each request only ever sees
 * one account's devices. Nothing here is per-device or per-customer.
 *
 * What a device looks like to an assistant lives in `../smarthome/traits`,
 * which is pure and tested. This file is the protocol around it: authenticate,
 * fetch that user's devices, translate, publish.
 */
import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { pool } from "../db";
import { publishCommand } from "../mqtt";
import { logger } from "../logger";
import { verifySmartHomeToken } from "./oauth";
import { onlineColumn } from "../device-online";
import {
  alexaCategoryFor,
  brightness,
  fanSpeed,
  googleState,
  googleSyncEntry,
  googleTypeFor,
  isExposed,
  onOff,
  type DeviceLike,
} from "../smarthome/traits";
import { recordLink, unlink } from "../smarthome/links";
import { acceptGrant, alexaEventsConfigured } from "../smarthome/alexa-events";
import { googlePushConfigured } from "../smarthome/homegraph";

export const smarthomeRouter = Router();

/**
 * Answering a browser that lands on a fulfilment endpoint.
 *
 * These accept POST from Google's and Amazon's servers and nothing else, so a
 * GET fell through to the catch-all and answered `{"error":"Not found"}`.
 * That is the wrong status and, worse, the wrong story: the endpoint exists
 * and is healthy, and "Not found" reads as a broken deployment.
 *
 * It is not hypothetical. Anybody diagnosing a linking problem pastes the
 * fulfilment URL into a browser first, and so does a certification reviewer —
 * so the natural first check said the integration was missing while it was
 * working perfectly. 405 with `Allow` is the honest answer, and the message
 * says plainly that seeing it means things are fine.
 */
function postOnly(what: string, expects: string) {
  return (_req: Request, res: Response) => {
    res
      .status(405)
      .set("Allow", "POST")
      .json({
        error: "method_not_allowed",
        endpoint: what,
        expects,
        message: `This is the ${what}. It answers POST from ${expects} and nothing else — seeing this in a browser means it is deployed and working.`,
        health: "https://api.circuvent.com/health",
      });
  };
}

smarthomeRouter.get("/google", postOnly("Google Home fulfilment endpoint", "Google's servers"));
smarthomeRouter.get("/alexa", postOnly("Alexa Smart Home fulfilment endpoint", "the Alexa skill's Lambda"));

/* Re-exported for the existing typing test, which asserts a pump is never a
   plain switch. The definitions moved to traits.ts so the fulfilment and the
   proactive reporter cannot disagree about what a device is. */
export { googleTypeFor, alexaCategoryFor };

/** Publish a device command and best-effort log it to the audit trail. */
function sendCommand(deviceId: string, uid: number, payload: Record<string, unknown>): void {
  publishCommand(deviceId, payload);
  void pool
    .query(`INSERT INTO commands (device_id, user_id, payload) VALUES ($1, $2, $3)`, [deviceId, uid, payload])
    .catch((err) => logger.error({ err, deviceId }, "smart-home command audit insert failed"));
}

type Dev = DeviceLike & { room: string };

async function ownerDevices(uid: number): Promise<Dev[]> {
  const { rows } = await pool.query<Dev>(
    `SELECT id, name, type, room, ${onlineColumn()}, state FROM devices WHERE owner_id = $1 ORDER BY created_at`,
    [uid]
  );
  return rows;
}

async function bearerUid(req: Request): Promise<number | null> {
  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) return verifySmartHomeToken(h.slice(7).trim());
  return null;
}

// ------------------------------------------------------------- Google Home --

smarthomeRouter.post("/google", async (req: Request, res: Response) => {
  const uid = await bearerUid(req);
  const reqId = req.body?.requestId ?? "";
  if (uid == null) {
    res.status(401).json({ requestId: reqId, payload: { errorCode: "authFailure" } });
    return;
  }
  const input = req.body?.inputs?.[0];
  const intent = input?.intent;

  /*
   * DISCONNECT first, and before any device query.
   *
   * Google sends this when the customer removes Circuvent from their Home
   * app. It used to answer an empty 200 and revoke nothing, so somebody who
   * had plainly said "stop" kept a working 90-day refresh token. Unlinking
   * bumps the account's token epoch — the same kill switch "sign out
   * everywhere" uses — so the grant dies immediately.
   */
  if (intent === "action.devices.DISCONNECT") {
    try {
      await unlink(uid, "google");
    } catch (err) {
      /* Google expects an empty body and retries on an error. Retrying will
         not help if the database is down, and the customer has already been
         told in Google's UI that it is unlinked — so log loudly and accept. */
      logger.error({ err, uid }, "google DISCONNECT could not revoke");
    }
    res.json({});
    return;
  }

  const devs = await ownerDevices(uid);

  if (intent === "action.devices.SYNC") {
    /* Recorded on SYNC as well as on token exchange: SYNC is the first thing
       Google does after linking, and it is the only signal that survives a
       re-link which reused an existing token. */
    void recordLink(uid, "google");
    const list = devs.filter((d) => isExposed(d.type)).map((d) => googleSyncEntry(d, googlePushConfigured()));
    res.json({ requestId: reqId, payload: { agentUserId: String(uid), devices: list } });
    return;
  }

  if (intent === "action.devices.QUERY") {
    const ids: string[] = (input.payload?.devices ?? []).map((d: { id: string }) => d.id);
    const states: Record<string, unknown> = {};
    for (const id of ids) {
      const d = devs.find((x) => x.id === id);
      states[id] = d ? googleState(d) : { online: false, status: "ERROR" };
    }
    res.json({ requestId: reqId, payload: { devices: states } });
    return;
  }

  if (intent === "action.devices.EXECUTE") {
    const results: Array<{ ids: string[]; status: string; states?: unknown; errorCode?: string }> = [];
    for (const c of input.payload?.commands ?? []) {
      for (const dv of c.devices ?? []) {
        const d = devs.find((x) => x.id === dv.id);
        if (!d || !isExposed(d.type)) {
          results.push({ ids: [dv.id], status: "ERROR", errorCode: "deviceNotFound" });
          continue;
        }
        /*
         * Offline is reported as such rather than as success.
         *
         * Publishing to a device that is not connected leaves the command in
         * the broker and tells Google it worked, so the assistant says "OK"
         * about a lamp that will not move until the board comes back — which
         * may be never. deviceOffline is a phrase Google speaks aloud.
         */
        if (!d.online) {
          results.push({ ids: [d.id], status: "OFFLINE", errorCode: "deviceOffline" });
          continue;
        }
        for (const ex of c.execution ?? []) {
          const m = onOff(d.type);
          if (ex.command === "action.devices.commands.OnOff" && m) {
            const on = !!ex.params?.on;
            sendCommand(d.id, uid, { action: "set", ...m.cmd(on) });
            results.push({ ids: [d.id], status: "SUCCESS", states: { on, online: true } });
            continue;
          }
          const b = brightness(d.type);
          if (ex.command === "action.devices.commands.BrightnessAbsolute" && b) {
            const level = Number(ex.params?.brightness) || 0;
            sendCommand(d.id, uid, b.cmd(level));
            /* Brightness above zero implies on, and the firmware turns the
               load on when it receives one. Reporting `on` keeps Google's
               model in step without waiting for the echo. */
            results.push({
              ids: [d.id],
              status: "SUCCESS",
              states: { on: level > 0, brightness: level, online: true },
            });
            continue;
          }
          const f = fanSpeed(d.type);
          if (
            f &&
            (ex.command === "action.devices.commands.SetFanSpeed" ||
              ex.command === "action.devices.commands.SetFanSpeedRelative")
          ) {
            const named = { S1: 33, S2: 66, S3: 100 } as Record<string, number>;
            const pct =
              ex.params?.fanSpeedPercent != null
                ? Number(ex.params.fanSpeedPercent)
                : /* A named speed — "set the fan to low". The names are the
                     firmware's positions, mapped through the same table the
                     slider uses so voice and the app mean the same airflow. */
                  named[String(ex.params?.fanSpeed ?? "")] ?? f.toPercent(d.state);
            sendCommand(d.id, uid, f.cmd(pct));
            results.push({
              ids: [d.id],
              status: "SUCCESS",
              states: { on: pct > 0, currentFanSpeedPercent: pct, online: true },
            });
            continue;
          }
          results.push({ ids: [d.id], status: "ERROR", errorCode: "functionNotSupported" });
        }
      }
    }
    res.json({ requestId: reqId, payload: { commands: results } });
    return;
  }

  res.status(400).json({ requestId: reqId, payload: { errorCode: "notSupported" } });
});

// ------------------------------------------------------------------ Alexa ---

function aHeader(namespace: string, name: string, correlationToken?: string) {
  return {
    namespace,
    name,
    payloadVersion: "3",
    messageId: crypto.randomUUID(),
    ...(correlationToken ? { correlationToken } : {}),
  };
}

function alexaEndpoint(d: Dev) {
  /*
   * Same reasoning as googleTypeFor: Alexa groups by display category, so a
   * pump categorised as a SWITCH joins "turn everything off" and every
   * goodnight routine. WATER_HEATER is the category Alexa keeps out of those
   * sweeps, and it is the honest description of a tank pump's role in a house.
   */
  const cat = alexaCategoryFor(d.type);
  /* Only claimed when the server can actually push. Advertising
     proactivelyReported while nothing reports leaves Alexa waiting for updates
     that never arrive. */
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
    /* PercentageController rather than RangeController: "set the fan to fifty
       per cent" is the phrasing people use, and it needs no custom resource
       strings to be certified. */
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
    displayCategories: [cat],
    capabilities,
  };
}

/** Every property Alexa can retrieve for a device, in one place. */
function alexaProps(d: Dev): Array<Record<string, unknown>> {
  const now = new Date().toISOString();
  const props: Array<Record<string, unknown>> = [];
  const m = onOff(d.type);
  if (m) {
    props.push({
      namespace: "Alexa.PowerController",
      name: "powerState",
      value: d.state[m.field] ? "ON" : "OFF",
      timeOfSample: now,
      uncertaintyInMilliseconds: 500,
    });
  }
  const b = brightness(d.type);
  if (b && d.state[b.field] != null) {
    props.push({
      namespace: "Alexa.BrightnessController",
      name: "brightness",
      value: Math.max(0, Math.min(100, Number(d.state[b.field]) || 0)),
      timeOfSample: now,
      uncertaintyInMilliseconds: 500,
    });
  }
  const f = fanSpeed(d.type);
  if (f) {
    props.push({
      namespace: "Alexa.PercentageController",
      name: "percentage",
      value: f.toPercent(d.state),
      timeOfSample: now,
      uncertaintyInMilliseconds: 500,
    });
  }
  props.push({
    namespace: "Alexa.EndpointHealth",
    name: "connectivity",
    value: { value: d.online ? "OK" : "UNREACHABLE" },
    timeOfSample: now,
    uncertaintyInMilliseconds: 500,
  });
  return props;
}

smarthomeRouter.post("/alexa", async (req: Request, res: Response) => {
  const dir = req.body?.directive;
  const header = dir?.header || {};
  const ns = header.namespace;
  /* AcceptGrant carries the token under `grantee` rather than `scope`, which
     is the sort of detail that makes a directive fail authentication for no
     visible reason. */
  const token = dir?.payload?.scope?.token || dir?.endpoint?.scope?.token || dir?.payload?.grantee?.token;
  const uid = token ? await verifySmartHomeToken(token) : null;

  const errorResp = (type: string, message: string) => ({
    event: {
      header: aHeader("Alexa", "ErrorResponse", header.correlationToken),
      endpoint: dir?.endpoint,
      payload: { type, message },
    },
  });

  if (uid == null) {
    res.json(errorResp("INVALID_AUTHORIZATION_CREDENTIAL", "Invalid or expired token"));
    return;
  }

  /*
   * AcceptGrant — handled before anything that needs a device.
   *
   * Alexa sends this once when the skill is enabled, carrying an
   * authorization code we exchange for a refresh token belonging to that
   * customer's Amazon account. That token is issued once and never repeated:
   * lose it and proactive updates stop for them until they disable and
   * re-enable the skill.
   */
  if (ns === "Alexa.Authorization" && header.name === "AcceptGrant") {
    const code = dir?.payload?.grant?.code;
    const ok = typeof code === "string" && (await acceptGrant(uid, code));
    if (!ok) {
      res.json({
        event: {
          header: aHeader("Alexa.Authorization", "ErrorResponse"),
          payload: {
            type: "ACCEPT_GRANT_FAILED",
            message: "Could not store the grant needed to send device updates.",
          },
        },
      });
      return;
    }
    await recordLink(uid, "alexa");
    res.json({ event: { header: aHeader("Alexa.Authorization", "AcceptGrant.Response"), payload: {} } });
    return;
  }

  const devs = await ownerDevices(uid);

  if (ns === "Alexa.Discovery" && header.name === "Discover") {
    void recordLink(uid, "alexa");
    const endpoints = devs.filter((d) => isExposed(d.type)).map(alexaEndpoint);
    res.json({ event: { header: aHeader("Alexa.Discovery", "Discover.Response"), payload: { endpoints } } });
    return;
  }

  const id = dir?.endpoint?.endpointId;
  const d = devs.find((x) => x.id === id);
  if (!d || !isExposed(d.type)) {
    res.json(errorResp("NO_SUCH_ENDPOINT", "Unknown device"));
    return;
  }

  const respond = () => {
    res.json({
      context: { properties: alexaProps(d) },
      event: {
        header: aHeader("Alexa", "Response", header.correlationToken),
        endpoint: { endpointId: d.id },
        payload: {},
      },
    });
  };

  /*
   * Offline is an error Alexa speaks aloud, rather than a silent success on a
   * device that will not move. ReportState is exempt: asking the state of an
   * unreachable device is a reasonable question with a truthful answer.
   */
  const isReportState = ns === "Alexa" && header.name === "ReportState";
  if (!isReportState && !d.online) {
    res.json(errorResp("ENDPOINT_UNREACHABLE", `${d.name || d.id} is offline.`));
    return;
  }

  const m = onOff(d.type);
  if (ns === "Alexa.PowerController" && m && (header.name === "TurnOn" || header.name === "TurnOff")) {
    const on = header.name === "TurnOn";
    sendCommand(d.id, uid, { action: "set", ...m.cmd(on) });
    /* The optimistic value, because the echo has not arrived yet and Alexa
       reads the context to decide what to say. */
    d.state = { ...d.state, [m.field]: on };
    respond();
    return;
  }

  const b = brightness(d.type);
  if (ns === "Alexa.BrightnessController" && b) {
    const current = Number(d.state[b.field]) || 0;
    const next =
      header.name === "SetBrightness"
        ? Number(dir?.payload?.brightness) || 0
        : Math.max(0, Math.min(100, current + (Number(dir?.payload?.brightnessDelta) || 0)));
    sendCommand(d.id, uid, b.cmd(next));
    d.state = { ...d.state, [b.field]: next, power: next > 0 };
    respond();
    return;
  }

  const f = fanSpeed(d.type);
  if (ns === "Alexa.PercentageController" && f) {
    const current = f.toPercent(d.state);
    const next =
      header.name === "SetPercentage"
        ? Number(dir?.payload?.percentage) || 0
        : Math.max(0, Math.min(100, current + (Number(dir?.payload?.percentageDelta) || 0)));
    sendCommand(d.id, uid, f.cmd(next));
    d.state = { ...d.state, level: next, power: next > 0 };
    respond();
    return;
  }

  if (isReportState) {
    res.json({
      context: { properties: alexaProps(d) },
      event: {
        header: aHeader("Alexa", "StateReport", header.correlationToken),
        endpoint: { endpointId: d.id },
        payload: {},
      },
    });
    return;
  }

  res.json(errorResp("INVALID_DIRECTIVE", `Unsupported directive ${ns}/${header.name}`));
});
