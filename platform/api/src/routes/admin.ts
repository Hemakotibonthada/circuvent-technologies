import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db";
import { config } from "../config";
import { requireAuth, type AuthedRequest, generateDeviceKey, hashDeviceKey } from "../auth";
import { publishCommand, provisionBrokerClient, deprovisionBrokerClient, getMqtt } from "../mqtt";
import { invalidateOwnership, invalidateOwner } from "../ownership";
import { revokeAllSessions, invalidateUser } from "../sessions";
import { revokeAllRefreshTokens } from "../refresh";
import { logger } from "../logger";

export const adminRouter = Router();

const adminEmails = new Set(
  config.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
);

/** requireAuth first, then confirm (or bootstrap) the admin role. */
async function adminGuard(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rows } = await pool.query<{ is_admin: boolean; email: string }>(
      `SELECT is_admin, email FROM users WHERE id = $1`,
      [req.user!.uid]
    );
    const u = rows[0];
    if (!u) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (u.is_admin) return next();
    // Bootstrap: promote allow-listed emails on first admin access.
    if (adminEmails.has(u.email.toLowerCase())) {
      await pool.query(`UPDATE users SET is_admin = true WHERE id = $1`, [req.user!.uid]);
      return next();
    }
    res.status(403).json({ error: "Admin access required" });
  } catch (err) {
    logger.error({ err }, "adminGuard failed");
    res.status(500).json({ error: "Server error" });
  }
}

adminRouter.use(requireAuth, adminGuard);

/** GET /admin/me — confirm admin + who am I. */
adminRouter.get("/me", async (req: AuthedRequest, res) => {
  res.json({ admin: true, uid: req.user!.uid, email: req.user!.email });
});

/** GET /admin/stats — fleet-wide counters. */
adminRouter.get("/stats", async (_req, res) => {
  const [users, devices, online, events, pending] = await Promise.all([
    pool.query<{ c: string }>(`SELECT COUNT(*)::int c FROM users`),
    pool.query<{ c: string }>(`SELECT COUNT(*)::int c FROM devices`),
    pool.query<{ c: string }>(`SELECT COUNT(*)::int c FROM devices WHERE online = true`),
    pool.query<{ c: string }>(`SELECT COUNT(*)::int c FROM events WHERE ts > now() - interval '7 days'`),
    pool.query<{ c: string }>(`SELECT COUNT(*)::int c FROM pending_registrations`),
  ]);
  const byType = await pool.query<{ type: string; c: string }>(
    `SELECT type, COUNT(*)::int c FROM devices GROUP BY type ORDER BY c DESC`
  );
  res.json({
    users: Number(users.rows[0].c),
    devices: Number(devices.rows[0].c),
    online: Number(online.rows[0].c),
    events7d: Number(events.rows[0].c),
    pendingSignups: Number(pending.rows[0].c),
    byType: byType.rows.map((r) => ({ type: r.type, count: Number(r.c) })),
  });
});

/** GET /admin/users — all users with device counts. */
adminRouter.get("/users", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.is_admin, u.blocked, u.created_at,
            (SELECT COUNT(*)::int FROM devices d WHERE d.owner_id = u.id) AS devices
     FROM users u ORDER BY u.created_at DESC`
  );
  res.json({ users: rows });
});

/** PATCH /admin/users/:id — toggle admin role. */
adminRouter.patch("/users/:id", async (req: AuthedRequest, res) => {
  const parsed = z
    .object({ is_admin: z.boolean().optional(), blocked: z.boolean().optional() })
    .refine((v) => v.is_admin !== undefined || v.blocked !== undefined, "Nothing to change")
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const targetId = Number(req.params.id);
  const isSelf = targetId === req.user!.uid;

  if (isSelf && parsed.data.is_admin === false) {
    res.status(400).json({ error: "You cannot remove your own admin role." });
    return;
  }
  // Locking yourself out of the console is not a mistake you can undo from
  // inside the console.
  if (isSelf && parsed.data.blocked === true) {
    res.status(400).json({ error: "You cannot disable your own account." });
    return;
  }

  if (parsed.data.is_admin !== undefined) {
    await pool.query(`UPDATE users SET is_admin = $2 WHERE id = $1`, [targetId, parsed.data.is_admin]);
  }

  if (parsed.data.blocked !== undefined) {
    await pool.query(`UPDATE users SET blocked = $2 WHERE id = $1`, [targetId, parsed.data.blocked]);
    // Disabling an account has to end its live sessions, or the person keeps
    // full control of their devices using the token already on their phone —
    // which is precisely the situation the flag exists to stop.
    if (parsed.data.blocked) {
      await revokeAllSessions(targetId);
      // A surviving refresh chain would let a disabled account mint new access
      // tokens on demand, which is the whole thing blocking is meant to stop.
      await revokeAllRefreshTokens(targetId);
      invalidateOwner(targetId);
      logger.info({ targetId, by: req.user!.uid }, "admin disabled an account and revoked its sessions");
    } else {
      invalidateUser(targetId);
    }
  } else if (parsed.data.is_admin !== undefined) {
    // A role change alters what adminGuard allows, so drop the cached row
    // rather than serving a stale one for the next few seconds.
    invalidateUser(targetId);
  }

  res.json({ success: true });
});

/**
 * POST /admin/users/:id/revoke-sessions — end an account's sessions without
 * disabling it. The right action when a device is lost but the account is
 * fine, so the owner can simply sign in again.
 */
adminRouter.post("/users/:id/revoke-sessions", async (req: AuthedRequest, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isFinite(targetId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  await revokeAllSessions(targetId);
  await revokeAllRefreshTokens(targetId);
  logger.info({ targetId, by: req.user!.uid }, "admin revoked all sessions for an account");
  res.json({ success: true });
});

/** DELETE /admin/users/:id — delete a user (cascades their devices' ownership). */
adminRouter.delete("/users/:id", async (req: AuthedRequest, res) => {
  if (Number(req.params.id) === req.user!.uid) {
    res.status(400).json({ error: "You cannot delete your own account here." });
    return;
  }
  await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
  // Their devices' owner_id goes NULL — drop every cached grant immediately so
  // the deleted account's still-valid bearer token cannot keep sending commands.
  invalidateOwner(req.params.id);
  // And drop the cached session row, so requireAuth re-reads, finds no user and
  // rejects the token rather than serving it from a stale entry.
  invalidateUser(req.params.id);
  res.json({ success: true });
});

/** GET /admin/devices — every device with owner + last-seen. */
adminRouter.get("/devices", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.type, d.room, d.online, d.last_seen, d.fw_version, d.state,
            u.email AS owner_email, u.id AS owner_id
     FROM devices d LEFT JOIN users u ON u.id = d.owner_id
     ORDER BY d.online DESC, d.last_seen DESC NULLS LAST`
  );
  res.json({ devices: rows });
});

/** POST /admin/devices/:id/command — force a command to any device. */
adminRouter.post("/devices/:id/command", async (req: AuthedRequest, res) => {
  const payload = req.body ?? {};
  if (typeof payload !== "object") {
    res.status(400).json({ error: "Command body must be a JSON object." });
    return;
  }
  publishCommand(req.params.id, payload);
  res.json({ success: true });
});

/** POST /admin/devices/:id/ota — push an OTA firmware update pointer. */
adminRouter.post("/devices/:id/ota", async (req: AuthedRequest, res) => {
  const parsed = z.object({ url: z.string().url(), version: z.string().max(40).optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A firmware url is required." });
    return;
  }
  publishCommand(req.params.id, { action: "ota", url: parsed.data.url, version: parsed.data.version ?? "" });
  res.json({ success: true });
});

/** DELETE /admin/devices/:id — force-remove a device from the fleet. */
adminRouter.delete("/devices/:id", async (req: AuthedRequest, res) => {
  await pool.query(`DELETE FROM devices WHERE id = $1`, [req.params.id]);
  invalidateOwnership(req.params.id);
  deprovisionBrokerClient(req.params.id);
  res.json({ success: true });
});

/** GET /admin/events — recent fleet-wide activity/alerts. */
adminRouter.get("/events", async (req: AuthedRequest, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const { rows } = await pool.query(
    `SELECT e.id, e.owner_id, e.device_id, e.kind, e.title, e.body, e.ts, u.email AS owner_email
     FROM events e LEFT JOIN users u ON u.id = e.owner_id
     ORDER BY e.ts DESC LIMIT $1`,
    [limit]
  );
  res.json({ events: rows });
});

/** GET /admin/health — control-plane + broker + db liveness. */
adminRouter.get("/health", async (_req, res) => {
  let mqtt = false;
  try {
    mqtt = getMqtt().connected;
  } catch {
    mqtt = false;
  }
  let db = false;
  try {
    await pool.query("SELECT 1");
    db = true;
  } catch {
    db = false;
  }
  res.json({ mqtt, db, uptimeSec: Math.round(process.uptime()), node: process.version });
});

/** GET /admin/devices/:id — full detail for one device. */
adminRouter.get("/devices/:id", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.type, d.room, d.favorite, d.online, d.last_seen, d.fw_version, d.state, d.created_at,
            u.email AS owner_email, u.id AS owner_id
     FROM devices d LEFT JOIN users u ON u.id = d.owner_id WHERE d.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ device: rows[0] });
});

/** GET /admin/devices/:id/telemetry?limit=100 */
adminRouter.get("/devices/:id/telemetry", async (req, res) => {
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
  const { rows } = await pool.query(
    `SELECT ts, payload FROM telemetry WHERE device_id = $1 ORDER BY ts DESC LIMIT $2`,
    [req.params.id, limit]
  );
  res.json({ telemetry: rows });
});

/** PATCH /admin/devices/:id — rename / re-room / reassign owner. */
adminRouter.patch("/devices/:id", async (req: AuthedRequest, res) => {
  const parsed = z
    .object({ name: z.string().max(120).optional(), room: z.string().max(80).optional(), owner_id: z.number().int().nullable().optional() })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const d = parsed.data;
  const sets: string[] = [];
  const vals: unknown[] = [req.params.id];
  let i = 2;
  if (d.name !== undefined) { sets.push(`name = $${i++}`); vals.push(d.name); }
  if (d.room !== undefined) { sets.push(`room = $${i++}`); vals.push(d.room); }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "owner_id")) { sets.push(`owner_id = $${i++}`); vals.push(d.owner_id ?? null); }
  if (sets.length) await pool.query(`UPDATE devices SET ${sets.join(", ")} WHERE id = $1`, vals);
  // Reassigning an owner must revoke the previous one's cached command rights.
  invalidateOwnership(req.params.id);
  res.json({ success: true });
});

/** POST /admin/devices/provision — mint a new device id+key and assign an owner. */
adminRouter.post("/devices/provision", async (req: AuthedRequest, res) => {
  const parsed = z
    .object({ type: z.string().min(1).max(40), name: z.string().max(120).optional(), owner_id: z.number().int().optional() })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "type is required" });
    return;
  }
  try {
    const hwid = Math.random().toString(16).slice(2, 10);
    let id = `${parsed.data.type}-${hwid}`.toLowerCase();
    const exists = await pool.query(`SELECT 1 FROM devices WHERE id = $1`, [id]);
    if (exists.rowCount) id = `${id}-${Math.random().toString(16).slice(2, 6)}`;
    const key = generateDeviceKey();
    const keyHash = await hashDeviceKey(key);
    const owner = parsed.data.owner_id ?? req.user!.uid;
    await pool.query(`INSERT INTO devices (id, key_hash, owner_id, name, type) VALUES ($1, $2, $3, $4, $5)`, [
      id,
      keyHash,
      owner,
      parsed.data.name || parsed.data.type,
      parsed.data.type,
    ]);
    provisionBrokerClient(id, key);
    res.json({ id, key, mqttUsername: id, mqttPassword: key });
  } catch (err) {
    logger.error({ err }, "admin provision failed");
    res.status(500).json({ error: "Could not provision device" });
  }
});

/** POST /admin/broadcast — publish a command to every device matching a filter. */
adminRouter.post("/broadcast", async (req, res) => {
  const parsed = z
    .object({ type: z.string().optional(), online: z.boolean().optional(), command: z.record(z.unknown()) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "command is required" });
    return;
  }
  const conds: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (parsed.data.type) { conds.push(`type = $${i++}`); vals.push(parsed.data.type); }
  if (parsed.data.online !== undefined) { conds.push(`online = $${i++}`); vals.push(parsed.data.online); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM devices ${where}`, vals);
  for (const r of rows) publishCommand(r.id, parsed.data.command);
  res.json({ success: true, sent: rows.length });
});

/** POST /admin/ota-broadcast — push an OTA pointer to every device (optionally by type). */
adminRouter.post("/ota-broadcast", async (req, res) => {
  const parsed = z.object({ type: z.string().optional(), url: z.string().url(), version: z.string().max(40).optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A firmware url is required." });
    return;
  }
  const where = parsed.data.type ? `WHERE type = $1` : "";
  const vals = parsed.data.type ? [parsed.data.type] : [];
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM devices ${where}`, vals);
  for (const r of rows) publishCommand(r.id, { action: "ota", url: parsed.data.url, version: parsed.data.version ?? "" });
  res.json({ success: true, sent: rows.length });
});
