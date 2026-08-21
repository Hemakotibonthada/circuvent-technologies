/**
 * Binding a physical card to a person, by presenting it at the reader.
 *
 * WHY NOT JUST TYPE THE NUMBER IN
 *
 * Because nobody can read it. A blank fob has no number printed on it, and the
 * value the reader derives is the UID interpreted a particular way — not
 * whatever is etched on the plastic. Before this, the only way to issue a card
 * was to present it at a door, find the refusal in the live feed, copy the
 * number out of an error message and paste it into a form. That works, and it
 * is a terrible thing to ask somebody to do, so people guessed instead.
 *
 * THE WINDOW IS THE SECURITY PROPERTY
 *
 * An enrolment is an open invitation for the next card presented to become
 * somebody's credential. Left open, the next person through the door loses
 * their card to the record being enrolled — and both parties carry on believing
 * everything worked, because nothing about it looks like a failure.
 *
 * So a session is short, belongs to exactly one person, and is consumed by the
 * first card that arrives. The firmware enforces its own copy of the same
 * window, because a session that only the server tracked would leave a reader
 * blinking and open if the server forgot about it.
 */
import { pool } from "../db";
import { logger } from "../logger";
import { publishCommand } from "../mqtt";
import { syncSite } from "./acl";

/** How long a person has to present a card once enrolment has started. */
export const ENROL_WINDOW_SECONDS = 30;

export type EnrolState = "waiting" | "done" | "expired" | "cancelled" | "failed";

export interface EnrolSession {
  id: number;
  siteId: number;
  personId: number;
  deviceId: string;
  state: EnrolState;
  cardNumber: number | null;
  message: string;
  expiresAt: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function enrolOut(r: any): EnrolSession {
  return {
    id: Number(r.id),
    siteId: Number(r.site_id),
    personId: Number(r.person_id),
    deviceId: r.device_id,
    state: r.state,
    cardNumber: r.card_number === null ? null : Number(r.card_number),
    message: r.message ?? "",
    expiresAt: r.expires_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Whether this person may be issued a card at all.
 *
 * One card per person is the rule, and it is enforced here rather than only
 * hidden in the console: a second active credential means two cards open the
 * door as the same person, and the register cannot tell which of them arrived.
 * Replacing a lost card goes through a request so that the old one is revoked
 * as part of the same act.
 */
export async function canEnrol(
  personId: number
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM attend_credentials
      WHERE person_id = $1 AND active`,
    [personId]
  );
  if (rows[0].n > 0) {
    return {
      ok: false,
      reason:
        "This person already holds a card. To replace a lost one, raise a card replacement request — approving it revokes the old card.",
    };
  }
  return { ok: true };
}

/**
 * Open a reader for one card.
 *
 * Any earlier session for this device is expired first. Two live sessions on
 * one reader would race for the next card presented, and the loser would be a
 * person standing at a door believing they had just been issued a badge.
 */
export async function startEnrol(
  siteId: number,
  personId: number,
  deviceId: string
): Promise<EnrolSession> {
  await pool.query(
    `UPDATE attend_enrolments SET state = 'cancelled',
            message = 'Superseded by a newer enrolment on this reader'
      WHERE device_id = $1 AND state = 'waiting'`,
    [deviceId]
  );

  const { rows } = await pool.query(
    `INSERT INTO attend_enrolments (site_id, person_id, device_id, state, expires_at)
     VALUES ($1,$2,$3,'waiting', now() + ($4 || ' seconds')::interval)
     RETURNING *, to_char(expires_at,'YYYY-MM-DD"T"HH24:MI:SSOF') AS expires_at`,
    [siteId, personId, deviceId, String(ENROL_WINDOW_SECONDS)]
  );

  publishCommand(deviceId, { action: "enrol", seconds: ENROL_WINDOW_SECONDS });
  return enrolOut(rows[0]);
}

/** Stop waiting, and tell the reader to stop too. */
export async function cancelEnrol(id: number, deviceId: string): Promise<void> {
  await pool.query(
    `UPDATE attend_enrolments SET state = 'cancelled', message = 'Cancelled'
      WHERE id = $1 AND state = 'waiting'`,
    [id]
  );
  publishCommand(deviceId, { action: "enrolCancel" });
}

/**
 * The live session for a reader, if it has not run out.
 *
 * Expiry is evaluated in the query rather than by a sweeper. A row that says
 * `waiting` an hour later would otherwise claim a card the moment somebody
 * walked past, and relying on a background job to have run is exactly the kind
 * of assumption that holds until the one time it does not.
 */
export async function liveEnrolFor(deviceId: string): Promise<EnrolSession | null> {
  const { rows } = await pool.query(
    `SELECT *, to_char(expires_at,'YYYY-MM-DD"T"HH24:MI:SSOF') AS expires_at
       FROM attend_enrolments
      WHERE device_id = $1 AND state = 'waiting' AND expires_at > now()
      ORDER BY id DESC LIMIT 1`,
    [deviceId]
  );
  return rows[0] ? enrolOut(rows[0]) : null;
}

/**
 * A card arrived while a reader was enrolling.
 *
 * Returns the finished session, or null when nothing was waiting — in which
 * case the caller must treat the read as an ordinary presentation rather than
 * silently discarding it.
 */
export async function completeEnrol(
  deviceId: string,
  cardNumber: number
): Promise<EnrolSession | null> {
  const session = await liveEnrolFor(deviceId);
  if (!session) return null;

  /*
   * A card already issued to somebody else is refused rather than moved. Two
   * people would otherwise share one credential, and the second enrolment would
   * silently take the card away from the first — whose badge then stops working
   * for reasons nobody can trace back to this moment.
   */
  /*
   * Scoped to the site, because the uniqueness is. The same UID at another
   * building is a different card as far as this system is concerned, and
   * refusing it here would block an enrolment for no reason anybody could see.
   */
  const { rows: clash } = await pool.query(
    `SELECT c.person_id, p.name FROM attend_credentials c
       JOIN attend_people p ON p.id = c.person_id
      WHERE c.card_number = $1 AND c.site_id = $2 AND c.active`,
    [cardNumber, session.siteId]
  );
  if (clash[0] && Number(clash[0].person_id) !== session.personId) {
    const { rows } = await pool.query(
      `UPDATE attend_enrolments SET state = 'failed', card_number = $2,
              message = $3, decided_at = now()
        WHERE id = $1
        RETURNING *, to_char(expires_at,'YYYY-MM-DD"T"HH24:MI:SSOF') AS expires_at`,
      [session.id, cardNumber, `That card already belongs to ${clash[0].name}.`]
    );
    return enrolOut(rows[0]);
  }

  const guard = await canEnrol(session.personId);
  if (!guard.ok) {
    const { rows } = await pool.query(
      `UPDATE attend_enrolments SET state = 'failed', card_number = $2,
              message = $3, decided_at = now()
        WHERE id = $1
        RETURNING *, to_char(expires_at,'YYYY-MM-DD"T"HH24:MI:SSOF') AS expires_at`,
      [session.id, cardNumber, guard.reason]
    );
    return enrolOut(rows[0]);
  }

  /*
   * Inserted plainly rather than upserted. The unique index is partial
   * (`WHERE active`), so `ON CONFLICT (card_number)` has no constraint to bind
   * to and would throw at runtime while typechecking perfectly. The clash it
   * would have absorbed is caught above, deliberately, where it can be
   * explained rather than silently resolved in favour of whoever enrolled last.
   */
  await pool.query(
    `INSERT INTO attend_credentials (site_id, person_id, card_number, kind, active, label)
     VALUES ($1,$2,$3,'card',true,$4)`,
    [session.siteId, session.personId, cardNumber, "Enrolled at the reader"]
  );

  const { rows } = await pool.query(
    `UPDATE attend_enrolments SET state = 'done', card_number = $2,
            message = 'Card registered', decided_at = now()
      WHERE id = $1
      RETURNING *, to_char(expires_at,'YYYY-MM-DD"T"HH24:MI:SSOF') AS expires_at`,
    [session.id, cardNumber]
  );

  logger.info(
    { deviceId, personId: session.personId, cardNumber },
    "attendance card enrolled at the reader"
  );

  /*
   * The readers hold their own copy of the card list. A credential that only
   * reached the database is a badge that opens nothing — and the person holding
   * it was just told, by a green light, that it works.
   */
  void syncSite(session.siteId).catch((err) =>
    logger.error({ err, siteId: session.siteId }, "acl push after enrolment failed")
  );

  return enrolOut(rows[0]);
}

/**
 * The session a console is polling, by id.
 *
 * `waiting` past its expiry is reported as `expired` rather than returned as
 * live, so a console shows the window closing even though no row was rewritten.
 */
export async function enrolById(id: number, uid: number): Promise<EnrolSession | null> {
  const { rows } = await pool.query(
    `SELECT e.*, to_char(e.expires_at,'YYYY-MM-DD"T"HH24:MI:SSOF') AS expires_at,
            (e.state = 'waiting' AND e.expires_at <= now()) AS timed_out
       FROM attend_enrolments e
       JOIN attend_sites s ON s.id = e.site_id
      WHERE e.id = $1 AND s.owner_id = $2`,
    [id, uid]
  );
  if (!rows[0]) return null;
  const out = enrolOut(rows[0]);
  if (rows[0].timed_out) {
    out.state = "expired";
    out.message = "No card was presented in time. Start again when ready.";
  }
  return out;
}
