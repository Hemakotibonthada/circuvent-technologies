import { Router } from "express";
import { z } from "zod";
import { pool, recordEvent } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";
import { publishCommand } from "../mqtt";
import { logger } from "../logger";

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
  const owned = await pool.query<{ id: string }>(`SELECT id FROM devices WHERE owner_id = $1`, [req.user!.uid]);
  const ownedIds = new Set(owned.rows.map((r) => r.id));
  let sent = 0;
  for (const a of scene.actions ?? []) {
    if (a && typeof a.deviceId === "string" && ownedIds.has(a.deviceId) && a.command && typeof a.command === "object") {
      publishCommand(a.deviceId, a.command);
      sent++;
      void pool
        .query(`INSERT INTO commands (device_id, user_id, payload) VALUES ($1, $2, $3)`, [a.deviceId, req.user!.uid, a.command])
        .catch((err) => logger.error({ err }, "scene command audit failed"));
    }
  }
  await recordEvent(req.user!.uid, "activity", "Scene activated", `${scene.name} — ${sent} device${sent === 1 ? "" : "s"}.`);
  res.json({ success: true, sent });
});
