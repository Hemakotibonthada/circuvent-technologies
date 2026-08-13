/**
 * Resolving which home a request is acting in.
 *
 * A signed-in account is always the owner of its own home. It may additionally
 * be a member of somebody else's, and it selects which one it is acting in
 * with a header — so a person with a house and a holiday flat switches between
 * them without signing out.
 *
 * WHY THIS IS A DATABASE READ AND NOT A JWT CLAIM
 *
 * Putting the home and role in the token would make this free, and would mean
 * revoking somebody's access did nothing until their token expired. A person
 * removed from a household must stop being able to open its doors at once,
 * not in fifteen minutes. This is the same argument `checkSession` already
 * makes for blocked accounts, and it is worth paying twice.
 */
import { pool } from "../db";
import { logger } from "../logger";
import { normaliseRole, type HomeRole, type Membership } from "./roles";

/** Header a client sets to act inside a home it has been invited to. */
export const HOME_HEADER = "x-circuvent-home";

/**
 * The home this request is acting in, and with what authority.
 *
 * Returns null when the caller asked for a home they are not a member of —
 * which is refused rather than silently falling back to their own. A silent
 * fallback would show somebody their own house while they believed they were
 * looking at their mother's, and every reading would be quietly wrong.
 */
export async function resolveMembership(
  actorId: number,
  requestedHome: number | null
): Promise<Membership | null> {
  if (!requestedHome || requestedHome === actorId) {
    return { homeId: actorId, actorId, role: "owner" };
  }

  try {
    const r = await pool.query<{ role: string }>(
      `SELECT role FROM home_members WHERE home_id = $1 AND member_id = $2`,
      [requestedHome, actorId]
    );
    const role = normaliseRole(r.rows[0]?.role);
    if (!role) return null;

    /*
     * A membership row saying "owner" is not honoured. The owner of a home is
     * the account itself and never a row, so this can only be corruption or a
     * hand-edit — and treating it as authority is how a bad row becomes a
     * house key.
     */
    if (role === "owner") {
      logger.warn({ home: requestedHome, member: actorId }, "membership row claims owner; refusing");
      return null;
    }

    return { homeId: requestedHome, actorId, role };
  } catch (err) {
    /*
     * Fails closed, like requireAuth. A database blip must not hand somebody
     * access to a home they may not belong to.
     */
    logger.error({ err }, "membership lookup failed");
    return null;
  }
}

/** Parses the home header. Anything unparseable means "my own home". */
export function requestedHomeFrom(headerValue: string | undefined): number | null {
  if (!headerValue) return null;
  const n = Number(headerValue);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export interface HomeSummary {
  homeId: number;
  role: HomeRole;
  ownerName: string;
  ownerEmail: string;
}

/** Every home this account can act in, their own first. */
export async function homesFor(actorId: number): Promise<HomeSummary[]> {
  const own = await pool.query<{ name: string; email: string }>(
    `SELECT name, email FROM users WHERE id = $1`,
    [actorId]
  );

  const mine: HomeSummary[] = own.rows.length
    ? [
        {
          homeId: actorId,
          role: "owner",
          ownerName: own.rows[0].name || "My home",
          ownerEmail: own.rows[0].email,
        },
      ]
    : [];

  const shared = await pool.query<{ home_id: string; role: string; name: string; email: string }>(
    `SELECT m.home_id, m.role, u.name, u.email
       FROM home_members m
       JOIN users u ON u.id = m.home_id
      WHERE m.member_id = $1
      ORDER BY u.name`,
    [actorId]
  );

  const rows: HomeSummary[] = [];
  for (const r of shared.rows) {
    const role = normaliseRole(r.role);
    /* A shared home whose role is unreadable, or which claims owner, is left
       out rather than shown with a guessed level of access. */
    if (!role || role === "owner") continue;
    rows.push({
      homeId: Number(r.home_id),
      role,
      ownerName: r.name || r.email,
      ownerEmail: r.email,
    });
  }

  return [...mine, ...rows];
}
