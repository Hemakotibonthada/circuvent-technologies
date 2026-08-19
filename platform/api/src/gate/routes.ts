/**
 * Gate tags and the access log.
 *
 *   /gate/devices/:id/tags        the vehicles that may pass, and when
 *   /gate/devices/:id/events      who came through
 *   /gate/devices/:id/sync        force a push, for when somebody is standing
 *                                 at the barrier wondering why
 *
 * Guest passes live in routes/gate.ts and are unchanged: a pass is a one-off
 * code for somebody without a tag, and a tag is a standing permission. They
 * look similar and answer different questions.
 *
 * EVERY ROUTE RE-CHECKS OWNERSHIP
 *
 * `ownsGate` is repeated in each handler rather than resolved once in a parent
 * router. This decides who can drive onto somebody's property; the check has to
 * be visible where it matters, so the next endpoint added is not the one that
 * forgets it.
 */
import { Router } from "express";
import { z } from "zod";
import { pool, recordEvent } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";
import { requireCapability } from "../home/enforce";
import { publishCommand } from "../mqtt";
import { syncGate } from "./sync";
import { wiegand26Encode } from "./access";

export const gateAccessRouter = Router();

async function ownsGate(userId: number, deviceId: string) {
  const r = await pool.query<{ id: string; type: string }>(
    `SELECT id, type FROM devices WHERE id = $1 AND owner_id = $2`,
    [deviceId, userId],
  );
  const row = r.rows[0];
  if (!row || row.type !== "rfid-gate") return null;
  return row;
}

const tagSchema = z.object({
  /*
   * The card number the reader reports, or the facility/card pair printed on
   * the tag. Both are offered because both are how somebody actually has the
   * number in front of them: read off a label before the tag is fitted, or
   * captured from the last scan once it is.
   */
  tag: z.number().int().min(0).max(0xffffffff).optional(),
  facility: z.number().int().min(0).max(255).optional(),
  card: z.number().int().min(0).max(65535).optional(),
  label: z.string().trim().max(60).default(""),
  vehicle: z.string().trim().max(24).default(""),
  active: z.boolean().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
  days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  fromMinute: z.number().int().min(0).max(1439).nullable().optional(),
  toMinute: z.number().int().min(0).max(1439).nullable().optional(),
  note: z.string().trim().max(200).optional(),
});

/** Resolves whichever form the caller used into the number the reader reports. */
function tagNumberFrom(d: z.infer<typeof tagSchema>): number | null {
  if (typeof d.tag === "number") return d.tag;
  if (typeof d.facility === "number" && typeof d.card === "number") {
    // Encode then strip parity, so it matches exactly what the gate decodes.
    return (wiegand26Encode(d.facility, d.card) >>> 1) & 0xffffff;
  }
  return null;
}

gateAccessRouter.get("/devices/:id/tags", requireAuth, async (req: AuthedRequest, res) => {
  const dev = await ownsGate(req.user!.uid, req.params.id);
  if (!dev) return res.status(404).json({ error: "not found" });

  const r = await pool.query(
    `SELECT id, tag, label, vehicle, active,
            valid_from AS "validFrom", valid_to AS "validTo", days,
            from_minute AS "fromMinute", to_minute AS "toMinute", note,
            created_at AS "createdAt"
       FROM gate_tags WHERE device_id = $1 ORDER BY label, tag`,
    [dev.id],
  );
  res.json({ tags: r.rows });
});

gateAccessRouter.post(
  "/devices/:id/tags",
  requireAuth,
  requireCapability("manage-devices"),
  async (req: AuthedRequest, res) => {
    const dev = await ownsGate(req.user!.uid, req.params.id);
    if (!dev) return res.status(404).json({ error: "not found" });

    const parsed = tagSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid" });
    }
    const d = parsed.data;
    const tagNumber = tagNumberFrom(d);
    if (tagNumber === null) {
      return res.status(400).json({ error: "Give either tag, or facility and card." });
    }

    /*
     * Re-enrolling the same physical tag updates the existing row rather than
     * adding a second. Two rows for one tag is how a revocation stops working:
     * the old permissive rule is still there, and the list the device is sent
     * is the union of both.
     */
    const r = await pool.query<{ id: string }>(
      `INSERT INTO gate_tags
         (device_id, owner_id, tag, label, vehicle, active, valid_from, valid_to,
          days, from_minute, to_minute, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (device_id, tag) DO UPDATE SET
         label = EXCLUDED.label, vehicle = EXCLUDED.vehicle, active = EXCLUDED.active,
         valid_from = EXCLUDED.valid_from, valid_to = EXCLUDED.valid_to,
         days = EXCLUDED.days, from_minute = EXCLUDED.from_minute,
         to_minute = EXCLUDED.to_minute, note = EXCLUDED.note
       RETURNING id`,
      [
        dev.id,
        req.user!.uid,
        tagNumber,
        d.label,
        d.vehicle,
        d.active ?? true,
        d.validFrom ?? null,
        d.validTo ?? null,
        d.days ?? [],
        d.fromMinute ?? null,
        d.toMinute ?? null,
        d.note ?? "",
      ],
    );

    await syncGate(dev.id, true);
    await recordEvent(
      req.user!.uid,
      "gate",
      `Gate tag ${d.label || tagNumber} saved`,
      d.vehicle,
      dev.id,
    );
    res.json({ ok: true, id: r.rows[0].id, tag: tagNumber });
  },
);

gateAccessRouter.delete(
  "/devices/:id/tags/:tagId",
  requireAuth,
  requireCapability("manage-devices"),
  async (req: AuthedRequest, res) => {
    const dev = await ownsGate(req.user!.uid, req.params.id);
    if (!dev) return res.status(404).json({ error: "not found" });

    await pool.query(`DELETE FROM gate_tags WHERE id = $1 AND device_id = $2`, [
      req.params.tagId,
      dev.id,
    ]);
    /*
     * Forced, and awaited. A revocation that is merely queued is a car that can
     * still drive in, and the person doing the revoking is entitled to know it
     * has actually left the building.
     */
    await syncGate(dev.id, true);
    await recordEvent(req.user!.uid, "gate", "Gate tag removed", "", dev.id);
    res.json({ ok: true });
  },
);

gateAccessRouter.get("/devices/:id/events", requireAuth, async (req: AuthedRequest, res) => {
  const dev = await ownsGate(req.user!.uid, req.params.id);
  if (!dev) return res.status(404).json({ error: "not found" });

  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));
  const deniedOnly = req.query.denied === "1";

  const r = await pool.query(
    `SELECT id, tag, label, allowed, reason, at
       FROM gate_events
      WHERE device_id = $1 ${deniedOnly ? "AND allowed = false" : ""}
      ORDER BY at DESC
      LIMIT $2`,
    [dev.id, limit],
  );
  res.json({ events: r.rows });
});

/** Push the list now — for somebody standing at a barrier that will not open. */
gateAccessRouter.post(
  "/devices/:id/sync",
  requireAuth,
  requireCapability("manage-devices"),
  async (req: AuthedRequest, res) => {
    const dev = await ownsGate(req.user!.uid, req.params.id);
    if (!dev) return res.status(404).json({ error: "not found" });
    await syncGate(dev.id, true);
    res.json({ ok: true });
  },
);

/**
 * Open the barrier by hand, and say so in the log.
 *
 * The plain `open` command already exists on the device. This exists so that a
 * manual opening appears in the access log alongside the tags — otherwise the
 * record shows four cars entering on an evening when six did, and the log
 * quietly stops being something anybody trusts.
 */
gateAccessRouter.post("/devices/:id/open", requireAuth, async (req: AuthedRequest, res) => {
  const dev = await ownsGate(req.user!.uid, req.params.id);
  if (!dev) return res.status(404).json({ error: "not found" });

  publishCommand(dev.id, { action: "open" });
  await pool.query(
    `INSERT INTO gate_events (device_id, owner_id, allowed, reason, label)
     VALUES ($1,$2,true,'manual',$3)`,
    [dev.id, req.user!.uid, req.user!.email ?? "app"],
  );
  res.json({ ok: true });
});
