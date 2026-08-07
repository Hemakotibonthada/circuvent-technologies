import { pool, recordEvent } from "./db";
import { sendPushToUser } from "./push";
import { logger } from "./logger";
import { DEVICE_STALE_SECONDS } from "./device-online";

/**
 * Reconciles the stored `devices.online` flag with reality.
 *
 * Reads are already safe — every query derives liveness from `last_seen` via
 * `onlineSql()`. But two things still need the stored flag to be *correct*:
 *
 *  1. Notifications. "Device offline" is emitted by `mqtt.ts` when it sees the
 *     flag go true -> false, and that only happens if a status message arrives
 *     saying so. A device that dies silently — power cut, broker restart, dead
 *     uplink — produces no message, so it produced no alert. The fleet had
 *     devices two weeks stale and still flagged online; nobody was ever told.
 *
 *  2. Transition detection itself. Without reconciliation the flag stays true
 *     forever, so when the device eventually *does* reconnect there is no
 *     false -> true edge either, and the "reconnected" event is lost too.
 *
 * Running this every 30s means a genuinely dead device is reported within
 * ~2 minutes of its last message.
 *
 * Multi-instance safety comes free from the UPDATE: flipping true -> false is
 * atomic, and RETURNING yields the row only to whichever replica won. The
 * others match nothing and send nothing, so no duplicate pushes — no lock or
 * tick-claim needed.
 */
export async function sweepStaleDevices(): Promise<number> {
  const { rows } = await pool.query<{ id: string; name: string | null; owner_id: number | null }>(
    `UPDATE devices
        SET online = false
      WHERE online = true
        AND (last_seen IS NULL OR last_seen < now() - interval '${DEVICE_STALE_SECONDS} seconds')
      RETURNING id, name, owner_id`
  );

  for (const d of rows) {
    if (d.owner_id == null) continue;
    const label = d.name || d.id;
    try {
      await sendPushToUser(d.owner_id, {
        title: "Device offline",
        body: `${label} stopped responding.`,
      });
      await recordEvent(
        d.owner_id,
        "info",
        "Device offline",
        // Worth distinguishing from a clean disconnect: this one vanished, and
        // that usually means power or network rather than the device itself.
        `${label} stopped responding and has been marked offline.`,
        d.id
      );
    } catch (err) {
      logger.error({ err, device: d.id }, "failed to report stale device");
    }
  }

  if (rows.length) logger.info({ count: rows.length }, "marked stale devices offline");
  return rows.length;
}

export function startLivenessSweeper(): NodeJS.Timeout {
  const timer = setInterval(() => {
    sweepStaleDevices().catch((err) => logger.error({ err }, "liveness sweep failed"));
  }, 30_000);
  timer.unref?.();
  return timer;
}
