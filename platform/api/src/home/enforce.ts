/**
 * Applying the household guard to a request.
 *
 * Kept apart from `guard.ts` so that the decision stays pure and testable, and
 * only the plumbing — reading the device type, shaping the refusal — lives
 * here.
 */
import { pool } from "../db";
import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "../auth";
import { capabilityFor, mayWatch } from "./guard";
import { can, refusalFor } from "./roles";

/**
 * Device types, cached briefly.
 *
 * A device's type never changes after provisioning, so this is safe to hold;
 * the short expiry exists only so a deleted device does not linger. Without
 * it, every command by a household member would pay an extra round-trip on the
 * path that opens a door.
 */
const typeCache = new Map<string, { type: string; until: number }>();
const TYPE_TTL_MS = 60_000;

async function deviceType(id: string): Promise<string> {
  const hit = typeCache.get(id);
  if (hit && Date.now() < hit.until) return hit.type;
  const r = await pool.query<{ type: string }>(`SELECT type FROM devices WHERE id = $1`, [id]);
  const type = r.rows[0]?.type ?? "";
  typeCache.set(id, { type, until: Date.now() + TYPE_TTL_MS });
  return type;
}

export function forgetDeviceType(id: string): void {
  typeCache.delete(id);
}

/**
 * Why this command must be refused, or null if it may proceed.
 *
 * Returns a sentence meant to be shown to a person, because "403" on a door
 * that will not open tells somebody standing in the rain nothing about who to
 * ask.
 *
 * The owner of a home short-circuits before any database read, so the common
 * case — almost every request — costs nothing.
 */
export async function refuseCommand(
  req: AuthedRequest,
  deviceId: string,
  command: unknown
): Promise<string | null> {
  const home = req.home;
  if (!home || home.actorId === home.homeId) return null;

  const capability = capabilityFor({
    deviceType: await deviceType(deviceId),
    command: (command && typeof command === "object" ? command : {}) as Record<string, unknown>,
  });

  return can(home.role, capability) ? null : refusalFor(home.role, capability);
}

/** Why this member may not watch this camera, or null. */
export async function refuseWatch(req: AuthedRequest, deviceId: string): Promise<string | null> {
  const home = req.home;
  if (!home || home.actorId === home.homeId) return null;
  return mayWatch(home.role, await deviceType(deviceId))
    ? null
    : "Your access to this home does not include cameras.";
}

/**
 * Re-exported so callers that already import from here keep working, and so
 * there is one obvious place to look. The implementations live in `actor.ts`,
 * which imports no database — see the note there.
 */
export { actorId, asActor, refuse, requireCapability } from "./actor";
