import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import {
  requireAuth,
  type AuthedRequest,
  signProvisionToken,
  verifyProvisionToken,
  generateDeviceKey,
  hashDeviceKey,
} from "../auth";
import { provisionBrokerClient } from "../mqtt";
import { generateSerial } from "../serial";
import { logger } from "../logger";

export const provisioningRouter = Router();

const tokenSchema = z.object({ type: z.string().min(1).max(40), name: z.string().max(120).optional() });

/**
 * POST /provisioning/token  (owner-authenticated)
 * Mint a short-lived provisioning token for a new device of `type`. The app
 * encrypts this to the device over the setup link; the device redeems it over
 * TLS at /provisioning/self. It carries NO device secret — just the capability
 * to create one device owned by this user.
 */
provisioningRouter.post("/token", requireAuth, (req: AuthedRequest, res) => {
  const p = tokenSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const token = signProvisionToken({ uid: req.user!.uid, type: p.data.type, name: p.data.name ?? "" });
  res.json({ token });
});

const selfSchema = z.object({ token: z.string().min(10), hwid: z.string().max(64).optional() });

/**
 * POST /provisioning/self  (authorized by the provisioning token, over TLS)
 * The device redeems its token: we create the device row (owned by the token's
 * user), mint the secret, create its broker client, and return id+key over the
 * TLS response. The secret is delivered cloud -> device only, never locally.
 */
provisioningRouter.post("/self", async (req, res) => {
  const p = selfSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const claims = verifyProvisionToken(p.data.token);
  if (!claims) {
    res.status(401).json({ error: "Invalid or expired provisioning token" });
    return;
  }
  const hwid = (p.data.hwid || Math.random().toString(16).slice(2, 10)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "dev";
  try {
    let id = `${claims.type}-${hwid}`.toLowerCase();
    const key = generateDeviceKey();
    const keyHash = await hashDeviceKey(key);
    const serial = generateSerial(claims.type, hwid);

    // Upsert device by serial or id or hwid
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM devices WHERE serial = $1 OR id = $2 OR (hwid = $3 AND type = $4) LIMIT 1`,
      [serial, id, hwid, claims.type]
    );

    if (existing.rowCount && existing.rows[0]?.id) {
      id = existing.rows[0].id;
      await pool.query(
        `UPDATE devices
            SET key_hash = $2,
                owner_id = $3,
                name = COALESCE(NULLIF($4, ''), name),
                type = $5,
                hwid = $6,
                serial = $7,
                online = true,
                last_seen = NOW()
          WHERE id = $1`,
        [id, keyHash, claims.uid, claims.name || claims.type, claims.type, hwid, serial]
      );
    } else {
      await pool.query(
        `INSERT INTO devices (id, key_hash, owner_id, name, type, serial, hwid)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE
         SET key_hash = EXCLUDED.key_hash,
             owner_id = EXCLUDED.owner_id,
             name = EXCLUDED.name,
             type = EXCLUDED.type,
             serial = EXCLUDED.serial,
             hwid = EXCLUDED.hwid`,
        [id, keyHash, claims.uid, claims.name || claims.type, claims.type, serial, hwid]
      );
    }

    provisionBrokerClient(id, key);
    logger.info({ id, serial, uid: claims.uid, type: claims.type }, "device self-provisioned");
    res.json({ id, key, serial, broker: "mqtt.circuvent.com" });
  } catch (err) {
    logger.error({ err }, "self-provision failed");
    res.status(500).json({ error: "Could not provision device" });
  }
});
