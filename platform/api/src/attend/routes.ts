/**
 * The attendance and access-control API.
 *
 * One REST surface serving a school register, an office timesheet and a
 * server-room door log, because underneath they are the same thing: a person,
 * in a group, expected at certain times, carrying a credential, passing a
 * door. The wording differs and the reports differ; the rows do not.
 *
 * SHAPE OF THE THING
 *
 *   /attendance/sites          the building and its policy
 *   /attendance/groups         classes, departments, teams
 *   /attendance/people         the roll
 *   /attendance/credentials    cards and fobs
 *   /attendance/zones          doors
 *   /attendance/terminals      readers on walls
 *   /attendance/schedules      when people are expected
 *   /attendance/rules          who may pass which door, when
 *   /attendance/access-requests asking to come into the building, and answers
 *   /attendance/leaves         authorised absence and closures
 *   /attendance/punches        the raw scans
 *   /attendance/register       the day's register
 *   /attendance/summary        a range, per person
 *   /attendance/live           what is happening right now
 *   /attendance/export         the same data as CSV
 *
 * EVERYTHING IS SCOPED BY SITE, AND EVERY SITE IS SCOPED BY OWNER
 *
 * A single `ownsSite` check at the top of each handler is what stands between
 * one school and another's register. It is deliberately repeated rather than
 * inferred from a parent route: a nested router that resolved the site once
 * would make the check invisible at the point where it matters, and the next
 * endpoint added would be the one that forgot.
 */
import { Router } from "express";
import { z } from "zod";
import { pool, recordEvent } from "../db";
import { publishCommand } from "../mqtt";
import { requireAuth, type AuthedRequest } from "../auth";
import { logger } from "../logger";
import { requireCapability } from "../home/enforce";
import { onlineColumn } from "../device-online";
import { syncSite, syncTerminal } from "./acl";
import { autoDecide } from "./access-requests";
import { ingestPunch } from "./ingest";
import {
  getSite,
  recomputeDay,
  recomputeRange,
  siteToday,
  type SiteSettings,
} from "./rollup";
import { addDays, eachDay, formatHHMM, localMoment, parseHHMM } from "./schedule";

export const attendanceRouter = Router();

/*
 * Reading a register is not device management, but changing who can open a
 * door certainly is. Reads stay open to anybody in the household or
 * organisation; every mutation below needs the capability that also covers
 * adding and removing devices.
 */
attendanceRouter.use(requireCapability("manage-devices"));

/** The site, if this caller owns it. Null is a 404, never a 403. */
async function ownsSite(siteId: unknown, uid: number): Promise<SiteSettings | null> {
  const id = Number(siteId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const site = await getSite(id);
  return site && site.ownerId === uid ? site : null;
}

/**
 * A guard for every numeric path parameter.
 *
 * Express 4 does not route async rejections, so a malformed id reaching a
 * BIGINT column throws inside a promise nothing is waiting on and takes the
 * whole process down. That is not hypothetical — it happened once already, on
 * the ANPR routes, and this is the same shape of hole.
 */
function id(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Rows scoped to a site the caller owns, or a 404. */
async function scoped<T>(
  req: AuthedRequest,
  siteId: unknown,
  fn: (site: SiteSettings) => Promise<T>
): Promise<T | null> {
  const site = await ownsSite(siteId, req.user!.uid);
  if (!site) return null;
  return fn(site);
}

const notFound = { error: "Not found" };

/* ------------------------------------------------------------------ *
 * Sites
 * ------------------------------------------------------------------ */

const siteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["school", "office", "facility"]).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  graceMinutes: z.number().int().min(0).max(240).optional(),
  halfDayAfterMinutes: z.number().int().min(15).max(720).optional(),
  absentAfterMinutes: z.number().int().min(5).max(1440).optional(),
  autoOut: z.boolean().optional(),
  dedupeSeconds: z.number().int().min(0).max(3600).optional(),
  notifyGuardians: z.boolean().optional(),
  notifyAbsence: z.boolean().optional(),
  requireAccessRequest: z.boolean().optional(),
});

attendanceRouter.get("/sites", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT s.*,
            (SELECT count(*) FROM attend_people p WHERE p.site_id = s.id AND p.active)::int AS people,
            (SELECT count(*) FROM attend_terminals t WHERE t.site_id = s.id)::int AS terminals
       FROM attend_sites s WHERE s.owner_id = $1 ORDER BY s.name`,
    [req.user!.uid]
  );
  res.json({ sites: rows.map(siteOut) });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
function siteOut(r: any) {
  return {
    id: Number(r.id),
    name: r.name,
    kind: r.kind,
    timezone: r.timezone,
    graceMinutes: r.grace_minutes,
    halfDayAfterMinutes: r.half_day_after_minutes,
    absentAfterMinutes: r.absent_after_minutes,
    autoOut: r.auto_out,
    dedupeSeconds: r.dedupe_seconds,
    notifyGuardians: r.notify_guardians,
    notifyAbsence: r.notify_absence,
    requireAccessRequest: r.require_access_request ?? false,
    people: r.people ?? 0,
    terminals: r.terminals ?? 0,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

attendanceRouter.post("/sites", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = siteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid site" });
    return;
  }
  const d = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO attend_sites (owner_id, name, kind, timezone, grace_minutes,
                               half_day_after_minutes, absent_after_minutes, auto_out,
                               dedupe_seconds, notify_guardians, notify_absence)
     VALUES ($1,$2,COALESCE($3,'school'),COALESCE($4,'Asia/Kolkata'),COALESCE($5,10),
             COALESCE($6,180),COALESCE($7,120),COALESCE($8,true),COALESCE($9,60),
             COALESCE($10,false),COALESCE($11,false))
     RETURNING *`,
    [
      req.user!.uid, d.name, d.kind ?? null, d.timezone ?? null, d.graceMinutes ?? null,
      d.halfDayAfterMinutes ?? null, d.absentAfterMinutes ?? null, d.autoOut ?? null,
      d.dedupeSeconds ?? null, d.notifyGuardians ?? null, d.notifyAbsence ?? null,
    ]
  );
  await recordEvent(req.user!.uid, "attendance", `Attendance site "${d.name}" created`, "", null);
  res.status(201).json({ site: siteOut(rows[0]) });
});

attendanceRouter.patch("/sites/:id", requireAuth, async (req: AuthedRequest, res) => {
  const site = await ownsSite(req.params.id, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const parsed = siteSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid site" }); return; }
  const d = parsed.data;

  const { rows } = await pool.query(
    `UPDATE attend_sites SET
       name = COALESCE($2, name), kind = COALESCE($3, kind), timezone = COALESCE($4, timezone),
       grace_minutes = COALESCE($5, grace_minutes),
       half_day_after_minutes = COALESCE($6, half_day_after_minutes),
       absent_after_minutes = COALESCE($7, absent_after_minutes),
       auto_out = COALESCE($8, auto_out), dedupe_seconds = COALESCE($9, dedupe_seconds),
       notify_guardians = COALESCE($10, notify_guardians),
       notify_absence = COALESCE($11, notify_absence),
       require_access_request = COALESCE($12, require_access_request),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      site.id, d.name ?? null, d.kind ?? null, d.timezone ?? null, d.graceMinutes ?? null,
      d.halfDayAfterMinutes ?? null, d.absentAfterMinutes ?? null, d.autoOut ?? null,
      d.dedupeSeconds ?? null, d.notifyGuardians ?? null, d.notifyAbsence ?? null,
      d.requireAccessRequest ?? null,
    ]
  );
  /*
   * Policy changed, so the register that was derived from the old policy is
   * now wrong. Recomputing today immediately is what stops a screen showing
   * yesterday's rules until somebody happens to scan.
   */
  void recomputeDay(site.id, siteToday(site)).catch((err) =>
    logger.error({ err, siteId: site.id }, "recompute after site change failed")
  );
  res.json({ site: siteOut(rows[0]) });
});

attendanceRouter.delete("/sites/:id", requireAuth, async (req: AuthedRequest, res) => {
  const site = await ownsSite(req.params.id, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  await pool.query(`DELETE FROM attend_sites WHERE id = $1`, [site.id]);
  await recordEvent(req.user!.uid, "attendance", `Attendance site "${site.name}" deleted`, "", null);
  res.json({ success: true });
});

/* ------------------------------------------------------------------ *
 * Groups
 * ------------------------------------------------------------------ */

const groupSchema = z.object({
  siteId: z.union([z.number(), z.string()]),
  name: z.string().trim().min(1).max(80),
  kind: z.string().trim().max(24).optional(),
  parentId: z.union([z.number(), z.string()]).nullable().optional(),
  scheduleId: z.union([z.number(), z.string()]).nullable().optional(),
  leadName: z.string().trim().max(120).optional(),
  leadEmail: z.string().trim().max(160).optional(),
});

attendanceRouter.get("/groups", requireAuth, async (req: AuthedRequest, res) => {
  const out = await scoped(req, req.query.siteId, async (site) => {
    const { rows } = await pool.query(
      `SELECT g.*, (SELECT count(*) FROM attend_people p
                     WHERE p.group_id = g.id AND p.active)::int AS people
         FROM attend_groups g WHERE g.site_id = $1 ORDER BY g.name`,
      [site.id]
    );
    return rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      kind: r.kind,
      parentId: r.parent_id === null ? null : Number(r.parent_id),
      scheduleId: r.schedule_id === null ? null : Number(r.schedule_id),
      leadName: r.lead_name,
      leadEmail: r.lead_email,
      people: r.people,
    }));
  });
  if (!out) { res.status(404).json(notFound); return; }
  res.json({ groups: out });
});

attendanceRouter.post("/groups", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = groupSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid group" }); return; }
  const site = await ownsSite(parsed.data.siteId, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const d = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO attend_groups (site_id, name, kind, parent_id, schedule_id, lead_name, lead_email)
       VALUES ($1,$2,COALESCE($3,'class'),$4,$5,COALESCE($6,''),COALESCE($7,''))
       RETURNING id`,
      [site.id, d.name, d.kind ?? null, d.parentId ?? null, d.scheduleId ?? null,
       d.leadName ?? null, d.leadEmail ?? null]
    );
    res.status(201).json({ group: { id: Number(rows[0].id), name: d.name } });
  } catch (err) {
    // The unique index on (site, lower(name)) is what stops two "5A"s, which
    // would split a class in half in every report without anybody noticing.
    res.status(409).json({ error: "A group with that name already exists here" });
    logger.debug({ err }, "group insert rejected");
  }
});

attendanceRouter.patch("/groups/:id", requireAuth, async (req: AuthedRequest, res) => {
  const gid = id(req.params.id);
  if (!gid) { res.status(404).json(notFound); return; }
  const { rows: own } = await pool.query(
    `SELECT g.site_id FROM attend_groups g JOIN attend_sites s ON s.id = g.site_id
      WHERE g.id = $1 AND s.owner_id = $2`,
    [gid, req.user!.uid]
  );
  if (!own[0]) { res.status(404).json(notFound); return; }
  const parsed = groupSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid group" }); return; }
  const d = parsed.data;
  await pool.query(
    `UPDATE attend_groups SET name = COALESCE($2,name), kind = COALESCE($3,kind),
       parent_id = $4, schedule_id = $5,
       lead_name = COALESCE($6,lead_name), lead_email = COALESCE($7,lead_email),
       updated_at = now()
     WHERE id = $1`,
    [gid, d.name ?? null, d.kind ?? null, d.parentId ?? null, d.scheduleId ?? null,
     d.leadName ?? null, d.leadEmail ?? null]
  );
  void syncSite(Number(own[0].site_id));
  res.json({ success: true });
});

attendanceRouter.delete("/groups/:id", requireAuth, async (req: AuthedRequest, res) => {
  const gid = id(req.params.id);
  if (!gid) { res.status(404).json(notFound); return; }
  const r = await pool.query(
    `DELETE FROM attend_groups g USING attend_sites s
      WHERE g.id = $1 AND s.id = g.site_id AND s.owner_id = $2`,
    [gid, req.user!.uid]
  );
  if (!r.rowCount) { res.status(404).json(notFound); return; }
  res.json({ success: true });
});

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

const personSchema = z.object({
  siteId: z.union([z.number(), z.string()]),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  role: z.enum(["student", "staff", "employee", "visitor", "contractor"]).optional(),
  groupId: z.union([z.number(), z.string()]).nullable().optional(),
  scheduleId: z.union([z.number(), z.string()]).nullable().optional(),
  email: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  guardianName: z.string().trim().max(120).optional(),
  guardianEmail: z.string().trim().max(160).optional(),
  guardianPhone: z.string().trim().max(40).optional(),
  active: z.boolean().optional(),
  validFrom: z.string().trim().max(10).nullable().optional(),
  validTo: z.string().trim().max(10).nullable().optional(),
  photoUrl: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/* eslint-disable @typescript-eslint/no-explicit-any */
function personOut(r: any) {
  return {
    id: Number(r.id),
    code: r.code,
    name: r.name,
    role: r.role,
    groupId: r.group_id === null ? null : Number(r.group_id),
    groupName: r.group_name ?? null,
    scheduleId: r.schedule_id === null ? null : Number(r.schedule_id),
    email: r.email,
    phone: r.phone,
    guardianName: r.guardian_name,
    guardianEmail: r.guardian_email,
    guardianPhone: r.guardian_phone,
    active: r.active,
    validFrom: r.valid_from,
    validTo: r.valid_to,
    photoUrl: r.photo_url,
    notes: r.notes,
    cards: r.cards ?? 0,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

attendanceRouter.get("/people", requireAuth, async (req: AuthedRequest, res) => {
  const out = await scoped(req, req.query.siteId, async (site) => {
    const groupId = id(req.query.groupId);
    const q = String(req.query.q ?? "").trim();
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
    const { rows } = await pool.query(
      `SELECT p.*, g.name AS group_name,
              to_char(p.valid_from,'YYYY-MM-DD') AS valid_from,
              to_char(p.valid_to,'YYYY-MM-DD')   AS valid_to,
              (SELECT count(*) FROM attend_credentials c
                WHERE c.person_id = p.id AND c.active)::int AS cards
         FROM attend_people p
         LEFT JOIN attend_groups g ON g.id = p.group_id
        WHERE p.site_id = $1
          AND ($2::bigint IS NULL OR p.group_id = $2)
          AND ($3 = '' OR p.name ILIKE '%' || $3 || '%' OR p.code ILIKE '%' || $3 || '%')
        ORDER BY p.name LIMIT $4`,
      [site.id, groupId, q, limit]
    );
    return rows.map(personOut);
  });
  if (!out) { res.status(404).json(notFound); return; }
  res.json({ people: out });
});

attendanceRouter.post("/people", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = personSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid person" }); return; }
  const site = await ownsSite(parsed.data.siteId, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const d = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO attend_people (site_id, group_id, code, name, role, email, phone,
                                  guardian_name, guardian_email, guardian_phone,
                                  schedule_id, active, valid_from, valid_to, photo_url, notes)
       VALUES ($1,$2,$3,$4,COALESCE($5,'student'),COALESCE($6,''),COALESCE($7,''),
               COALESCE($8,''),COALESCE($9,''),COALESCE($10,''),$11,COALESCE($12,true),
               $13::date,$14::date,COALESCE($15,''),COALESCE($16,''))
       RETURNING *, to_char(valid_from,'YYYY-MM-DD') AS valid_from,
                    to_char(valid_to,'YYYY-MM-DD') AS valid_to`,
      [site.id, d.groupId ?? null, d.code, d.name, d.role ?? null, d.email ?? null,
       d.phone ?? null, d.guardianName ?? null, d.guardianEmail ?? null, d.guardianPhone ?? null,
       d.scheduleId ?? null, d.active ?? null, d.validFrom || null, d.validTo || null,
       d.photoUrl ?? null, d.notes ?? null]
    );
    res.status(201).json({ person: personOut(rows[0]) });
  } catch (err) {
    logger.debug({ err }, "person insert rejected");
    res.status(409).json({ error: `Somebody already has the code "${d.code}" at this site` });
  }
});

attendanceRouter.patch("/people/:id", requireAuth, async (req: AuthedRequest, res) => {
  const pid = id(req.params.id);
  if (!pid) { res.status(404).json(notFound); return; }
  const { rows: own } = await pool.query(
    `SELECT p.site_id FROM attend_people p JOIN attend_sites s ON s.id = p.site_id
      WHERE p.id = $1 AND s.owner_id = $2`,
    [pid, req.user!.uid]
  );
  if (!own[0]) { res.status(404).json(notFound); return; }
  const parsed = personSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid person" }); return; }
  const d = parsed.data;
  const { rows } = await pool.query(
    `UPDATE attend_people SET
       group_id = COALESCE($2, group_id), code = COALESCE($3, code), name = COALESCE($4, name),
       role = COALESCE($5, role), email = COALESCE($6, email), phone = COALESCE($7, phone),
       guardian_name = COALESCE($8, guardian_name),
       guardian_email = COALESCE($9, guardian_email),
       guardian_phone = COALESCE($10, guardian_phone),
       schedule_id = COALESCE($11, schedule_id), active = COALESCE($12, active),
       valid_from = COALESCE($13::date, valid_from), valid_to = COALESCE($14::date, valid_to),
       photo_url = COALESCE($15, photo_url), notes = COALESCE($16, notes),
       updated_at = now()
     WHERE id = $1
     RETURNING *, to_char(valid_from,'YYYY-MM-DD') AS valid_from,
                  to_char(valid_to,'YYYY-MM-DD') AS valid_to`,
    [pid, d.groupId ?? null, d.code ?? null, d.name ?? null, d.role ?? null, d.email ?? null,
     d.phone ?? null, d.guardianName ?? null, d.guardianEmail ?? null, d.guardianPhone ?? null,
     d.scheduleId ?? null, d.active ?? null, d.validFrom ?? null, d.validTo ?? null,
     d.photoUrl ?? null, d.notes ?? null]
  );
  /*
   * A change here can mean somebody stopped being allowed through a door —
   * deactivated, or given an end date. The terminals hold their own copy of
   * who may pass, so it has to be told, and told now rather than within the
   * minute the sweep would take.
   */
  void syncSite(Number(own[0].site_id));
  res.json({ person: personOut(rows[0]) });
});

attendanceRouter.delete("/people/:id", requireAuth, async (req: AuthedRequest, res) => {
  const pid = id(req.params.id);
  if (!pid) { res.status(404).json(notFound); return; }
  const { rows } = await pool.query(
    `SELECT p.site_id FROM attend_people p JOIN attend_sites s ON s.id = p.site_id
      WHERE p.id = $1 AND s.owner_id = $2`,
    [pid, req.user!.uid]
  );
  if (!rows[0]) { res.status(404).json(notFound); return; }
  await pool.query(`DELETE FROM attend_people WHERE id = $1`, [pid]);
  void syncSite(Number(rows[0].site_id));
  res.json({ success: true });
});

/**
 * POST /attendance/people/import — a roll, as CSV.
 *
 * Every school and office already has this list somewhere, and typing eight
 * hundred names into a web form is not a feature anybody will use. Matching on
 * `code` makes a re-import an update rather than a second intake, which is
 * what turns "we exported it again with the new starters" into a working
 * workflow instead of eight hundred duplicates.
 */
attendanceRouter.post("/people/import", requireAuth, async (req: AuthedRequest, res) => {
  const siteId = req.body?.siteId;
  const site = await ownsSite(siteId, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const rowsIn = Array.isArray(req.body?.people) ? req.body.people : null;
  if (!rowsIn) { res.status(400).json({ error: "Send people as an array" }); return; }
  if (rowsIn.length > 2000) { res.status(413).json({ error: "Import at most 2000 at a time" }); return; }

  let created = 0, updated = 0, failed = 0;
  const errors: string[] = [];

  for (const raw of rowsIn) {
    const parsed = personSchema.omit({ siteId: true }).safeParse(raw);
    if (!parsed.success) {
      failed++;
      if (errors.length < 20) errors.push(`${String(raw?.code ?? raw?.name ?? "?")}: not valid`);
      continue;
    }
    const d = parsed.data;
    try {
      // A named group is resolved by name, because a spreadsheet has "5A" in
      // it and not a database id.
      let groupId: number | null = d.groupId ? Number(d.groupId) : null;
      const groupName = typeof raw.group === "string" ? raw.group.trim() : "";
      if (!groupId && groupName) {
        const g = await pool.query(
          `INSERT INTO attend_groups (site_id, name) VALUES ($1, $2)
           ON CONFLICT (site_id, lower(name)) DO UPDATE SET updated_at = now()
           RETURNING id`,
          [site.id, groupName]
        );
        groupId = Number(g.rows[0].id);
      }
      const r = await pool.query(
        `INSERT INTO attend_people (site_id, group_id, code, name, role, email, phone,
                                    guardian_name, guardian_email, guardian_phone,
                                    active, valid_from, valid_to)
         VALUES ($1,$2,$3,$4,COALESCE($5,'student'),COALESCE($6,''),COALESCE($7,''),
                 COALESCE($8,''),COALESCE($9,''),COALESCE($10,''),COALESCE($11,true),
                 $12::date,$13::date)
         ON CONFLICT (site_id, lower(code)) DO UPDATE SET
           name = EXCLUDED.name, group_id = EXCLUDED.group_id, role = EXCLUDED.role,
           email = EXCLUDED.email, phone = EXCLUDED.phone,
           guardian_name = EXCLUDED.guardian_name,
           guardian_email = EXCLUDED.guardian_email,
           guardian_phone = EXCLUDED.guardian_phone,
           updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
        [site.id, groupId, d.code, d.name, d.role ?? null, d.email ?? null, d.phone ?? null,
         d.guardianName ?? null, d.guardianEmail ?? null, d.guardianPhone ?? null,
         d.active ?? null, d.validFrom || null, d.validTo || null]
      );
      if (r.rows[0]?.inserted) created++; else updated++;
    } catch (err) {
      failed++;
      logger.debug({ err }, "import row failed");
      if (errors.length < 20) errors.push(`${d.code}: could not be saved`);
    }
  }

  void syncSite(site.id);
  await recordEvent(
    req.user!.uid, "attendance",
    `Roll imported for ${site.name}`,
    `${created} added, ${updated} updated${failed ? `, ${failed} failed` : ""}`,
    null
  );
  res.json({ created, updated, failed, errors });
});

/* ------------------------------------------------------------------ *
 * Credentials
 * ------------------------------------------------------------------ */

const credentialSchema = z.object({
  personId: z.union([z.number(), z.string()]),
  cardNumber: z.union([z.number(), z.string()]),
  kind: z.enum(["card", "fob", "wiegand", "pin", "plate"]).optional(),
  label: z.string().trim().max(80).optional(),
});

attendanceRouter.get("/credentials", requireAuth, async (req: AuthedRequest, res) => {
  const out = await scoped(req, req.query.siteId, async (site) => {
    const personId = id(req.query.personId);
    const { rows } = await pool.query(
      `SELECT c.*, p.name AS person_name, p.code AS person_code
         FROM attend_credentials c JOIN attend_people p ON p.id = c.person_id
        WHERE c.site_id = $1 AND ($2::bigint IS NULL OR c.person_id = $2)
        ORDER BY c.active DESC, c.issued_at DESC LIMIT 2000`,
      [site.id, personId]
    );
    return rows.map((r) => ({
      id: Number(r.id),
      personId: Number(r.person_id),
      personName: r.person_name,
      personCode: r.person_code,
      kind: r.kind,
      cardNumber: Number(r.card_number),
      label: r.label,
      active: r.active,
      issuedAt: r.issued_at,
      revokedAt: r.revoked_at,
      revokedReason: r.revoked_reason,
      lastSeenAt: r.last_seen_at,
    }));
  });
  if (!out) { res.status(404).json(notFound); return; }
  res.json({ credentials: out });
});

attendanceRouter.post("/credentials", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = credentialSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid card" }); return; }
  const pid = id(parsed.data.personId);
  const card = Number(parsed.data.cardNumber);
  if (!pid || !Number.isFinite(card) || card <= 0) {
    res.status(400).json({ error: "Invalid card" });
    return;
  }
  const { rows: own } = await pool.query(
    `SELECT p.site_id, p.name FROM attend_people p JOIN attend_sites s ON s.id = p.site_id
      WHERE p.id = $1 AND s.owner_id = $2`,
    [pid, req.user!.uid]
  );
  if (!own[0]) { res.status(404).json(notFound); return; }

  try {
    const { rows } = await pool.query(
      `INSERT INTO attend_credentials (site_id, person_id, kind, card_number, label)
       VALUES ($1,$2,COALESCE($3,'card'),$4,COALESCE($5,''))
       RETURNING id`,
      [own[0].site_id, pid, parsed.data.kind ?? null, card, parsed.data.label ?? null]
    );
    void syncSite(Number(own[0].site_id));
    res.status(201).json({ credential: { id: Number(rows[0].id), cardNumber: card } });
  } catch (err) {
    /*
     * The partial unique index only covers live cards, so this means the
     * number is in somebody else's hand right now — not that it was ever
     * issued. Saying which is the difference between "revoke the old one
     * first" and a support call.
     */
    logger.debug({ err }, "credential insert rejected");
    res.status(409).json({ error: "That card is already issued to somebody at this site" });
  }
});

attendanceRouter.post("/credentials/:id/revoke", requireAuth, async (req: AuthedRequest, res) => {
  const cid = id(req.params.id);
  if (!cid) { res.status(404).json(notFound); return; }
  const { rows } = await pool.query(
    `UPDATE attend_credentials c SET active = false, revoked_at = now(),
            revoked_reason = COALESCE($3,'')
       FROM attend_sites s
      WHERE c.id = $1 AND s.id = c.site_id AND s.owner_id = $2
      RETURNING c.site_id`,
    [cid, req.user!.uid, String(req.body?.reason ?? "")]
  );
  if (!rows[0]) { res.status(404).json(notFound); return; }
  /*
   * Pushed immediately and not left to the sweep. A lost card is the one
   * change where the minute between "revoked in the console" and "refused at
   * the door" is the whole point of having revoked it.
   */
  await syncSite(Number(rows[0].site_id), true);
  res.json({ success: true });
});

/* ------------------------------------------------------------------ *
 * Zones and terminals
 * ------------------------------------------------------------------ */

attendanceRouter.get("/zones", requireAuth, async (req: AuthedRequest, res) => {
  const out = await scoped(req, req.query.siteId, async (site) => {
    const { rows } = await pool.query(
      `SELECT * FROM attend_zones WHERE site_id = $1 ORDER BY name`, [site.id]
    );
    return rows.map((r) => ({
      id: Number(r.id), name: r.name, kind: r.kind,
      countsForAttendance: r.counts_for_attendance,
    }));
  });
  if (!out) { res.status(404).json(notFound); return; }
  res.json({ zones: out });
});

attendanceRouter.post("/zones", requireAuth, async (req: AuthedRequest, res) => {
  const site = await ownsSite(req.body?.siteId, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const name = String(req.body?.name ?? "").trim();
  if (!name) { res.status(400).json({ error: "A zone needs a name" }); return; }
  const { rows } = await pool.query(
    `INSERT INTO attend_zones (site_id, name, kind, counts_for_attendance)
     VALUES ($1,$2,COALESCE($3,'door'),COALESCE($4,true)) RETURNING id`,
    [site.id, name, req.body?.kind ?? null,
     typeof req.body?.countsForAttendance === "boolean" ? req.body.countsForAttendance : null]
  );
  res.status(201).json({ zone: { id: Number(rows[0].id), name } });
});

attendanceRouter.delete("/zones/:id", requireAuth, async (req: AuthedRequest, res) => {
  const zid = id(req.params.id);
  if (!zid) { res.status(404).json(notFound); return; }
  const r = await pool.query(
    `DELETE FROM attend_zones z USING attend_sites s
      WHERE z.id = $1 AND s.id = z.site_id AND s.owner_id = $2`,
    [zid, req.user!.uid]
  );
  if (!r.rowCount) { res.status(404).json(notFound); return; }
  res.json({ success: true });
});

const terminalSchema = z.object({
  siteId: z.union([z.number(), z.string()]),
  zoneId: z.union([z.number(), z.string()]).nullable().optional(),
  name: z.string().trim().max(60).optional(),
  mode: z.enum(["attendance", "access", "both"]).optional(),
  direction: z.enum(["in", "out", "auto"]).optional(),
  enabled: z.boolean().optional(),
  relaySec: z.number().int().min(1).max(30).optional(),
  dedupeSec: z.number().int().min(1).max(120).optional(),
  heldOpenSec: z.number().int().min(5).max(600).optional(),
  buzzer: z.boolean().optional(),
  offlineFailOpen: z.boolean().optional(),
});

attendanceRouter.get("/terminals", requireAuth, async (req: AuthedRequest, res) => {
  const out = await scoped(req, req.query.siteId, async (site) => {
    const { rows } = await pool.query(
      `SELECT t.*, z.name AS zone_name, d.name AS device_name, ${onlineColumn("d.")}, d.state
         FROM attend_terminals t
         LEFT JOIN attend_zones z ON z.id = t.zone_id
         LEFT JOIN devices d ON d.id = t.device_id
        WHERE t.site_id = $1 ORDER BY t.name`,
      [site.id]
    );
    return rows.map((r) => ({
      deviceId: r.device_id,
      deviceName: r.device_name,
      online: r.online,
      zoneId: r.zone_id === null ? null : Number(r.zone_id),
      zoneName: r.zone_name,
      name: r.name,
      mode: r.mode,
      direction: r.direction,
      enabled: r.enabled,
      aclVersion: Number(r.acl_version),
      aclCount: r.acl_count,
      aclPushedAt: r.acl_pushed_at,
      lastPunchAt: r.last_punch_at,
      /*
       * What the terminal says it holds, beside what the server last sent.
       * A mismatch is the visible symptom of a push that never landed, and it
       * is the difference between a door quietly running last week's roster
       * and somebody being told about it.
       */
      deviceAclVersion: r.state?.aclVersion ?? null,
      deviceAclCount: r.state?.aclCount ?? null,
      queued: r.state?.queued ?? 0,
      readerPresent: r.state?.reader ?? null,
    }));
  });
  if (!out) { res.status(404).json(notFound); return; }
  res.json({ terminals: out });
});

attendanceRouter.put("/terminals/:deviceId", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = terminalSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid terminal" }); return; }
  const site = await ownsSite(parsed.data.siteId, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const deviceId = String(req.params.deviceId);

  const { rows: dev } = await pool.query(
    `SELECT 1 FROM devices WHERE id = $1 AND owner_id = $2`, [deviceId, req.user!.uid]
  );
  if (!dev[0]) { res.status(404).json({ error: "Device not found" }); return; }

  const d = parsed.data;
  await pool.query(
    `INSERT INTO attend_terminals (device_id, site_id, zone_id, owner_id, name, mode, direction, enabled)
     VALUES ($1,$2,$3,$4,COALESCE($5,'Entrance'),COALESCE($6,'both'),COALESCE($7,'in'),COALESCE($8,true))
     ON CONFLICT (device_id) DO UPDATE SET
       site_id = EXCLUDED.site_id, zone_id = EXCLUDED.zone_id,
       name = COALESCE($5, attend_terminals.name),
       mode = COALESCE($6, attend_terminals.mode),
       direction = COALESCE($7, attend_terminals.direction),
       enabled = COALESCE($8, attend_terminals.enabled),
       updated_at = now()`,
    [deviceId, site.id, d.zoneId ?? null, req.user!.uid, d.name ?? null, d.mode ?? null,
     d.direction ?? null, d.enabled ?? null]
  );

  // The device holds its own copy of these, so the row and the wall have to be
  // set together or the console will describe a terminal that does not exist.
  const settings: Record<string, unknown> = { action: "set" };
  if (d.name !== undefined) settings.terminalName = d.name;
  if (d.mode !== undefined) settings.mode = d.mode;
  if (d.direction !== undefined) settings.direction = d.direction;
  if (d.relaySec !== undefined) settings.relaySec = d.relaySec;
  if (d.dedupeSec !== undefined) settings.dedupeSec = d.dedupeSec;
  if (d.heldOpenSec !== undefined) settings.heldOpenSec = d.heldOpenSec;
  if (d.buzzer !== undefined) settings.buzzer = d.buzzer;
  if (d.offlineFailOpen !== undefined) settings.offlineFailOpen = d.offlineFailOpen;
  if (Object.keys(settings).length > 1) {
    try { publishCommand(deviceId, settings); } catch { /* the row is saved either way */ }
  }

  const acl = await syncTerminal(deviceId, { force: true });
  res.json({ success: true, cards: acl?.cards.length ?? 0 });
});

attendanceRouter.delete("/terminals/:deviceId", requireAuth, async (req: AuthedRequest, res) => {
  const r = await pool.query(
    `DELETE FROM attend_terminals t USING attend_sites s
      WHERE t.device_id = $1 AND s.id = t.site_id AND s.owner_id = $2`,
    [String(req.params.deviceId), req.user!.uid]
  );
  if (!r.rowCount) { res.status(404).json(notFound); return; }
  res.json({ success: true });
});

/** POST /attendance/terminals/:deviceId/sync — push the roster again, now. */
attendanceRouter.post("/terminals/:deviceId/sync", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT 1 FROM attend_terminals t JOIN attend_sites s ON s.id = t.site_id
      WHERE t.device_id = $1 AND s.owner_id = $2`,
    [String(req.params.deviceId), req.user!.uid]
  );
  if (!rows[0]) { res.status(404).json(notFound); return; }
  const acl = await syncTerminal(String(req.params.deviceId), { force: true });
  res.json({ success: true, cards: acl?.cards.length ?? 0, version: acl?.version ?? 0 });
});

/** POST /attendance/terminals/:deviceId/open — release the door from here. */
attendanceRouter.post("/terminals/:deviceId/open", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT 1 FROM attend_terminals t JOIN attend_sites s ON s.id = t.site_id
      WHERE t.device_id = $1 AND s.owner_id = $2`,
    [String(req.params.deviceId), req.user!.uid]
  );
  if (!rows[0]) { res.status(404).json(notFound); return; }
  try {
    publishCommand(String(req.params.deviceId), { action: "open" });
  } catch {
    res.status(503).json({ error: "The broker is not reachable right now" });
    return;
  }
  await recordEvent(req.user!.uid, "security", "A door was released from the console", "", String(req.params.deviceId));
  res.json({ success: true });
});

/* ------------------------------------------------------------------ *
 * Schedules, rules, leave
 * ------------------------------------------------------------------ */

const windowSchema = z.object({ in: z.string(), out: z.string() });
const scheduleSchema = z.object({
  siteId: z.union([z.number(), z.string()]),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["fixed", "flexible"]).optional(),
  windows: z.record(z.string(), z.array(windowSchema)).optional(),
  graceMinutes: z.number().int().min(0).max(240).nullable().optional(),
  minMinutes: z.number().int().min(0).max(1440).optional(),
});

/** Rejects a window whose times are not times, before it reaches a register. */
function windowsValid(w: unknown): boolean {
  if (!w || typeof w !== "object") return false;
  for (const [day, list] of Object.entries(w as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(day)) return false;
    if (!Array.isArray(list)) return false;
    for (const entry of list) {
      if (parseHHMM((entry as { in?: unknown })?.in) === null) return false;
      if (parseHHMM((entry as { out?: unknown })?.out) === null) return false;
    }
  }
  return true;
}

attendanceRouter.get("/schedules", requireAuth, async (req: AuthedRequest, res) => {
  const out = await scoped(req, req.query.siteId, async (site) => {
    const { rows } = await pool.query(
      `SELECT * FROM attend_schedules WHERE site_id = $1 ORDER BY name`, [site.id]
    );
    return rows.map((r) => ({
      id: Number(r.id), name: r.name, kind: r.kind, windows: r.windows,
      graceMinutes: r.grace_minutes, minMinutes: r.min_minutes,
    }));
  });
  if (!out) { res.status(404).json(notFound); return; }
  res.json({ schedules: out });
});

attendanceRouter.post("/schedules", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid schedule" }); return; }
  const site = await ownsSite(parsed.data.siteId, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const d = parsed.data;
  if (d.windows && !windowsValid(d.windows)) {
    res.status(400).json({ error: "Times must be written as HH:MM, and days as 0 to 6" });
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO attend_schedules (site_id, name, kind, windows, grace_minutes, min_minutes)
     VALUES ($1,$2,COALESCE($3,'fixed'),COALESCE($4::jsonb,'{}'::jsonb),$5,COALESCE($6,0))
     RETURNING id`,
    [site.id, d.name, d.kind ?? null, d.windows ? JSON.stringify(d.windows) : null,
     d.graceMinutes ?? null, d.minMinutes ?? null]
  );
  res.status(201).json({ schedule: { id: Number(rows[0].id), name: d.name } });
});

attendanceRouter.patch("/schedules/:id", requireAuth, async (req: AuthedRequest, res) => {
  const sid = id(req.params.id);
  if (!sid) { res.status(404).json(notFound); return; }
  const { rows: own } = await pool.query(
    `SELECT sc.site_id FROM attend_schedules sc JOIN attend_sites s ON s.id = sc.site_id
      WHERE sc.id = $1 AND s.owner_id = $2`,
    [sid, req.user!.uid]
  );
  if (!own[0]) { res.status(404).json(notFound); return; }
  const parsed = scheduleSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid schedule" }); return; }
  const d = parsed.data;
  if (d.windows && !windowsValid(d.windows)) {
    res.status(400).json({ error: "Times must be written as HH:MM, and days as 0 to 6" });
    return;
  }
  await pool.query(
    `UPDATE attend_schedules SET name = COALESCE($2,name), kind = COALESCE($3,kind),
       windows = COALESCE($4::jsonb, windows), grace_minutes = $5,
       min_minutes = COALESCE($6,min_minutes), updated_at = now()
     WHERE id = $1`,
    [sid, d.name ?? null, d.kind ?? null, d.windows ? JSON.stringify(d.windows) : null,
     d.graceMinutes ?? null, d.minMinutes ?? null]
  );
  const siteId = Number(own[0].site_id);
  const site = await getSite(siteId);
  if (site) {
    // Lateness is measured against this, so yesterday and today are both
    // affected the moment it changes.
    const today = siteToday(site);
    void recomputeRange(siteId, addDays(today, -1), today).catch(() => {});
  }
  void syncSite(siteId);
  res.json({ success: true });
});

attendanceRouter.delete("/schedules/:id", requireAuth, async (req: AuthedRequest, res) => {
  const sid = id(req.params.id);
  if (!sid) { res.status(404).json(notFound); return; }
  const r = await pool.query(
    `DELETE FROM attend_schedules sc USING attend_sites s
      WHERE sc.id = $1 AND s.id = sc.site_id AND s.owner_id = $2`,
    [sid, req.user!.uid]
  );
  if (!r.rowCount) { res.status(404).json(notFound); return; }
  res.json({ success: true });
});

const ruleSchema = z.object({
  siteId: z.union([z.number(), z.string()]),
  zoneId: z.union([z.number(), z.string()]).nullable().optional(),
  groupId: z.union([z.number(), z.string()]).nullable().optional(),
  personId: z.union([z.number(), z.string()]).nullable().optional(),
  scheduleId: z.union([z.number(), z.string()]).nullable().optional(),
  allow: z.boolean().optional(),
  priority: z.number().int().min(-100).max(100).optional(),
  validFrom: z.string().trim().max(10).nullable().optional(),
  validTo: z.string().trim().max(10).nullable().optional(),
  note: z.string().trim().max(200).optional(),
});

attendanceRouter.get("/rules", requireAuth, async (req: AuthedRequest, res) => {
  const out = await scoped(req, req.query.siteId, async (site) => {
    const { rows } = await pool.query(
      `SELECT r.*, z.name AS zone_name, g.name AS group_name, p.name AS person_name,
              sc.name AS schedule_name,
              to_char(r.valid_from,'YYYY-MM-DD') AS valid_from,
              to_char(r.valid_to,'YYYY-MM-DD') AS valid_to
         FROM attend_rules r
         LEFT JOIN attend_zones z ON z.id = r.zone_id
         LEFT JOIN attend_groups g ON g.id = r.group_id
         LEFT JOIN attend_people p ON p.id = r.person_id
         LEFT JOIN attend_schedules sc ON sc.id = r.schedule_id
        WHERE r.site_id = $1 ORDER BY r.priority DESC, r.id`,
      [site.id]
    );
    return rows.map((r) => ({
      id: Number(r.id),
      zoneId: r.zone_id === null ? null : Number(r.zone_id), zoneName: r.zone_name,
      groupId: r.group_id === null ? null : Number(r.group_id), groupName: r.group_name,
      personId: r.person_id === null ? null : Number(r.person_id), personName: r.person_name,
      scheduleId: r.schedule_id === null ? null : Number(r.schedule_id), scheduleName: r.schedule_name,
      allow: r.allow, priority: r.priority,
      validFrom: r.valid_from, validTo: r.valid_to, note: r.note,
    }));
  });
  if (!out) { res.status(404).json(notFound); return; }
  res.json({ rules: out });
});

attendanceRouter.post("/rules", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = ruleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid rule" }); return; }
  const site = await ownsSite(parsed.data.siteId, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const d = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO attend_rules (site_id, zone_id, group_id, person_id, schedule_id, allow,
                               priority, valid_from, valid_to, note)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6,true),COALESCE($7,0),$8::date,$9::date,COALESCE($10,''))
     RETURNING id`,
    [site.id, d.zoneId ?? null, d.groupId ?? null, d.personId ?? null, d.scheduleId ?? null,
     d.allow ?? null, d.priority ?? null, d.validFrom || null, d.validTo || null, d.note ?? null]
  );
  await syncSite(site.id, true);
  res.status(201).json({ rule: { id: Number(rows[0].id) } });
});

attendanceRouter.delete("/rules/:id", requireAuth, async (req: AuthedRequest, res) => {
  const rid = id(req.params.id);
  if (!rid) { res.status(404).json(notFound); return; }
  const { rows } = await pool.query(
    `DELETE FROM attend_rules r USING attend_sites s
      WHERE r.id = $1 AND s.id = r.site_id AND s.owner_id = $2
      RETURNING r.site_id`,
    [rid, req.user!.uid]
  );
  if (!rows[0]) { res.status(404).json(notFound); return; }
  await syncSite(Number(rows[0].site_id), true);
  res.json({ success: true });
});

const leaveSchema = z.object({
  siteId: z.union([z.number(), z.string()]),
  personId: z.union([z.number(), z.string()]).nullable().optional(),
  groupId: z.union([z.number(), z.string()]).nullable().optional(),
  kind: z.string().trim().min(1).max(24).optional(),
  fromDay: z.string().trim().length(10),
  toDay: z.string().trim().length(10),
  countsAsPresent: z.boolean().optional(),
  note: z.string().trim().max(200).optional(),
  approvedBy: z.string().trim().max(120).optional(),
});

attendanceRouter.get("/leaves", requireAuth, async (req: AuthedRequest, res) => {
  const out = await scoped(req, req.query.siteId, async (site) => {
    const { rows } = await pool.query(
      `SELECT l.*, p.name AS person_name, g.name AS group_name,
              to_char(l.from_day,'YYYY-MM-DD') AS from_day,
              to_char(l.to_day,'YYYY-MM-DD') AS to_day
         FROM attend_leaves l
         LEFT JOIN attend_people p ON p.id = l.person_id
         LEFT JOIN attend_groups g ON g.id = l.group_id
        WHERE l.site_id = $1 ORDER BY l.from_day DESC LIMIT 500`,
      [site.id]
    );
    return rows.map((r) => ({
      id: Number(r.id),
      personId: r.person_id === null ? null : Number(r.person_id), personName: r.person_name,
      groupId: r.group_id === null ? null : Number(r.group_id), groupName: r.group_name,
      kind: r.kind, fromDay: r.from_day, toDay: r.to_day,
      countsAsPresent: r.counts_as_present, note: r.note, approvedBy: r.approved_by,
    }));
  });
  if (!out) { res.status(404).json(notFound); return; }
  res.json({ leaves: out });
});

attendanceRouter.post("/leaves", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = leaveSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid leave" }); return; }
  const site = await ownsSite(parsed.data.siteId, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const d = parsed.data;
  if (d.toDay < d.fromDay) {
    res.status(400).json({ error: "The end date is before the start date" });
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO attend_leaves (site_id, person_id, group_id, kind, from_day, to_day,
                                counts_as_present, note, approved_by)
     VALUES ($1,$2,$3,COALESCE($4,'leave'),$5::date,$6::date,COALESCE($7,false),
             COALESCE($8,''),COALESCE($9,''))
     RETURNING id`,
    [site.id, d.personId ?? null, d.groupId ?? null, d.kind ?? null, d.fromDay, d.toDay,
     d.countsAsPresent ?? null, d.note ?? null, d.approvedBy ?? null]
  );
  // The register for those days is now wrong until it is redone.
  void recomputeRange(site.id, d.fromDay, d.toDay).catch((err) =>
    logger.error({ err }, "recompute after leave failed")
  );
  res.status(201).json({ leave: { id: Number(rows[0].id) } });
});

attendanceRouter.delete("/leaves/:id", requireAuth, async (req: AuthedRequest, res) => {
  const lid = id(req.params.id);
  if (!lid) { res.status(404).json(notFound); return; }
  const { rows } = await pool.query(
    `DELETE FROM attend_leaves l USING attend_sites s
      WHERE l.id = $1 AND s.id = l.site_id AND s.owner_id = $2
      RETURNING l.site_id, to_char(l.from_day,'YYYY-MM-DD') AS f, to_char(l.to_day,'YYYY-MM-DD') AS t`,
    [lid, req.user!.uid]
  );
  if (!rows[0]) { res.status(404).json(notFound); return; }
  void recomputeRange(Number(rows[0].site_id), rows[0].f, rows[0].t).catch(() => {});
  res.json({ success: true });
});

/* ------------------------------------------------------------------ *
 * Office access requests
 *
 * Asking to come into the building, and the answer. Most answers are given by
 * the rule in access-requests.ts the moment the request is raised; the ones
 * left pending are the ones worth a person's attention.
 * ------------------------------------------------------------------ */

const accessRequestSchema = z.object({
  siteId: z.union([z.number(), z.string()]),
  personId: z.union([z.number(), z.string()]),
  reason: z.string().trim().max(200).optional(),
  validFrom: z.string().trim().length(10).nullable().optional(),
  validTo: z.string().trim().length(10).nullable().optional(),
});

/** Rows out of the table, in the shape the console and the app read. */
function accessRequestRow(r: Record<string, unknown>) {
  return {
    id: Number(r.id),
    personId: Number(r.person_id),
    personName: r.person_name ?? null,
    personCode: r.person_code ?? null,
    status: r.status,
    decidedBy: r.decided_by,
    reason: r.reason,
    validFrom: r.valid_from ?? null,
    validTo: r.valid_to ?? null,
    requestedAt: r.requested_at,
    decidedAt: r.decided_at ?? null,
  };
}

const ACCESS_REQUEST_SELECT = `
  SELECT r.id, r.person_id, r.status, r.decided_by, r.reason,
         to_char(r.valid_from,'YYYY-MM-DD') AS valid_from,
         to_char(r.valid_to,'YYYY-MM-DD')   AS valid_to,
         r.requested_at, r.decided_at,
         p.name AS person_name, p.code AS person_code
    FROM attend_access_requests r
    JOIN attend_people p ON p.id = r.person_id`;

/** GET /attendance/access-requests?siteId=&status= — who has asked, and the answers. */
attendanceRouter.get("/access-requests", requireAuth, async (req: AuthedRequest, res) => {
  const wanted = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const out = await scoped(req, req.query.siteId, async (site) => {
    const { rows } = await pool.query(
      `${ACCESS_REQUEST_SELECT}
        WHERE r.site_id = $1 AND ($2 = '' OR r.status = $2)
        ORDER BY r.requested_at DESC LIMIT 500`,
      [site.id, wanted]
    );
    return rows.map(accessRequestRow);
  });
  if (!out) { res.status(404).json(notFound); return; }
  /*
   * The count of pending requests is what a console badge needs, and deriving
   * it from a filtered list would give the wrong number whenever a filter is
   * applied — the one case where somebody is most likely to be looking at it.
   */
  const site = await ownsSite(req.query.siteId, req.user!.uid);
  const { rows: pend } = await pool.query(
    `SELECT count(*)::int AS n FROM attend_access_requests
      WHERE site_id = $1 AND status = 'pending'`,
    [site!.id]
  );
  res.json({ requests: out, pending: pend[0].n });
});

/** POST /attendance/access-requests — ask to come in. Usually answered at once. */
attendanceRouter.post("/access-requests", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = accessRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const site = await ownsSite(parsed.data.siteId, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const d = parsed.data;

  const { rows: people } = await pool.query(
    `SELECT id, name, active, role, to_char(valid_from,'YYYY-MM-DD') AS valid_from,
            to_char(valid_to,'YYYY-MM-DD') AS valid_to
       FROM attend_people WHERE id = $1 AND site_id = $2`,
    [Number(d.personId), site.id]
  );
  if (!people[0]) { res.status(404).json(notFound); return; }

  if (d.validFrom && d.validTo && d.validTo < d.validFrom) {
    res.status(400).json({ error: "The end date is before the start date" });
    return;
  }

  const day = siteToday(site);
  const verdict = autoDecide(
    {
      id: Number(people[0].id),
      active: people[0].active,
      role: people[0].role ?? "",
      validFrom: people[0].valid_from,
      validTo: people[0].valid_to,
    },
    day
  );

  /*
   * A person with a live request does not need a second one. Without this, a
   * button pressed twice leaves two pending rows and an approver who answers
   * one of them and wonders why the other is still there.
   */
  const { rows: existing } = await pool.query(
    `SELECT id FROM attend_access_requests
      WHERE site_id = $1 AND person_id = $2 AND status IN ('pending','approved')
        AND (valid_to IS NULL OR valid_to >= $3::date)
      LIMIT 1`,
    [site.id, Number(d.personId), day]
  );
  if (existing[0]) {
    const { rows } = await pool.query(`${ACCESS_REQUEST_SELECT} WHERE r.id = $1`, [existing[0].id]);
    res.status(200).json({ request: accessRequestRow(rows[0]), existing: true });
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO attend_access_requests
       (site_id, person_id, status, decided_by, reason, valid_from, valid_to, decided_at)
     VALUES ($1,$2,$3,$4,$5,$6::date,$7::date, CASE WHEN $3 = 'pending' THEN NULL ELSE now() END)
     RETURNING id`,
    [
      site.id, Number(d.personId), verdict.status, verdict.decidedBy,
      d.reason?.trim() || verdict.reason, d.validFrom ?? null, d.validTo ?? null,
    ]
  );
  await recordEvent(
    req.user!.uid,
    "attendance",
    verdict.status === "approved"
      ? `Office access approved for ${people[0].name ?? `person ${d.personId}`} by ${verdict.decidedBy}`
      : `Office access requested for ${people[0].name ?? `person ${d.personId}`} — awaiting a decision`,
    "",
    null
  );
  const { rows: full } = await pool.query(`${ACCESS_REQUEST_SELECT} WHERE r.id = $1`, [rows[0].id]);
  res.status(201).json({ request: accessRequestRow(full[0]) });
});

/** PATCH /attendance/access-requests/:id — a person answering, or changing their mind. */
attendanceRouter.patch("/access-requests/:id", requireAuth, async (req: AuthedRequest, res) => {
  const rid = id(req.params.id);
  if (!rid) { res.status(404).json(notFound); return; }
  const parsed = z
    .object({
      status: z.enum(["pending", "approved", "rejected", "revoked"]),
      reason: z.string().trim().max(200).optional(),
      validFrom: z.string().trim().length(10).nullable().optional(),
      validTo: z.string().trim().length(10).nullable().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid decision" }); return; }
  const d = parsed.data;

  /*
   * The decider is recorded by email, never as 'auto'. That word is reserved
   * for the rule, and letting a person write it would destroy the one
   * distinction the column exists to make.
   */
  const who = req.user!.email || `user:${req.user!.uid}`;
  const { rows } = await pool.query(
    `UPDATE attend_access_requests r
        SET status = $3,
            decided_by = CASE WHEN $3 = 'pending' THEN '' ELSE $4 END,
            decided_at = CASE WHEN $3 = 'pending' THEN NULL ELSE now() END,
            reason = COALESCE($5, r.reason),
            valid_from = COALESCE($6::date, r.valid_from),
            valid_to = COALESCE($7::date, r.valid_to)
       FROM attend_sites s
      WHERE r.id = $1 AND s.id = r.site_id AND s.owner_id = $2
      RETURNING r.id`,
    [rid, req.user!.uid, d.status, who, d.reason ?? null, d.validFrom ?? null, d.validTo ?? null]
  );
  if (!rows[0]) { res.status(404).json(notFound); return; }
  await recordEvent(
    req.user!.uid,
    "attendance",
    `Office access request #${rid} ${d.status} by ${who}`,
    "",
    null
  );
  const { rows: full } = await pool.query(`${ACCESS_REQUEST_SELECT} WHERE r.id = $1`, [rid]);
  res.json({ request: accessRequestRow(full[0]) });
});

/* ------------------------------------------------------------------ *
 * The register and the reports
 * ------------------------------------------------------------------ */

/** GET /attendance/register?siteId=&day=&groupId= — one day, everybody. */
attendanceRouter.get("/register", requireAuth, async (req: AuthedRequest, res) => {
  const site = await ownsSite(req.query.siteId, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const day = String(req.query.day || siteToday(site));
  const groupId = id(req.query.groupId);

  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.code, p.role, g.name AS group_name,
            d.status, d.first_in, d.last_out, d.worked_minutes, d.late_minutes,
            d.early_minutes, d.punches, d.assumed_out, d.note, d.source
       FROM attend_people p
       LEFT JOIN attend_groups g ON g.id = p.group_id
       LEFT JOIN attend_days d ON d.person_id = p.id AND d.day = $2::date
      WHERE p.site_id = $1 AND p.active
        AND ($3::bigint IS NULL OR p.group_id = $3)
        AND (p.valid_from IS NULL OR p.valid_from <= $2::date)
        AND (p.valid_to   IS NULL OR p.valid_to   >= $2::date)
      ORDER BY g.name NULLS FIRST, p.name`,
    [site.id, day, groupId]
  );

  const people = rows.map((r) => ({
    personId: Number(r.id), name: r.name, code: r.code, role: r.role,
    groupName: r.group_name,
    status: r.status ?? "unknown",
    firstIn: r.first_in, lastOut: r.last_out,
    workedMinutes: r.worked_minutes ?? 0,
    lateMinutes: r.late_minutes ?? 0,
    earlyMinutes: r.early_minutes ?? 0,
    punches: r.punches ?? 0,
    assumedOut: r.assumed_out ?? false,
    note: r.note ?? "",
    manual: r.source === "manual",
  }));

  const totals: Record<string, number> = {};
  for (const p of people) totals[p.status] = (totals[p.status] ?? 0) + 1;

  res.json({ day, timezone: site.timeZone, people, totals });
});

/** POST /attendance/register/recompute — redo a day, or a range, on demand. */
attendanceRouter.post("/register/recompute", requireAuth, async (req: AuthedRequest, res) => {
  const site = await ownsSite(req.body?.siteId, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const from = String(req.body?.from || siteToday(site));
  const to = String(req.body?.to || from);
  if (to < from) { res.status(400).json({ error: "The end date is before the start date" }); return; }
  const days = eachDay(from, to);
  if (days.length > 62) {
    // Bounded because this is synchronous work on a shared database, and a
    // year-long recompute asked for by accident should not stop the register
    // loading for everybody else.
    res.status(400).json({ error: "Recompute at most two months at a time" });
    return;
  }
  const written = await recomputeRange(site.id, from, to);
  res.json({ success: true, days: days.length, rows: written });
});

/**
 * PATCH /attendance/register/:personId — a human overrides the machine.
 *
 * The reader was broken, somebody was on a school trip that nobody recorded,
 * a card was left at home. Marked as manual so the next recompute leaves it
 * alone; an override that silently reverted would be worse than none, because
 * whoever made it would have no reason to check.
 */
attendanceRouter.patch("/register/:personId", requireAuth, async (req: AuthedRequest, res) => {
  const pid = id(req.params.personId);
  if (!pid) { res.status(404).json(notFound); return; }
  const { rows: own } = await pool.query(
    `SELECT p.site_id FROM attend_people p JOIN attend_sites s ON s.id = p.site_id
      WHERE p.id = $1 AND s.owner_id = $2`,
    [pid, req.user!.uid]
  );
  if (!own[0]) { res.status(404).json(notFound); return; }

  const day = String(req.body?.day ?? "");
  const status = String(req.body?.status ?? "");
  const allowed = ["present", "late", "absent", "half", "leave", "holiday"];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !allowed.includes(status)) {
    res.status(400).json({ error: "Send a day and one of " + allowed.join(", ") });
    return;
  }

  await pool.query(
    `INSERT INTO attend_days (site_id, person_id, day, status, note, source, updated_at)
     VALUES ($1,$2,$3::date,$4,COALESCE($5,''),'manual',now())
     ON CONFLICT (person_id, day) DO UPDATE SET
       status = EXCLUDED.status, note = EXCLUDED.note, source = 'manual', updated_at = now()`,
    [own[0].site_id, pid, day, status, String(req.body?.note ?? "")]
  );
  await recordEvent(
    req.user!.uid, "attendance", "Register corrected by hand",
    `${day} set to ${status}`, null
  );
  res.json({ success: true });
});

/** DELETE /attendance/register/:personId?day= — undo an override. */
attendanceRouter.delete("/register/:personId", requireAuth, async (req: AuthedRequest, res) => {
  const pid = id(req.params.personId);
  const day = String(req.query.day ?? "");
  if (!pid || !/^\d{4}-\d{2}-\d{2}$/.test(day)) { res.status(400).json({ error: "Bad request" }); return; }
  const { rows } = await pool.query(
    `DELETE FROM attend_days d USING attend_people p, attend_sites s
      WHERE d.person_id = $1 AND d.day = $3::date AND p.id = d.person_id
        AND s.id = p.site_id AND s.owner_id = $2
      RETURNING d.site_id`,
    [pid, req.user!.uid, day]
  );
  if (!rows[0]) { res.status(404).json(notFound); return; }
  await recomputeDay(Number(rows[0].site_id), day);
  res.json({ success: true });
});

/** GET /attendance/summary?siteId=&from=&to=&groupId= — a range, per person. */
attendanceRouter.get("/summary", requireAuth, async (req: AuthedRequest, res) => {
  const site = await ownsSite(req.query.siteId, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const to = String(req.query.to || siteToday(site));
  const from = String(req.query.from || addDays(to, -29));
  const groupId = id(req.query.groupId);
  if (eachDay(from, to).length > 400) {
    res.status(400).json({ error: "That range is too long" });
    return;
  }

  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.code, g.name AS group_name,
            count(*) FILTER (WHERE d.status IN ('present','late','half'))::int AS present,
            count(*) FILTER (WHERE d.status = 'late')::int  AS late,
            count(*) FILTER (WHERE d.status = 'absent')::int AS absent,
            count(*) FILTER (WHERE d.status = 'half')::int   AS half,
            count(*) FILTER (WHERE d.status = 'leave')::int  AS leave,
            COALESCE(sum(d.worked_minutes),0)::int AS worked_minutes,
            COALESCE(sum(d.late_minutes),0)::int   AS late_minutes,
            count(*) FILTER (WHERE d.status IN ('present','late','half','absent'))::int AS expected
       FROM attend_people p
       LEFT JOIN attend_groups g ON g.id = p.group_id
       LEFT JOIN attend_days d ON d.person_id = p.id AND d.day BETWEEN $2::date AND $3::date
      WHERE p.site_id = $1 AND ($4::bigint IS NULL OR p.group_id = $4)
      GROUP BY p.id, p.name, p.code, g.name
      ORDER BY g.name NULLS FIRST, p.name`,
    [site.id, from, to, groupId]
  );

  res.json({
    from, to,
    people: rows.map((r) => ({
      personId: Number(r.id), name: r.name, code: r.code, groupName: r.group_name,
      present: r.present, late: r.late, absent: r.absent, half: r.half, leave: r.leave,
      workedMinutes: r.worked_minutes, lateMinutes: r.late_minutes,
      expected: r.expected,
      /*
       * The number a school actually reports, computed here so every screen
       * and export agrees on it. Days nobody was expected are excluded rather
       * than counted as attended, which would flatter every figure.
       */
      percent: r.expected > 0 ? Math.round((r.present / r.expected) * 1000) / 10 : null,
    })),
  });
});

/** GET /attendance/person/:id?from=&to= — one person's own record. */
attendanceRouter.get("/person/:id", requireAuth, async (req: AuthedRequest, res) => {
  const pid = id(req.params.id);
  if (!pid) { res.status(404).json(notFound); return; }
  const { rows: own } = await pool.query(
    `SELECT p.*, s.timezone, g.name AS group_name,
            to_char(p.valid_from,'YYYY-MM-DD') AS valid_from,
            to_char(p.valid_to,'YYYY-MM-DD') AS valid_to
       FROM attend_people p
       JOIN attend_sites s ON s.id = p.site_id
       LEFT JOIN attend_groups g ON g.id = p.group_id
      WHERE p.id = $1 AND s.owner_id = $2`,
    [pid, req.user!.uid]
  );
  if (!own[0]) { res.status(404).json(notFound); return; }

  const to = String(req.query.to || new Date().toISOString().slice(0, 10));
  const from = String(req.query.from || addDays(to, -29));

  const [days, punches, cards] = await Promise.all([
    pool.query(
      `SELECT to_char(day,'YYYY-MM-DD') AS day, status, first_in, last_out,
              worked_minutes, late_minutes, early_minutes, assumed_out, note, source
         FROM attend_days WHERE person_id = $1 AND day BETWEEN $2::date AND $3::date
        ORDER BY day DESC`,
      [pid, from, to]
    ),
    pool.query(
      `SELECT id, at, device_at, direction, granted, reason, method, device_id
         FROM attend_punches WHERE person_id = $1 ORDER BY at DESC LIMIT 100`,
      [pid]
    ),
    pool.query(
      `SELECT id, card_number, kind, label, active, issued_at, revoked_at
         FROM attend_credentials WHERE person_id = $1 ORDER BY active DESC, issued_at DESC`,
      [pid]
    ),
  ]);

  res.json({
    person: personOut(own[0]),
    groupName: own[0].group_name,
    timezone: own[0].timezone,
    days: days.rows.map((r) => ({
      day: r.day, status: r.status, firstIn: r.first_in, lastOut: r.last_out,
      workedMinutes: r.worked_minutes, lateMinutes: r.late_minutes,
      earlyMinutes: r.early_minutes, assumedOut: r.assumed_out,
      note: r.note, manual: r.source === "manual",
    })),
    punches: punches.rows.map((r) => ({
      id: Number(r.id), at: r.at, deviceAt: r.device_at, direction: r.direction,
      granted: r.granted, reason: r.reason, method: r.method, deviceId: r.device_id,
    })),
    cards: cards.rows.map((r) => ({
      id: Number(r.id), cardNumber: Number(r.card_number), kind: r.kind, label: r.label,
      active: r.active, issuedAt: r.issued_at, revokedAt: r.revoked_at,
    })),
  });
});

/** GET /attendance/punches?siteId=&limit=&granted= — the raw scans. */
attendanceRouter.get("/punches", requireAuth, async (req: AuthedRequest, res) => {
  const site = await ownsSite(req.query.siteId, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const onlyRefused = String(req.query.granted) === "false";

  const { rows } = await pool.query(
    `SELECT pu.id, pu.at, pu.device_at, pu.direction, pu.granted, pu.reason, pu.method,
            pu.card_number, pu.offline, pu.device_id,
            p.name AS person_name, p.code AS person_code, z.name AS zone_name,
            t.name AS terminal_name
       FROM attend_punches pu
       LEFT JOIN attend_people p ON p.id = pu.person_id
       LEFT JOIN attend_zones z ON z.id = pu.zone_id
       LEFT JOIN attend_terminals t ON t.device_id = pu.device_id
      WHERE pu.site_id = $1 AND ($2::boolean IS FALSE OR pu.granted = false)
      ORDER BY pu.at DESC LIMIT $3`,
    [site.id, onlyRefused, limit]
  );

  res.json({
    punches: rows.map((r) => ({
      id: Number(r.id), at: r.at, deviceAt: r.device_at, direction: r.direction,
      granted: r.granted, reason: r.reason, method: r.method,
      cardNumber: r.card_number === null ? null : Number(r.card_number),
      offline: r.offline, deviceId: r.device_id,
      personName: r.person_name, personCode: r.person_code,
      zoneName: r.zone_name, terminalName: r.terminal_name,
    })),
  });
});

/**
 * POST /attendance/punches — record a scan by hand, or from another system.
 *
 * A visitor whose card was not issued in time, a reader that failed, a
 * turnstile somebody was waved through. Goes through exactly the same ingest
 * as a real scan, so it is judged, deduplicated and rolled up identically —
 * and is marked `manual` so a register can show which entries a person made
 * rather than a card.
 */
attendanceRouter.post("/punches", requireAuth, async (req: AuthedRequest, res) => {
  const deviceId = String(req.body?.deviceId ?? "");
  const { rows } = await pool.query(
    `SELECT 1 FROM attend_terminals t JOIN attend_sites s ON s.id = t.site_id
      WHERE t.device_id = $1 AND s.owner_id = $2`,
    [deviceId, req.user!.uid]
  );
  if (!rows[0]) { res.status(404).json(notFound); return; }

  const result = await ingestPunch(
    deviceId,
    {
      card: Number(req.body?.cardNumber ?? 0),
      granted: req.body?.granted !== false,
      direction: req.body?.direction === "out" ? "out" : "in",
      method: "manual",
      seq: undefined,
      ts: req.body?.at ? Math.floor(new Date(String(req.body.at)).getTime() / 1000) : undefined,
    },
    { source: "manual" }
  );
  if (!result) { res.status(404).json(notFound); return; }
  res.status(201).json(result);
});

/** GET /attendance/live?siteId= — what is happening right now. */
attendanceRouter.get("/live", requireAuth, async (req: AuthedRequest, res) => {
  const site = await ownsSite(req.query.siteId, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const day = siteToday(site);

  const [recent, totals, inside, terminals] = await Promise.all([
    pool.query(
      `SELECT pu.at, pu.direction, pu.granted, pu.reason, pu.card_number,
              p.name AS person_name, p.code AS person_code, t.name AS terminal_name
         FROM attend_punches pu
         LEFT JOIN attend_people p ON p.id = pu.person_id
         LEFT JOIN attend_terminals t ON t.device_id = pu.device_id
        WHERE pu.site_id = $1 ORDER BY pu.at DESC LIMIT 30`,
      [site.id]
    ),
    pool.query(
      `SELECT status, count(*)::int AS n FROM attend_days
        WHERE site_id = $1 AND day = $2::date GROUP BY status`,
      [site.id, day]
    ),
    /*
     * Who is currently in the building: the last scan of the day, per person,
     * that was an entry. The roll call a fire warden needs, which is the one
     * question this system can answer that a paper register never could.
     */
    pool.query(
      `SELECT p.id, p.name, p.code, g.name AS group_name, last.at, last.direction
         FROM attend_people p
         LEFT JOIN attend_groups g ON g.id = p.group_id
         JOIN LATERAL (
           SELECT pu.at, pu.direction FROM attend_punches pu
            WHERE pu.person_id = p.id AND pu.granted
              AND COALESCE(pu.device_at, pu.at) >= $2::date
            ORDER BY COALESCE(pu.device_at, pu.at) DESC LIMIT 1
         ) last ON true
        WHERE p.site_id = $1 AND last.direction = 'in'
        ORDER BY last.at DESC`,
      [site.id, day]
    ),
    pool.query(
      `SELECT t.device_id, t.name, ${onlineColumn("d.")}, t.last_punch_at, t.acl_count, d.state
         FROM attend_terminals t LEFT JOIN devices d ON d.id = t.device_id
        WHERE t.site_id = $1 ORDER BY t.name`,
      [site.id]
    ),
  ]);

  const byStatus: Record<string, number> = {};
  for (const r of totals.rows) byStatus[r.status] = r.n;

  res.json({
    day,
    timezone: site.timeZone,
    totals: byStatus,
    onSite: inside.rows.map((r) => ({
      personId: Number(r.id), name: r.name, code: r.code,
      groupName: r.group_name, since: r.at,
    })),
    recent: recent.rows.map((r) => ({
      at: r.at, direction: r.direction, granted: r.granted, reason: r.reason,
      cardNumber: r.card_number === null ? null : Number(r.card_number),
      personName: r.person_name, personCode: r.person_code, terminalName: r.terminal_name,
    })),
    terminals: terminals.rows.map((r) => ({
      deviceId: r.device_id, name: r.name, online: r.online,
      lastPunchAt: r.last_punch_at, aclCount: r.acl_count,
      queued: r.state?.queued ?? 0,
    })),
  });
});

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

/** Quotes a CSV field. Everything is quoted: a name with a comma in it is normal. */
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function csv(header: string[], rows: unknown[][]): string {
  /*
   * A BOM, deliberately.
   *
   * These files are opened in Excel by people who did not ask for a CSV, and
   * without it Excel reads UTF-8 as the local codepage and mangles every name
   * with an accent in it. It costs three bytes.
   */
  return "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * A timestamp, on the site's clock.
 *
 * The whole point of the timezone handling everywhere else is that a register
 * says 08:25 because that is what the bell said. Letting a Date fall through
 * to its default string form put "Tue Aug 18 2026 02:55:00 GMT+0000" in a
 * column headed "First in" — the right instant, in the wrong timezone, in a
 * format nobody would choose, on a document somebody prints and signs.
 */
function localTime(v: unknown, timeZone: string, withDate = false): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  const m = localMoment(d, timeZone);
  return withDate ? `${m.day} ${formatHHMM(m.minutes)}` : formatHHMM(m.minutes);
}

/** GET /attendance/export?siteId=&from=&to=&what=register|summary|punches */
attendanceRouter.get("/export", requireAuth, async (req: AuthedRequest, res) => {
  const site = await ownsSite(req.query.siteId, req.user!.uid);
  if (!site) { res.status(404).json(notFound); return; }
  const what = String(req.query.what || "register");
  const to = String(req.query.to || siteToday(site));
  const from = String(req.query.from || to);
  if (eachDay(from, to).length > 400) { res.status(400).json({ error: "That range is too long" }); return; }

  let body: string;
  let name: string;

  if (what === "punches") {
    const { rows } = await pool.query(
      `SELECT pu.at, pu.device_at, p.code, p.name, pu.card_number, pu.direction,
              pu.granted, pu.reason, pu.method, t.name AS terminal
         FROM attend_punches pu
         LEFT JOIN attend_people p ON p.id = pu.person_id
         LEFT JOIN attend_terminals t ON t.device_id = pu.device_id
        WHERE pu.site_id = $1 AND pu.at >= $2::date AND pu.at < ($3::date + 1)
        ORDER BY pu.at`,
      [site.id, from, to]
    );
    body = csv(
      ["At", "Terminal clock", "Code", "Name", "Card", "Direction", "Granted", "Reason", "Method", "Terminal"],
      rows.map((r) => [
        localTime(r.at, site.timeZone, true),
        localTime(r.device_at, site.timeZone, true),
        r.code, r.name, r.card_number, r.direction,
        r.granted ? "yes" : "no", r.reason, r.method, r.terminal,
      ])
    );
    name = `punches-${from}-to-${to}.csv`;
  } else if (what === "summary") {
    const { rows } = await pool.query(
      `SELECT p.code, p.name, g.name AS grp,
              count(*) FILTER (WHERE d.status IN ('present','late','half'))::int AS present,
              count(*) FILTER (WHERE d.status = 'late')::int AS late,
              count(*) FILTER (WHERE d.status = 'absent')::int AS absent,
              COALESCE(sum(d.worked_minutes),0)::int AS worked
         FROM attend_people p
         LEFT JOIN attend_groups g ON g.id = p.group_id
         LEFT JOIN attend_days d ON d.person_id = p.id AND d.day BETWEEN $2::date AND $3::date
        WHERE p.site_id = $1 GROUP BY p.code, p.name, g.name ORDER BY g.name, p.name`,
      [site.id, from, to]
    );
    body = csv(
      ["Code", "Name", "Group", "Present", "Late", "Absent", "Hours"],
      rows.map((r) => [r.code, r.name, r.grp, r.present, r.late, r.absent,
                       (r.worked / 60).toFixed(2)])
    );
    name = `summary-${from}-to-${to}.csv`;
  } else {
    const { rows } = await pool.query(
      `SELECT to_char(d.day,'YYYY-MM-DD') AS day, p.code, p.name, g.name AS grp,
              d.status, d.first_in, d.last_out, d.worked_minutes, d.late_minutes,
              d.assumed_out, d.source, d.note
         FROM attend_days d
         JOIN attend_people p ON p.id = d.person_id
         LEFT JOIN attend_groups g ON g.id = p.group_id
        WHERE d.site_id = $1 AND d.day BETWEEN $2::date AND $3::date
        ORDER BY d.day, g.name, p.name`,
      [site.id, from, to]
    );
    body = csv(
      ["Day", "Code", "Name", "Group", "Status", "First in", "Last out", "Hours",
       "Late minutes", "Exit assumed", "Corrected by hand", "Note"],
      rows.map((r) => [r.day, r.code, r.name, r.grp, r.status,
                       localTime(r.first_in, site.timeZone),
                       localTime(r.last_out, site.timeZone),
                       (r.worked_minutes / 60).toFixed(2), r.late_minutes,
                       r.assumed_out ? "yes" : "", r.source === "manual" ? "yes" : "", r.note])
    );
    name = `register-${from}-to-${to}.csv`;
  }

  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="${name}"`);
  res.send(body);
});
