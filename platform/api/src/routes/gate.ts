import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { pool, recordEvent } from "../db";
import { publishCommand } from "../mqtt";
import { requireAuth, type AuthedRequest } from "../auth";
import { logger } from "../logger";
import { refuseCommand } from "../home/enforce";

export const gateRouter = Router();

// Unambiguous alphabet (no I/L/O/0/1) for human-readable PINs / QR codes.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function genCode(n = 8): string {
  const b = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

interface PassRow {
  id: number; device_id: string; code: string; label: string;
  valid_from: string; valid_to: string; max_uses: number; uses: number;
  revoked: boolean; last_used: string | null; created_at: string;
}
function passStatus(p: PassRow): string {
  if (p.revoked) return "revoked";
  const now = Date.now();
  if (now < new Date(p.valid_from).getTime()) return "scheduled";
  if (now > new Date(p.valid_to).getTime()) return "expired";
  if (p.uses >= p.max_uses) return "used";
  return "active";
}
function toQr(code: string): string {
  return `circuvent://gate?code=${code}`;
}

const createSchema = z.object({
  deviceId: z.string().min(1),
  label: z.string().max(80).optional(),
  validToMinutes: z.number().int().min(5).max(43200).optional(), // up to 30 days
  validTo: z.string().datetime().optional(),
  validFrom: z.string().datetime().optional(),
  maxUses: z.number().int().min(1).max(999).optional(),
});

// Create a time-boxed guest pass for a gate the caller owns.
gateRouter.post("/passes", requireAuth, async (req: AuthedRequest, res) => {
  const p = createSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: "Invalid pass", details: p.error.flatten().fieldErrors });
    return;
  }
  const { deviceId, label, validToMinutes, validTo, validFrom, maxUses } = p.data;
  const own = await pool.query(`SELECT 1 FROM devices WHERE id = $1 AND owner_id = $2`, [deviceId, req.user!.uid]);
  if (!own.rowCount) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  /*
   * Minting a pass is handing out a key to the gate, so it needs the same
   * access as opening it yourself. Without this, a household member who may
   * not open the gate could issue themselves a code that does — which is a
   * longer way round to the same barrier.
   */
  const refusal = await refuseCommand(req, deviceId, { action: "grantOpen" });
  if (refusal) {
    res.status(403).json({ error: refusal });
    return;
  }
  const from = validFrom ? new Date(validFrom) : new Date();
  const to = validTo ? new Date(validTo) : new Date(Date.now() + (validToMinutes ?? 120) * 60_000);
  if (to.getTime() <= from.getTime()) {
    res.status(400).json({ error: "Validity window must end in the future" });
    return;
  }
  // Insert with one retry on the (rare) code collision.
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = genCode();
    try {
      const { rows } = await pool.query<PassRow>(
        `INSERT INTO gate_passes (owner_id, device_id, code, label, valid_from, valid_to, max_uses)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, device_id, code, label, valid_from, valid_to, max_uses, uses, revoked, last_used, created_at`,
        [req.user!.uid, deviceId, code, label || "Guest", from.toISOString(), to.toISOString(), maxUses ?? 1]
      );
      const row = rows[0];
      res.json({ pass: { ...row, status: passStatus(row), qr: toQr(row.code) } });
      return;
    } catch (err) {
      if (attempt === 1) {
        logger.error({ err }, "gate pass create failed");
        res.status(500).json({ error: "Could not create pass" });
        return;
      }
    }
  }
});

// List the caller's passes (optionally for one device).
gateRouter.get("/passes", requireAuth, async (req: AuthedRequest, res) => {
  const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : null;
  const { rows } = await pool.query<PassRow>(
    `SELECT id, device_id, code, label, valid_from, valid_to, max_uses, uses, revoked, last_used, created_at
     FROM gate_passes WHERE owner_id = $1 ${deviceId ? "AND device_id = $2" : ""}
     ORDER BY created_at DESC LIMIT 200`,
    deviceId ? [req.user!.uid, deviceId] : [req.user!.uid]
  );
  res.json({ passes: rows.map((r) => ({ ...r, status: passStatus(r), qr: toQr(r.code) })) });
});

// Revoke a pass.
gateRouter.post("/passes/:id/revoke", requireAuth, async (req: AuthedRequest, res) => {
  const { rowCount } = await pool.query(
    `UPDATE gate_passes SET revoked = true WHERE id = $1 AND owner_id = $2`,
    [Number(req.params.id), req.user!.uid]
  );
  if (!rowCount) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ success: true });
});

// Redeem a code — used by a guard/guest (NO auth; the unguessable code is the
// credential). On success the barrier opens via grantOpen.
const redeemSchema = z.object({ code: z.string().min(4).max(32) });
gateRouter.post("/redeem", async (req, res) => {
  const p = redeemSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ ok: false, error: "Invalid code" });
    return;
  }
  const code = p.data.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const { rows } = await pool.query<PassRow & { owner_id: number }>(
    `SELECT id, owner_id, device_id, code, label, valid_from, valid_to, max_uses, uses, revoked, last_used, created_at
     FROM gate_passes WHERE code = $1`,
    [code]
  );
  const pass = rows[0];
  if (!pass) {
    res.status(404).json({ ok: false, error: "Unknown code" });
    return;
  }
  const status = passStatus(pass);
  if (status !== "active") {
    res.status(403).json({ ok: false, error: `Pass ${status}` });
    return;
  }
  // Atomically claim one use (guards against double-redeem races).
  const upd = await pool.query(
    `UPDATE gate_passes SET uses = uses + 1, last_used = now()
     WHERE id = $1 AND NOT revoked AND uses < max_uses
       AND now() BETWEEN valid_from AND valid_to
     RETURNING uses`,
    [pass.id]
  );
  if (!upd.rowCount) {
    res.status(403).json({ ok: false, error: "Pass no longer valid" });
    return;
  }
  publishCommand(pass.device_id, { action: "grantOpen" });
  await recordEvent(pass.owner_id, "security", "Gate opened via guest pass", `${pass.label} used pass ${code}.`, pass.device_id).catch(() => {});
  logger.info({ device: pass.device_id, pass: pass.id }, "gate pass redeemed");
  res.json({ ok: true, opened: true, label: pass.label, usesLeft: pass.max_uses - (upd.rows[0].uses as number) });
});
