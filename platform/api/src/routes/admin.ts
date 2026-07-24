import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db";
import { config } from "../config";
import { requireAuth, type AuthedRequest } from "../auth";
import { publishCommand, deprovisionBrokerClient } from "../mqtt";
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
    `SELECT u.id, u.email, u.name, u.is_admin, u.created_at,
            (SELECT COUNT(*)::int FROM devices d WHERE d.owner_id = u.id) AS devices
     FROM users u ORDER BY u.created_at DESC`
  );
  res.json({ users: rows });
});

/** PATCH /admin/users/:id — toggle admin role. */
adminRouter.patch("/users/:id", async (req: AuthedRequest, res) => {
  const parsed = z.object({ is_admin: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  if (Number(req.params.id) === req.user!.uid && !parsed.data.is_admin) {
    res.status(400).json({ error: "You cannot remove your own admin role." });
    return;
  }
  await pool.query(`UPDATE users SET is_admin = $2 WHERE id = $1`, [req.params.id, parsed.data.is_admin]);
  res.json({ success: true });
});

/** DELETE /admin/users/:id — delete a user (cascades their devices' ownership). */
adminRouter.delete("/users/:id", async (req: AuthedRequest, res) => {
  if (Number(req.params.id) === req.user!.uid) {
    res.status(400).json({ error: "You cannot delete your own account here." });
    return;
  }
  await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
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
