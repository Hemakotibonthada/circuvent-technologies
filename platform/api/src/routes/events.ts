import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";

export const eventsRouter = Router();

/** GET /events?limit=100&unread=1 — the notification center / activity feed. */
eventsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const unreadOnly = req.query.unread === "1" || req.query.unread === "true";
  const { rows } = await pool.query(
    `SELECT id, device_id, kind, title, body, read, ts
     FROM events WHERE owner_id = $1 ${unreadOnly ? "AND read = false" : ""}
     ORDER BY ts DESC LIMIT $2`,
    [req.user!.uid, limit]
  );
  res.json({ events: rows });
});

/** GET /events/unread-count — badge count. */
eventsRouter.get("/unread-count", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM events WHERE owner_id = $1 AND read = false`,
    [req.user!.uid]
  );
  res.json({ count: Number(rows[0]?.count ?? 0) });
});

const readSchema = z.object({ ids: z.array(z.number().int()).optional() });

/** POST /events/read — mark specific ids (or all) as read. */
eventsRouter.post("/read", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = readSchema.safeParse(req.body ?? {});
  const ids = parsed.success ? parsed.data.ids : undefined;
  if (ids && ids.length) {
    await pool.query(`UPDATE events SET read = true WHERE owner_id = $1 AND id = ANY($2::bigint[])`, [req.user!.uid, ids]);
  } else {
    await pool.query(`UPDATE events SET read = true WHERE owner_id = $1 AND read = false`, [req.user!.uid]);
  }
  res.json({ success: true });
});

/** DELETE /events/:id — remove one; /events with no id clears all. */
eventsRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  await pool.query(`DELETE FROM events WHERE id = $1 AND owner_id = $2`, [req.params.id, req.user!.uid]);
  res.json({ success: true });
});

eventsRouter.delete("/", requireAuth, async (req: AuthedRequest, res) => {
  await pool.query(`DELETE FROM events WHERE owner_id = $1`, [req.user!.uid]);
  res.json({ success: true });
});
