import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { pool, recordEvent, recordDeviceAudit } from "../db";
import { config } from "../config";
import {
  requireAuth,
  type AuthedRequest,
  generateDeviceKey,
  hashDeviceKey,
  verifyDeviceKey,
} from "../auth";
import { publishCommand, provisionBrokerClient, deprovisionBrokerClient, getMqtt } from "../mqtt";
import { listAll as listInstalls, stats as installStats } from "../app-installs";
import { invalidateOwnership, invalidateOwner } from "../ownership";
import { normalizeSerial, generateSerial } from "../serial";
import { buildDeviceReport, reportToCsv } from "../device-report";
import { revokeAllSessions, invalidateUser } from "../sessions";
import { revokeAllRefreshTokens } from "../refresh";
import { readBrokerCertificate } from "../broker-cert";
import { logger } from "../logger";
import { onlineColumn, onlineSql } from "../device-online";

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
  // Name and avatar come from the row, not the JWT: tokens outlive profile
  // edits, so reading them here means a changed photo shows up on the next
  // page load instead of waiting for the session to expire.
  const r = await pool.query<{ name: string; avatar_url: string }>(
    `SELECT name, avatar_url FROM users WHERE id = $1`,
    [req.user!.uid]
  );
  res.json({
    admin: true,
    uid: req.user!.uid,
    email: req.user!.email,
    name: r.rows[0]?.name ?? "",
    avatarUrl: r.rows[0]?.avatar_url ?? "",
  });
});

/** GET /admin/stats — fleet-wide counters. */
adminRouter.get("/stats", async (_req, res) => {
  const [users, devices, online, events, pending] = await Promise.all([
    pool.query<{ c: string }>(`SELECT COUNT(*)::int c FROM users`),
    pool.query<{ c: string }>(`SELECT COUNT(*)::int c FROM devices`),
    pool.query<{ c: string }>(`SELECT COUNT(*)::int c FROM devices WHERE ${onlineSql()}`),
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

/**
 * GET /admin/app-installs — which phones and tablets are on the platform.
 *
 * Answers the questions support and security actually get asked: what build is
 * this person on, is anyone still on the version with the bug, has this account
 * been used from somewhere it should not have been.
 *
 * There are no coordinates here, and that is deliberate rather than an
 * omission. The app holds location permission for the weather; reporting a
 * user's whereabouts to staff is a different purpose from the one they granted
 * it for, which is exactly what purpose limitation under the DPDP Act and GDPR
 * forbids. City and country come from the reverse proxy's own IP geolocation
 * where it provides one — the same thing every "recent sign-ins" screen shows —
 * and are blank rather than guessed where it does not.
 */
adminRouter.get("/app-installs", async (req, res) => {
  const platform = String(req.query.platform || "").toLowerCase();
  const rows = await listInstalls({
    limit: Number(req.query.limit) || 200,
    platform: platform === "android" || platform === "ios" ? platform : undefined,
    q: String(req.query.q || "").trim().toLowerCase() || undefined,
  });
  res.json({ installs: rows, stats: await installStats() });
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
    `SELECT d.id, d.serial, d.name, d.type, d.room, ${onlineColumn("d.")}, d.last_seen, d.fw_version, d.state,
            u.email AS owner_email, u.id AS owner_id
     FROM devices d LEFT JOIN users u ON u.id = d.owner_id
     ORDER BY ${onlineSql("d.")} DESC, d.last_seen DESC NULLS LAST`
  );
  res.json({ devices: rows });
});

/* ------------------------------------------------------------------ */
/* Device registry — internal team                                     */
/*                                                                     */
/* NOTE ON ROUTE ORDER: every literal path below must stay above the   */
/* `/devices/:id` handlers. Express matches in registration order, so  */
/* a `/devices/lookup` declared later would be swallowed by `:id` and  */
/* silently 404 as a device named "lookup".                            */
/* ------------------------------------------------------------------ */

/**
 * GET /admin/devices/lookup?q=
 *
 * The support desk's entry point: somebody reads a number off a unit and we
 * find it. Accepts a serial in any casing or spacing, a device id, a name
 * fragment, or an owner's email address, because the person calling does not
 * know which of those they are holding.
 */
adminRouter.get("/devices/lookup", async (req, res) => {
  const raw = String(req.query.q ?? "").trim();
  if (raw.length < 2) {
    res.status(400).json({ error: "Enter at least two characters to search." });
    return;
  }

  // An exact serial is the strongest signal we can get, so it is tried first
  // and short-circuits: a support call should not return a list when the
  // number on the label matches exactly one unit.
  const serial = normalizeSerial(raw);
  if (serial) {
    const { rows } = await pool.query(
      `SELECT d.id, d.serial, d.name, d.type, d.room, ${onlineColumn("d.")}, d.last_seen, d.fw_version,
              d.created_at, d.batch, u.email AS owner_email, u.id AS owner_id
         FROM devices d LEFT JOIN users u ON u.id = d.owner_id
        WHERE d.serial = $1`,
      [serial]
    );
    res.json({ matchedBy: "serial", normalized: serial, devices: rows });
    return;
  }

  // Not a valid serial. If it *looks* like one — right length, right prefix —
  // say the check character failed rather than returning an empty list, or the
  // caller goes looking for a device that never existed instead of re-reading
  // the label.
  const looksLikeSerial = /^cv[\s-]?[a-z]{3}[\s-]?[a-z0-9]{4}[\s-]?[a-z0-9]{4}$/i.test(raw);
  if (looksLikeSerial) {
    res.status(400).json({
      error: "That looks like a serial but the check character does not match — please re-read the label.",
      code: "bad_serial_checksum",
    });
    return;
  }

  const like = `%${raw.toLowerCase()}%`;
  const { rows } = await pool.query(
    `SELECT d.id, d.serial, d.name, d.type, d.room, ${onlineColumn("d.")}, d.last_seen, d.fw_version,
            d.created_at, d.batch, u.email AS owner_email, u.id AS owner_id
       FROM devices d LEFT JOIN users u ON u.id = d.owner_id
      WHERE LOWER(d.id) LIKE $1 OR LOWER(d.name) LIKE $1 OR LOWER(u.email) LIKE $1
         OR LOWER(COALESCE(d.serial,'')) LIKE $1 OR LOWER(COALESCE(d.hwid,'')) LIKE $1
      ORDER BY ${onlineSql("d.")} DESC, d.last_seen DESC NULLS LAST
      LIMIT 50`,
    [like]
  );
  res.json({ matchedBy: "search", normalized: null, devices: rows });
});

/**
 * POST /admin/devices/claim-for-user
 *
 * A customer has a unit and its claim key but cannot complete the claim
 * themselves — a failed app onboarding, a replacement handset, a bulk
 * deployment done by an installer. This performs the same check the customer's
 * own claim would: the key must verify against the stored hash. An admin can
 * assign a device (see /assign below) without the key; this route is for when
 * the key is present and should be verified, so the audit trail can record
 * that the credential really was produced.
 */
adminRouter.post("/devices/claim-for-user", async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      device: z.string().min(2),
      key: z.string().min(1),
      ownerEmail: z.string().email(),
      note: z.string().max(300).optional(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "device, key and ownerEmail are required." });
    return;
  }
  const { device, key, ownerEmail, note } = parsed.data;

  const serial = normalizeSerial(device);
  const { rows } = await pool.query<{ id: string; key_hash: string; owner_id: string | null }>(
    serial
      ? `SELECT id, key_hash, owner_id FROM devices WHERE serial = $1`
      : `SELECT id, key_hash, owner_id FROM devices WHERE id = $1`,
    [serial ?? device]
  );
  const d = rows[0];
  if (!d) {
    res.status(404).json({ error: "No device found for that serial or id." });
    return;
  }
  if (!(await verifyDeviceKey(key, d.key_hash))) {
    // Deliberately does not say whether the device exists — this endpoint is
    // reachable by any operator, and confirming a key is wrong for a device
    // that does exist is a different disclosure from "no such device".
    res.status(400).json({ error: "That key does not match this device.", code: "key_mismatch" });
    return;
  }

  const { rows: users } = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)`,
    [ownerEmail]
  );
  const user = users[0];
  if (!user) {
    res.status(404).json({ error: "No account with that email address." });
    return;
  }

  const previousOwner = d.owner_id ? Number(d.owner_id) : null;
  await pool.query(`UPDATE devices SET owner_id = $2 WHERE id = $1`, [d.id, Number(user.id)]);
  provisionBrokerClient(d.id, key);
  invalidateOwnership(d.id);

  await recordDeviceAudit(
    d.id,
    { uid: req.user!.uid, email: req.user!.email },
    "claim-for-user",
    { previousOwner, newOwner: Number(user.id), ownerEmail: user.email, keyVerified: true },
    note ?? ""
  );
  // The customer is told, in their own feed, that their account changed.
  void recordEvent(Number(user.id), "security", "Device added to your account", `${d.id} was linked by Circuvent support.`, d.id);

  res.json({ success: true, deviceId: d.id, ownerEmail: user.email });
});

/**
 * POST /admin/devices/:id/assign — move a device to an account without its key.
 *
 * Separate from claim-for-user on purpose. This is the stronger action: it
 * transfers a unit on the operator's authority alone, which is what an RMA or
 * a mis-shipped order needs, and exactly what should be hardest to do quietly.
 * It therefore requires a reason, and both the losing and gaining accounts are
 * told.
 */
adminRouter.post("/devices/:id/assign", async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      ownerEmail: z.string().email().nullable(),
      note: z.string().min(3, "Give a reason — this is an audited transfer.").max(300),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "ownerEmail and a note explaining the transfer are required." });
    return;
  }
  const { ownerEmail, note } = parsed.data;

  const { rows } = await pool.query<{ id: string; owner_id: string | null }>(
    `SELECT id, owner_id FROM devices WHERE id = $1`,
    [req.params.id]
  );
  const d = rows[0];
  if (!d) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  let newOwner: { id: number; email: string } | null = null;
  if (ownerEmail) {
    const { rows: users } = await pool.query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)`,
      [ownerEmail]
    );
    if (!users[0]) {
      res.status(404).json({ error: "No account with that email address." });
      return;
    }
    newOwner = { id: Number(users[0].id), email: users[0].email };
  }

  const previousOwner = d.owner_id ? Number(d.owner_id) : null;
  await pool.query(`UPDATE devices SET owner_id = $2 WHERE id = $1`, [d.id, newOwner?.id ?? null]);
  invalidateOwnership(d.id);
  if (previousOwner) invalidateOwner(previousOwner);

  await recordDeviceAudit(
    d.id,
    { uid: req.user!.uid, email: req.user!.email },
    newOwner ? "assign" : "unassign",
    { previousOwner, newOwner: newOwner?.id ?? null, ownerEmail: newOwner?.email ?? null },
    note
  );
  if (newOwner) {
    void recordEvent(newOwner.id, "security", "Device added to your account", `${d.id} was assigned by Circuvent support.`, d.id);
  }
  if (previousOwner && previousOwner !== newOwner?.id) {
    void recordEvent(previousOwner, "security", "Device removed from your account", `${d.id} was transferred by Circuvent support.`, d.id);
  }

  res.json({ success: true, deviceId: d.id, ownerEmail: newOwner?.email ?? null });
});

/**
 * POST /admin/devices/:id/reissue-key
 *
 * The honest answer to "the customer lost their device key".
 *
 * We store bcrypt, so the original cannot be read back — not by support, not
 * by an admin, not by us. The only thing that can be done is to issue a new
 * one, which is a real change with real consequences: the device must be
 * re-claimed or re-flashed with it, and until then it cannot reconnect to the
 * broker under the old credential.
 *
 * That is why this records an audit entry and notifies the owner, and why the
 * console spells out the consequence before the button does anything. A route
 * that quietly minted a replacement would let a support call take a customer's
 * device offline with nothing on the record explaining why.
 */
adminRouter.post("/devices/:id/reissue-key", async (req: AuthedRequest, res) => {
  const parsed = z
    .object({ note: z.string().min(3, "Give a reason — this disconnects the device.").max(300) })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "A note explaining why the key is being reissued is required." });
    return;
  }

  const { rows } = await pool.query<{ id: string; owner_id: string | null; key_rotations: number }>(
    `SELECT id, owner_id, key_rotations FROM devices WHERE id = $1`,
    [req.params.id]
  );
  const d = rows[0];
  if (!d) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const key = generateDeviceKey();
  const keyHash = await hashDeviceKey(key);
  await pool.query(
    `UPDATE devices SET key_hash = $2, key_rotated_at = now(), key_rotations = key_rotations + 1 WHERE id = $1`,
    [d.id, keyHash]
  );
  // Re-point the broker client at the new secret. Without this the device
  // would be holding a key the API accepts and the broker rejects.
  provisionBrokerClient(d.id, key);

  await recordDeviceAudit(
    d.id,
    { uid: req.user!.uid, email: req.user!.email },
    "reissue-key",
    { rotation: d.key_rotations + 1 },
    parsed.data.note
  );
  if (d.owner_id) {
    void recordEvent(
      Number(d.owner_id),
      "security",
      "Device credentials reissued",
      `${d.id} was given a new key by Circuvent support. It must be set up again with the new key.`,
      d.id
    );
  }

  logger.warn({ deviceId: d.id, by: req.user!.email }, "device key reissued");
  // Shown exactly once. It is not stored anywhere it can be read back.
  res.json({ success: true, deviceId: d.id, key, mqttUsername: d.id, mqttPassword: key });
});

/** GET /admin/devices/:id/report — the full record for one unit. */
adminRouter.get("/devices/:id/report", async (req, res) => {
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
  const report = await buildDeviceReport(req.params.id, "admin", { limit });
  if (!report) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (String(req.query.format).toLowerCase() === "csv") {
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="device-${req.params.id}-report.csv"`);
    res.send(reportToCsv(report));
    return;
  }
  res.json({ report });
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
  // Included here because the broker certificate expires on a date that is
  // knowable years ahead, and an expired one takes the whole fleet offline.
  // Somewhere an operator already looks is the right place for that.
  const brokerCert = await readBrokerCertificate();
  res.json({ mqtt, db, uptimeSec: Math.round(process.uptime()), node: process.version, brokerCert });
});

/** GET /admin/devices/:id — full detail for one device. */
adminRouter.get("/devices/:id", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.type, d.room, d.favorite, ${onlineColumn("d.")}, d.last_seen, d.fw_version, d.state, d.created_at,
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
    .object({
      name: z.string().max(120).optional(),
      room: z.string().max(80).optional(),
      owner_id: z.number().int().nullable().optional(),
      notes: z.string().max(2000).optional(),
      batch: z.string().max(60).optional(),
      // Correcting a mistyped device.
      //
      // Nothing validates the type chosen in Add Device against the firmware
      // that actually boots, so a sentinel board can be registered as a
      // camera. Until this existed there was no way to fix that: the owner
      // PATCH covers name/room/favorite only, so the unit rendered the wrong
      // controls forever — a camera panel waiting for a first frame from a
      // board with no camera fitted — and the only remedy was to delete and
      // re-provision, which loses the device's history.
      type: z.string().min(1).max(40).optional(),
    })
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
  if (d.notes !== undefined) { sets.push(`notes = $${i++}`); vals.push(d.notes); }
  if (d.batch !== undefined) { sets.push(`batch = $${i++}`); vals.push(d.batch); }
  if (d.type !== undefined) { sets.push(`type = $${i++}`); vals.push(d.type); }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "owner_id")) { sets.push(`owner_id = $${i++}`); vals.push(d.owner_id ?? null); }
  if (sets.length) await pool.query(`UPDATE devices SET ${sets.join(", ")} WHERE id = $1`, vals);
  // Reassigning an owner must revoke the previous one's cached command rights.
  invalidateOwnership(req.params.id);
  // An ownership change made through the generic patch is still an ownership
  // change, and has to reach the audit trail like the dedicated route does.
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "owner_id")) {
    void recordDeviceAudit(req.params.id, { uid: req.user!.uid, email: req.user!.email }, "assign", {
      newOwner: d.owner_id ?? null,
      via: "patch",
    });
  }
  // A type change alters which controls the apps render and which commands the
  // projection map produces, so it belongs on the record too.
  if (d.type !== undefined) {
    void recordDeviceAudit(req.params.id, { uid: req.user!.uid, email: req.user!.email }, "retype", {
      newType: d.type,
    });
  }
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
    const serial = generateSerial(parsed.data.type, hwid);
    await pool.query(
      `INSERT INTO devices (id, key_hash, owner_id, name, type, serial, hwid) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, keyHash, owner, parsed.data.name || parsed.data.type, parsed.data.type, serial, hwid]
    );
    provisionBrokerClient(id, key);
    void recordDeviceAudit(id, { uid: req.user!.uid, email: req.user!.email }, "provision", {
      type: parsed.data.type,
      serial,
      owner,
    });
    res.json({ id, key, serial, mqttUsername: id, mqttPassword: key });
  } catch (err) {
    logger.error({ err }, "admin provision failed");
    res.status(500).json({ error: "Could not provision device" });
  }
});

/** POST /admin/broadcast — publish a command to every device matching a filter. */
adminRouter.post("/broadcast", async (req: AuthedRequest, res) => {
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
  /*
   * Recorded because this is the widest action in the product: one request
   * publishes an arbitrary command to every matching device, and the fleet
   * includes locks and gates. Nothing wrote it down, so "who unlocked
   * everything at 02:00" was not answerable from any log — the MQTT publish
   * leaves no trace and the command itself is not persisted.
   *
   * Best-effort and after the publish: an audit write that failed must not
   * stop a command the operator already committed to, and must not make the
   * request look like it failed when the devices already acted on it.
   */
  await recordEvent(
    req.user!.uid,
    "security",
    `Fleet broadcast to ${rows.length} device${rows.length === 1 ? "" : "s"}`,
    `by ${req.user!.email} · target ${parsed.data.type ?? "all types"}${
      parsed.data.online === true ? " (online only)" : ""
    } · ${JSON.stringify(parsed.data.command).slice(0, 300)}`
  );
  res.json({ success: true, sent: rows.length });
});

/** POST /admin/ota-broadcast — push an OTA pointer to every device (optionally by type). */
adminRouter.post("/ota-broadcast", async (req: AuthedRequest, res) => {
  const parsed = z.object({ type: z.string().optional(), url: z.string().url(), version: z.string().max(40).optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A firmware url is required." });
    return;
  }
  const where = parsed.data.type ? `WHERE type = $1` : "";
  const vals = parsed.data.type ? [parsed.data.type] : [];
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM devices ${where}`, vals);
  for (const r of rows) publishCommand(r.id, { action: "ota", url: parsed.data.url, version: parsed.data.version ?? "" });
  // Firmware is the least reversible thing this API does, so who pushed which
  // build to how many devices is the first question after a bad rollout.
  await recordEvent(
    req.user!.uid,
    "security",
    `Firmware push to ${rows.length} device${rows.length === 1 ? "" : "s"}`,
    `by ${req.user!.email} · target ${parsed.data.type ?? "whole fleet"} · ${parsed.data.version || "unversioned"} · ${parsed.data.url}`
  );
  res.json({ success: true, sent: rows.length });
});
