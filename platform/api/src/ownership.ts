import { pool } from "./db";

/**
 * Device ownership check, memoised for a short window.
 *
 * Every command POST would otherwise spend a Postgres round-trip here before
 * the MQTT publish, which is pure latency on the hot path. Positive results
 * are cached briefly; negative results are never cached so a fresh claim takes
 * effect immediately.
 *
 * SECURITY: every code path that mutates `devices.owner_id` — claim, unclaim,
 * admin reassignment, admin device delete, admin user delete — must call
 * `invalidateOwnership` / `invalidateOwner`, otherwise a revoked owner keeps
 * command authority until the entry expires. The cache is process-local, so if
 * the API is ever scaled past one replica this must move to Redis (or the TTL
 * must drop to zero) — invalidation does not cross process boundaries.
 */
const ownershipCache = new Map<string, number>();

export const OWNERSHIP_TTL_MS = 5_000;

/**
 * Other caches keyed by device that must be dropped whenever ownership moves.
 *
 * A registration list rather than a direct import, so this module keeps no
 * dependency on the subsystems that use it — `anpr/index.ts` already imports
 * mqtt, which lazily imports anpr, and adding ownership to that ring is how a
 * module cycle gets created.
 *
 * It exists because the contract above ("every path that mutates owner_id must
 * invalidate") is only worth anything if one call clears *everything* keyed by
 * that device. The ANPR pipeline caches owner + lane for 30 s; without this, a
 * device unclaimed and re-claimed by a different account inside that window
 * would file the new owner's number-plate reads into the previous owner's log.
 */
type DeviceCacheHook = (id: string) => void;
const deviceHooks: DeviceCacheHook[] = [];

export function onOwnershipChange(hook: DeviceCacheHook): void {
  deviceHooks.push(hook);
}

/** Drop cached ownership for one device (claim, unclaim, admin reassign/delete). */
export function invalidateOwnership(id: string): void {
  const suffix = `:${id}`;
  for (const key of ownershipCache.keys()) {
    if (key.endsWith(suffix)) ownershipCache.delete(key);
  }
  for (const hook of deviceHooks) {
    try {
      hook(id);
    } catch {
      /* a downstream cache must never break an ownership change */
    }
  }
}

/** Drop every cached grant held by one user (admin deletes the account). */
export function invalidateOwner(uid: number | string): void {
  const prefix = `${uid}:`;
  for (const key of ownershipCache.keys()) {
    if (key.startsWith(prefix)) ownershipCache.delete(key);
  }
}

export async function ownsDevice(uid: number, id: string): Promise<boolean> {
  const key = `${uid}:${id}`;
  const hit = ownershipCache.get(key);
  if (hit !== undefined && Date.now() < hit) return true;
  const { rowCount } = await pool.query(`SELECT 1 FROM devices WHERE id = $1 AND owner_id = $2`, [id, uid]);
  if (rowCount) {
    ownershipCache.set(key, Date.now() + OWNERSHIP_TTL_MS);
    return true;
  }
  ownershipCache.delete(key);
  return false;
}
