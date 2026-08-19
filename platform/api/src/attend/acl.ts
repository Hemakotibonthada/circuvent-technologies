/**
 * Which cards a terminal is told to accept.
 *
 * The terminal decides on the spot from a list of numbers, because a school
 * gate cannot wait for a round trip and must keep working when the line is
 * down. This is where that list comes from.
 *
 * WHY IT IS RECOMPUTED ON A TIMER AND NOT ONLY ON CHANGE
 *
 * A rule can be limited to a schedule — cleaners between 18:00 and 21:00, the
 * server room during office hours — and the terminal holds no schedules. If
 * the list were only rebuilt when somebody edited something, a card allowed
 * until 19:00 would keep working at midnight.
 *
 * So the list is "who is allowed *now*", rebuilt every minute. Nothing is sent
 * unless the answer actually changed, which for a settled site is almost
 * never: the cost is one query per site per minute, and the benefit is that
 * time-limited access means what it says at the door rather than only in the
 * report afterwards.
 *
 * The alternative — teaching the firmware about schedules — was rejected
 * because it puts the policy in two places, and the copy on the wall is the
 * one that is hardest to fix when it is wrong.
 */
import { createHash } from "node:crypto";
import { pool } from "../db";
import { logger } from "../logger";
import { publishCommand } from "../mqtt";
import { decideAccess, type AccessRule, type Credential, type Person } from "./decide";
import { loadSchedules, type SiteSettings } from "./rollup";
import { siteShape } from "./rollup";

/** Cards per MQTT message. A hundred numbers is about 900 bytes of JSON. */
const CHUNK = 100;

/** Remembered so an unchanged list is not pushed every minute. */
const lastPushed = new Map<string, string>();

interface TerminalRow {
  device_id: string;
  site_id: string;
  zone_id: string | null;
  enabled: boolean;
  acl_version: string;
}

export interface AclResult {
  deviceId: string;
  cards: number[];
  version: number;
  changed: boolean;
}

/** Every ancestor of a group, including itself, so parent rules apply. */
export function ancestryOf(groupId: number | null, parents: Map<number, number | null>): number[] {
  const out: number[] = [];
  let id = groupId;
  let guard = 0;
  // Bounded: a cycle in the group tree would otherwise hang every push.
  while (id !== null && id !== undefined && guard++ < 16) {
    out.push(id);
    id = parents.get(id) ?? null;
  }
  return out;
}

/**
 * The card numbers allowed through one terminal at this moment.
 *
 * Every live credential is run through the same decideAccess the punch handler
 * uses. That is deliberate duplication of effort and not duplication of logic:
 * one function decides who may pass, and it is asked here in advance and again
 * when somebody actually arrives.
 */
export async function computeAcl(
  site: SiteSettings,
  terminal: { deviceId: string; zoneId: number | null },
  at = new Date()
): Promise<number[]> {
  const [creds, rules, schedules, groups] = await Promise.all([
    pool.query(
      `SELECT c.id, c.card_number, c.active, c.revoked_at,
              p.id AS person_id, p.name, p.group_id, p.active AS person_active,
              to_char(p.valid_from, 'YYYY-MM-DD') AS valid_from,
              to_char(p.valid_to,   'YYYY-MM-DD') AS valid_to
         FROM attend_credentials c
         JOIN attend_people p ON p.id = c.person_id
        WHERE c.site_id = $1 AND c.active AND c.revoked_at IS NULL`,
      [site.id]
    ),
    pool.query(
      `SELECT id, zone_id, group_id, person_id, schedule_id, allow, priority,
              to_char(valid_from, 'YYYY-MM-DD') AS valid_from,
              to_char(valid_to,   'YYYY-MM-DD') AS valid_to
         FROM attend_rules WHERE site_id = $1`,
      [site.id]
    ),
    loadSchedules(site.id),
    pool.query(`SELECT id, parent_id FROM attend_groups WHERE site_id = $1`, [site.id]),
  ]);

  const parents = new Map<number, number | null>();
  for (const g of groups.rows) {
    parents.set(Number(g.id), g.parent_id === null ? null : Number(g.parent_id));
  }

  const ruleList: AccessRule[] = rules.rows.map((r) => ({
    id: Number(r.id),
    zoneId: r.zone_id === null ? null : Number(r.zone_id),
    groupId: r.group_id === null ? null : Number(r.group_id),
    personId: r.person_id === null ? null : Number(r.person_id),
    scheduleId: r.schedule_id === null ? null : Number(r.schedule_id),
    allow: r.allow,
    priority: r.priority,
    validFrom: r.valid_from,
    validTo: r.valid_to,
  }));

  const allowed: number[] = [];
  for (const row of creds.rows) {
    const person: Person = {
      id: Number(row.person_id),
      name: row.name,
      groupId: row.group_id === null ? null : Number(row.group_id),
      active: row.person_active,
      validFrom: row.valid_from,
      validTo: row.valid_to,
    };
    const credential: Credential = {
      id: Number(row.id),
      personId: person.id,
      active: row.active,
      revokedAt: row.revoked_at,
    };
    const decision = decideAccess({
      person,
      credential,
      zoneId: terminal.zoneId,
      rules: ruleList,
      schedules,
      groupAncestry: ancestryOf(person.groupId, parents),
      at,
      timeZone: site.timeZone,
    });
    if (decision.granted) allowed.push(Number(row.card_number));
  }

  // Sorted so the fingerprint is stable and the device's insertion sort has
  // almost nothing to do.
  return [...new Set(allowed)].sort((a, b) => a - b);
}

function fingerprint(cards: number[]): string {
  return createHash("sha256").update(cards.join(",")).digest("hex").slice(0, 16);
}

/**
 * Sends a list to a terminal, in chunks, with a commit at the end.
 *
 * The device stages the chunks and only swaps them in when the commit says the
 * expected number arrived. A dropped packet therefore leaves the old list in
 * place rather than a roster that is quietly short by whatever went missing —
 * which would look exactly like a working door to anybody testing it with
 * their own card.
 */
export function pushAcl(deviceId: string, cards: number[], version: number): void {
  publishCommand(deviceId, { action: "acl", mode: "begin", version, total: cards.length });
  for (let i = 0; i < cards.length; i += CHUNK) {
    publishCommand(deviceId, { action: "acl", mode: "chunk", cards: cards.slice(i, i + CHUNK) });
  }
  publishCommand(deviceId, { action: "acl", mode: "commit", version });
}

/** Recomputes and pushes one terminal's list if it has changed. */
export async function syncTerminal(
  deviceId: string,
  opts: { force?: boolean; at?: Date } = {}
): Promise<AclResult | null> {
  const { rows } = await pool.query<TerminalRow>(
    `SELECT device_id, site_id, zone_id, enabled, acl_version
       FROM attend_terminals WHERE device_id = $1`,
    [deviceId]
  );
  const t = rows[0];
  if (!t) return null;

  const siteRows = await pool.query(
    `SELECT id, owner_id, name, kind, timezone, grace_minutes, half_day_after_minutes,
            absent_after_minutes, auto_out, dedupe_seconds, notify_guardians, notify_absence
       FROM attend_sites WHERE id = $1`,
    [t.site_id]
  );
  if (!siteRows.rows[0]) return null;
  const site = siteShape(siteRows.rows[0]);

  const cards = t.enabled
    ? await computeAcl(site, { deviceId, zoneId: t.zone_id === null ? null : Number(t.zone_id) }, opts.at)
    : /*
       * A disabled terminal is sent an empty list rather than left alone.
       *
       * "Disabled" has to mean the door stops opening, and a terminal that
       * keeps its last list would carry on admitting everybody exactly as
       * before — with the console showing it as off.
       */
      [];

  const print = fingerprint(cards);
  if (!opts.force && lastPushed.get(deviceId) === print) {
    return { deviceId, cards, version: Number(t.acl_version), changed: false };
  }

  const version = Number(t.acl_version) + 1;
  try {
    pushAcl(deviceId, cards, version);
  } catch (err) {
    // The broker is restarting. Leave the fingerprint unset so the next sweep
    // tries again rather than believing this one landed.
    logger.error({ err, deviceId }, "attendance acl push failed");
    return null;
  }
  lastPushed.set(deviceId, print);

  await pool.query(
    `UPDATE attend_terminals
        SET acl_version = $2, acl_count = $3, acl_pushed_at = now(), updated_at = now()
      WHERE device_id = $1`,
    [deviceId, version, cards.length]
  );

  logger.info({ deviceId, cards: cards.length, version }, "attendance acl pushed");
  return { deviceId, cards, version, changed: true };
}

/** Pushes every terminal on a site. Called after a roster or rule change. */
export async function syncSite(siteId: number, force = false): Promise<void> {
  const { rows } = await pool.query<{ device_id: string }>(
    `SELECT device_id FROM attend_terminals WHERE site_id = $1`,
    [siteId]
  );
  for (const r of rows) {
    try {
      await syncTerminal(r.device_id, { force });
    } catch (err) {
      logger.error({ err, deviceId: r.device_id }, "attendance terminal sync failed");
    }
  }
}

/** Every terminal in the system. The minute sweep that keeps time rules honest. */
export async function syncAll(at = new Date()): Promise<void> {
  try {
    const { rows } = await pool.query<{ device_id: string }>(
      `SELECT device_id FROM attend_terminals WHERE enabled`
    );
    for (const r of rows) {
      try {
        await syncTerminal(r.device_id, { at });
      } catch (err) {
        logger.error({ err, deviceId: r.device_id }, "attendance terminal sync failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "attendance acl sweep failed");
  }
}

/** Test seam: forgets what was pushed, so a suite starts from nothing. */
export function __resetAclCacheForTests(): void {
  lastPushed.clear();
}
