import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";
import { publishCommand } from "../mqtt";
import { logger } from "../logger";
import { analysePlate, normalisePlate, prettyPlate } from "../anpr/plate";
import { listVehicles, visitsFor } from "../anpr/visits";
import { getSettings, listOverstays, occupancy, saveSettings } from "../anpr/site";
import { sendReport } from "../anpr/report";
import { config } from "../config";

/**
 * ANPR: the plate log and the allow / deny / watch list.
 *
 * Every route is scoped to the caller's own devices. The ownership check is
 * written into each query rather than done once up front, because a plate log
 * is a record of other people's movements and a query that forgets its
 * `owner_id` would return the neighbours' as readily as your own.
 */
export const anprRouter = Router();

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

interface ReadRow {
  id: string;
  device_id: string;
  device_name: string | null;
  capture_id: string;
  plate: string;
  plate_raw: string;
  confidence: number;
  votes: number;
  samples: number;
  kind: string;
  status: string;
  reason: string;
  decision: string;
  rule_id: string | null;
  trigger: string;
  ms: number;
  ts: Date;
  has_thumb: boolean;
  direction: string | null;
  visit_id: string | null;
}

function readShape(r: ReadRow) {
  return {
    id: Number(r.id),
    deviceId: r.device_id,
    deviceName: r.device_name || r.device_id,
    captureId: Number(r.capture_id),
    plate: r.plate || null,
    // Formatted here rather than in the browser so the console, the app and a
    // CSV a customer attaches to a ticket all render the same string.
    pretty: r.plate ? prettyPlate(r.plate) : null,
    raw: r.plate_raw || null,
    confidence: r.confidence,
    votes: r.votes,
    samples: r.samples,
    kind: r.kind,
    status: r.status,
    reason: r.reason || null,
    decision: r.decision,
    ruleId: r.rule_id ? Number(r.rule_id) : null,
    trigger: r.trigger,
    ms: r.ms,
    at: r.ts.toISOString(),
    // null, not "in": a lane whose direction could not be resolved genuinely
    // has no answer, and defaulting would assert a movement nobody observed.
    direction: r.direction,
    visitId: r.visit_id ? Number(r.visit_id) : null,
    /*
     * The image is advertised, not inlined.
     *
     * A page of 50 reads with base64 JPEGs attached is several megabytes of
     * JSON for a list in which most rows are never opened. The client fetches
     * `/anpr/reads/:id/image` for the one it wants.
     */
    hasImage: r.has_thumb,
  };
}

const READ_COLUMNS = `
  r.id, r.device_id, d.name AS device_name, r.capture_id, r.plate, r.plate_raw,
  r.confidence, r.votes, r.samples, r.kind, r.status, r.reason, r.decision,
  r.rule_id, r.trigger, r.ms, r.ts, (r.thumb IS NOT NULL) AS has_thumb,
  r.direction, r.visit_id`;

/** GET /anpr/reads?deviceId=&plate=&decision=&status=&since=&limit= */
anprRouter.get("/reads", requireAuth, async (req: AuthedRequest, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : null;
  const decision = typeof req.query.decision === "string" ? req.query.decision : null;
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const since = typeof req.query.since === "string" ? req.query.since : null;
  // Searched through the same normaliser that stored it, so an operator can
  // paste "KA 01 AB 1234" out of an email and find the row.
  const plate = typeof req.query.plate === "string" ? normalisePlate(req.query.plate) : null;

  try {
    const { rows } = await pool.query<ReadRow>(
      `SELECT ${READ_COLUMNS}
         FROM plate_reads r
         JOIN devices d ON d.id = r.device_id
        WHERE r.owner_id = $1
          AND ($2::text IS NULL OR r.device_id = $2)
          AND ($3::text IS NULL OR r.decision = $3)
          AND ($4::text IS NULL OR r.status = $4)
          AND ($5::text IS NULL OR r.plate = $5)
          AND ($6::timestamptz IS NULL OR r.ts >= $6)
        ORDER BY r.ts DESC
        LIMIT $7`,
      [req.user!.uid, deviceId, decision, status, plate || null, since, limit]
    );
    res.json({ reads: rows.map(readShape) });
  } catch (err) {
    logger.error({ err }, "anpr reads query failed");
    res.status(500).json({ error: "Could not load plate reads." });
  }
});

/**
 * GET /anpr/reads/:id/image — the capture the plate was read from.
 *
 * Served as real `image/jpeg` rather than base64 in JSON so a browser caches
 * it, an `<img>` tag can point straight at it, and it can be saved or attached
 * to a ticket without decoding anything.
 */
anprRouter.get("/reads/:id/image", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query<{ thumb: string | null }>(
    `SELECT thumb FROM plate_reads WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user!.uid]
  );
  const thumb = rows[0]?.thumb;
  if (!thumb) {
    res.status(404).json({ error: "No image for this read." });
    return;
  }
  const buf = Buffer.from(thumb, "base64");
  res.setHeader("content-type", "image/jpeg");
  res.setHeader("content-length", String(buf.length));
  // Immutable: a stored capture never changes. Private, because it is a
  // photograph of somebody's vehicle and must not sit in a shared cache.
  res.setHeader("cache-control", "private, max-age=86400, immutable");
  res.end(buf);
});

/** GET /anpr/summary?days= — counts for the traffic dashboard. */
anprRouter.get("/summary", requireAuth, async (req: AuthedRequest, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
  try {
    const { rows } = await pool.query<{
      total: string; recognised: string; denied: string; allowed: string; watched: string; unique_plates: string;
    }>(
      `SELECT COUNT(*)::text                                                  AS total,
              COUNT(*) FILTER (WHERE status = 'recognised')::text             AS recognised,
              COUNT(*) FILTER (WHERE decision = 'deny')::text                 AS denied,
              COUNT(*) FILTER (WHERE decision = 'allow')::text                AS allowed,
              COUNT(*) FILTER (WHERE decision = 'watch')::text                AS watched,
              COUNT(DISTINCT plate) FILTER (WHERE plate <> '')::text          AS unique_plates
         FROM plate_reads
        WHERE owner_id = $1 AND ts >= now() - ($2 || ' days')::interval`,
      [req.user!.uid, days]
    );
    const s = rows[0];

    const { rows: busiest } = await pool.query<{ hour: number; n: string }>(
      `SELECT EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Kolkata')::int AS hour, COUNT(*)::text AS n
         FROM plate_reads
        WHERE owner_id = $1 AND ts >= now() - ($2 || ' days')::interval
        GROUP BY 1 ORDER BY 1`,
      [req.user!.uid, days]
    );

    const { rows: frequent } = await pool.query<{ plate: string; n: string; last_at: Date }>(
      `SELECT plate, COUNT(*)::text AS n, MAX(ts) AS last_at
         FROM plate_reads
        WHERE owner_id = $1 AND plate <> '' AND ts >= now() - ($2 || ' days')::interval
        GROUP BY plate ORDER BY COUNT(*) DESC, MAX(ts) DESC LIMIT 10`,
      [req.user!.uid, days]
    );

    res.json({
      days,
      total: Number(s?.total ?? 0),
      recognised: Number(s?.recognised ?? 0),
      denied: Number(s?.denied ?? 0),
      allowed: Number(s?.allowed ?? 0),
      watched: Number(s?.watched ?? 0),
      uniquePlates: Number(s?.unique_plates ?? 0),
      // Reported so a low number is attributable. Without it, "we only read
      // 40 % of plates" looks like a broken camera when the real answer is
      // that no recogniser is configured at all.
      recogniser: config.ANPR_PROVIDER,
      byHour: busiest.map((r) => ({ hour: r.hour, count: Number(r.n) })),
      frequent: frequent.map((r) => ({
        plate: r.plate,
        pretty: prettyPlate(r.plate),
        count: Number(r.n),
        lastAt: r.last_at.toISOString(),
      })),
    });
  } catch (err) {
    logger.error({ err }, "anpr summary failed");
    res.status(500).json({ error: "Could not load the summary." });
  }
});

/* ------------------------------------------------------------------ */
/* Site: occupancy, capacity and overstays                             */
/* ------------------------------------------------------------------ */

/**
 * GET /anpr/occupancy — how full the site is right now.
 *
 * Deliberately its own endpoint rather than a field on /anpr/summary: a gate
 * display or a kiosk polls this every few seconds and must not drag a week of
 * aggregate statistics along with it.
 */
anprRouter.get("/occupancy", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const [now, overstays] = await Promise.all([
      occupancy(req.user!.uid),
      listOverstays(req.user!.uid),
    ]);
    res.json({
      ...now,
      overstays: overstays.map((o) => ({ ...o, pretty: prettyPlate(o.plate) })),
    });
  } catch (err) {
    logger.error({ err }, "anpr occupancy failed");
    res.status(500).json({ error: "Could not load occupancy." });
  }
});

anprRouter.get("/settings", requireAuth, async (req: AuthedRequest, res) => {
  res.json({ settings: await getSettings(req.user!.uid) });
});

const settingsSchema = z.object({
  // Nullable throughout: null means "not managed", which is a different and
  // valid state from zero. A capacity of 0 would mean the site is permanently
  // full, so the two must not be conflated by a coercion.
  capacity: z.number().int().min(1).max(100000).nullable().optional(),
  overstayHours: z.number().int().min(1).max(8760).nullable().optional(),
  alertUnknown: z.boolean().optional(),
  alertFull: z.boolean().optional(),
  // An empty string is normalised to null below rather than rejected: clearing
  // the field in the console is how somebody turns the report off, and making
  // that a validation error would be a strange way to say "stop emailing me".
  reportEmail: z.string().trim().max(200).nullable().optional(),
  reportHour: z.number().int().min(0).max(23).optional(),
});

anprRouter.patch("/settings", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = settingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid settings", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const patch = { ...parsed.data };
  if (patch.reportEmail !== undefined) {
    const email = (patch.reportEmail ?? "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "That does not look like an email address.", code: "invalid_email" });
      return;
    }
    patch.reportEmail = email || null;
  }
  try {
    res.json({ settings: await saveSettings(req.user!.uid, patch) });
  } catch (err) {
    logger.error({ err }, "anpr settings save failed");
    res.status(500).json({ error: "Could not save settings." });
  }
});

/**
 * POST /anpr/report/test — send today's report now.
 *
 * Runs `sendReport`, the same function the scheduler runs, rather than a
 * preview built by a second path. A preview that renders correctly proves
 * nothing about the mail that actually arrives at 07:00 — the interesting
 * failures are in delivery: a wrong sender domain failing DMARC, an SMTP host
 * that rejects the mailbox, a recipient with a typo.
 */
anprRouter.post("/report/test", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const settings = await getSettings(req.user!.uid);
    if (!settings.reportEmail) {
      res.status(400).json({ error: "Set a report address first.", code: "no_recipient" });
      return;
    }
    const { rows } = await pool.query<{ name: string; email: string }>(
      `SELECT name, email FROM users WHERE id = $1`,
      [req.user!.uid]
    );
    const sent = await sendReport(req.user!.uid, rows[0]?.name || rows[0]?.email || "Your site");
    if (!sent) {
      // The mail layer already logged why. Saying "sent" when nothing left the
      // building is the one answer this endpoint must never give.
      res.status(502).json({
        error: "The report could not be sent. Check the mail server settings on the control plane.",
        code: "send_failed",
      });
      return;
    }
    res.json({ sent: true, to: settings.reportEmail });
  } catch (err) {
    logger.error({ err }, "test report failed");
    res.status(500).json({ error: "Could not send the report." });
  }
});

/* ------------------------------------------------------------------ */
/* Vehicles                                                            */
/* ------------------------------------------------------------------ */

/**
 * GET /anpr/vehicles?days=&limit=
 *
 * The fleet of vehicles this account has seen, rather than the stream of
 * sightings. Distinct question, distinct endpoint: "how often does this van
 * come here and is it here now" cannot be answered by paging the log.
 */
anprRouter.get("/vehicles", requireAuth, async (req: AuthedRequest, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
  try {
    const vehicles = await listVehicles(req.user!.uid, days, limit);
    res.json({
      days,
      vehicles: vehicles.map((v) => ({ ...v, pretty: prettyPlate(v.plate) })),
      insideNow: vehicles.filter((v) => v.inside).length,
    });
  } catch (err) {
    logger.error({ err }, "anpr vehicles query failed");
    res.status(500).json({ error: "Could not load vehicles." });
  }
});

/**
 * GET /anpr/vehicles/:plate — everything known about one vehicle.
 *
 * The plate is normalised on the way in, so a URL pasted from a report with
 * spaces or dashes resolves to the same vehicle the camera recorded.
 */
anprRouter.get("/vehicles/:plate", requireAuth, async (req: AuthedRequest, res) => {
  const plate = normalisePlate(req.params.plate);
  if (!plate) {
    res.status(400).json({ error: "Not a plate.", code: "invalid_plate" });
    return;
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

  try {
    const { rows: readRows } = await pool.query<ReadRow>(
      `SELECT ${READ_COLUMNS}
         FROM plate_reads r
         JOIN devices d ON d.id = r.device_id
        WHERE r.owner_id = $1 AND r.plate = $2
        ORDER BY r.ts DESC
        LIMIT $3`,
      [req.user!.uid, plate, limit]
    );

    // A plate with no reads is not an empty vehicle, it is a vehicle this
    // account has never seen — a 404 so a typo does not read as "came zero
    // times", which looks like a working answer.
    if (!readRows.length) {
      res.status(404).json({ error: "No sightings of that plate.", code: "unknown_vehicle" });
      return;
    }

    const [visits, rules] = await Promise.all([
      visitsFor(req.user!.uid, plate, 200),
      pool.query<RuleRow>(
        `SELECT ${RULE_COLUMNS} FROM plate_rules WHERE owner_id = $1 AND plate = $2`,
        [req.user!.uid, plate]
      ),
    ]);

    const reads = readRows.map(readShape);
    const closed = visits.filter((v) => v.durationSec != null);
    const totalStay = closed.reduce((n, v) => n + (v.durationSec ?? 0), 0);
    const seenAt = readRows.map((r) => r.ts.getTime());

    res.json({
      plate,
      pretty: prettyPlate(plate),
      summary: {
        passes: reads.length,
        entries: reads.filter((r) => r.direction === "in").length,
        exits: reads.filter((r) => r.direction === "out").length,
        visits: visits.length,
        inside: visits.some((v) => v.status === "open"),
        firstSeen: new Date(Math.min(...seenAt)).toISOString(),
        lastSeen: new Date(Math.max(...seenAt)).toISOString(),
        totalStaySec: totalStay,
        avgStaySec: closed.length ? Math.round(totalStay / closed.length) : null,
        longestStaySec: closed.length ? Math.max(...closed.map((v) => v.durationSec ?? 0)) : null,
        // Named so the console can explain a gap rather than just showing one.
        missedReads: visits.filter((v) => v.status !== "open" && v.status !== "closed").length,
        cameras: [...new Set(readRows.map((r) => r.device_id))],
        bestConfidence: Math.max(...readRows.map((r) => r.confidence)),
        // The window `reads` covers, so a truncated list is not read as the
        // vehicle's whole history.
        truncated: reads.length >= limit,
      },
      rule: rules.rows[0] ? ruleShape(rules.rows[0]) : null,
      visits,
      reads,
    });
  } catch (err) {
    logger.error({ err }, "anpr vehicle profile failed");
    res.status(500).json({ error: "Could not load that vehicle." });
  }
});

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

interface RuleRow {
  id: string;
  plate: string;
  kind: string;
  label: string;
  device_id: string | null;
  valid_from: Date | null;
  valid_to: Date | null;
  enabled: boolean;
  hits: string;
  last_hit_at: Date | null;
  created_at: Date;
}

function ruleShape(r: RuleRow) {
  return {
    id: Number(r.id),
    plate: r.plate,
    pretty: prettyPlate(r.plate),
    kind: r.kind,
    label: r.label,
    deviceId: r.device_id,
    validFrom: r.valid_from ? r.valid_from.toISOString() : null,
    validTo: r.valid_to ? r.valid_to.toISOString() : null,
    enabled: r.enabled,
    hits: Number(r.hits),
    lastHitAt: r.last_hit_at ? r.last_hit_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
  };
}

const RULE_COLUMNS = `id, plate, kind, label, device_id, valid_from, valid_to, enabled, hits, last_hit_at, created_at`;

anprRouter.get("/rules", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query<RuleRow>(
    `SELECT ${RULE_COLUMNS} FROM plate_rules WHERE owner_id = $1
      ORDER BY CASE kind WHEN 'deny' THEN 0 WHEN 'watch' THEN 1 ELSE 2 END, plate`,
    [req.user!.uid]
  );
  res.json({ rules: rows.map(ruleShape) });
});

const MAX_RULES_PER_USER = 2000;

const createRuleSchema = z.object({
  plate: z.string().trim().min(4).max(20),
  kind: z.enum(["allow", "deny", "watch"]).default("allow"),
  label: z.string().trim().max(80).default(""),
  deviceId: z.string().min(1).nullable().default(null),
  validFrom: z.string().datetime().nullable().default(null),
  validTo: z.string().datetime().nullable().default(null),
});

anprRouter.post("/rules", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createRuleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid rule", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { kind, label, deviceId, validFrom, validTo } = parsed.data;

  /*
   * Stored through the same analyser a read goes through.
   *
   * A rule typed as "KA-01-AB-1234" and a read that arrives as "KA01AB1234"
   * have to become the same string or the allow-list quietly never matches —
   * and it fails open-ended: nothing errors, the gate simply never recognises
   * the owner's own car. Correcting it here, at the only other place a plate
   * enters the system, is what keeps the two ends in step.
   */
  const analysis = analysePlate(parsed.data.plate);
  if (!analysis.valid) {
    res.status(400).json({
      error:
        analysis.reason === "unknown_state"
          ? `"${parsed.data.plate}" does not start with a recognised state code.`
          : `"${parsed.data.plate}" is not a valid registration.`,
      code: "invalid_plate",
    });
    return;
  }
  const plate = analysis.plate;

  if (deviceId) {
    const own = await pool.query(`SELECT 1 FROM devices WHERE id = $1 AND owner_id = $2`, [
      deviceId,
      req.user!.uid,
    ]);
    if (!own.rowCount) {
      res.status(404).json({ error: "Device not found", code: "unknown_device" });
      return;
    }
  }

  const { rows: countRows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM plate_rules WHERE owner_id = $1`,
    [req.user!.uid]
  );
  if (Number(countRows[0]?.n ?? 0) >= MAX_RULES_PER_USER) {
    res.status(409).json({ error: `Limit of ${MAX_RULES_PER_USER} plate rules reached.`, code: "rule_limit" });
    return;
  }

  try {
    const { rows } = await pool.query<RuleRow>(
      `INSERT INTO plate_rules (owner_id, plate, kind, label, device_id, valid_from, valid_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${RULE_COLUMNS}`,
      [req.user!.uid, plate, kind, label, deviceId, validFrom, validTo]
    );
    res.status(201).json({ rule: ruleShape(rows[0]) });
  } catch (err) {
    // The unique index. Reported as a conflict with the plate in the message,
    // because the operator has almost certainly just typed a plate that is
    // already on a different list and needs to know which.
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({
        error: `${prettyPlate(plate)} is already on a list for this scope.`,
        code: "duplicate_plate",
      });
      return;
    }
    logger.error({ err }, "anpr rule create failed");
    res.status(500).json({ error: "Could not save the rule." });
  }
});

const patchRuleSchema = z.object({
  kind: z.enum(["allow", "deny", "watch"]).optional(),
  label: z.string().trim().max(80).optional(),
  enabled: z.boolean().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
});

anprRouter.patch("/rules/:id", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = patchRuleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid rule", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { kind, label, enabled, validFrom, validTo } = parsed.data;
  const { rows } = await pool.query<RuleRow>(
    `UPDATE plate_rules
        SET kind       = COALESCE($3, kind),
            label      = COALESCE($4, label),
            enabled    = COALESCE($5, enabled),
            valid_from = CASE WHEN $6::boolean THEN $7::timestamptz ELSE valid_from END,
            valid_to   = CASE WHEN $8::boolean THEN $9::timestamptz ELSE valid_to   END
      WHERE id = $1 AND owner_id = $2
      RETURNING ${RULE_COLUMNS}`,
    [
      req.params.id,
      req.user!.uid,
      kind ?? null,
      label ?? null,
      enabled ?? null,
      // "validFrom was supplied" and "validFrom is null" are different
      // requests — the second clears the window — and COALESCE cannot tell
      // them apart, so the presence flag is passed separately.
      validFrom !== undefined,
      validFrom ?? null,
      validTo !== undefined,
      validTo ?? null,
    ]
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ rule: ruleShape(rows[0]) });
});

anprRouter.delete("/rules/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { rowCount } = await pool.query(`DELETE FROM plate_rules WHERE id = $1 AND owner_id = $2`, [
    req.params.id,
    req.user!.uid,
  ]);
  if (!rowCount) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ success: true });
});

/**
 * POST /anpr/rules/from-read/:id — add the plate of an existing read to a list.
 *
 * The path that actually gets used: somebody looks at last night's log,
 * recognises their own car or one that should not have been there, and adds
 * it. Re-typing a plate from a photograph is exactly where a transcription
 * error gets baked into an allow-list, so it is never re-typed.
 */
anprRouter.post("/rules/from-read/:id", requireAuth, async (req: AuthedRequest, res) => {
  const kind = ["allow", "deny", "watch"].includes(String(req.body?.kind)) ? String(req.body.kind) : "allow";
  const label = String(req.body?.label ?? "").slice(0, 80);

  const { rows: readRows } = await pool.query<{ plate: string; device_id: string }>(
    `SELECT plate, device_id FROM plate_reads WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user!.uid]
  );
  const read = readRows[0];
  if (!read || !read.plate) {
    res.status(404).json({ error: "No recognised plate on that read." });
    return;
  }

  try {
    const { rows } = await pool.query<RuleRow>(
      `INSERT INTO plate_rules (owner_id, plate, kind, label) VALUES ($1,$2,$3,$4)
       RETURNING ${RULE_COLUMNS}`,
      [req.user!.uid, read.plate, kind, label]
    );
    res.status(201).json({ rule: ruleShape(rows[0]) });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({ error: `${prettyPlate(read.plate)} is already on a list.`, code: "duplicate_plate" });
      return;
    }
    logger.error({ err }, "anpr rule from read failed");
    res.status(500).json({ error: "Could not save the rule." });
  }
});

/**
 * POST /anpr/devices/:id/capture — take a burst now.
 *
 * The installer's tool. Aim the camera, press this, and see what the pipeline
 * makes of the vehicle in front of it, rather than waiting for one to arrive.
 */
anprRouter.post("/devices/:id/capture", requireAuth, async (req: AuthedRequest, res) => {
  const own = await pool.query(`SELECT 1 FROM devices WHERE id = $1 AND owner_id = $2`, [
    req.params.id,
    req.user!.uid,
  ]);
  if (!own.rowCount) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  try {
    publishCommand(req.params.id, { action: "capture" });
    res.json({ success: true });
  } catch {
    // publishCommand throws while the broker is restarting. A 503 is something
    // a client can retry; a hung request is not.
    res.status(503).json({ error: "Broker unavailable — try again in a moment.", code: "broker_down" });
  }
});
