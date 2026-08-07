/**
 * Device liveness.
 *
 * `devices.online` is a stored boolean, and the only thing that ever sets it
 * back to false is a `status` message carrying `online:false` — the MQTT last
 * will. That works when a device disconnects and the broker is healthy enough
 * to publish its will, and fails silently in every other case: broker restart,
 * network partition, or the device and broker losing power together. The row
 * then reads `online = true` forever.
 *
 * This is not hypothetical. Three devices in the live fleet reported
 * `online = true` with `last_seen` two weeks stale, which the console, the
 * energy page, the admin counters and — worst — the Google/Alexa bridges all
 * repeated back as "reachable".
 *
 * A flag cannot express liveness on its own, because liveness is a statement
 * about *time*. So liveness is derived: the flag must be set AND we must have
 * heard from the device recently. Devices publish state every 10s
 * (`_interval` in CircuventDevice.h) and the MQTT keepalive is 45s, so the
 * broker itself gives up at roughly 67s. 90s therefore sits past both — it
 * cannot be tripped by one dropped publish, but it also cannot be fooled by a
 * will that never arrived.
 *
 * Every read path must use `onlineSql()` rather than selecting the raw column;
 * `online-derivation.test.ts` fails the build if a new query forgets.
 */
export const DEVICE_STALE_SECONDS = 90;

/**
 * SQL expression for a device's true online state.
 *
 * @param alias table alias including the trailing dot, e.g. `"d."`, or `""`
 *              when the query selects from `devices` unaliased.
 */
export function onlineSql(alias = ""): string {
  return `(${alias}online AND ${alias}last_seen > now() - interval '${DEVICE_STALE_SECONDS} seconds')`;
}

/** The same expression, aliased back to `online` for use in a SELECT list. */
export function onlineColumn(alias = ""): string {
  return `${onlineSql(alias)} AS online`;
}

/** Mirror of {@link onlineSql} for values already loaded into JS. */
export function isOnline(row: { online?: boolean | null; last_seen?: Date | string | null }): boolean {
  if (!row.online || !row.last_seen) return false;
  const seen = row.last_seen instanceof Date ? row.last_seen : new Date(row.last_seen);
  if (Number.isNaN(seen.getTime())) return false;
  return Date.now() - seen.getTime() <= DEVICE_STALE_SECONDS * 1000;
}
