import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";
import { publishCommand } from "../mqtt";
import { logger } from "../logger";
import { liveAircraft } from "../drone";
import {
  flightTrack,
  listFlights,
  openFlight,
  recordFlightEvent,
  toSummary,
  type FlightRow,
} from "../drone/flights";
import {
  addBattery,
  assignBattery,
  deleteBattery,
  getSettings,
  listBatteries,
  saveSettings,
  updateBattery,
} from "../drone/settings";
import { checkCommand, limitsFor, ACTIONS, REMOTE_MODES } from "../drone/safety";
import { sendReport } from "../drone/report";

/**
 * Drone: live state, the log book, missions and the safety envelope.
 *
 * Every route is scoped to the caller's own devices, and the ownership check is
 * written into each query rather than done once up front. A flight log is a
 * record of where an aircraft — and by implication a person — was, so a query
 * that forgot its `owner_id` would hand somebody else's movements over as
 * readily as your own.
 */
export const droneRouter = Router();

/** Confirms the caller owns a `drone-link`, and returns its live state. */
async function ownedAircraft(
  uid: number,
  deviceId: string
): Promise<{ state: Record<string, unknown> | null } | null> {
  const { rows } = await pool.query<{ state: Record<string, unknown> | null; type: string }>(
    `SELECT state, type FROM devices WHERE id = $1 AND owner_id = $2`,
    [deviceId, uid]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.type !== "drone-link") return null;
  return { state: row.state };
}

/* ------------------------------------------------------------------ */
/* Live                                                                */
/* ------------------------------------------------------------------ */

droneRouter.get("/live", requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.uid;
  try {
    const [aircraft, limits] = await Promise.all([liveAircraft(uid), limitsFor(uid)]);
    res.json({ aircraft, limits });
  } catch (err) {
    logger.error({ err }, "drone live failed");
    res.status(500).json({ error: "Failed to load aircraft" });
  }
});

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

const commandSchema = z.object({
  action: z.enum(ACTIONS),
  alt: z.number().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  force: z.boolean().optional(),
  op: z.enum(["start", "pause", "resume"]).optional(),
  mode: z.enum(REMOTE_MODES).optional(),
  // Device settings passed through on `set`.
  allowArm: z.boolean().optional(),
  trackHz: z.number().int().min(1).max(10).optional(),
  maxAlt: z.number().int().positive().optional(),
  maxRange: z.number().int().positive().optional(),
  minBatt: z.number().int().min(0).max(90).optional(),
  minSats: z.number().int().min(4).max(30).optional(),
  requireHome: z.boolean().optional(),
});

/**
 * Relays one command to an aircraft.
 *
 * Every command is checked against the account's safety envelope first, and a
 * refusal is a 409 with a machine-readable code — not a silent no-op. An
 * operator who taps "return home" and sees nothing happen will tap it again,
 * and then start looking for the transmitter.
 *
 * Both the acceptance and the refusal are written to the flight record. The
 * refusals matter more: "the pilot tried to disarm in flight and the system
 * refused" is exactly the sort of thing that needs to be in the log when
 * somebody asks what happened.
 */
droneRouter.post("/:id/command", requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.uid;
  const deviceId = req.params.id;
  const parsed = commandSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid command", detail: parsed.error.issues[0]?.message });
  }

  try {
    const aircraft = await ownedAircraft(uid, deviceId);
    if (!aircraft) return res.status(404).json({ error: "No such aircraft" });

    const { action, ...params } = parsed.data;
    const limits = await limitsFor(uid);
    const verdict = checkCommand(action, params as Record<string, unknown>, aircraft.state as never, limits);

    const flight = await openFlight(deviceId);

    if (!verdict.ok) {
      await recordFlightEvent(
        deviceId,
        uid,
        "command-refused",
        { action, code: verdict.code, reason: verdict.reason },
        "warn",
        flight?.id
      );
      return res.status(409).json({ error: verdict.reason, code: verdict.code });
    }

    publishCommand(deviceId, { action, ...params });
    await recordFlightEvent(
      deviceId,
      uid,
      "command",
      { action, ...params, by: req.user!.email ?? uid },
      // A forced disarm is the single most consequential thing anyone can do
      // from this API, so it is recorded at alert severity and turns up in the
      // daily report rather than sitting quietly in the command log.
      action === "disarm" && params.force ? "alert" : "info",
      flight?.id
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, deviceId }, "drone command failed");
    res.status(500).json({ error: "Failed to send command" });
  }
});

/* ------------------------------------------------------------------ */
/* Flights                                                             */
/* ------------------------------------------------------------------ */

droneRouter.get("/flights", requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.uid;
  try {
    const flights = await listFlights(uid, {
      deviceId: typeof req.query.device === "string" ? req.query.device : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      since: typeof req.query.since === "string" ? req.query.since : undefined,
    });
    res.json({ flights });
  } catch (err) {
    logger.error({ err }, "flight list failed");
    res.status(500).json({ error: "Failed to load flights" });
  }
});

droneRouter.get("/flights/:id", requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.uid;
  try {
    const { rows } = await pool.query<FlightRow>(
      `SELECT * FROM flights WHERE id = $1 AND owner_id = $2`,
      [req.params.id, uid]
    );
    if (!rows[0]) return res.status(404).json({ error: "No such flight" });

    const { rows: events } = await pool.query<{
      at: string; kind: string; detail: Record<string, unknown>; severity: string;
    }>(
      `SELECT at, kind, detail, severity FROM flight_events
        WHERE flight_id = $1 ORDER BY at LIMIT 500`,
      [req.params.id]
    );

    res.json({ flight: toSummary(rows[0]), events });
  } catch (err) {
    logger.error({ err }, "flight detail failed");
    res.status(500).json({ error: "Failed to load flight" });
  }
});

droneRouter.get("/flights/:id/track", requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.uid;
  try {
    const points = await flightTrack(
      uid,
      req.params.id,
      req.query.points ? Math.min(Number(req.query.points) || 2000, 20000) : 2000
    );
    res.json({ points });
  } catch (err) {
    logger.error({ err }, "flight track failed");
    res.status(500).json({ error: "Failed to load track" });
  }
});

/**
 * The log book as CSV.
 *
 * Produced by the API rather than assembled in the browser so that the file a
 * pilot attaches to an insurance claim is byte-for-byte the one support would
 * generate — the same reasoning the device report follows.
 */
droneRouter.get("/flights.csv", requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.uid;
  try {
    const flights = await listFlights(uid, { limit: 500 });
    const head =
      "flight_id,device,started_at,took_off_at,ended_at,duration_s,airborne_s," +
      "distance_m,max_alt_m,max_dist_m,max_speed_ms,batt_start_pct,batt_end_pct,outcome,failsafe,fence_breach\n";
    const body = flights
      .map((f) =>
        [
          f.id, f.deviceId, f.startedAt, f.tookOffAt ?? "", f.endedAt ?? "",
          f.durationSec ?? "", f.airborneSec ?? "", Math.round(f.distanceM),
          f.maxAltM.toFixed(1), Math.round(f.maxDistM), f.maxSpeedMs.toFixed(1),
          f.battStartPct ?? "", f.battEndPct ?? "", f.outcome, f.failsafe, f.fenceBreach,
        ].join(",")
      )
      .join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="flights.csv"`);
    res.send(head + body + "\n");
  } catch (err) {
    logger.error({ err }, "flight csv failed");
    res.status(500).json({ error: "Failed to export" });
  }
});

const notesSchema = z.object({
  notes: z.string().max(2000).optional(),
  batteryId: z.string().nullable().optional(),
});

droneRouter.patch("/flights/:id", requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.uid;
  const parsed = notesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  try {
    if (parsed.data.notes !== undefined) {
      await pool.query(
        `UPDATE flights SET notes = $3, updated_at = now() WHERE id = $1 AND owner_id = $2`,
        [req.params.id, uid, parsed.data.notes]
      );
    }
    if (parsed.data.batteryId !== undefined) {
      await assignBattery(uid, req.params.id, parsed.data.batteryId);
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "flight patch failed");
    res.status(500).json({ error: "Failed to update flight" });
  }
});

/* ------------------------------------------------------------------ */
/* Missions                                                            */
/* ------------------------------------------------------------------ */

const waypointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  alt: z.number().positive().max(500),
  action: z.enum(["waypoint", "loiter", "land", "rtl"]).default("waypoint"),
  holdSec: z.number().int().min(0).max(3600).optional(),
});

const missionSchema = z.object({
  name: z.string().min(1).max(80),
  waypoints: z.array(waypointSchema).min(1).max(200),
});

droneRouter.get("/missions", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, waypoints, created_at, updated_at FROM drone_missions
        WHERE owner_id = $1 ORDER BY name`,
      [req.user!.uid]
    );
    res.json({ missions: rows });
  } catch (err) {
    logger.error({ err }, "mission list failed");
    res.status(500).json({ error: "Failed to load missions" });
  }
});

droneRouter.post("/missions", requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.uid;
  const parsed = missionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid mission", detail: parsed.error.issues[0]?.message });
  }
  try {
    // A mission that breaches the account ceiling is refused at save time, not
    // at fly time. Storing it and refusing later means the operator discovers
    // the problem standing in a field with the aircraft already armed.
    const limits = await limitsFor(uid);
    const tooHigh = parsed.data.waypoints.find((w) => w.alt > limits.maxAltM);
    if (tooHigh) {
      return res.status(409).json({
        error: `Waypoint altitude ${tooHigh.alt} m is above the ${limits.maxAltM} m ceiling for this account`,
        code: "above_ceiling",
      });
    }
    const { rows } = await pool.query(
      `INSERT INTO drone_missions (owner_id, name, waypoints) VALUES ($1,$2,$3)
       RETURNING id, name, waypoints, created_at, updated_at`,
      [uid, parsed.data.name, JSON.stringify(parsed.data.waypoints)]
    );
    res.status(201).json({ mission: rows[0] });
  } catch (err) {
    logger.error({ err }, "mission create failed");
    res.status(500).json({ error: "Failed to save mission" });
  }
});

droneRouter.delete("/missions/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM drone_missions WHERE id = $1 AND owner_id = $2`,
      [req.params.id, req.user!.uid]
    );
    if (!rowCount) return res.status(404).json({ error: "No such mission" });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "mission delete failed");
    res.status(500).json({ error: "Failed to delete mission" });
  }
});

/* ------------------------------------------------------------------ */
/* Batteries                                                           */
/* ------------------------------------------------------------------ */

droneRouter.get("/batteries", requireAuth, async (req: AuthedRequest, res) => {
  try {
    res.json({ batteries: await listBatteries(req.user!.uid) });
  } catch (err) {
    logger.error({ err }, "battery list failed");
    res.status(500).json({ error: "Failed to load batteries" });
  }
});

const batterySchema = z.object({
  label: z.string().min(1).max(60),
  cells: z.number().int().min(1).max(14).optional(),
  capacityMah: z.number().int().min(100).max(100000).optional(),
  retireAt: z.number().int().min(10).max(5000).optional(),
  notes: z.string().max(500).optional(),
});

droneRouter.post("/batteries", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = batterySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid battery" });
  try {
    const battery = await addBattery(req.user!.uid, parsed.data);
    if (!battery) return res.status(400).json({ error: "Invalid battery" });
    res.status(201).json({ battery });
  } catch (err) {
    logger.error({ err }, "battery create failed");
    res.status(500).json({ error: "Failed to add battery" });
  }
});

const batteryPatchSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  retireAt: z.number().int().min(10).max(5000).optional(),
  retired: z.boolean().optional(),
  notes: z.string().max(500).optional(),
  cycles: z.number().int().min(0).max(10000).optional(),
});

droneRouter.patch("/batteries/:id", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = batteryPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid patch" });
  try {
    const battery = await updateBattery(req.user!.uid, req.params.id, parsed.data);
    if (!battery) return res.status(404).json({ error: "No such battery" });
    res.json({ battery });
  } catch (err) {
    logger.error({ err }, "battery patch failed");
    res.status(500).json({ error: "Failed to update battery" });
  }
});

droneRouter.delete("/batteries/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const ok = await deleteBattery(req.user!.uid, req.params.id);
    if (!ok) return res.status(404).json({ error: "No such battery" });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "battery delete failed");
    res.status(500).json({ error: "Failed to delete battery" });
  }
});

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

droneRouter.get("/settings", requireAuth, async (req: AuthedRequest, res) => {
  try {
    res.json({ settings: await getSettings(req.user!.uid) });
  } catch (err) {
    logger.error({ err }, "drone settings read failed");
    res.status(500).json({ error: "Failed to load settings" });
  }
});

const settingsSchema = z.object({
  maxAltM: z.number().int().min(5).max(500).optional(),
  maxRangeM: z.number().int().min(10).max(20000).optional(),
  minBattPct: z.number().int().min(0).max(90).optional(),
  operatorId: z.string().max(60).nullable().optional(),
  reportEmail: z.string().email().nullable().optional().or(z.literal("")),
  reportHour: z.number().int().min(0).max(23).optional(),
  alertFailsafe: z.boolean().optional(),
  alertFence: z.boolean().optional(),
  alertLowBatt: z.boolean().optional(),
});

droneRouter.put("/settings", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid settings", detail: parsed.error.issues[0]?.message });
  }
  try {
    const patch = { ...parsed.data };
    if (patch.reportEmail === "") patch.reportEmail = null;
    res.json({ settings: await saveSettings(req.user!.uid, patch) });
  } catch (err) {
    logger.error({ err }, "drone settings write failed");
    res.status(500).json({ error: "Failed to save settings" });
  }
});

/**
 * Sends the daily report now, to whatever address is configured.
 *
 * Runs the real `sendReport`, not a preview: a button that proved a different
 * code path worked would prove nothing about the mail that arrives at 07:00.
 */
droneRouter.post("/report/test", requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.uid;
  try {
    const settings = await getSettings(uid);
    if (!settings.reportEmail) {
      return res.status(400).json({ error: "No report address is configured" });
    }
    const ok = await sendReport(uid, req.user!.email ?? "Fleet");
    if (!ok) return res.status(502).json({ error: "The mail server rejected the message" });
    res.json({ ok: true, sentTo: settings.reportEmail });
  } catch (err) {
    logger.error({ err }, "drone report test failed");
    res.status(500).json({ error: "Failed to send report" });
  }
});

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

droneRouter.get("/events", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { rows } = await pool.query(
      `SELECT id, flight_id, device_id, at, kind, detail, severity
         FROM flight_events WHERE owner_id = $1 ORDER BY at DESC LIMIT $2`,
      [req.user!.uid, limit]
    );
    res.json({ events: rows });
  } catch (err) {
    logger.error({ err }, "drone events failed");
    res.status(500).json({ error: "Failed to load events" });
  }
});
