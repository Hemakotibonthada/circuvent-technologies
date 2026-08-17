/**
 * The Circuvent groups a report can be addressed to.
 *
 * Groups are mail-enabled distribution lists in the identity service, so
 * sending to `admins@circuvent.com` reaches everyone in it without this
 * application needing to know, or cache, who that is. Membership changes in
 * one place and takes effect immediately — a copied list of addresses here
 * would start going to the wrong people the day somebody joins or leaves.
 *
 * Read with a service token scoped to `directory:read`. That token can read
 * the catalogue and nothing else: it cannot approve a request or change a
 * group, because those are acts by a named person and the audit trail has to
 * say who.
 *
 * SERVER ONLY.
 */

import { ISSUER } from "./admin-sso";
import { logger } from "./logger";

export interface DirectoryGroup {
  id: string;
  email: string;
  name: string;
  description: string;
}

/** Only mail-addressable, active groups are worth offering as a recipient. */
function usable(g: { email?: unknown; status?: unknown }): boolean {
  return typeof g.email === "string" && g.email.includes("@") && g.status !== "archived";
}

/**
 * The groups that can receive a report.
 *
 * Returns an empty list rather than throwing when the directory is
 * unreachable or no token is configured: the report screen still has to
 * render, and an empty picker with an explanation beats a page that will not
 * load. The reason is logged so it is not silently nothing forever.
 */
export async function listDirectoryGroups(): Promise<DirectoryGroup[]> {
  const token = process.env.IDENTITY_SERVICE_TOKEN;
  if (!token) {
    logger.warn("directory.no_token", { reason: "IDENTITY_SERVICE_TOKEN is not set" });
    return [];
  }

  try {
    const res = await fetch(`${ISSUER}/api/groups?limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      logger.warn("directory.list_failed", { status: res.status });
      return [];
    }
    const body = (await res.json()) as { groups?: unknown };
    if (!Array.isArray(body.groups)) return [];

    return body.groups
      .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
      .filter(usable)
      .map((g) => ({
        id: String(g.id ?? g.email),
        email: String(g.email).toLowerCase(),
        name: String(g.name ?? g.email),
        description: typeof g.description === "string" ? g.description : "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    logger.warn("directory.list_error", { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

/**
 * Keeps only the addresses that are really groups.
 *
 * The report screen sends back whatever was ticked, and a stale tab could send
 * a group that has since been deleted — or an arbitrary address, if somebody
 * posts to the endpoint directly. Checking against the directory means the
 * saved recipient list can only ever contain real groups.
 */
export function keepKnownGroups(
  requested: string[],
  known: DirectoryGroup[]
): { accepted: string[]; rejected: string[] } {
  const valid = new Set(known.map((g) => g.email));
  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const raw of requested) {
    const email = String(raw ?? "").trim().toLowerCase();
    if (!email) continue;
    if (valid.has(email)) {
      if (!accepted.includes(email)) accepted.push(email);
    } else if (!rejected.includes(email)) {
      rejected.push(email);
    }
  }
  return { accepted, rejected };
}

/**
 * Everyone a report should go to.
 *
 * The individual address stays even when groups are chosen — a group is an
 * addition, not a replacement, and quietly dropping the address somebody
 * already relies on is how a report stops arriving without anybody noticing.
 * Deduplicated case-insensitively, because sending twice to the same mailbox
 * is a bug people report as "duplicate emails".
 */
export function reportRecipients(individual: string | undefined, groups: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [individual ?? "", ...groups]) {
    const email = String(raw ?? "").trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}
