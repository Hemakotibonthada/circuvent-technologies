import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { pool } from "../db";
import { publishCommand } from "../mqtt";
import { logger } from "../logger";
import { verifySmartHomeToken } from "./oauth";
import { onlineColumn } from "../device-online";

export const smarthomeRouter = Router();

/** Publish a device command and best-effort log it to the audit trail. */
function sendCommand(deviceId: string, uid: number, payload: Record<string, unknown>): void {
  publishCommand(deviceId, payload);
  void pool
    .query(`INSERT INTO commands (device_id, user_id, payload) VALUES ($1, $2, $3)`, [deviceId, uid, payload])
    .catch((err) => logger.error({ err, deviceId }, "smart-home command audit insert failed"));
}

interface Dev {
  id: string;
  name: string;
  type: string;
  room: string;
  online: boolean;
  state: Record<string, unknown>;
}

async function ownerDevices(uid: number): Promise<Dev[]> {
  const { rows } = await pool.query<Dev>(
    `SELECT id, name, type, room, ${onlineColumn()}, state FROM devices WHERE owner_id = $1 ORDER BY created_at`,
    [uid]
  );
  return rows;
}

/** On/off mapping per device type. Returns null for non-switchable devices. */
function onOff(type: string): { field: string; cmd: (v: boolean) => Record<string, unknown> } | null {
  switch (type) {
    case "smart-plug":
    case "smart-switch":
    case "smart-light":
    case "smart-fan":
      return { field: "power", cmd: (v) => ({ power: v }) };
    case "agri-starter":
    case "aquaguard":
      return { field: "pump", cmd: (v) => ({ pump: v }) };
    case "home-hub":
      return { field: "power", cmd: (v) => ({ ch: 0, on: v }) };
    case "sentinel":
      return { field: "r1", cmd: (v) => ({ r1: v }) };
    default:
      return null;
  }
}

function bearerUid(req: Request): number | null {
  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) return verifySmartHomeToken(h.slice(7).trim());
  return null;
}

// ------------------------------------------------------------- Google Home --

function googleType(t: string): string {
  if (t === "smart-plug") return "action.devices.types.OUTLET";
  if (t === "aquaguard" || t === "agri-starter") return "action.devices.types.SWITCH";
  return "action.devices.types.SWITCH";
}

smarthomeRouter.post("/google", async (req: Request, res: Response) => {
  const uid = bearerUid(req);
  const reqId = req.body?.requestId ?? "";
  if (uid == null) {
    res.status(401).json({ requestId: reqId, payload: { errorCode: "authFailure" } });
    return;
  }
  const input = req.body?.inputs?.[0];
  const intent = input?.intent;
  const devs = await ownerDevices(uid);

  if (intent === "action.devices.SYNC") {
    const list = devs
      .filter((d) => onOff(d.type))
      .map((d) => ({
        id: d.id,
        type: googleType(d.type),
        traits: ["action.devices.traits.OnOff"],
        name: { name: d.name || d.id },
        willReportState: false,
        roomHint: d.room || undefined,
        deviceInfo: { manufacturer: "Circuvent", model: d.type },
      }));
    res.json({ requestId: reqId, payload: { agentUserId: String(uid), devices: list } });
    return;
  }

  if (intent === "action.devices.QUERY") {
    const ids: string[] = (input.payload?.devices ?? []).map((d: { id: string }) => d.id);
    const states: Record<string, unknown> = {};
    for (const id of ids) {
      const d = devs.find((x) => x.id === id);
      const m = d ? onOff(d.type) : null;
      states[id] = d && m ? { online: d.online, status: "SUCCESS", on: !!d.state[m.field] } : { online: false, status: "ERROR" };
    }
    res.json({ requestId: reqId, payload: { devices: states } });
    return;
  }

  if (intent === "action.devices.EXECUTE") {
    const results: Array<{ ids: string[]; status: string; states?: unknown; errorCode?: string }> = [];
    for (const c of input.payload?.commands ?? []) {
      for (const dv of c.devices ?? []) {
        const d = devs.find((x) => x.id === dv.id);
        const m = d ? onOff(d.type) : null;
        if (!d || !m) {
          results.push({ ids: [dv.id], status: "ERROR", errorCode: "deviceNotFound" });
          continue;
        }
        for (const ex of c.execution ?? []) {
          if (ex.command === "action.devices.commands.OnOff") {
            const on = !!ex.params?.on;
            sendCommand(d.id, uid, { action: "set", ...m.cmd(on) });
            results.push({ ids: [d.id], status: "SUCCESS", states: { on, online: true } });
          }
        }
      }
    }
    res.json({ requestId: reqId, payload: { commands: results } });
    return;
  }

  if (intent === "action.devices.DISCONNECT") {
    res.json({});
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
  const cat = d.type === "smart-plug" ? "SMARTPLUG" : "SWITCH";
  return {
    endpointId: d.id,
    friendlyName: d.name || d.id,
    description: `Circuvent ${d.type}`,
    manufacturerName: "Circuvent",
    displayCategories: [cat],
    capabilities: [
      { type: "AlexaInterface", interface: "Alexa", version: "3" },
      {
        type: "AlexaInterface",
        interface: "Alexa.PowerController",
        version: "3",
        properties: { supported: [{ name: "powerState" }], retrievable: true, proactivelyReported: false },
      },
      {
        type: "AlexaInterface",
        interface: "Alexa.EndpointHealth",
        version: "3",
        properties: { supported: [{ name: "connectivity" }], retrievable: true, proactivelyReported: false },
      },
    ],
  };
}

function powerProps(on: boolean, online: boolean) {
  const now = new Date().toISOString();
  return [
    { namespace: "Alexa.PowerController", name: "powerState", value: on ? "ON" : "OFF", timeOfSample: now, uncertaintyInMilliseconds: 500 },
    {
      namespace: "Alexa.EndpointHealth",
      name: "connectivity",
      value: { value: online ? "OK" : "UNREACHABLE" },
      timeOfSample: now,
      uncertaintyInMilliseconds: 500,
    },
  ];
}

smarthomeRouter.post("/alexa", async (req: Request, res: Response) => {
  const dir = req.body?.directive;
  const header = dir?.header || {};
  const ns = header.namespace;
  const token = dir?.payload?.scope?.token || dir?.endpoint?.scope?.token;
  const uid = token ? verifySmartHomeToken(token) : null;

  const errorResp = (type: string, message: string) => ({
    event: { header: aHeader("Alexa", "ErrorResponse", header.correlationToken), endpoint: dir?.endpoint, payload: { type, message } },
  });

  if (uid == null) {
    res.json(errorResp("INVALID_AUTHORIZATION_CREDENTIAL", "Invalid or expired token"));
    return;
  }
  const devs = await ownerDevices(uid);

  if (ns === "Alexa.Discovery" && header.name === "Discover") {
    const endpoints = devs.filter((d) => onOff(d.type)).map(alexaEndpoint);
    res.json({ event: { header: aHeader("Alexa.Discovery", "Discover.Response"), payload: { endpoints } } });
    return;
  }

  const id = dir?.endpoint?.endpointId;
  const d = devs.find((x) => x.id === id);
  const m = d ? onOff(d.type) : null;

  if (ns === "Alexa.PowerController" && (header.name === "TurnOn" || header.name === "TurnOff")) {
    const on = header.name === "TurnOn";
    if (d && m) sendCommand(d.id, uid, { action: "set", ...m.cmd(on) });
    res.json({
      context: { properties: powerProps(on, d?.online ?? true) },
      event: {
        header: aHeader("Alexa", "Response", header.correlationToken),
        endpoint: { endpointId: id },
        payload: {},
      },
    });
    return;
  }

  if (ns === "Alexa" && header.name === "ReportState") {
    const on = d && m ? !!d.state[m.field] : false;
    res.json({
      context: { properties: powerProps(on, d?.online ?? false) },
      event: {
        header: aHeader("Alexa", "StateReport", header.correlationToken),
        endpoint: { endpointId: id },
        payload: {},
      },
    });
    return;
  }

  res.json(errorResp("INVALID_DIRECTIVE", "Unsupported directive"));
});
