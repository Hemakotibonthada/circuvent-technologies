/**
 * Whether a card opens a door, and which way through it counts.
 *
 * Pure, like schedule.ts, and for the same reason: this is the part somebody
 * will be asked to justify after an incident, and a rule engine that can only
 * be exercised by presenting a real card to a real door is one nobody can
 * check.
 *
 * WHERE THIS RUNS, AND WHERE IT DOES NOT
 *
 * The terminal decides in the moment, from a pushed list of card numbers, and
 * it has to: a school gate cannot wait for a round trip and must keep working
 * when the line is down (see firmware/rfid-attend). This is the *other* half —
 * the full rule set, evaluated on the server, which decides who is on that
 * pushed list in the first place and re-checks every scan as it arrives.
 *
 * So a punch can be granted by the terminal and refused here. That is not a
 * contradiction to paper over: it is a card that was valid when the list was
 * pushed and is not valid now, and the honest record is that the door opened
 * and it should not have. The register says so, and the console can say so,
 * which is how somebody finds out that a leaver still has a working card.
 */
import { localMoment, windowsFor, type Schedule } from "./schedule";

export type PunchReason =
  | "ok"
  | "unknown-card"
  | "revoked"
  | "inactive"
  | "expired"
  | "not-yet-valid"
  | "not-allowed"
  | "no-access-request"
  | "out-of-hours"
  | "duplicate"
  | "offline";

export interface Person {
  id: number;
  name: string;
  groupId: number | null;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
}

export interface Credential {
  id: number;
  personId: number;
  active: boolean;
  revokedAt: string | null;
}

/** An access rule, as stored. Nulls widen: no group and no person is everyone. */
export interface AccessRule {
  id: number;
  zoneId: number | null;
  groupId: number | null;
  personId: number | null;
  scheduleId: number | null;
  allow: boolean;
  priority: number;
  validFrom: string | null;
  validTo: string | null;
}

export interface DecideInput {
  person: Person | null;
  credential: Credential | null;
  zoneId: number | null;
  /** Rules already narrowed to this site. */
  rules: AccessRule[];
  /** Schedules a rule may reference, by id. */
  schedules: Map<number, Schedule>;
  /** Group ancestry, so a rule on "Grade 5" covers "5A". */
  groupAncestry: number[];
  at: Date;
  timeZone: string;
  /**
   * Whether an approved office-access request covers today.
   *
   * Undefined on sites that do not require one, and undefined must never read
   * as a refusal — see the check in `decideAccess`.
   */
  accessApproved?: boolean;
}

export interface Decision {
  granted: boolean;
  reason: PunchReason;
  /** The rule that settled it, for the audit trail. Null when nothing matched. */
  ruleId: number | null;
}

/** True when `day` falls inside an inclusive, open-ended range. */
export function withinDates(day: string, from: string | null, to: string | null): boolean {
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/**
 * How specific a rule is.
 *
 * A rule naming a person beats one naming their class, which beats one that
 * applies to everybody. Without this, "nobody may enter the server room" and
 * "Priya may enter the server room" would be settled by whichever happened to
 * be created first, and the answer would change when somebody edited an
 * unrelated rule.
 */
export function specificity(rule: AccessRule): number {
  let score = 0;
  if (rule.personId !== null) score += 4;
  if (rule.groupId !== null) score += 2;
  if (rule.zoneId !== null) score += 1;
  return score;
}

function ruleApplies(rule: AccessRule, input: DecideInput, day: string): boolean {
  if (rule.zoneId !== null && rule.zoneId !== input.zoneId) return false;
  if (rule.personId !== null && rule.personId !== input.person?.id) return false;
  if (rule.groupId !== null && !input.groupAncestry.includes(rule.groupId)) return false;
  if (!withinDates(day, rule.validFrom, rule.validTo)) return false;
  return true;
}

/** True when `at` falls inside the schedule a rule is limited to. */
function insideSchedule(rule: AccessRule, input: DecideInput, day: string, minutes: number): boolean {
  if (rule.scheduleId === null) return true;
  const schedule = input.schedules.get(rule.scheduleId);
  /*
   * A rule pointing at a schedule that no longer exists does not apply.
   *
   * The alternative readings are both worse: treating it as "always" quietly
   * turns a time-limited permission into a permanent one the moment somebody
   * deletes a schedule, and treating it as "never" silently locks people out
   * with nothing on screen to explain why. Not applying leaves the decision to
   * the remaining rules, which is the same thing that would have happened had
   * the rule been deleted alongside the schedule.
   */
  if (!schedule) return false;
  return windowsFor(schedule, day).some((w) => minutes >= w.start && minutes <= w.end);
}

/**
 * Judge one presentation of a card.
 *
 * The order matters and reads as the policy: an unknown card is unknown before
 * anything else is considered, a revoked card is refused even if a rule would
 * have allowed it, and only then does the rule set get a say.
 */
export function decideAccess(input: DecideInput): Decision {
  const { day, minutes } = localMoment(input.at, input.timeZone);

  if (!input.credential || !input.person) {
    return { granted: false, reason: "unknown-card", ruleId: null };
  }
  if (!input.credential.active || input.credential.revokedAt) {
    return { granted: false, reason: "revoked", ruleId: null };
  }
  if (!input.person.active) {
    return { granted: false, reason: "inactive", ruleId: null };
  }
  if (input.person.validFrom && day < input.person.validFrom) {
    return { granted: false, reason: "not-yet-valid", ruleId: null };
  }
  if (input.person.validTo && day > input.person.validTo) {
    // A leaver whose card still works because the terminal's list is stale.
    return { granted: false, reason: "expired", ruleId: null };
  }

  /*
   * Sites that require an approved office-access request.
   *
   * Checked after the roster and before the rules, because it answers a
   * different question from either: the roster says this person exists, the
   * rules say where and when a card works, and this says somebody agreed they
   * should be in the building at all.
   *
   * `accessApproved` is undefined on sites that have not opted in, and
   * undefined is deliberately not a refusal — a site that never turned this on
   * has to behave exactly as it did before the feature existed.
   */
  if (input.accessApproved === false) {
    return { granted: false, reason: "no-access-request", ruleId: null };
  }

  const candidates = input.rules
    .filter((r) => ruleApplies(r, input, day))
    .sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      const s = specificity(b) - specificity(a);
      if (s !== 0) return s;
      /*
       * Deny wins a tie.
       *
       * Somebody will eventually write two rules that contradict each other at
       * the same priority and specificity, and when they do, the safe reading
       * of "allowed and also not allowed" is not allowed. It is also the one
       * that produces a complaint rather than a silent hole.
       */
      return Number(a.allow) - Number(b.allow);
    });

  for (const rule of candidates) {
    if (!insideSchedule(rule, input, day, minutes)) {
      /*
       * A rule that would have applied but for the time is not simply skipped
       * — if it is an allow rule, the reason the person is standing outside is
       * that it is the wrong time, and saying "not allowed" would send them to
       * argue with the wrong person.
       */
      if (rule.allow) {
        const anyTime = candidates.some(
          (r) => r !== rule && r.allow && insideSchedule(r, input, day, minutes)
        );
        if (!anyTime) return { granted: false, reason: "out-of-hours", ruleId: rule.id };
      }
      continue;
    }
    return {
      granted: rule.allow,
      reason: rule.allow ? "ok" : "not-allowed",
      ruleId: rule.id,
    };
  }

  /*
   * Nothing matched.
   *
   * Allowed, deliberately. A site that has written no rules at all is the
   * normal state of a freshly installed system, and the alternative is a
   * building where nobody's card works until somebody discovers that an empty
   * rule table means "deny everyone". Access is narrowed by writing rules; the
   * roster is what says who has a card in the first place.
   */
  return { granted: true, reason: "ok", ruleId: null };
}

/* ------------------------------------------------------------------ */
/* Direction                                                           */
/* ------------------------------------------------------------------ */

export interface DirectionInput {
  /** What the terminal is configured as: in, out, or work it out. */
  terminal: "in" | "out" | "auto";
  /** The person's previous scan today, if there was one. */
  lastDirection: "in" | "out" | null;
}

/**
 * Which way through the door this scan counts.
 *
 * Most installations have a reader on each side and the answer is whatever the
 * terminal says. A single reader serving both directions — one door, one
 * panel, which is what most small offices actually fit — has to alternate, and
 * the only sane basis for that is what the person did last.
 *
 * Starting at "in" when there is no previous scan is not arbitrary: the first
 * time somebody touches a reader on a given day, they are arriving. Assuming
 * "out" would open every register with everyone leaving a building they had
 * not entered.
 */
export function resolveDirection(input: DirectionInput): "in" | "out" {
  if (input.terminal !== "auto") return input.terminal;
  return input.lastDirection === "in" ? "out" : "in";
}

/* ------------------------------------------------------------------ */
/* Duplicate suppression                                               */
/* ------------------------------------------------------------------ */

/**
 * Whether this scan is the same event as the last one.
 *
 * The terminal already suppresses a card left sitting on the reader. This is
 * the second line, and it exists because the first one cannot see across
 * devices: somebody who taps the in-reader and then the out-reader a metre
 * away, two seconds apart, has walked past two panels, not worked a two-second
 * shift.
 *
 * Only same-direction repeats are suppressed on one device; across devices any
 * repeat inside the window is suppressed, because two readers disagreeing
 * about direction that fast is noise whichever way it points.
 */
export function isDuplicate(
  previous: { at: Date; deviceId: string | null; direction: string } | null,
  next: { at: Date; deviceId: string | null; direction: string },
  windowSeconds: number
): boolean {
  if (!previous) return false;
  const gap = (next.at.getTime() - previous.at.getTime()) / 1000;
  if (gap < 0 || gap > windowSeconds) return false;
  if (previous.deviceId !== next.deviceId) return true;
  return previous.direction === next.direction;
}
