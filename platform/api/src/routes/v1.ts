import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { pool, recordEvent } from "../db";
import { publishCommand } from "../mqtt";
import { ownsDevice } from "../ownership";
import { requireApiAccess, developerCors, type ApiRequest } from "../api-auth";
import { API_SCOPES, SCOPE_DESCRIPTIONS } from "../api-keys";
import { WEBHOOK_EVENTS } from "../webhooks";
import {
  createSchema as createAutomationSchema,
  patchSchema as patchAutomationSchema,
  ownsReferencedDevices,
} from "./automations";
import { logger } from "../logger";
import { onlineColumn, onlineSql } from "../device-online";
import { analysePlate, normalisePlate, prettyPlate } from "../anpr/plate";
import { listVehicles, visitsFor } from "../anpr/visits";
import { occupancy } from "../anpr/site";

/**
 * The public, versioned developer API.
 *
 * WHY THIS IS A SEPARATE ROUTER AND NOT A FEW `requireApiAccess` CALLS BOLTED
 * ONTO THE EXISTING ROUTES
 *
 * The routes under /devices, /scenes and the rest exist to serve our own
 * console and app, and they change whenever those change — a field gets
 * renamed, a response grows a key the dashboard needs, a route is folded into
 * another. That is fine while we are the only caller and are shipping both
 * sides together. It stops being fine the moment somebody else's production
 * dashboard depends on the shape.
 *
 * /v1 is therefore a deliberate, narrow projection with its own response
 * shapes. The console can keep moving; this cannot, except additively.
 *
 * COMPATIBILITY PROMISE (also stated in the published docs, so it is a promise
 * to developers and not just a note to ourselves):
 *   - fields are added, never removed or retyped within a version;
 *   - unknown fields in a request body are ignored, not rejected;
 *   - a breaking change means /v2, with /v1 kept working.
 */
export const v1Router = Router();

v1Router.use(developerCors);

/**
 * Route registration that cannot hang.
 *
 * Express 4 does not catch rejections from async handlers: the promise rejects,
 * no response is ever written, and the caller waits until its own timeout. That
 * is the worst failure mode we could hand a developer — an integration that
 * stops responding rather than returning an error it can retry or alert on.
 *
 * It is reachable in normal operation. `publishCommand` throws "MQTT not
 * connected" whenever the broker is restarting, which index.ts explicitly plans
 * for ("the API stays up even if the broker is briefly unavailable"). Without
 * this wrapper that plan produces a hung POST instead of a 503.
 */
type Handler = (req: ApiRequest, res: Response, next: NextFunction) => unknown;

function safe(fn: Handler): Handler {
  return (req, res, next) => {
    try {
      const out = fn(req, res, next);
      if (out instanceof Promise) out.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

const route = {
  get: (path: string, ...h: Handler[]) => v1Router.get(path, ...h.map(safe)),
  post: (path: string, ...h: Handler[]) => v1Router.post(path, ...h.map(safe)),
  patch: (path: string, ...h: Handler[]) => v1Router.patch(path, ...h.map(safe)),
  delete: (path: string, ...h: Handler[]) => v1Router.delete(path, ...h.map(safe)),
};

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

interface DeviceRow {
  id: string;
  name: string;
  type: string;
  room: string;
  favorite: boolean;
  online: boolean;
  last_seen: Date | null;
  state: Record<string, unknown>;
  fw_version: string;
}

/**
 * One place that decides what a device looks like on the wire. Handlers must
 * not build this inline, or the list and the detail endpoint drift apart and
 * a client that works against one breaks against the other.
 */
function deviceShape(r: DeviceRow) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    room: r.room || null,
    favorite: r.favorite,
    online: r.online,
    lastSeen: r.last_seen ? r.last_seen.toISOString() : null,
    firmware: r.fw_version || null,
    state: r.state ?? {},
  };
}

const DEVICE_COLUMNS = `id, name, type, room, favorite, ${onlineColumn()}, last_seen, state, fw_version`;

/* ------------------------------------------------------------------ */
/* Discovery                                                           */
/* ------------------------------------------------------------------ */

/**
 * GET /v1 — machine-readable index.
 *
 * Unauthenticated on purpose: a developer holding a key they cannot get to
 * work needs to be able to confirm the base URL is right before they can
 * debug anything else, and this discloses nothing about any account.
 */
route.get("/", (_req, res) => {
  res.json({
    version: "1",
    documentation: "https://circuvent.com/developers",
    openapi: "https://circuvent.com/openapi.json",
    scopes: API_SCOPES.map((s) => ({ scope: s, description: SCOPE_DESCRIPTIONS[s] })),
    webhookEvents: WEBHOOK_EVENTS,
    endpoints: [
      { method: "GET", path: "/v1/me", scope: "devices:read" },
      { method: "GET", path: "/v1/devices", scope: "devices:read" },
      { method: "GET", path: "/v1/devices/{id}", scope: "devices:read" },
      { method: "POST", path: "/v1/devices/{id}/commands", scope: "devices:control" },
      { method: "PATCH", path: "/v1/devices/{id}", scope: "devices:write" },
      { method: "GET", path: "/v1/devices/{id}/telemetry", scope: "telemetry:read" },
      { method: "GET", path: "/v1/devices/{id}/energy", scope: "telemetry:read" },
      { method: "GET", path: "/v1/rooms", scope: "rooms:read" },
      { method: "GET", path: "/v1/scenes", scope: "scenes:read" },
      { method: "POST", path: "/v1/scenes/{id}/activate", scope: "scenes:run" },
      { method: "GET", path: "/v1/automations", scope: "automations:read" },
      { method: "POST", path: "/v1/automations", scope: "automations:write" },
      { method: "PATCH", path: "/v1/automations/{id}", scope: "automations:write" },
      { method: "DELETE", path: "/v1/automations/{id}", scope: "automations:write" },
      { method: "GET", path: "/v1/events", scope: "events:read" },
      { method: "GET", path: "/v1/plates", scope: "plates:read" },
      { method: "GET", path: "/v1/plates/{id}/image", scope: "plates:read" },
      { method: "GET", path: "/v1/vehicles", scope: "plates:read" },
      { method: "GET", path: "/v1/vehicles/{plate}", scope: "plates:read" },
      { method: "GET", path: "/v1/occupancy", scope: "plates:read" },
      { method: "GET", path: "/v1/plate-rules", scope: "plates:read" },
      { method: "POST", path: "/v1/plate-rules", scope: "plates:write" },
      { method: "DELETE", path: "/v1/plate-rules/{id}", scope: "plates:write" },
    ],
  });
});

/** GET /v1/me — who this credential belongs to and what it may do. */
route.get("/me", requireApiAccess("devices:read"), async (req: ApiRequest, res) => {
  const { rows } = await pool.query<{ id: string; email: string; name: string }>(
    `SELECT id, email, name FROM users WHERE id = $1`,
    [req.user!.uid]
  );
  const u = rows[0];
  const { rows: counts } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM devices WHERE owner_id = $1`,
    [req.user!.uid]
  );
  res.json({
    account: u ? { id: Number(u.id), email: u.email, name: u.name } : null,
    deviceCount: Number(counts[0]?.n ?? 0),
    // A JWT caller is the account itself and holds everything; a key reports
    // exactly what it was granted so a developer can debug a 403 without
    // going back to the console.
    auth: req.apiKey
      ? { method: "api_key", keyName: req.apiKey.name, env: req.apiKey.env, scopes: req.apiKey.scopes }
      : { method: "session", scopes: [...API_SCOPES] },
  });
});

/* ------------------------------------------------------------------ */
/* Devices                                                             */
/* ------------------------------------------------------------------ */

/** GET /v1/devices?room=&type=&online= */
route.get("/devices", requireApiAccess("devices:read"), async (req: ApiRequest, res) => {
  const room = typeof req.query.room === "string" ? req.query.room : null;
  const type = typeof req.query.type === "string" ? req.query.type : null;
  const online =
    req.query.online === "true" ? true : req.query.online === "false" ? false : null;

  const { rows } = await pool.query<DeviceRow>(
    `SELECT ${DEVICE_COLUMNS} FROM devices
      WHERE owner_id = $1
        AND ($2::text IS NULL OR room = $2)
        AND ($3::text IS NULL OR type = $3)
        AND ($4::bool IS NULL OR ${onlineSql()} = $4)
      ORDER BY created_at`,
    [req.user!.uid, room, type, online]
  );
  res.json({ devices: rows.map(deviceShape) });
});

/** GET /v1/devices/:id */
route.get("/devices/:id", requireApiAccess("devices:read"), async (req: ApiRequest, res) => {
  const { rows } = await pool.query<DeviceRow>(
    `SELECT ${DEVICE_COLUMNS} FROM devices WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user!.uid]
  );
  if (!rows[0]) {
    res.status(404).json({ error: "No such device.", code: "not_found" });
    return;
  }
  res.json({ device: deviceShape(rows[0]) });
});

/**
 * POST /v1/devices/:id/commands
 *
 * The body is the command itself, forwarded to the device unchanged. It is
 * deliberately not validated against a per-type schema here: the set of
 * commands a board understands is defined by its firmware, which ships
 * independently of this API, so a whitelist maintained here would silently
 * block every new capability until somebody remembered to update it.
 *
 * Responds 202, not 200. The broker has accepted the command for delivery;
 * the relay has not necessarily closed yet. Read the device back, or take a
 * webhook, to observe the result — the docs show both.
 */
route.post("/devices/:id/commands", requireApiAccess("devices:control"), async (req: ApiRequest, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "Command body must be a JSON object.", code: "invalid_body" });
    return;
  }
  if (!(await ownsDevice(req.user!.uid, req.params.id))) {
    res.status(404).json({ error: "No such device.", code: "not_found" });
    return;
  }
  publishCommand(req.params.id, body as Record<string, unknown>);
  void pool
    .query(`INSERT INTO commands (device_id, user_id, payload) VALUES ($1, $2, $3)`, [
      req.params.id,
      req.user!.uid,
      body,
    ])
    .catch((err) => logger.error({ err, deviceId: req.params.id }, "v1 command audit insert failed"));
  res.status(202).json({ accepted: true, deviceId: req.params.id, command: body });
});

/** PATCH /v1/devices/:id — name / room / favorite. */
const patchSchema = z.object({
  name: z.string().max(120).optional(),
  room: z.string().max(80).optional(),
  favorite: z.boolean().optional(),
});
route.patch("/devices/:id", requireApiAccess("devices:write"), async (req: ApiRequest, res) => {
  const parsed = patchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid input.",
      code: "invalid_body",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }
  if (!(await ownsDevice(req.user!.uid, req.params.id))) {
    res.status(404).json({ error: "No such device.", code: "not_found" });
    return;
  }
  await pool.query(
    `UPDATE devices SET name = COALESCE($2, name), room = COALESCE($3, room), favorite = COALESCE($4, favorite) WHERE id = $1`,
    [req.params.id, parsed.data.name ?? null, parsed.data.room ?? null, parsed.data.favorite ?? null]
  );
  const { rows } = await pool.query<DeviceRow>(
    `SELECT ${DEVICE_COLUMNS} FROM devices WHERE id = $1`,
    [req.params.id]
  );
  res.json({ device: deviceShape(rows[0]) });
});

/** GET /v1/devices/:id/telemetry?limit=100&since=<iso> */
route.get("/devices/:id/telemetry", requireApiAccess("telemetry:read"), async (req: ApiRequest, res) => {
  if (!(await ownsDevice(req.user!.uid, req.params.id))) {
    res.status(404).json({ error: "No such device.", code: "not_found" });
    return;
  }
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
  const since = typeof req.query.since === "string" ? new Date(req.query.since) : null;
  if (since && Number.isNaN(since.getTime())) {
    res.status(400).json({ error: "`since` must be an ISO-8601 timestamp.", code: "invalid_query" });
    return;
  }
  const { rows } = await pool.query<{ ts: Date; payload: Record<string, unknown> }>(
    `SELECT ts, payload FROM telemetry
      WHERE device_id = $1 AND ($3::timestamptz IS NULL OR ts > $3)
      ORDER BY ts DESC LIMIT $2`,
    [req.params.id, limit, since]
  );
  res.json({
    deviceId: req.params.id,
    telemetry: rows.map((r) => ({ at: r.ts.toISOString(), data: r.payload })),
  });
});

/** GET /v1/devices/:id/energy?hours=24&metric=watts */
route.get("/devices/:id/energy", requireApiAccess("telemetry:read"), async (req: ApiRequest, res) => {
  if (!(await ownsDevice(req.user!.uid, req.params.id))) {
    res.status(404).json({ error: "No such device.", code: "not_found" });
    return;
  }
  const hours = Math.min(24 * 90, Math.max(1, Number(req.query.hours) || 24));
  const metric = String(req.query.metric || "watts").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 40) || "watts";
  const gran = hours <= 48 ? "hour" : "day";
  const { rows } = await pool.query<{ bucket: Date; avg: number | null; max: number | null }>(
    `SELECT date_trunc($3, ts) AS bucket,
            AVG(NULLIF(payload->>$4,'')::float) AS avg,
            MAX(NULLIF(payload->>$4,'')::float) AS max
       FROM telemetry
      WHERE device_id = $1 AND ts > now() - ($2 || ' hours')::interval AND payload ? $4
      GROUP BY 1 ORDER BY 1`,
    [req.params.id, String(hours), gran, metric]
  );
  const bucketHours = gran === "hour" ? 1 : 24;
  const series = rows.map((r) => ({
    at: r.bucket.toISOString(),
    avg: r.avg == null ? 0 : Math.round(r.avg * 100) / 100,
    max: r.max == null ? 0 : Math.round(r.max * 100) / 100,
  }));
  const kwh = series.reduce((s, p) => s + (p.avg * bucketHours) / 1000, 0);
  res.json({ deviceId: req.params.id, metric, granularity: gran, series, kwh: Math.round(kwh * 1000) / 1000 });
});

/* ------------------------------------------------------------------ */
/* Rooms, scenes, automations, events                                  */
/* ------------------------------------------------------------------ */

route.get("/rooms", requireApiAccess("rooms:read"), async (req: ApiRequest, res) => {
  const { rows } = await pool.query<{ id: string; name: string; icon: string; sort: number; n: string }>(
    `SELECT r.id, r.name, r.icon, r.sort,
            (SELECT COUNT(*)::text FROM devices d WHERE d.owner_id = r.owner_id AND d.room = r.name) AS n
       FROM rooms r WHERE r.owner_id = $1 ORDER BY r.sort, r.name`,
    [req.user!.uid]
  );
  res.json({
    rooms: rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      icon: r.icon,
      sort: r.sort,
      deviceCount: Number(r.n),
    })),
  });
});

route.get("/scenes", requireApiAccess("scenes:read"), async (req: ApiRequest, res) => {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    icon: string;
    favorite: boolean;
    actions: Array<{ deviceId: string; command: Record<string, unknown> }>;
  }>(`SELECT id, name, icon, favorite, actions FROM scenes WHERE owner_id = $1 ORDER BY created_at`, [
    req.user!.uid,
  ]);
  res.json({
    scenes: rows.map((s) => ({
      id: Number(s.id),
      name: s.name,
      icon: s.icon,
      favorite: s.favorite,
      actions: s.actions ?? [],
    })),
  });
});

/**
 * POST /v1/scenes/:id/activate
 *
 * Mirrors the console's behaviour exactly, including that actions naming a
 * device the caller no longer owns are skipped rather than failing the whole
 * scene — a scene that still references a sold device should keep working for
 * the rest of the house. `sent` reports how many actually went out.
 */
route.post("/scenes/:id/activate", requireApiAccess("scenes:run"), async (req: ApiRequest, res) => {
  const { rows } = await pool.query<{
    name: string;
    actions: Array<{ deviceId: string; command: Record<string, unknown> }>;
  }>(`SELECT name, actions FROM scenes WHERE id = $1 AND owner_id = $2`, [req.params.id, req.user!.uid]);
  const scene = rows[0];
  if (!scene) {
    res.status(404).json({ error: "No such scene.", code: "not_found" });
    return;
  }
  const owned = await pool.query<{ id: string }>(`SELECT id FROM devices WHERE owner_id = $1`, [req.user!.uid]);
  const ownedIds = new Set(owned.rows.map((r) => r.id));
  let sent = 0;
  const skipped: string[] = [];
  for (const a of scene.actions ?? []) {
    if (a && typeof a.deviceId === "string" && a.command && typeof a.command === "object") {
      if (!ownedIds.has(a.deviceId)) {
        skipped.push(a.deviceId);
        continue;
      }
      publishCommand(a.deviceId, a.command);
      sent++;
      void pool
        .query(`INSERT INTO commands (device_id, user_id, payload) VALUES ($1, $2, $3)`, [
          a.deviceId,
          req.user!.uid,
          a.command,
        ])
        .catch((err) => logger.error({ err }, "v1 scene command audit failed"));
    }
  }
  void recordEvent(req.user!.uid, "activity", "Scene activated", `${scene.name} — ${sent} device${sent === 1 ? "" : "s"}.`);
  res.status(202).json({ accepted: true, scene: scene.name, sent, skipped });
});

route.get("/automations", requireApiAccess("automations:read"), async (req: ApiRequest, res) => {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    enabled: boolean;
    trigger: unknown;
    action: unknown;
    created_at: Date;
  }>(`SELECT id, name, enabled, trigger, action, created_at FROM automations WHERE owner_id = $1 ORDER BY created_at`, [
    req.user!.uid,
  ]);
  res.json({
    automations: rows.map((a) => ({
      id: Number(a.id),
      name: a.name,
      enabled: a.enabled,
      trigger: a.trigger,
      action: a.action,
      createdAt: a.created_at.toISOString(),
    })),
  });
});

/* ------------------------------------------------------------------ */
/* Automations — write                                                 */
/* ------------------------------------------------------------------ */

/**
 * The schemas and the ownership guard are imported from the console's
 * automation route rather than restated here.
 *
 * `ownsReferencedDevices` is security-critical: it checks the *trigger* side as
 * well as the action side, because pointing a trigger at somebody else's device
 * and pairing it with a `notify` action (which names no device at all) turns
 * the notification pipeline into a cross-tenant surveillance channel. A second
 * copy of that reasoning here would be one copy to forget to update.
 */
route.post("/automations", requireApiAccess("automations:write"), async (req: ApiRequest, res) => {
  const p = createAutomationSchema.safeParse(req.body ?? {});
  if (!p.success) {
    res.status(400).json({
      error: "Invalid automation.",
      code: "invalid_body",
      details: p.error.flatten().fieldErrors,
    });
    return;
  }
  const { name, enabled, trigger, action } = p.data;
  if (!(await ownsReferencedDevices(req.user!.uid, trigger, action))) {
    res.status(403).json({
      error: "That automation references a device this account does not own.",
      code: "device_not_owned",
    });
    return;
  }
  const { rows } = await pool.query<{
    id: string;
    name: string;
    enabled: boolean;
    trigger: unknown;
    action: unknown;
    created_at: Date;
  }>(
    `INSERT INTO automations (owner_id, name, enabled, trigger, action) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, enabled, trigger, action, created_at`,
    [req.user!.uid, name, enabled ?? true, trigger, action]
  );
  const a = rows[0];
  res.status(201).json({
    automation: {
      id: Number(a.id),
      name: a.name,
      enabled: a.enabled,
      trigger: a.trigger,
      action: a.action,
      createdAt: a.created_at.toISOString(),
    },
  });
});

route.patch("/automations/:id", requireApiAccess("automations:write"), async (req: ApiRequest, res) => {
  const p = patchAutomationSchema.safeParse(req.body ?? {});
  if (!p.success) {
    res.status(400).json({
      error: "Invalid automation.",
      code: "invalid_body",
      details: p.error.flatten().fieldErrors,
    });
    return;
  }
  const body = p.data;
  const { rowCount } = await pool.query(`SELECT 1 FROM automations WHERE id = $1 AND owner_id = $2`, [
    Number(req.params.id),
    req.user!.uid,
  ]);
  if (!rowCount) {
    res.status(404).json({ error: "No such automation.", code: "not_found" });
    return;
  }
  if (!(await ownsReferencedDevices(req.user!.uid, body.trigger, body.action))) {
    res.status(403).json({
      error: "That automation references a device this account does not own.",
      code: "device_not_owned",
    });
    return;
  }
  const { rows } = await pool.query<{
    id: string;
    name: string;
    enabled: boolean;
    trigger: unknown;
    action: unknown;
    created_at: Date;
  }>(
    `UPDATE automations SET
       name    = COALESCE($2, name),
       enabled = COALESCE($3, enabled),
       trigger = COALESCE($4, trigger),
       action  = COALESCE($5, action)
     WHERE id = $1
     RETURNING id, name, enabled, trigger, action, created_at`,
    [
      Number(req.params.id),
      body.name ?? null,
      typeof body.enabled === "boolean" ? body.enabled : null,
      body.trigger ? JSON.stringify(body.trigger) : null,
      body.action ? JSON.stringify(body.action) : null,
    ]
  );
  const a = rows[0];
  res.json({
    automation: {
      id: Number(a.id),
      name: a.name,
      enabled: a.enabled,
      trigger: a.trigger,
      action: a.action,
      createdAt: a.created_at.toISOString(),
    },
  });
});

route.delete("/automations/:id", requireApiAccess("automations:write"), async (req: ApiRequest, res) => {
  const { rowCount } = await pool.query(`DELETE FROM automations WHERE id = $1 AND owner_id = $2`, [
    Number(req.params.id),
    req.user!.uid,
  ]);
  if (!rowCount) {
    res.status(404).json({ error: "No such automation.", code: "not_found" });
    return;
  }
  res.json({ deleted: true });
});

/** GET /v1/events?limit=50&since=<iso> */
route.get("/events", requireApiAccess("events:read"), async (req: ApiRequest, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
  const since = typeof req.query.since === "string" ? new Date(req.query.since) : null;
  if (since && Number.isNaN(since.getTime())) {
    res.status(400).json({ error: "`since` must be an ISO-8601 timestamp.", code: "invalid_query" });
    return;
  }
  const { rows } = await pool.query<{
    id: string;
    device_id: string | null;
    kind: string;
    title: string;
    body: string;
    read: boolean;
    ts: Date;
  }>(
    `SELECT id, device_id, kind, title, body, read, ts FROM events
      WHERE owner_id = $1 AND ($3::timestamptz IS NULL OR ts > $3)
      ORDER BY ts DESC LIMIT $2`,
    [req.user!.uid, limit, since]
  );
  res.json({
    events: rows.map((e) => ({
      id: Number(e.id),
      deviceId: e.device_id,
      kind: e.kind,
      title: e.title,
      body: e.body,
      read: e.read,
      at: e.ts.toISOString(),
    })),
  });
});

/* ------------------------------------------------------------------ */
/* ANPR                                                                */
/* ------------------------------------------------------------------ */

/**
 * GET /v1/plates?deviceId=&plate=&decision=&status=&since=&limit=
 *
 * The endpoint an integration actually wants: a parking system, a visitor
 * log, a billing job. Deliberately does not return the capture image —
 * `hasImage` plus a URL keeps a page of 100 reads a few KB instead of several
 * MB, and most rows are never opened.
 */
route.get("/plates", requireApiAccess("plates:read"), async (req: ApiRequest, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
  const since = typeof req.query.since === "string" ? new Date(req.query.since) : null;
  if (since && Number.isNaN(since.getTime())) {
    res.status(400).json({ error: "`since` must be an ISO-8601 timestamp.", code: "invalid_query" });
    return;
  }
  const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : null;
  const decision = typeof req.query.decision === "string" ? req.query.decision : null;
  const status = typeof req.query.status === "string" ? req.query.status : null;
  // Normalised on the way in, so a caller may send "KA 01 AB 1234" or
  // "ka-01-ab-1234" and get the same rows the console would show.
  const plate = typeof req.query.plate === "string" ? normalisePlate(req.query.plate) : null;

  const { rows } = await pool.query<{
    id: string; device_id: string; capture_id: string; plate: string; confidence: number;
    votes: number; samples: number; kind: string; status: string; reason: string;
    decision: string; trigger: string; ts: Date; has_thumb: boolean;
  }>(
    `SELECT id, device_id, capture_id, plate, confidence, votes, samples, kind,
            status, reason, decision, trigger, ts, (thumb IS NOT NULL) AS has_thumb
       FROM plate_reads
      WHERE owner_id = $1
        AND ($3::text IS NULL OR device_id = $3)
        AND ($4::text IS NULL OR decision = $4)
        AND ($5::text IS NULL OR status = $5)
        AND ($6::text IS NULL OR plate = $6)
        AND ($7::timestamptz IS NULL OR ts > $7)
      ORDER BY ts DESC LIMIT $2`,
    [req.user!.uid, limit, deviceId, decision, status, plate || null, since]
  );

  res.json({
    plates: rows.map((r) => ({
      id: Number(r.id),
      deviceId: r.device_id,
      captureId: Number(r.capture_id),
      plate: r.plate || null,
      formatted: r.plate ? prettyPlate(r.plate) : null,
      confidence: r.confidence,
      votes: r.votes,
      samples: r.samples,
      plateKind: r.kind,
      status: r.status,
      reason: r.reason || null,
      decision: r.decision,
      trigger: r.trigger,
      hasImage: r.has_thumb,
      imageUrl: r.has_thumb ? `/v1/plates/${r.id}/image` : null,
      at: r.ts.toISOString(),
    })),
  });
});

/** GET /v1/plates/:id/image — the capture the plate was read from, as JPEG. */
route.get("/plates/:id/image", requireApiAccess("plates:read"), async (req: ApiRequest, res) => {
  const { rows } = await pool.query<{ thumb: string | null }>(
    `SELECT thumb FROM plate_reads WHERE id = $1 AND owner_id = $2`,
    [Number(req.params.id), req.user!.uid]
  );
  const thumb = rows[0]?.thumb;
  if (!thumb) {
    res.status(404).json({ error: "No image for that read.", code: "not_found" });
    return;
  }
  const buf = Buffer.from(thumb, "base64");
  res.setHeader("content-type", "image/jpeg");
  res.setHeader("cache-control", "private, max-age=86400, immutable");
  res.end(buf);
});

/**
 * GET /v1/vehicles?days=&limit=
 *
 * The vehicle register: one row per distinct plate rather than per sighting.
 * This is what a parking, billing or visitor-management integration needs —
 * "how many times has this van been here and is it here now" cannot be
 * answered by paging /v1/plates.
 */
route.get("/vehicles", requireApiAccess("plates:read"), async (req: ApiRequest, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 200));
  const vehicles = await listVehicles(req.user!.uid, days, limit);
  res.json({
    days,
    insideNow: vehicles.filter((v) => v.inside).length,
    vehicles: vehicles.map((v) => ({
      plate: v.plate,
      formatted: prettyPlate(v.plate),
      passes: v.passes,
      entries: v.entries,
      exits: v.exits,
      visits: v.visits,
      inside: v.inside,
      firstSeen: v.firstSeen,
      lastSeen: v.lastSeen,
      averageStaySeconds: v.avgStaySec,
      totalStaySeconds: v.totalStaySec,
      cameras: v.devices,
      list: v.rule,
      label: v.label,
    })),
  });
});

/** GET /v1/vehicles/{plate} — visit history for one vehicle. */
route.get("/vehicles/:plate", requireApiAccess("plates:read"), async (req: ApiRequest, res) => {
  // Normalised on the way in, so a caller may pass "KA 01 AB 1234" or
  // "ka-01-ab-1234" and reach the same vehicle the camera recorded.
  const plate = normalisePlate(req.params.plate);
  if (!plate) {
    res.status(400).json({ error: "Not a plate.", code: "invalid_plate" });
    return;
  }

  const { rows: seen } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM plate_reads WHERE owner_id = $1 AND plate = $2`,
    [req.user!.uid, plate]
  );
  // 404 rather than an empty profile: "came zero times" reads like a working
  // answer to what is actually a typo.
  if (Number(seen[0]?.n ?? 0) === 0) {
    res.status(404).json({ error: "No sightings of that plate.", code: "not_found" });
    return;
  }

  const visits = await visitsFor(req.user!.uid, plate, 500);
  const closed = visits.filter((v) => v.durationSec != null);
  res.json({
    plate,
    formatted: prettyPlate(plate),
    passes: Number(seen[0].n),
    visits: visits.map((v) => ({
      id: v.id,
      entryAt: v.entryAt,
      exitAt: v.exitAt,
      entryCamera: v.entryDevice,
      exitCamera: v.exitDevice,
      status: v.status,
      // Null, never 0, when a read was missed — a fabricated duration is worse
      // than an absent one for anything billed or audited.
      staySeconds: v.durationSec,
    })),
    inside: visits.some((v) => v.status === "open"),
    totalStaySeconds: closed.reduce((n, v) => n + (v.durationSec ?? 0), 0),
  });
});

/** GET /v1/occupancy — how full the site is right now. */
route.get("/occupancy", requireApiAccess("plates:read"), async (req: ApiRequest, res) => {
  const now = await occupancy(req.user!.uid);
  res.json({
    inside: now.inside,
    capacity: now.capacity,
    free: now.free,
    full: now.full,
    percent: now.percent,
  });
});

/** GET /v1/plate-rules — the allow / deny / watch list. */route.get("/plate-rules", requireApiAccess("plates:read"), async (req: ApiRequest, res) => {
  const { rows } = await pool.query<{
    id: string; plate: string; kind: string; label: string; device_id: string | null;
    valid_from: Date | null; valid_to: Date | null; enabled: boolean; hits: string;
  }>(
    `SELECT id, plate, kind, label, device_id, valid_from, valid_to, enabled, hits
       FROM plate_rules WHERE owner_id = $1 ORDER BY plate`,
    [req.user!.uid]
  );
  res.json({
    rules: rows.map((r) => ({
      id: Number(r.id),
      plate: r.plate,
      formatted: prettyPlate(r.plate),
      kind: r.kind,
      label: r.label,
      deviceId: r.device_id,
      validFrom: r.valid_from ? r.valid_from.toISOString() : null,
      validTo: r.valid_to ? r.valid_to.toISOString() : null,
      enabled: r.enabled,
      hits: Number(r.hits),
    })),
  });
});

const v1PlateRuleSchema = z.object({
  plate: z.string().trim().min(4).max(20),
  kind: z.enum(["allow", "deny", "watch"]).default("allow"),
  label: z.string().trim().max(80).default(""),
  deviceId: z.string().min(1).nullable().default(null),
  validFrom: z.string().datetime().nullable().default(null),
  validTo: z.string().datetime().nullable().default(null),
});

/** POST /v1/plate-rules — put a plate on a list. */
route.post("/plate-rules", requireApiAccess("plates:write"), async (req: ApiRequest, res) => {
  const parsed = v1PlateRuleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid rule.",
      code: "invalid_body",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }
  const { kind, label, deviceId, validFrom, validTo } = parsed.data;

  // Validated and corrected by the same analyser a camera read goes through,
  // so a rule and a read of the same vehicle can never be different strings.
  const analysis = analysePlate(parsed.data.plate);
  if (!analysis.valid) {
    res.status(400).json({
      error: `"${parsed.data.plate}" is not a valid registration.`,
      code: "invalid_plate",
    });
    return;
  }

  if (deviceId && !(await ownsDevice(req.user!.uid, deviceId))) {
    res.status(404).json({ error: "No such device.", code: "not_found" });
    return;
  }

  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO plate_rules (owner_id, plate, kind, label, device_id, valid_from, valid_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.user!.uid, analysis.plate, kind, label, deviceId, validFrom, validTo]
    );
    res.status(201).json({
      rule: {
        id: Number(rows[0].id),
        plate: analysis.plate,
        formatted: prettyPlate(analysis.plate),
        kind,
        label,
        deviceId,
        validFrom,
        validTo,
        enabled: true,
        hits: 0,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({
        error: `${prettyPlate(analysis.plate)} is already on a list for that scope.`,
        code: "duplicate_plate",
      });
      return;
    }
    throw err;
  }
});

/** DELETE /v1/plate-rules/:id */
route.delete("/plate-rules/:id", requireApiAccess("plates:write"), async (req: ApiRequest, res) => {
  const { rowCount } = await pool.query(`DELETE FROM plate_rules WHERE id = $1 AND owner_id = $2`, [
    Number(req.params.id),
    req.user!.uid,
  ]);
  if (!rowCount) {
    res.status(404).json({ error: "No such rule.", code: "not_found" });
    return;
  }
  res.json({ deleted: true });
});

v1Router.use((_req, res) => {
  res.status(404).json({ error: "No such endpoint in /v1.", code: "not_found" });
});

/**
 * Terminal error handler.
 *
 * `safe()` funnels every rejection here, which is what turns a hung request
 * into an answer. The broker case is separated out because it is the one a
 * developer can act on: their command was not delivered and retrying shortly
 * is the right response, which a generic 500 would not tell them.
 */
v1Router.use((err: unknown, _req: ApiRequest, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);

  if (/MQTT not connected/i.test(message)) {
    logger.error({ err }, "v1 command rejected — broker unavailable");
    res.status(503).json({
      error: "The device broker is temporarily unavailable. The command was not delivered — retry shortly.",
      code: "broker_unavailable",
    });
    return;
  }

  logger.error({ err }, "unhandled error in /v1");
  res.status(500).json({ error: "Internal error.", code: "internal_error" });
});
