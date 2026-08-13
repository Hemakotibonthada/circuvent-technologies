import { Router } from "express";
import { z } from "zod";
import { pool, recordEvent } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";
import { publishCommand } from "../mqtt";
import { normaliseCommand } from "../device-commands";
import { logger } from "../logger";
import { refuseCommand, actorId } from "../home/enforce";

export const scenesRouter = Router();

const actionSchema = z.object({
  deviceId: z.string().min(1),
  command: z.record(z.unknown()),
});
const sceneSchema = z.object({
  name: z.string().min(1).max(120),
  icon: z.string().max(8).optional(),
  favorite: z.boolean().optional(),
  actions: z.array(actionSchema).max(64).optional(),
});

/** GET /scenes — the caller's scenes. */
scenesRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, icon, actions, favorite, created_at FROM scenes WHERE owner_id = $1 ORDER BY created_at`,
    [req.user!.uid]
  );
  res.json({ scenes: rows });
});

/** POST /scenes — create a scene. */
scenesRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = sceneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { name, icon, favorite, actions } = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO scenes (owner_id, name, icon, favorite, actions) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, icon, actions, favorite, created_at`,
    [req.user!.uid, name, icon ?? "✨", favorite ?? false, JSON.stringify(actions ?? [])]
  );
  res.json({ scene: rows[0] });
});

/** PATCH /scenes/:id — update a scene. */
scenesRouter.patch("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = sceneSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const owns = await pool.query(`SELECT 1 FROM scenes WHERE id = $1 AND owner_id = $2`, [req.params.id, req.user!.uid]);
  if (!owns.rowCount) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const d = parsed.data;
  const { rows } = await pool.query(
    `UPDATE scenes SET name = COALESCE($2, name), icon = COALESCE($3, icon),
            favorite = COALESCE($4, favorite),
            actions = COALESCE($5, actions)
     WHERE id = $1 RETURNING id, name, icon, actions, favorite, created_at`,
    [
      req.params.id,
      d.name ?? null,
      d.icon ?? null,
      d.favorite ?? null,
      d.actions ? JSON.stringify(d.actions) : null,
    ]
  );
  res.json({ scene: rows[0] });
});

/** DELETE /scenes/:id */
scenesRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  await pool.query(`DELETE FROM scenes WHERE id = $1 AND owner_id = $2`, [req.params.id, req.user!.uid]);
  res.json({ success: true });
});

/** POST /scenes/:id/activate — publish every action to devices the caller owns. */
scenesRouter.post("/:id/activate", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query<{ name: string; actions: Array<{ deviceId: string; command: Record<string, unknown> }> }>(
    `SELECT name, actions FROM scenes WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user!.uid]
  );
  const scene = rows[0];
  if (!scene) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  /*
   * Types, not just ids.
   *
   * A scene publishes whatever command was stored against it, and some stored
   * commands are the old state-shaped kind — `{ "power2": true }` with no
   * action — which CircuventDevice::_dispatch() discards before any handler
   * runs. normaliseCommand exists precisely to repair those, and it was wired
   * into rules and schedules and not into scenes, so the same broken payload
   * was fixed when a timer fired it and published raw when a scene did. That
   * repair needs the device type, which is why this now selects it.
   */
  const owned = await pool.query<{ id: string; type: string }>(
    `SELECT id, type FROM devices WHERE owner_id = $1`,
    [req.user!.uid]
  );
  const typeById = new Map(owned.rows.map((r) => [r.id, r.type]));
  let sent = 0;
  let skipped = 0;
  let refused = 0;
  try {
    for (const a of scene.actions ?? []) {
      if (!a || typeof a.deviceId !== "string" || !typeById.has(a.deviceId)) continue;
      const command = normaliseCommand(typeById.get(a.deviceId)!, a.command);
      /*
       * A command that cannot be repaired is not published. Sending a payload
       * the firmware will drop costs a broker round trip and, worse, counts
       * towards the "sent" figure the caller is shown — so the scene reports
       * having done something it did not.
       */
      if (!command) {
        skipped++;
        continue;
      }
      /*
       * A scene is a bundle, and a household member may be entitled to some of
       * it and not the rest — "Goodnight" dims the lamps and unlocks nothing,
       * but "Welcome home" may open the gate. The parts they may run are run,
       * and the rest are counted as refused rather than silently dropped, so
       * the answer distinguishes "the scene did less than you think" from
       * "the scene worked".
       */
      if (await refuseCommand(req, a.deviceId, command)) {
        refused++;
        continue;
      }
      publishCommand(a.deviceId, command);
      sent++;
      void pool
        .query(`INSERT INTO commands (device_id, user_id, payload) VALUES ($1, $2, $3)`, [a.deviceId, actorId(req), command])
        .catch((err) => logger.error({ err }, "scene command audit failed"));
    }
  } catch {
    // Broker down mid-scene. Report what did go out rather than pretending the
    // whole scene ran — and answer at all, which an uncaught rejection would not.
    res.status(503).json({ error: "The device broker is temporarily unavailable — please retry.", sent });
    return;
  }
  if (skipped > 0) {
    logger.warn({ sceneId: req.params.id, skipped }, "scene had actions no device could execute");
  }
  await recordEvent(req.user!.uid, "activity", "Scene activated", `${scene.name} — ${sent} device${sent === 1 ? "" : "s"}.`);
  res.json({
    success: true,
    sent,
    ...(skipped > 0 ? { skipped } : {}),
    /* Named plainly so the app can say which parts did not run. A scene that
       quietly does two thirds of itself is worse than one that refuses. */
    ...(refused > 0
      ? { refused, refusedReason: "Some of this scene needs access you do not have in this home." }
      : {}),
  });
});
