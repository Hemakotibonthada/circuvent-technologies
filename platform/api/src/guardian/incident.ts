/**
 * The life of one emergency.
 *
 * WHAT THIS IS RESPONSIBLE FOR
 *
 * The device raises the alarm entirely on its own — SMS and a voice call over
 * its own SIM, with the numbers cached in NVS. That is deliberate, and it is
 * the path that must never depend on anything here: the wearer is somewhere
 * bad, and a server they cannot reach is a server that cannot help them.
 *
 * This module is everything that becomes possible *when* the platform can see
 * the device: a record that an incident happened, a track of where the wearer
 * went, push notifications to contacts who have the app, and — the one thing
 * the device genuinely cannot do for itself — working out which police station
 * is nearest and pushing that number down so the offline path reaches the
 * right one next time.
 *
 * SO THE ORDERING MATTERS
 *
 * Nothing here is on the critical path of raising an alarm, and nothing here
 * is allowed to fail in a way that makes the device's own attempt look
 * unsuccessful. Every failure is logged and swallowed.
 */
import { pool, recordEvent } from "../db";
import { logger } from "../logger";
import { bus, publishCommand, type DeviceUpdate } from "../mqtt";
import {
  isUsableFix,
  nearestStation,
  shouldPushStation,
  stationNumberFor,
  type Station,
} from "./nearest";
import {
  describeTransition,
  evaluateZones,
  type Zone,
  type ZoneState,
} from "./geofence";

let started = false;

type IncidentRow = {
  id: string;
  device_id: string;
  owner_id: string;
  status: string;
};

/** The device's own view, as published. */
type GuardianState = {
  sos?: unknown;
  lat?: unknown;
  lng?: unknown;
  fix?: unknown;
  fixAgeSec?: unknown;
  battery?: unknown;
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * The position in a state document, or null.
 *
 * `fix` is consulted rather than just the coordinates. The firmware publishes
 * the last known position alongside a flag saying whether it is current,
 * precisely so a stale one is not mistaken for a live one — dropping the flag
 * here would throw that away and draw an hour-old point on a live map.
 */
function positionOf(state: GuardianState): { lat: number; lng: number; ageSec: number } | null {
  const lat = num(state.lat);
  const lng = num(state.lng);
  if (lat === null || lng === null) return null;
  if (!isUsableFix(lat, lng)) return null;
  const ageSec = num(state.fixAgeSec) ?? 0;
  return { lat, lng, ageSec };
}

async function ownerOf(deviceId: string): Promise<string | null> {
  const r = await pool.query<{ owner_id: string | null }>(
    `SELECT owner_id FROM devices WHERE id = $1`,
    [deviceId],
  );
  return r.rows[0]?.owner_id ?? null;
}

export async function openIncidentFor(
  deviceId: string,
  state: GuardianState,
  source: "button" | "app" | "test" = "button",
): Promise<IncidentRow | null> {
  const ownerId = await ownerOf(deviceId);
  if (!ownerId) return null;

  const pos = positionOf(state);
  const resolved = pos ? await resolveStation(pos.lat, pos.lng) : null;

  /*
   * ON CONFLICT DO NOTHING, against the partial unique index.
   *
   * A device republishes its state on every reconnect, and the broker replays
   * retained messages. Without this, one emergency becomes three incidents and
   * the contacts are told three times — which, at the moment somebody is in
   * trouble, is worse than useless because it makes the real one harder to
   * find.
   */
  const ins = await pool.query<IncidentRow>(
    `INSERT INTO guardian_incidents
        (device_id, owner_id, source, status, opened_lat, opened_lng, station_id, station_km)
     VALUES ($1, $2, $3, 'open', $4, $5, $6, $7)
     ON CONFLICT DO NOTHING
     RETURNING id, device_id, owner_id, status`,
    [
      deviceId,
      ownerId,
      source,
      pos?.lat ?? null,
      pos?.lng ?? null,
      resolved?.station.id ?? null,
      resolved?.km ?? null,
    ],
  );
  const row = ins.rows[0];
  if (!row) return null;   // one was already open; this is a duplicate report

  if (pos) await appendPoint(row.id, pos.lat, pos.lng, pos.ageSec, num(state.battery));

  await recordEvent(
    Number(ownerId),
    "guardian",
    source === "test" ? "Guardian test" : "SOS raised",
    pos
      ? `Location ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}${resolved ? ` — nearest station ${resolved.station.name}` : ""}`
      : "No GPS fix at the time the alarm was raised.",
    deviceId,
  );

  logger.warn(
    { deviceId, incidentId: row.id, source, hasFix: !!pos },
    "guardian incident opened",
  );
  return row;
}

export async function appendPoint(
  incidentId: string,
  lat: number,
  lng: number,
  ageSec: number,
  battery: number | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO guardian_incident_points (incident_id, lat, lng, fix_age_sec, battery)
     VALUES ($1, $2, $3, $4, $5)`,
    [incidentId, lat, lng, Math.max(0, Math.round(ageSec)), battery],
  );
}

export async function openIncidentOf(deviceId: string): Promise<IncidentRow | null> {
  const r = await pool.query<IncidentRow>(
    `SELECT id, device_id, owner_id, status
       FROM guardian_incidents
      WHERE device_id = $1 AND status IN ('open','acknowledged')
      ORDER BY opened_at DESC
      LIMIT 1`,
    [deviceId],
  );
  return r.rows[0] ?? null;
}

/**
 * Closes an incident.
 *
 * `false_alarm` is kept distinct from `resolved` because they mean opposite
 * things to anybody reading the history later: one is "this happened and is
 * over", the other is "this did not happen". Collapsing them would make the
 * device's false-positive rate — the number that decides whether this product
 * is trustworthy — impossible to measure.
 */
export async function closeIncident(
  incidentId: string,
  status: "resolved" | "false_alarm",
  by = "",
): Promise<void> {
  await pool.query(
    `UPDATE guardian_incidents
        SET status = $2, closed_at = now(), acknowledged_by = COALESCE(NULLIF($3,''), acknowledged_by)
      WHERE id = $1 AND status IN ('open','acknowledged')`,
    [incidentId, status, by],
  );
}

export async function acknowledgeIncident(incidentId: string, by: string): Promise<void> {
  await pool.query(
    `UPDATE guardian_incidents
        SET status = 'acknowledged', acknowledged_at = now(), acknowledged_by = $2
      WHERE id = $1 AND status = 'open'`,
    [incidentId, by],
  );
}

/** Records that somebody was told something, and whether it worked. */
export async function recordNotification(
  incidentId: string,
  target: "contact" | "police" | "owner",
  targetName: string,
  channel: "sms" | "call" | "push" | "email",
  ok: boolean,
  sentBy: "device" | "platform",
  detail = "",
): Promise<void> {
  await pool.query(
    `INSERT INTO guardian_notifications
        (incident_id, target, target_name, channel, ok, sent_by, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [incidentId, target, targetName, channel, ok, sentBy, detail],
  );
}

async function stationDirectory(): Promise<Station[]> {
  const r = await pool.query<Station>(
    `SELECT id, name, phone, country, district, lat, lng
       FROM guardian_police_stations
      WHERE active = true`,
  );
  return r.rows.map((s) => ({ ...s, id: Number(s.id) }));
}

async function resolveStation(lat: number, lng: number) {
  const stations = await stationDirectory();
  return nearestStation(lat, lng, stations);
}

/**
 * Keeps the device's cached police number current as the wearer moves.
 *
 * This is the piece that makes the offline path correct rather than merely
 * present. The device can text a number but cannot choose one, so it carries
 * whichever we last told it — and a wearer who has travelled two cities away
 * is carrying the wrong one until this runs.
 *
 * It only sends when the number actually changes; see shouldPushStation for
 * why that guard is not optional.
 */
export async function refreshStationFor(
  deviceId: string,
  lat: number,
  lng: number,
  currentOnDevice: string,
  nationalFallback: string,
): Promise<void> {
  const resolved = await resolveStation(lat, lng);
  const { number } = stationNumberFor(resolved, nationalFallback);
  if (!shouldPushStation(currentOnDevice, number)) return;

  publishCommand(deviceId, { action: "setPolice", number });
  logger.info({ deviceId, number, km: resolved?.km ?? null }, "guardian station pushed");
}

/**
 * The device told us something.
 *
 * Three things are watched: the alarm going up, the alarm being cleared, and
 * position while one is running. Everything else about a Guardian is ordinary
 * telemetry and is handled by the generic path.
 */
const handler = async (u: DeviceUpdate): Promise<void> => {
  try {
    if (u.kind !== "state") return;
    const state = (u.payload ?? {}) as GuardianState;
    const type = await deviceType(u.deviceId);
    if (type !== "guardian") return;

    const sos = state.sos === true;
    const open = await openIncidentOf(u.deviceId);

    if (sos && !open) {
      await openIncidentFor(u.deviceId, state, "button");
      return;
    }

    if (!sos && open) {
      /*
       * Cleared from the device. Recorded as resolved rather than false alarm:
       * only a person can say it did not happen, and they say so through the
       * app. Guessing here would corrupt the one statistic that says whether
       * the trigger threshold is right.
       */
      await closeIncident(open.id, "resolved", "device");
      logger.info({ deviceId: u.deviceId, incidentId: open.id }, "guardian incident cleared");
      return;
    }

    if (sos && open) {
      const pos = positionOf(state);
      if (pos) {
        await appendPoint(open.id, pos.lat, pos.lng, pos.ageSec, num(state.battery));
      }
    }

    /*
     * Safe zones are evaluated on every position, incident or not.
     *
     * Deliberately after the incident handling: an alarm in progress is the
     * more important fact, and a wearer who is running away from school should
     * not have "left School" competing with it in the same notification list.
     */
    const pos = positionOf(state);
    if (pos) await evaluateZonesFor(u.deviceId, pos.lat, pos.lng);
  } catch (err) {
    // Never let a reporting failure look like a failure to raise the alarm.
    logger.error({ err, deviceId: u.deviceId }, "guardian ingest failed");
  }
};

/**
 * Checks a reported position against the wearer's safe zones.
 *
 * The presence flag is read from and written back to the row, which is what
 * makes a departure reported once rather than on every position for the rest
 * of the day — and what survives a restart of this process.
 */
async function evaluateZonesFor(deviceId: string, lat: number, lng: number): Promise<void> {
  const r = await pool.query<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    radius_m: number;
    notify_enter: boolean;
    notify_exit: boolean;
    presence: string | null;
  }>(
    `SELECT id, name, lat, lng, radius_m, notify_enter, notify_exit, presence
       FROM guardian_zones WHERE device_id = $1`,
    [deviceId],
  );
  if (r.rows.length === 0) return;

  const zones: Zone[] = r.rows.map((z) => ({
    id: Number(z.id),
    name: z.name,
    lat: z.lat,
    lng: z.lng,
    radiusM: z.radius_m,
    notifyOnEnter: z.notify_enter,
    notifyOnExit: z.notify_exit,
  }));

  const state: ZoneState = {};
  for (const z of r.rows) {
    if (z.presence === "inside" || z.presence === "outside") state[Number(z.id)] = z.presence;
  }

  const transitions = evaluateZones(lat, lng, zones, state);

  // Write back every presence the evaluation settled on, not just the ones
  // that produced an alert — the first sighting is silent but must be recorded.
  for (const [id, presence] of Object.entries(state)) {
    await pool.query(`UPDATE guardian_zones SET presence = $2 WHERE id = $1`, [id, presence]);
  }

  if (transitions.length === 0) return;

  const dev = await pool.query<{ owner_id: string | null; name: string | null }>(
    `SELECT owner_id, name FROM devices WHERE id = $1`,
    [deviceId],
  );
  const owner = dev.rows[0]?.owner_id;
  const who = dev.rows[0]?.name || "The wearer";
  if (!owner) return;

  for (const t of transitions) {
    await recordEvent(Number(owner), "guardian", describeTransition(t, who), "", deviceId);
    logger.info({ deviceId, zone: t.zone.name, kind: t.kind }, "guardian zone transition");
  }
}

const typeCache = new Map<string, string>();
async function deviceType(deviceId: string): Promise<string> {
  const hit = typeCache.get(deviceId);
  if (hit) return hit;
  const r = await pool.query<{ type: string }>(`SELECT type FROM devices WHERE id = $1`, [deviceId]);
  const t = r.rows[0]?.type ?? "";
  if (t) typeCache.set(deviceId, t);
  return t;
}

/** Wires the guardian ingest. Call once at boot, after the MQTT bridge. */
export function startGuardian(): void {
  if (started) return;
  started = true;
  bus.on("device:update", handler);
}

/** Test seam: drops only this module's listener, so a suite can exit cleanly. */
export function __resetGuardianForTests(): void {
  bus.off("device:update", handler);
  typeCache.clear();
  started = false;
}
