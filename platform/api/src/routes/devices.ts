import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth, type AuthedRequest, verifyDeviceKey, generateDeviceKey, hashDeviceKey } from "../auth";
import { publishCommand, provisionBrokerClient, deprovisionBrokerClient } from "../mqtt";
import { logger } from "../logger";

export const deviceRouter = Router();

/**
 * POST /devices/provision  (owner-authenticated)
 * Mints a new device id + one-time claim key. Flash the id+key into firmware
 * (or hand to the factory tool). The key is returned ONCE and only stored hashed.
 */
const provisionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9._-]{4,64}$/, "id must be 4-64 url-safe chars"),
  type: z.string().max(40).default("generic"),
  name: z.string().max(120).default(""),
});
deviceRouter.post("/provision", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = provisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { id, type, name } = parsed.data;
  try {
    const exists = await pool.query(`SELECT 1 FROM devices WHERE id = $1`, [id]);
    if (exists.rowCount) {
      res.status(409).json({ error: "A device with that id already exists." });
      return;
    }
    const key = generateDeviceKey();
    const keyHash = await hashDeviceKey(key);
    await pool.query(
      `INSERT INTO devices (id, key_hash, owner_id, name, type) VALUES ($1, $2, $3, $4, $5)`,
      [id, keyHash, req.user!.uid, name, type]
    );
    // Grant broker access immediately so the device can connect with no manual step.
    provisionBrokerClient(id, key);
    // key is shown once — the caller must save it into firmware + broker creds.
    res.json({ id, key, type, name, mqttUsername: id, mqttPassword: key });
  } catch {
    res.status(500).json({ error: "Could not provision device." });
  }
});

/**
 * POST /devices/claim  (owner-authenticated) — attach an existing device to me.
 * Used when a device was provisioned elsewhere and the user has its id + key.
 */
const claimSchema = z.object({ id: z.string().min(1), key: z.string().min(1), name: z.string().max(120).optional(), room: z.string().max(80).optional() });
deviceRouter.post("/claim", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { id, key, name, room } = parsed.data;
  try {
    const { rows } = await pool.query<{ key_hash: string; owner_id: number | null }>(
      `SELECT key_hash, owner_id FROM devices WHERE id = $1`,
      [id]
    );
    const device = rows[0];
    if (!device || !(await verifyDeviceKey(key, device.key_hash))) {
      res.status(404).json({ error: "No device found for that id + key." });
      return;
    }
    if (device.owner_id && Number(device.owner_id) !== req.user!.uid) {
      res.status(409).json({ error: "This device is already claimed by another account." });
      return;
    }
    await pool.query(
      `UPDATE devices SET owner_id = $2, name = COALESCE(NULLIF($3,''), name), room = COALESCE(NULLIF($4,''), room) WHERE id = $1`,
      [id, req.user!.uid, name ?? "", room ?? ""]
    );
    // Ensure the device has broker access (idempotent — no-op if it already exists).
    provisionBrokerClient(id, key);
    res.json({ success: true, id });
  } catch {
    res.status(500).json({ error: "Could not claim device." });
  }
});

/** GET /devices — the caller's devices with live-ish state. */
deviceRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, type, room, favorite, online, last_seen, state, fw_version
     FROM devices WHERE owner_id = $1 ORDER BY created_at`,
    [req.user!.uid]
  );
  res.json({ devices: rows });
});

async function ownsDevice(uid: number, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM devices WHERE id = $1 AND owner_id = $2`, [id, uid]);
  return !!rowCount;
}

/** GET /devices/:id — single device detail. */
deviceRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, type, room, favorite, online, last_seen, state, fw_version
     FROM devices WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user!.uid]
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ device: rows[0] });
});

/** PATCH /devices/:id — rename / assign room / favorite. */
const patchSchema = z.object({
  name: z.string().max(120).optional(),
  room: z.string().max(80).optional(),
  favorite: z.boolean().optional(),
});
deviceRouter.patch("/:id", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await ownsDevice(req.user!.uid, req.params.id))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  await pool.query(
    `UPDATE devices SET name = COALESCE($2, name), room = COALESCE($3, room), favorite = COALESCE($4, favorite) WHERE id = $1`,
    [req.params.id, parsed.data.name ?? null, parsed.data.room ?? null, parsed.data.favorite ?? null]
  );
  res.json({ success: true });
});

/**
 * POST /devices/:id/command — publish a command to the device over MQTT.
 * This is the fast path: broker delivers to the device in <1s.
 */
deviceRouter.post("/:id/command", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await ownsDevice(req.user!.uid, req.params.id))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const payload = req.body ?? {};
  if (typeof payload !== "object") {
    res.status(400).json({ error: "Command body must be a JSON object." });
    return;
  }
  publishCommand(req.params.id, payload);
  // Audit log is best-effort — do NOT block the command response on the DB
  // write; the command is already on its way to the device via MQTT.
  void pool
    .query(`INSERT INTO commands (device_id, user_id, payload) VALUES ($1, $2, $3)`, [
      req.params.id,
      req.user!.uid,
      payload,
    ])
    .catch((err) => logger.error({ err, deviceId: req.params.id }, "command audit insert failed"));
  res.json({ success: true });
});

/** GET /devices/:id/telemetry?limit=100 — recent telemetry rows. */
deviceRouter.get("/:id/telemetry", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await ownsDevice(req.user!.uid, req.params.id))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
  const { rows } = await pool.query(
    `SELECT ts, payload FROM telemetry WHERE device_id = $1 ORDER BY ts DESC LIMIT $2`,
    [req.params.id, limit]
  );
  res.json({ telemetry: rows });
});

/**
 * GET /devices/:id/energy?hours=24&metric=watts — time-bucketed series for the
 * energy dashboard. Buckets adapt to the window (hourly for <=48h, else daily),
 * averaging the chosen numeric telemetry metric and integrating it to kWh.
 */
deviceRouter.get("/:id/energy", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await ownsDevice(req.user!.uid, req.params.id))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const hours = Math.min(24 * 90, Math.max(1, Number(req.query.hours) || 24));
  const metric = String(req.query.metric || "watts").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 40) || "watts";
  const gran = hours <= 48 ? "hour" : "day";
  const { rows } = await pool.query(
    `SELECT date_trunc($3, ts) AS bucket,
            AVG(NULLIF(payload->>$4,'')::float) AS avg,
            MAX(NULLIF(payload->>$4,'')::float) AS max
     FROM telemetry
     WHERE device_id = $1 AND ts > now() - ($2 || ' hours')::interval
       AND payload ? $4
     GROUP BY 1 ORDER BY 1`,
    [req.params.id, String(hours), gran, metric]
  );
  const bucketHours = gran === "hour" ? 1 : 24;
  const series = rows.map((r: { bucket: string; avg: number | null; max: number | null }) => ({
    t: r.bucket,
    avg: r.avg == null ? 0 : Math.round(r.avg * 100) / 100,
    max: r.max == null ? 0 : Math.round(r.max * 100) / 100,
  }));
  const kwh = series.reduce((s, p) => s + (p.avg * bucketHours) / 1000, 0);
  res.json({ metric, gran, series, kwh: Math.round(kwh * 1000) / 1000 });
});

/** DELETE /devices/:id — unclaim/remove from the account. */
deviceRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await ownsDevice(req.user!.uid, req.params.id))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await pool.query(`UPDATE devices SET owner_id = NULL WHERE id = $1`, [req.params.id]);
  deprovisionBrokerClient(req.params.id);
  res.json({ success: true });
});
