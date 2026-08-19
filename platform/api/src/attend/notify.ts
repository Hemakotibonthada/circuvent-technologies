/**
 * Telling somebody that somebody else did or did not arrive.
 *
 * Two messages, and they are opposites. "Asha arrived at 08:25" is a courtesy
 * a parent likes receiving. "Asha has not arrived" is the one that matters and
 * the one that must never be wrong, because a parent who gets it while their
 * child is sitting in a classroom stops trusting every message that follows.
 *
 * WHY IT IS NOT SENT FROM THE PUNCH HANDLER
 *
 * Arrival could be. Absence cannot: absence is the absence of an event, so
 * there is nothing to hang it off. Both are therefore driven from the register
 * sweep, which already runs on a timer and already knows the difference
 * between "not here yet" and "absent" — a distinction this is entirely
 * dependent on and should not re-derive.
 *
 * WHY IT IS RECORDED ON THE DAY ROW
 *
 * `attend_days.notified_at` is stamped in the same statement that selects the
 * rows to notify, so a slow mail server, an overlapping sweep or a restart
 * mid-batch cannot produce a second message. Telling a parent twice that their
 * child is missing is the failure people remember.
 */
import { pool } from "../db";
import { logger } from "../logger";
import { sendMail } from "../mail";
import { localMoment } from "./schedule";
import { siteToday, type SiteSettings } from "./rollup";

/**
 * Absence is only announced once the register itself says "absent".
 *
 * That distinction lives in `classifyDay`, which will not say it until
 * `absent_after_minutes` have passed since *that person's* window opened. It
 * is deliberately not re-derived here: the window is per person, and a second
 * copy of the rule measured from a different origin is how a parent gets a
 * message about a child walking up the drive.
 */
interface Pending {
  dayId: number;
  personId: number;
  name: string;
  status: string;
  firstIn: string | null;
  guardianEmail: string;
  guardianName: string;
  groupLead: string;
}

/**
 * Claims the rows that still need a message, and stamps them in the same
 * statement.
 *
 * The stamp happens before the mail is sent, not after, which means a send
 * that fails is not retried. That is the right way round here: a retry loop on
 * a message about a child not arriving is how somebody receives it four times
 * at midnight, and the register itself is always available and always correct.
 * A failure is logged and visible; a duplicate is a phone call.
 */
async function claim(site: SiteSettings, day: string, kinds: string[]): Promise<Pending[]> {
  const { rows } = await pool.query(
    `UPDATE attend_days d
        SET notified_at = now()
      FROM attend_people p
      LEFT JOIN attend_groups g ON g.id = p.group_id
     WHERE d.person_id = p.id
       AND d.site_id = $1
       AND d.day = $2::date
       AND d.notified_at IS NULL
       AND d.status = ANY($3::text[])
       AND p.active
     RETURNING d.id AS day_id, p.id AS person_id, p.name, d.status, d.first_in,
               p.guardian_email, p.guardian_name, COALESCE(g.lead_email, '') AS lead_email`,
    [site.id, day, kinds]
  );
  return rows.map((r) => ({
    dayId: Number(r.day_id),
    personId: Number(r.person_id),
    name: r.name,
    status: r.status,
    firstIn: r.first_in,
    guardianEmail: String(r.guardian_email || "").trim(),
    guardianName: String(r.guardian_name || "").trim(),
    groupLead: String(r.lead_email || "").trim(),
  }));
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function body(site: SiteSettings, p: Pending, day: string): { subject: string; html: string } {
  const who = escape(p.name);
  const where = escape(site.name);

  if (p.status === "absent") {
    return {
      subject: `${p.name} has not arrived at ${site.name}`,
      html:
        `<p>Hello${p.guardianName ? " " + escape(p.guardianName) : ""},</p>` +
        `<p><strong>${who}</strong> has not been recorded as arriving at ${where} today (${day}).</p>` +
        /*
         * The caveat is not boilerplate. A card left at home produces exactly
         * this message about somebody sitting in a classroom, and a parent who
         * is told that plainly reacts very differently from one who is told
         * their child is missing.
         */
        `<p>This is recorded from the card readers at the entrance. If they are there but forgot ` +
        `their card, please contact the office so the register can be corrected.</p>` +
        `<p style="color:#666;font-size:12px">Sent automatically by ${where}.</p>`,
    };
  }

  const at = p.firstIn ? localMoment(new Date(p.firstIn), site.timeZone) : null;
  const time = at ? `${String(Math.floor(at.minutes / 60)).padStart(2, "0")}:${String(at.minutes % 60).padStart(2, "0")}` : "";
  return {
    subject: `${p.name} arrived at ${site.name}`,
    html:
      `<p>Hello${p.guardianName ? " " + escape(p.guardianName) : ""},</p>` +
      `<p><strong>${who}</strong> arrived at ${where}${time ? ` at <strong>${time}</strong>` : ""}` +
      `${p.status === "late" ? ", which is after the start of the day" : ""}.</p>` +
      `<p style="color:#666;font-size:12px">Sent automatically by ${where}.</p>`,
  };
}

export interface NotifyResult {
  /** Rows claimed, and therefore stamped: the work this pass took ownership of. */
  claimed: number;
  /** Addresses chosen. Reported separately from `sent` because choosing the
   *  recipient is this module's decision and delivering is mail.ts's. */
  recipients: string[];
  sent: number;
}

/**
 * Sends whatever this site has asked for, for one day.
 *
 * Called from the register sweep, after the recompute, so the statuses it acts
 * on are the ones the register would show if somebody opened it right now.
 *
 * WHERE THE DELAY BEFORE AN ABSENCE LIVES
 *
 * Not here. `classifyDay` will not say "absent" until `absent_after_minutes`
 * have passed *since that person's window opened* — the only correct place for
 * it, because the window is per person and a night-shift worker's morning is
 * not a schoolchild's.
 *
 * An earlier version of this file added a second, cruder delay on top,
 * measured from local midnight. That is a different quantity: at 08:50 with a
 * two-hour settling period it read 530 minutes against 135, concluded the
 * morning was over, and was about to message a parent while the register still
 * correctly said "not yet". One policy, in the place that has the information.
 */
export async function notifyForDay(
  site: SiteSettings,
  day: string
): Promise<NotifyResult> {
  const result: NotifyResult = { claimed: 0, recipients: [], sent: 0 };
  if (!site.notifyGuardians && !site.notifyAbsence) return result;

  const kinds: string[] = [];
  if (site.notifyGuardians) kinds.push("present", "late");
  if (site.notifyAbsence) kinds.push("absent");

  const pending = await claim(site, day, kinds);
  result.claimed = pending.length;

  for (const p of pending) {
    /*
     * An absence falls back to the group's lead — a form tutor or a line
     * manager — when there is no guardian address. Somebody should be told
     * that a person did not arrive even if nobody has filled in a parent's
     * email, and the tutor is who acts on it. An *arrival* has no such
     * fallback: it is a courtesy for a family, not a report for staff.
     */
    const to = p.status === "absent" ? p.guardianEmail || p.groupLead : p.guardianEmail;
    // No address, nothing to do — but the row stays stamped, so a guardian
    // added tomorrow does not receive a message about last week.
    if (!to || !to.includes("@")) continue;
    result.recipients.push(to);

    const { subject, html } = body(site, p, day);
    try {
      if (await sendMail(to, subject, html)) result.sent++;
      else logger.warn({ personId: p.personId, day }, "attendance notification was not accepted");
    } catch (err) {
      logger.error({ err, personId: p.personId }, "attendance notification failed");
    }
  }
  if (result.sent) {
    logger.info({ siteId: site.id, day, sent: result.sent }, "attendance notifications sent");
  }
  return result;
}

/** Today, for every site that has asked to be told. Driven by the sweep. */
export async function notifyAll(now = new Date()): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, owner_id, name, kind, timezone, grace_minutes, half_day_after_minutes,
              absent_after_minutes, auto_out, dedupe_seconds, notify_guardians, notify_absence
         FROM attend_sites
        WHERE notify_guardians OR notify_absence`
    );
    for (const row of rows) {
      const site: SiteSettings = {
        id: Number(row.id), ownerId: Number(row.owner_id), name: row.name, kind: row.kind,
        timeZone: row.timezone, graceMinutes: row.grace_minutes,
        halfDayAfterMinutes: row.half_day_after_minutes,
        absentAfterMinutes: row.absent_after_minutes, autoOut: row.auto_out,
        dedupeSeconds: row.dedupe_seconds, notifyGuardians: row.notify_guardians,
        notifyAbsence: row.notify_absence,
      };
      try {
        await notifyForDay(site, siteToday(site, now));
      } catch (err) {
        logger.error({ err, siteId: site.id }, "attendance notification sweep failed for site");
      }
    }
  } catch (err) {
    logger.error({ err }, "attendance notification sweep failed");
  }
}
