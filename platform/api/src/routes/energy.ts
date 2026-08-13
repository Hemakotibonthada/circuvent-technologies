import { Router } from "express";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";
import { onlineColumn } from "../device-online";

export const energyRouter = Router();

/**
 * GET /energy/summary — account-wide power snapshot for the energy dashboard:
 * live wattage (from current device state), a rough kWh-today estimate from
 * telemetry, and per-device live watts.
 */
energyRouter.get("/summary", requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.uid;

  /*
   * `wattsTotal` first, then `watts`.
   *
   * The cv-em1/cv-em3 meter publishes a per-channel `watts` for channel 0 and
   * a `wattsTotal` summing every channel. Reading `watts` alone counts one
   * phase of a three-phase board and silently drops the other two — a
   * household with a three-phase meter would see roughly a third of its own
   * consumption and have no way to tell.
   *
   * Every other device publishes only `watts`, so the coalesce leaves them
   * exactly as they were.
   */
  const devs = await pool.query<{ id: string; name: string; type: string; online: boolean; watts: number | null }>(
    `SELECT id, name, type, ${onlineColumn()},
            COALESCE(
              NULLIF(state->>'wattsTotal','')::float,
              NULLIF(state->>'watts','')::float
            ) AS watts
     FROM devices WHERE owner_id = $1 ORDER BY watts DESC NULLS LAST`,
    [uid]
  );
  const byDevice = devs.rows.map((d) => ({
    id: d.id,
    name: d.name || d.id,
    type: d.type,
    online: d.online,
    watts: d.watts == null ? 0 : Math.round(d.watts * 10) / 10,
  }));
  const liveWatts = Math.round(byDevice.reduce((s, d) => s + d.watts, 0) * 10) / 10;

  // Rough kWh today: per device, avg watts today * elapsed hours / 1000.
  //
  // Same coalesce as above, for the same reason: a three-phase meter's
  // telemetry carries wattsTotal, and averaging only `watts` would estimate
  // the day from one phase.
  const agg = await pool.query<{ avg: number | null }>(
    `SELECT AVG(COALESCE(
              NULLIF(payload->>'wattsTotal','')::float,
              NULLIF(payload->>'watts','')::float
            )) AS avg
     FROM telemetry t JOIN devices d ON d.id = t.device_id
     WHERE d.owner_id = $1 AND t.ts::date = now()::date
       AND (t.payload ? 'watts' OR t.payload ? 'wattsTotal')`,
    [uid]
  );
  const now = new Date();
  const elapsedH = (now.getHours() * 60 + now.getMinutes()) / 60 || 0.1;
  const avgW = agg.rows[0]?.avg ?? liveWatts;
  const todayKwh = Math.round(((avgW * elapsedH) / 1000) * 1000) / 1000;

  res.json({ liveWatts, todayKwh, byDevice });
});
