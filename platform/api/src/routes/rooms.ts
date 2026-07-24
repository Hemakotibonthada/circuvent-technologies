import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";

export const roomsRouter = Router();

interface RoomRow {
  id: number | null;
  name: string;
  icon: string;
  sort: number;
  count: number;
}

/**
 * GET /rooms — the caller's rooms, merged from the `rooms` metadata table and
 * the distinct non-empty device `room` values, each with a live device count.
 */
roomsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.uid;
  const { rows } = await pool.query<RoomRow>(
    `WITH names AS (
       SELECT name FROM rooms WHERE owner_id = $1
       UNION
       SELECT DISTINCT room AS name FROM devices WHERE owner_id = $1 AND room <> ''
     )
     SELECT r.id, n.name,
            COALESCE(r.icon, '🏠') AS icon,
            COALESCE(r.sort, 0)    AS sort,
            (SELECT COUNT(*)::int FROM devices d WHERE d.owner_id = $1 AND d.room = n.name) AS count
     FROM names n
     LEFT JOIN rooms r ON r.owner_id = $1 AND r.name = n.name
     ORDER BY sort, name`,
    [uid]
  );
  res.json({ rooms: rows });
});

const roomSchema = z.object({ name: z.string().min(1).max(80), icon: z.string().max(8).optional(), sort: z.number().int().optional() });

/** POST /rooms — create (or upsert) a room's metadata. */
roomsRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { name, icon, sort } = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO rooms (owner_id, name, icon, sort) VALUES ($1, $2, $3, $4)
     ON CONFLICT (owner_id, name) DO UPDATE SET icon = EXCLUDED.icon, sort = EXCLUDED.sort
     RETURNING id, name, icon, sort`,
    [req.user!.uid, name, icon ?? "🏠", sort ?? 0]
  );
  res.json({ room: rows[0] });
});

/** PATCH /rooms/:id — rename / re-icon / reorder. Renaming re-tags devices. */
roomsRouter.patch("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = roomSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { rows } = await pool.query<{ name: string }>(`SELECT name FROM rooms WHERE id = $1 AND owner_id = $2`, [req.params.id, req.user!.uid]);
  const cur = rows[0];
  if (!cur) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await pool.query(
    `UPDATE rooms SET name = COALESCE($2, name), icon = COALESCE($3, icon), sort = COALESCE($4, sort) WHERE id = $1`,
    [req.params.id, parsed.data.name ?? null, parsed.data.icon ?? null, parsed.data.sort ?? null]
  );
  if (parsed.data.name && parsed.data.name !== cur.name) {
    await pool.query(`UPDATE devices SET room = $3 WHERE owner_id = $1 AND room = $2`, [req.user!.uid, cur.name, parsed.data.name]);
  }
  res.json({ success: true });
});

/** DELETE /rooms/:id — remove the room; its devices become unassigned. */
roomsRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query<{ name: string }>(`SELECT name FROM rooms WHERE id = $1 AND owner_id = $2`, [req.params.id, req.user!.uid]);
  const cur = rows[0];
  if (cur) {
    await pool.query(`UPDATE devices SET room = '' WHERE owner_id = $1 AND room = $2`, [req.user!.uid, cur.name]);
    await pool.query(`DELETE FROM rooms WHERE id = $1 AND owner_id = $2`, [req.params.id, req.user!.uid]);
  }
  res.json({ success: true });
});
