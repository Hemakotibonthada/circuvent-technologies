import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { pool, recordEvent } from "../db";
import { publishCommand } from "../mqtt";
import { ownsDevice } from "../ownership";
import { requireApiAccess, developerCors, type ApiRequest } from "../api-auth";
import { API_SCOPES, SCOPE_DESCRIPTIONS } from "../api-keys";
import { WEBHOOK_EVENTS } from "../webhooks";
import { logger } from "../logger";

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

const DEVICE_COLUMNS = `id, name, type, room, favorite, online, last_seen, state, fw_version`;

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
      { method: "GET", path: "/v1/events", scope: "events:read" },
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
        AND ($4::bool IS NULL OR online = $4)
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
