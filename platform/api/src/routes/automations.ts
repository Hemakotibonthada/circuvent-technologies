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
  // Day filter for time triggers, 0=Sunday … 6=Saturday, evaluated in IST.
  // Zod strips unknown keys, so this must be declared or the field is silently
  // dropped and every schedule quietly reverts to running daily.
  days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
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
export const createSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().optional(),
  trigger: triggerSchema,
  action: z.union([actionSchema, z.array(actionSchema).max(12)]),
});

/** PATCH accepts the same shapes, all optional — never raw JSON from the body. */
export const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  trigger: triggerSchema.optional(),
  action: z.union([actionSchema, z.array(actionSchema).max(12)]).optional(),
});

type Trigger = z.infer<typeof triggerSchema>;
type Action = z.infer<typeof actionSchema>;

/**
 * Every device id an automation names — trigger *and* action — must belong to
 * the caller.
 *
 * The action side was already checked at run time, but the trigger side was
 * not: pointing a trigger at someone else's device and pairing it with a
 * `notify` action (which targets no device at all) turns the notification
 * pipeline into a cross-tenant surveillance channel, and an `event` trigger's
 * `match` map into a field-value oracle over another household's telemetry.
 */
export async function ownsReferencedDevices(
  uid: number,
  trigger?: Trigger,
  action?: Action | Action[]
): Promise<boolean> {
  const ids = new Set<string>();
  if (trigger?.deviceId) ids.add(trigger.deviceId);
  for (const a of action ? (Array.isArray(action) ? action : [action]) : []) {
    if (a.deviceId) ids.add(a.deviceId);
  }
  if (!ids.size) return true;
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM devices WHERE owner_id = $1 AND id = ANY($2::text[])`,
    [uid, [...ids]]
  );
  return rows.length === ids.size;
}

automationRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, enabled, trigger, action, created_at,
              last_run_at, last_run_ok, last_error, run_count
         FROM automations WHERE owner_id = $1 ORDER BY created_at DESC`,
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
  if (!(await ownsReferencedDevices(req.user!.uid, trigger, action))) {
    res.status(403).json({ error: "That automation references a device you do not own." });
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO automations (owner_id, name, enabled, trigger, action) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, enabled, trigger, action, created_at`,
    [req.user!.uid, name, enabled ?? true, trigger, action]
  );
  res.json({ automation: rows[0] });
});

automationRouter.patch("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const p = patchSchema.safeParse(req.body ?? {});
  if (!p.success) {
    res.status(400).json({ error: "Invalid automation", details: p.error.flatten().fieldErrors });
    return;
  }
  const body = p.data;
  const { rowCount } = await pool.query(`SELECT 1 FROM automations WHERE id = $1 AND owner_id = $2`, [id, req.user!.uid]);
  if (!rowCount) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!(await ownsReferencedDevices(req.user!.uid, body.trigger, body.action))) {
    res.status(403).json({ error: "That automation references a device you do not own." });
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
      body.name ?? null,
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
