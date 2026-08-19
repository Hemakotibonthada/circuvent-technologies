/**
 * The Guardian API.
 *
 *   /guardian/devices/:id/contacts     who gets called, and in what order
 *   /guardian/devices/:id/provision    push the whole configuration to the device
 *   /guardian/devices/:id/test         prove the path works, without an emergency
 *   /guardian/devices/:id/panic        raise one from the app
 *   /guardian/incidents                what has happened
 *   /guardian/incidents/:id            one, with its track and who was told
 *   /guardian/incidents/:id/ack        somebody is dealing with it
 *   /guardian/incidents/:id/close      it is over, or it never happened
 *   /guardian/stations                 the police directory
 *
 * EVERY ROUTE RE-CHECKS OWNERSHIP
 *
 * `ownsDevice` is repeated at the top of each handler rather than resolved
 * once in a parent router. This is a device that knows where a child is and
 * carries their mother's phone number; the check that keeps one household's
 * out of another's has to be visible at the point where it matters, so that
 * the next endpoint added is not the one that forgot it.
 */
import { Router } from "express";
import { z } from "zod";
import { pool, recordEvent } from "../db";
import { publishCommand } from "../mqtt";
import { requireAuth, type AuthedRequest } from "../auth";
import { logger } from "../logger";
import { requireCapability } from "../home/enforce";
import {
  acknowledgeIncident,
  closeIncident,
  openIncidentFor,
  openIncidentOf,
} from "./incident";
import { nearestStation, stationNumberFor, type Station } from "./nearest";
import { clampJourneyMinutes } from "./watch";

export const guardianRouter = Router();

/** The device must exist and belong to the caller. Returns its row, or null. */
async function ownsDevice(userId: number, deviceId: string) {
  const r = await pool.query<{ id: string; type: string; state: Record<string, unknown> | null }>(
    `SELECT id, type, state FROM devices WHERE id = $1 AND owner_id = $2`,
    [deviceId, userId],
  );
  const row = r.rows[0];
  if (!row || row.type !== "guardian") return null;
  return row;
}

const contactSchema = z.object({
  name: z.string().trim().min(1).max(40),
  /*
   * E.164, and validated rather than trusted.
   *
   * This number goes to a GSM modem, which will not infer a country code the
   * way a phone's dialler does — a number stored as "9876543210" is dialled as
   * a local number from wherever the SIM happens to be roaming. A contact that
   * cannot be reached is the failure this whole product exists to prevent, and
   * it is silent until the day it matters.
   */
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,17}$/, "Use the full international form, starting with +"),
  relation: z.string().trim().max(24).optional(),
  notifyPush: z.boolean().optional(),
});

/* ------------------------------------------------------------------ */
/* Contacts                                                            */
/* ------------------------------------------------------------------ */

guardianRouter.get("/devices/:id/contacts", requireAuth, async (req: AuthedRequest, res) => {
  const dev = await ownsDevice(req.user!.uid, req.params.id);
  if (!dev) return res.status(404).json({ error: "not found" });

  const r = await pool.query(
    `SELECT id, name, phone, relation, position, notify_push AS "notifyPush"
       FROM guardian_contacts
      WHERE device_id = $1
      ORDER BY position, id`,
    [dev.id],
  );
  res.json({ contacts: r.rows });
});

guardianRouter.put(
  "/devices/:id/contacts",
  requireAuth,
  requireCapability("manage-devices"),
  async (req: AuthedRequest, res) => {
    const dev = await ownsDevice(req.user!.uid, req.params.id);
    if (!dev) return res.status(404).json({ error: "not found" });

    /*
     * Four, because the device stores four.
     *
     * Accepting more here would let the console show a fifth contact that the
     * firmware silently drops — the list would look right in the app and be
     * wrong in the shoe, which is the only place it is read when it counts.
     */
    const parsed = z.object({ contacts: z.array(contactSchema).max(4) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid" });
    }
    const { contacts } = parsed.data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM guardian_contacts WHERE device_id = $1`, [dev.id]);
      for (let i = 0; i < contacts.length; i++) {
        const c = contacts[i];
        await client.query(
          `INSERT INTO guardian_contacts
             (device_id, owner_id, name, phone, relation, position, notify_push)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [dev.id, req.user!.uid, c.name, c.phone, c.relation ?? "", i, c.notifyPush ?? true],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error({ err }, "guardian contacts save failed");
      return res.status(500).json({ error: "save failed" });
    } finally {
      client.release();
    }

    await pushConfig(dev.id, req.user!.uid);
    await recordEvent(req.user!.uid, "guardian", `Emergency contacts updated (${contacts.length})`, "", dev.id);
    res.json({ ok: true, count: contacts.length });
  },
);

/* ------------------------------------------------------------------ */
/* Provisioning                                                        */
/* ------------------------------------------------------------------ */

const provisionSchema = z.object({
  national: z.string().trim().max(19).optional(),
  apn: z.string().trim().max(23).optional(),
  holdSec: z.number().int().min(10).max(120).optional(),
  silent: z.boolean().optional(),
});

/**
 * Sends the device everything it needs to work alone.
 *
 * This is the whole of "set it up once from the phone, then it does not need
 * the phone": contacts, the national emergency fallback, the APN, the hold
 * length and whether it makes a noise, all written to NVS on the device.
 */
async function pushConfig(
  deviceId: string,
  userId: number,
  extra: z.infer<typeof provisionSchema> = {},
): Promise<number> {
  const r = await pool.query<{ name: string; phone: string }>(
    `SELECT name, phone FROM guardian_contacts
      WHERE device_id = $1 AND owner_id = $2
      ORDER BY position, id
      LIMIT 4`,
    [deviceId, userId],
  );

  publishCommand(deviceId, {
    action: "configure",
    contacts: r.rows.map((c) => ({ name: c.name.slice(0, 15), number: c.phone })),
    ...(extra.national !== undefined ? { national: extra.national } : {}),
    ...(extra.apn !== undefined ? { apn: extra.apn } : {}),
    ...(extra.holdSec !== undefined ? { holdSec: extra.holdSec } : {}),
    ...(extra.silent !== undefined ? { silent: extra.silent } : {}),
  });
  return r.rows.length;
}

guardianRouter.post(
  "/devices/:id/provision",
  requireAuth,
  requireCapability("manage-devices"),
  async (req: AuthedRequest, res) => {
    const dev = await ownsDevice(req.user!.uid, req.params.id);
    if (!dev) return res.status(404).json({ error: "not found" });

    const parsed = provisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid" });
    }

    const count = await pushConfig(dev.id, req.user!.uid, parsed.data);

    /*
     * Resolve a station straight away if the device has already reported a
     * position, so a freshly provisioned device is not carrying an empty
     * police number until the wearer next moves.
     */
    const state = (dev.state ?? {}) as Record<string, unknown>;
    const lat = typeof state.lat === "number" ? state.lat : null;
    const lng = typeof state.lng === "number" ? state.lng : null;
    if (lat !== null && lng !== null) {
      const stations = await pool.query<Station>(
        `SELECT id, name, phone, country, district, lat, lng
           FROM guardian_police_stations WHERE active = true`,
      );
      const nearest = nearestStation(
        lat,
        lng,
        stations.rows.map((s) => ({ ...s, id: Number(s.id) })),
        { requirePhone: true },
      );
      const { number } = stationNumberFor(nearest, parsed.data.national ?? "");
      if (number) publishCommand(dev.id, { action: "setPolice", number });
    }

    await recordEvent(req.user!.uid, "guardian", `Guardian provisioned with ${count} contact(s)`, "", dev.id);
    res.json({ ok: true, contacts: count });
  },
);

/* ------------------------------------------------------------------ */
/* Proving it works                                                    */
/* ------------------------------------------------------------------ */

/**
 * A rehearsal.
 *
 * A safety device nobody has ever tested is a safety device nobody should
 * trust, and the only alternative to this button is staging an emergency. The
 * firmware sends the test to the wearer's own contacts and deliberately not to
 * a police station — dialling one to check the wiring is how a product gets
 * its emergency numbers blocked.
 */
guardianRouter.post(
  "/devices/:id/test",
  requireAuth,
  requireCapability("manage-devices"),
  async (req: AuthedRequest, res) => {
    const dev = await ownsDevice(req.user!.uid, req.params.id);
    if (!dev) return res.status(404).json({ error: "not found" });
    publishCommand(dev.id, { action: "test" });
    await recordEvent(req.user!.uid, "guardian", "Guardian self-test sent", "A test message was sent to the emergency contacts. Police were not contacted.", dev.id);
    res.json({ ok: true });
  },
);

/**
 * Raising the alarm from the app.
 *
 * The phone is the first thing taken, so this is not the primary path and
 * never will be — but somebody who still has their phone and cannot reach
 * their shoe should not be told to take it off.
 */
guardianRouter.post("/devices/:id/panic", requireAuth, async (req: AuthedRequest, res) => {
  const dev = await ownsDevice(req.user!.uid, req.params.id);
  if (!dev) return res.status(404).json({ error: "not found" });

  publishCommand(dev.id, { action: "panic" });
  /*
   * Opened here as well as by the device's own report, because the point of
   * an app-raised alarm is that it works when the device is out of touch — if
   * we waited for the device to tell us, an unreachable device would mean no
   * incident at all.
   */
  const existing = await openIncidentOf(dev.id);
  if (!existing) {
    await openIncidentFor(dev.id, (dev.state ?? {}) as Record<string, unknown>, "app");
  }
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Incidents                                                           */
/* ------------------------------------------------------------------ */

guardianRouter.get("/incidents", requireAuth, async (req: AuthedRequest, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25) || 25));
  const r = await pool.query(
    `SELECT i.id, i.device_id AS "deviceId", d.name AS "deviceName", i.source, i.status,
            i.opened_at AS "openedAt", i.acknowledged_at AS "acknowledgedAt",
            i.acknowledged_by AS "acknowledgedBy", i.closed_at AS "closedAt",
            i.opened_lat AS "lat", i.opened_lng AS "lng",
            i.station_km AS "stationKm", s.name AS "stationName"
       FROM guardian_incidents i
       JOIN devices d ON d.id = i.device_id
       LEFT JOIN guardian_police_stations s ON s.id = i.station_id
      WHERE i.owner_id = $1
      ORDER BY i.opened_at DESC
      LIMIT $2`,
    [req.user!.uid, limit],
  );
  res.json({ incidents: r.rows });
});

guardianRouter.get("/incidents/:id", requireAuth, async (req: AuthedRequest, res) => {
  const head = await pool.query(
    `SELECT i.id, i.device_id AS "deviceId", d.name AS "deviceName", i.source, i.status,
            i.opened_at AS "openedAt", i.closed_at AS "closedAt",
            i.opened_lat AS "lat", i.opened_lng AS "lng",
            i.station_km AS "stationKm", s.name AS "stationName", s.phone AS "stationPhone"
       FROM guardian_incidents i
       JOIN devices d ON d.id = i.device_id
       LEFT JOIN guardian_police_stations s ON s.id = i.station_id
      WHERE i.id = $1 AND i.owner_id = $2`,
    [req.params.id, req.user!.uid],
  );
  const incident = head.rows[0];
  if (!incident) return res.status(404).json({ error: "not found" });

  const [points, notes] = await Promise.all([
    pool.query(
      `SELECT at, lat, lng, fix_age_sec AS "fixAgeSec", battery
         FROM guardian_incident_points WHERE incident_id = $1 ORDER BY at`,
      [req.params.id],
    ),
    pool.query(
      `SELECT target, target_name AS "targetName", channel, ok, sent_by AS "sentBy", detail, at
         FROM guardian_notifications WHERE incident_id = $1 ORDER BY at`,
      [req.params.id],
    ),
  ]);

  res.json({ incident, track: points.rows, notifications: notes.rows });
});

guardianRouter.post("/incidents/:id/ack", requireAuth, async (req: AuthedRequest, res) => {
  const own = await pool.query(
    `SELECT id FROM guardian_incidents WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user!.uid],
  );
  if (!own.rows[0]) return res.status(404).json({ error: "not found" });

  await acknowledgeIncident(req.params.id, req.user!.email);
  res.json({ ok: true });
});

guardianRouter.post("/incidents/:id/close", requireAuth, async (req: AuthedRequest, res) => {
  const own = await pool.query<{ device_id: string }>(
    `SELECT device_id FROM guardian_incidents WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user!.uid],
  );
  const row = own.rows[0];
  if (!row) return res.status(404).json({ error: "not found" });

  const falseAlarm = req.body?.falseAlarm === true;
  await closeIncident(
    req.params.id,
    falseAlarm ? "false_alarm" : "resolved",
    req.user!.email,
  );

  /*
   * Tell the device too, so it stands the alarm down and sends everyone who
   * was alerted a message saying it is over. Somebody who received "I need
   * help" and then heard nothing is left in the worst position of all.
   */
  publishCommand(row.device_id, { action: "cancel" });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Police directory                                                    */
/* ------------------------------------------------------------------ */

guardianRouter.get("/stations", requireAuth, async (req: AuthedRequest, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const r = await pool.query<Station>(
    `SELECT id, name, phone, country, district, lat, lng
       FROM guardian_police_stations WHERE active = true ORDER BY name`,
  );
  const stations = r.rows.map((s) => ({ ...s, id: Number(s.id) }));

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const nearest = nearestStation(lat, lng, stations, { requirePhone: true });
    return res.json({ stations, nearest });
  }
  res.json({ stations });
});

const stationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(19).default(""),
  country: z.string().trim().length(2).default("IN"),
  district: z.string().trim().max(60).default(""),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

guardianRouter.post(
  "/stations",
  requireAuth,
  requireCapability("manage-devices"),
  async (req: AuthedRequest, res) => {
    const parsed = stationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid" });
    }
    const s = parsed.data;
    const r = await pool.query<{ id: string }>(
      `INSERT INTO guardian_police_stations (name, phone, country, district, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [s.name, s.phone, s.country.toUpperCase(), s.district, s.lat, s.lng],
    );
    res.json({ ok: true, id: r.rows[0].id });
  },
);

/* ------------------------------------------------------------------ */
/* Safe zones                                                          */
/* ------------------------------------------------------------------ */

guardianRouter.get("/devices/:id/zones", requireAuth, async (req: AuthedRequest, res) => {
  const dev = await ownsDevice(req.user!.uid, req.params.id);
  if (!dev) return res.status(404).json({ error: "not found" });

  const r = await pool.query(
    `SELECT id, name, lat, lng, radius_m AS "radiusM",
            notify_enter AS "notifyEnter", notify_exit AS "notifyExit", presence
       FROM guardian_zones WHERE device_id = $1 ORDER BY id`,
    [dev.id],
  );
  res.json({ zones: r.rows });
});

const zoneSchema = z.object({
  name: z.string().trim().min(1).max(40),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /*
   * The floor is not arbitrary. Consumer GPS is good to five or ten metres in
   * the open and much worse beside a building — which is exactly where a school
   * gate is. A fifty-metre zone would be crossed and re-crossed by noise alone,
   * and the hysteresis band that stops that is itself fifty metres.
   */
  radiusM: z.number().int().min(100).max(5000),
  notifyEnter: z.boolean().optional(),
  notifyExit: z.boolean().optional(),
});

guardianRouter.post(
  "/devices/:id/zones",
  requireAuth,
  requireCapability("manage-devices"),
  async (req: AuthedRequest, res) => {
    const dev = await ownsDevice(req.user!.uid, req.params.id);
    if (!dev) return res.status(404).json({ error: "not found" });

    const parsed = zoneSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid" });
    }
    const z2 = parsed.data;
    const r = await pool.query<{ id: string }>(
      `INSERT INTO guardian_zones
         (device_id, owner_id, name, lat, lng, radius_m, notify_enter, notify_exit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        dev.id,
        req.user!.uid,
        z2.name,
        z2.lat,
        z2.lng,
        z2.radiusM,
        z2.notifyEnter ?? true,
        z2.notifyExit ?? true,
      ],
    );
    res.json({ ok: true, id: r.rows[0].id });
  },
);

guardianRouter.delete(
  "/devices/:id/zones/:zoneId",
  requireAuth,
  requireCapability("manage-devices"),
  async (req: AuthedRequest, res) => {
    const dev = await ownsDevice(req.user!.uid, req.params.id);
    if (!dev) return res.status(404).json({ error: "not found" });
    await pool.query(`DELETE FROM guardian_zones WHERE id = $1 AND device_id = $2`, [
      req.params.zoneId,
      dev.id,
    ]);
    res.json({ ok: true });
  },
);

/* ------------------------------------------------------------------ */
/* Journey mode                                                        */
/* ------------------------------------------------------------------ */

/**
 * "Walk me home."
 *
 * Armed on the device as well as recorded here. The device runs the same
 * deadline itself, so a wearer who walks out of coverage is still covered —
 * which is exactly the situation somebody starts a journey for.
 */
guardianRouter.post("/devices/:id/journey", requireAuth, async (req: AuthedRequest, res) => {
  const dev = await ownsDevice(req.user!.uid, req.params.id);
  if (!dev) return res.status(404).json({ error: "not found" });

  const parsed = z
    .object({
      minutes: z.number().int(),
      destination: z.string().trim().max(60).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "minutes is required" });

  const minutes = clampJourneyMinutes(parsed.data.minutes);

  /* One at a time. A second journey would leave the first running with nobody
     watching it, and its deadline would fire later as a mystery alarm. */
  await pool.query(
    `UPDATE guardian_journeys SET status='cancelled', closed_at=now()
      WHERE device_id = $1 AND status = 'running'`,
    [dev.id],
  );

  const r = await pool.query<{ id: string; due_at: string }>(
    `INSERT INTO guardian_journeys (device_id, owner_id, destination, due_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)
     RETURNING id, due_at`,
    [dev.id, req.user!.uid, parsed.data.destination ?? "", String(minutes)],
  );

  publishCommand(dev.id, { action: "journey", minutes });
  await recordEvent(
    req.user!.uid,
    "guardian",
    `Journey started — due in ${minutes} min`,
    parsed.data.destination ?? "",
    dev.id,
  );
  res.json({ ok: true, id: r.rows[0].id, dueAt: r.rows[0].due_at, minutes });
});

/** "I got there." */
guardianRouter.post("/devices/:id/arrived", requireAuth, async (req: AuthedRequest, res) => {
  const dev = await ownsDevice(req.user!.uid, req.params.id);
  if (!dev) return res.status(404).json({ error: "not found" });

  await pool.query(
    `UPDATE guardian_journeys SET status='arrived', closed_at=now()
      WHERE device_id = $1 AND status = 'running'`,
    [dev.id],
  );
  publishCommand(dev.id, { action: "arrived" });
  res.json({ ok: true });
});

guardianRouter.get("/devices/:id/journey", requireAuth, async (req: AuthedRequest, res) => {
  const dev = await ownsDevice(req.user!.uid, req.params.id);
  if (!dev) return res.status(404).json({ error: "not found" });

  const r = await pool.query(
    `SELECT id, destination, started_at AS "startedAt", due_at AS "dueAt",
            status, nudged_at AS "nudgedAt"
       FROM guardian_journeys
      WHERE device_id = $1
      ORDER BY started_at DESC
      LIMIT 1`,
    [dev.id],
  );
  res.json({ journey: r.rows[0] ?? null });
});
