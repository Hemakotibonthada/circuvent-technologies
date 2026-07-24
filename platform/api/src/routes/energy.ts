import { Router } from "express";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";

export const energyRouter = Router();

/**
 * GET /energy/summary — account-wide power snapshot for the energy dashboard:
 * live wattage (from current device state), a rough kWh-today estimate from
 * telemetry, and per-device live watts.
 */
energyRouter.get("/summary", requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.uid;

  const devs = await pool.query<{ id: string; name: string; type: string; online: boolean; watts: number | null }>(
    `SELECT id, name, type, online, NULLIF(state->>'watts','')::float AS watts
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
  const agg = await pool.query<{ avg: number | null }>(
    `SELECT AVG(NULLIF(payload->>'watts','')::float) AS avg
     FROM telemetry t JOIN devices d ON d.id = t.device_id
     WHERE d.owner_id = $1 AND t.ts::date = now()::date AND t.payload ? 'watts'`,
    [uid]
  );
  const now = new Date();
  const elapsedH = (now.getHours() * 60 + now.getMinutes()) / 60 || 0.1;
  const avgW = agg.rows[0]?.avg ?? liveWatts;
  const todayKwh = Math.round(((avgW * elapsedH) / 1000) * 1000) / 1000;

  res.json({ liveWatts, todayKwh, byDevice });
});
