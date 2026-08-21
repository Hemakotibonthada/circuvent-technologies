/**
 * Turning what a terminal saw into what the register says.
 *
 * Every scan arrives here as `cv/<id>/telemetry` with `type: "punch"`. What
 * happens next is: work out who the card belongs to, judge it again on the
 * server, write it down, tell the terminal whose card it was, and update that
 * person's day.
 *
 * WHY THE SERVER JUDGES A DECISION THE DOOR HAS ALREADY MADE
 *
 * The terminal has already opened or refused by the time this runs, from a
 * list pushed to it earlier. Re-deciding here is not second-guessing for its
 * own sake: the list can be stale, and the gap between what the door did and
 * what it should have done is the single most useful thing an access log can
 * tell somebody. A leaver's card that still works shows up as a granted punch
 * with `reason: expired`, which is a sentence rather than a mystery.
 *
 * WHY REPLAYS MUST BE FREE
 *
 * A terminal that has been offline replays its queue, and it will replay parts
 * of it twice — reconnecting mid-drain, or being power-cycled with a queue on
 * it. Without an idempotency key the register would show people arriving twice
 * on the morning after an outage, which is precisely the morning somebody is
 * looking at it closely.
 */
import { pool, recordEvent } from "../db";
import { logger } from "../logger";
import { bus, publishCommand, type DeviceUpdate } from "../mqtt";
import {
  decideAccess,
  isDuplicate,
  resolveDirection,
  type AccessRule,
  type Credential,
  type Person,
  type PunchReason,
} from "./decide";
import { ancestryOf, syncTerminal } from "./acl";
import { completeEnrol } from "./enrol";
import { dayForPunch, localMoment } from "./schedule";
import {
  getSite,
  loadSchedules,
  recomputePerson,
  scheduleForPerson,
  personShape,
  type SiteSettings,
} from "./rollup";

interface TerminalContext {
  deviceId: string;
  siteId: number;
  zoneId: number | null;
  direction: "in" | "out" | "auto";
  mode: string;
  enabled: boolean;
  countsForAttendance: boolean;
}

async function terminalFor(deviceId: string): Promise<TerminalContext | null> {
  const { rows } = await pool.query(
    `SELECT t.device_id, t.site_id, t.zone_id, t.direction, t.mode, t.enabled,
            COALESCE(z.counts_for_attendance, true) AS counts
       FROM attend_terminals t
       LEFT JOIN attend_zones z ON z.id = t.zone_id
      WHERE t.device_id = $1`,
    [deviceId]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    deviceId: r.device_id,
    siteId: Number(r.site_id),
    zoneId: r.zone_id === null ? null : Number(r.zone_id),
    direction: r.direction === "out" ? "out" : r.direction === "auto" ? "auto" : "in",
    mode: r.mode,
    enabled: r.enabled,
    countsForAttendance: r.counts,
  };
}

/** The card, its holder, and everything needed to judge them. */
async function resolveCard(siteId: number, cardNumber: number) {
  const { rows } = await pool.query(
    `SELECT c.id AS credential_id, c.active AS cred_active, c.revoked_at,
            p.id, p.name, p.code, p.group_id, p.schedule_id, p.active,
            to_char(p.valid_from, 'YYYY-MM-DD') AS valid_from,
            to_char(p.valid_to,   'YYYY-MM-DD') AS valid_to,
            g.schedule_id AS group_schedule_id
       FROM attend_credentials c
       JOIN attend_people p ON p.id = c.person_id
       LEFT JOIN attend_groups g ON g.id = p.group_id
      WHERE c.site_id = $1 AND c.card_number = $2
      ORDER BY c.active DESC, c.issued_at DESC
      LIMIT 1`,
    [siteId, cardNumber]
  );
  return rows[0] ?? null;
}

async function loadRules(siteId: number): Promise<AccessRule[]> {
  const { rows } = await pool.query(
    `SELECT id, zone_id, group_id, person_id, schedule_id, allow, priority,
            to_char(valid_from, 'YYYY-MM-DD') AS valid_from,
            to_char(valid_to,   'YYYY-MM-DD') AS valid_to
       FROM attend_rules WHERE site_id = $1`,
    [siteId]
  );
  return rows.map((r) => ({
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
}

/**
 * The key that makes a replay harmless.
 *
 * Device, sequence, card and the terminal's own clock. Device and sequence
 * alone would be tidier and would break the first time a terminal was factory
 * reset: its sequence restarts at zero and several hundred perfectly real
 * punches would be silently discarded as duplicates of last month's.
 */
export function dedupeKey(
  deviceId: string,
  seq: number | null,
  card: number,
  deviceTs: number | null
): string | null {
  if (seq === null || seq === undefined) return null;
  return `${deviceId}|${seq}|${card}|${deviceTs ?? 0}`;
}

export interface PunchPayload {
  seq?: number;
  card?: number;
  granted?: boolean;
  direction?: string;
  method?: string;
  reason?: string;
  ts?: number;
  offline?: boolean;
}

/**
 * One scan.
 *
 * Exported so it can be driven directly by a test, a manual entry from the
 * console, or an import, all of which are the same event arriving by a
 * different road.
 */
export async function ingestPunch(
  deviceId: string,
  payload: PunchPayload,
  opts: { at?: Date; source?: string } = {}
): Promise<{ stored: boolean; reason: PunchReason; personId: number | null } | null> {
  const terminal = await terminalFor(deviceId);
  if (!terminal) return null;

  const site = await getSite(terminal.siteId);
  if (!site) return null;

  const at = opts.at ?? new Date();
  const card = Number(payload.card ?? 0);
  const seq = payload.seq === undefined ? null : Number(payload.seq);
  /*
   * The terminal's clock, when it had one. Zero means it did not — a site that
   * lost power and came back before its internet did — and that is stored as
   * null rather than as 1970 or as "now", so a register can say the time is
   * approximate instead of quietly inventing one.
   */
  const deviceTs = payload.ts && Number(payload.ts) > 1_600_000_000 ? Number(payload.ts) : null;
  const deviceAt = deviceTs ? new Date(deviceTs * 1000) : null;
  const effectiveAt = deviceAt ?? at;

  const key = dedupeKey(deviceId, seq, card, deviceTs);

  /*
   * A request-to-exit or a remote release has no card. It is still written
   * down — a door that can be opened without leaving a trace is not an
   * access-controlled door — but there is nobody to attribute it to and
   * nothing to decide.
   */
  if (!card) {
    await insertPunch({
      siteId: site.id,
      deviceId,
      zoneId: terminal.zoneId,
      personId: null,
      credentialId: null,
      cardNumber: null,
      direction: payload.direction === "out" ? "out" : "in",
      granted: payload.granted !== false,
      reason: "ok",
      method: String(payload.method ?? "rex"),
      source: opts.source ?? "device",
      seq,
      deviceAt,
      at,
      offline: Boolean(payload.offline),
      key,
    });
    return { stored: true, reason: "ok", personId: null };
  }

  const row = await resolveCard(site.id, card);

  let decision: { granted: boolean; reason: PunchReason; ruleId: number | null };
  let personId: number | null = null;
  let credentialId: number | null = null;
  let personName = "";

  if (!row) {
    /*
     * A card nobody has issued. This is the most valuable row in the table —
     * an unknown card at a school gate at two in the morning is exactly what
     * somebody goes looking for — so it is stored rather than dropped for
     * failing to resolve.
     */
    decision = { granted: false, reason: "unknown-card", ruleId: null };
  } else {
    personId = Number(row.id);
    credentialId = Number(row.credential_id);
    personName = row.name;

    const person: Person = {
      id: personId,
      name: row.name,
      groupId: row.group_id === null ? null : Number(row.group_id),
      active: row.active,
      validFrom: row.valid_from,
      validTo: row.valid_to,
    };
    const credential: Credential = {
      id: credentialId,
      personId,
      active: row.cred_active,
      revokedAt: row.revoked_at,
    };

    const [rules, schedules, groups] = await Promise.all([
      loadRules(site.id),
      loadSchedules(site.id),
      pool.query(`SELECT id, parent_id FROM attend_groups WHERE site_id = $1`, [site.id]),
    ]);
    const parents = new Map<number, number | null>();
    for (const g of groups.rows) {
      parents.set(Number(g.id), g.parent_id === null ? null : Number(g.parent_id));
    }

    decision = decideAccess({
      person,
      credential,
      zoneId: terminal.zoneId,
      rules,
      schedules,
      groupAncestry: ancestryOf(person.groupId, parents),
      at: effectiveAt,
      timeZone: site.timeZone,
      accessApproved: site.requireAccessRequest
        ? await hasApprovedAccess(person.id, localMoment(effectiveAt, site.timeZone).day)
        : undefined,
    });
  }

  // What the terminal actually did, which is not always what should have
  // happened. Both are recorded; the reason explains the difference.
  const doorOpened = payload.granted === true;

  const previous = personId
    ? await pool.query(
        `SELECT device_id, direction, COALESCE(device_at, at) AS at
           FROM attend_punches
          WHERE person_id = $1
          ORDER BY COALESCE(device_at, at) DESC
          LIMIT 1`,
        [personId]
      )
    : null;
  const prev = previous?.rows[0]
    ? {
        at: new Date(previous.rows[0].at),
        deviceId: previous.rows[0].device_id as string | null,
        direction: previous.rows[0].direction as string,
      }
    : null;

  const direction =
    payload.direction === "in" || payload.direction === "out"
      ? (payload.direction as "in" | "out")
      : resolveDirection({
          terminal: terminal.direction,
          lastDirection: (prev?.direction as "in" | "out" | null) ?? null,
        });

  const duplicate = isDuplicate(prev, { at: effectiveAt, deviceId, direction }, site.dedupeSeconds);

  const reason: PunchReason = duplicate ? "duplicate" : decision.reason;

  const stored = await insertPunch({
    siteId: site.id,
    deviceId,
    zoneId: terminal.zoneId,
    personId,
    credentialId,
    cardNumber: card,
    direction,
    granted: doorOpened && decision.granted && !duplicate,
    reason,
    method: String(payload.method ?? "card"),
    source: opts.source ?? "device",
    seq,
    deviceAt,
    at,
    offline: Boolean(payload.offline),
    key,
  });

  if (!stored) {
    // Already have it: a replay of something the server has seen. Nothing to
    // recompute and nothing to say.
    return { stored: false, reason, personId };
  }

  if (credentialId) {
    void pool
      .query(`UPDATE attend_credentials SET last_seen_at = now() WHERE id = $1`, [credentialId])
      .catch(() => {});
  }
  void pool
    .query(`UPDATE attend_terminals SET last_punch_at = now() WHERE device_id = $1`, [deviceId])
    .catch(() => {});

  /*
   * Tell the terminal who that was.
   *
   * Only for a live scan. Greeting somebody by name three hours after they
   * walked through the door, because their punch was in a replayed queue, is
   * worse than saying nothing: the next person at the reader sees a stranger's
   * name and a door that did not open for them.
   */
  if (!payload.offline) {
    await greet(deviceId, personName, decision, duplicate, direction, site, personId, effectiveAt);
  }

  if (personId && terminal.countsForAttendance) {
    const schedules = await loadSchedules(site.id);
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.code, p.group_id, p.schedule_id, p.active,
              to_char(p.valid_from, 'YYYY-MM-DD') AS valid_from,
              to_char(p.valid_to,   'YYYY-MM-DD') AS valid_to,
              g.schedule_id AS group_schedule_id
         FROM attend_people p
         LEFT JOIN attend_groups g ON g.id = p.group_id
        WHERE p.id = $1`,
      [personId]
    );
    if (rows[0]) {
      const schedule = scheduleForPerson(personShape(rows[0]), schedules);
      const day = dayForPunch(localMoment(effectiveAt, site.timeZone), schedule);
      await recomputePerson(site.id, personId, day, at);
    }
  }

  return { stored: true, reason, personId };
}

interface InsertArgs {
  siteId: number;
  deviceId: string;
  zoneId: number | null;
  personId: number | null;
  credentialId: number | null;
  cardNumber: number | null;
  direction: string;
  granted: boolean;
  reason: string;
  method: string;
  source: string;
  seq: number | null;
  deviceAt: Date | null;
  at: Date;
  offline: boolean;
  key: string | null;
}

/** Returns false when the row was already there — an idempotent replay. */
async function insertPunch(a: InsertArgs): Promise<boolean> {
  const r = await pool.query(
    `INSERT INTO attend_punches
       (site_id, device_id, zone_id, person_id, credential_id, card_number, direction,
        granted, reason, method, source, device_seq, device_at, at, offline, dedupe_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [
      a.siteId, a.deviceId, a.zoneId, a.personId, a.credentialId, a.cardNumber,
      a.direction, a.granted, a.reason, a.method, a.source, a.seq,
      a.deviceAt, a.at, a.offline, a.key,
    ]
  );
  return Boolean(r.rowCount);
}

async function greet(
  deviceId: string,
  name: string,
  decision: { granted: boolean; reason: PunchReason },
  duplicate: boolean,
  direction: "in" | "out",
  site: SiteSettings,
  personId: number | null,
  at: Date
): Promise<void> {
  let status = direction === "out" ? "out" : "ok";
  let message = name;

  if (duplicate) {
    status = "ok";
    message = name ? `${name} — already scanned` : "Already scanned";
  } else if (!decision.granted) {
    status = "denied";
    message = REFUSALS[decision.reason] ?? "Not allowed";
  } else if (personId) {
    /*
     * "Late" on the screen rather than only in a report.
     *
     * A student who is told at the gate is a student who knows before the
     * register is printed, and the office is not the first they hear of it.
     */
    const { rows } = await pool.query(
      `SELECT status FROM attend_days WHERE person_id = $1 AND day = $2::date`,
      [personId, localMoment(at, site.timeZone).day]
    );
    if (rows[0]?.status === "late") {
      status = "late";
      message = name ? `${name} — late` : "Late";
    }
  }

  try {
    publishCommand(deviceId, { action: "greet", name, status, message });
  } catch (err) {
    // The screen is a courtesy. The record is already written and the door has
    // already done whatever it was going to do.
    logger.debug({ err, deviceId }, "attendance greet publish failed");
  }
}

const REFUSALS: Record<string, string> = {
  "unknown-card": "Card not recognised",
  revoked: "Card cancelled",
  inactive: "No longer enrolled",
  expired: "Enrolment ended",
  "not-yet-valid": "Not started yet",
  "not-allowed": "Not permitted here",
  "out-of-hours": "Outside allowed hours",
};

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

async function onTelemetry(u: DeviceUpdate): Promise<void> {
  if (u.kind !== "telemetry") return;
  const p = u.payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return;

  if (p.type === "punch") {
    await ingestPunch(u.deviceId, p as PunchPayload);
    return;
  }

  /*
   * A card presented while the reader was enrolling. Handled before punches
   * would ever see it and answered with the same `greet` a door decision uses,
   * so the person standing at the reader gets the usual green or red rather
   * than a reader that goes dark and leaves them wondering whether it worked.
   */
  if (p.type === "enrol") {
    const card = Number(p.card ?? 0);
    if (!card) return;
    const done = await completeEnrol(u.deviceId, card);
    if (!done) {
      /*
       * Nothing was waiting — the window closed between the tap and the
       * message arriving. Treated as an ordinary presentation rather than
       * dropped, because the person did present a card at a door and the
       * register should say so.
       */
      await ingestPunch(u.deviceId, p as unknown as PunchPayload);
      return;
    }
    publishCommand(u.deviceId, {
      action: "greet",
      status: done.state === "done" ? "granted" : "denied",
      message: done.message,
    });
    return;
  }

  if (p.type === "acl" && p.state === "failed") {
    /*
     * The terminal refused a partial list and kept its old one. Pushing again
     * immediately is the right move: the failure is a dropped packet, not a
     * disagreement, and a terminal running last week's roster is a terminal
     * that lets a leaver in.
     */
    logger.warn(
      { deviceId: u.deviceId, expected: p.expected, received: p.received },
      "attendance acl push was incomplete; retrying"
    );
    await syncTerminal(u.deviceId, { force: true });
    return;
  }

  if (p.type === "door" && (p.state === "forced" || p.state === "held")) {
    const terminal = await terminalFor(u.deviceId);
    if (!terminal) return;
    const { rows } = await pool.query(`SELECT owner_id FROM attend_sites WHERE id = $1`, [
      terminal.siteId,
    ]);
    if (!rows[0]) return;
    await recordEvent(
      Number(rows[0].owner_id),
      "security",
      p.state === "forced" ? "A door was forced open" : "A door was held open",
      p.state === "forced"
        ? "It opened without anybody being granted access"
        : `It has been open for more than ${Number(p.seconds ?? 0)} seconds`,
      u.deviceId
    );
  }
}

let started = false;

const handler = (u: DeviceUpdate): void => {
  void onTelemetry(u).catch((err) =>
    logger.error({ err, deviceId: u.deviceId }, "attendance ingest failed")
  );
};

/** Wires the attendance ingest. Call once at boot, after the MQTT bridge. */
export function startAttendance(): void {
  if (started) return;
  started = true;
  bus.on("device:update", handler);
}

/**
 * Test seam: drops this module's listener so a suite can exit cleanly.
 *
 * Only its own — removeAllListeners on the shared bus would silently
 * unsubscribe ANPR and the face door as well, and the damage would show up as
 * an unrelated suite failing depending on the order the files happened to run.
 */
export function __resetAttendanceForTests(): void {
  bus.off("device:update", handler);
  started = false;
}

/**
 * Whether an approved office-access request covers this person today.
 *
 * The dates are checked in SQL rather than the status alone, because an
 * approved request for last Tuesday stays approved for ever — reading only the
 * status would let a contractor in a month after their day.
 */
async function hasApprovedAccess(personId: number, day: string): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT true AS ok
       FROM attend_access_requests
      WHERE person_id = $1
        AND status = 'approved'
        /*
         * The kind matters as much as the status. A card-replacement request
         * lives in this table too, and counting one here would open a door for
         * somebody on the strength of having lost their badge.
         */
        AND kind = 'office-access'
        AND (valid_from IS NULL OR valid_from <= $2::date)
        AND (valid_to   IS NULL OR valid_to   >= $2::date)
      LIMIT 1`,
    [personId, day]
  );
  return rows.length > 0;
}
