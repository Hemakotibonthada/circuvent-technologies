import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";

export const automationRouter = Router();

const triggerSchema = z.object({
  type: z.enum(["state", "time", "event"]),
  deviceId: z.string().optional(),
  field: z.string().optional(),
  op: z.enum(["<", "<=", ">", ">=", "==", "!=", "truthy", "falsy"]).optional(),
  value: z.union([z.number(), z.string(), z.boolean()]).optional(),
  at: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  eventType: z.string().max(40).optional(),
  match: z.record(z.string(), z.unknown()).optional(),
});
const actionSchema = z.object({
  type: z.enum(["command", "notify", "tts"]),
  deviceId: z.string().optional(),
  command: z.record(z.string(), z.unknown()).optional(),
  title: z.string().max(120).optional(),
  body: z.string().max(300).optional(),
  text: z.string().max(300).optional(),
  delayMs: z.number().int().min(0).max(30000).optional(),
});
const createSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().optional(),
  trigger: triggerSchema,
  action: z.union([actionSchema, z.array(actionSchema).max(12)]),
});

automationRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, enabled, trigger, action, created_at FROM automations WHERE owner_id = $1 ORDER BY created_at DESC`,
    [req.user!.uid]
  );
  res.json({ automations: rows });
});

automationRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const p = createSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: "Invalid automation", details: p.error.flatten().fieldErrors });
    return;
  }
  const { name, enabled, trigger, action } = p.data;
  const { rows } = await pool.query(
    `INSERT INTO automations (owner_id, name, enabled, trigger, action) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, enabled, trigger, action, created_at`,
    [req.user!.uid, name, enabled ?? true, trigger, action]
  );
  res.json({ automation: rows[0] });
});

automationRouter.patch("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const body = req.body ?? {};
  const { rowCount } = await pool.query(`SELECT 1 FROM automations WHERE id = $1 AND owner_id = $2`, [id, req.user!.uid]);
  if (!rowCount) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await pool.query(
    `UPDATE automations SET
       name    = COALESCE($2, name),
       enabled = COALESCE($3, enabled),
       trigger = COALESCE($4, trigger),
       action  = COALESCE($5, action)
     WHERE id = $1`,
    [
      id,
      typeof body.name === "string" ? body.name : null,
      typeof body.enabled === "boolean" ? body.enabled : null,
      body.trigger ? JSON.stringify(body.trigger) : null,
      body.action ? JSON.stringify(body.action) : null,
    ]
  );
  res.json({ success: true });
});

automationRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  await pool.query(`DELETE FROM automations WHERE id = $1 AND owner_id = $2`, [Number(req.params.id), req.user!.uid]);
  res.json({ success: true });
});
