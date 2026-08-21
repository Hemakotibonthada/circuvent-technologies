/**
 * Office access requests, and which of them approve themselves.
 *
 * WHY A REQUEST AT ALL
 *
 * Holding a card and being allowed into the building are different facts. A
 * card says a credential was issued; it does not say anybody agreed this person
 * should be in the office. Most of the time nobody needs to: an employee who is
 * on the roll and inside their validity dates is obviously allowed, and making
 * somebody click approve for that would produce a queue nobody reads and an
 * approval that means nothing.
 *
 * So the rule approves those automatically, and records that it did. `auto` in
 * `decided_by` is the point — after an incident, "who let this person in" has an
 * answer, and the answer distinguishes a rule from a person.
 *
 * What is left pending is the interesting case: somebody inactive, expired, or
 * not yet started. Those are exactly the ones worth a human, and they are also
 * the ones an auto-approve-everything implementation would have waved through.
 */

export type AccessRequestStatus = "pending" | "approved" | "rejected" | "revoked";

export interface AccessRequestPerson {
  id: number;
  active: boolean;
  /** ISO date, or null for no lower bound. */
  validFrom: string | null;
  /** ISO date, or null for no upper bound. */
  validTo: string | null;
  role: string;
}

export interface AutoDecision {
  status: AccessRequestStatus;
  decidedBy: string;
  reason: string;
}

/**
 * Roles that may approve themselves.
 *
 * Visitors and contractors are excluded on purpose. They are the two kinds of
 * person for whom "somebody should know they are in the building today" is the
 * whole reason the request exists, and auto-approving them would leave the
 * feature doing nothing for the only cases it was needed for.
 */
const SELF_APPROVING_ROLES = new Set(["employee", "staff", "student"]);

/** Day-precision comparison, so a validity ending today still includes today. */
function withinDates(day: string, from: string | null, to: string | null): boolean {
  if (from && day < from.slice(0, 10)) return false;
  if (to && day > to.slice(0, 10)) return false;
  return true;
}

/**
 * What happens to a request the moment it is raised.
 *
 * Pure so the rule can be read and tested without a database — this is the part
 * that decides whether somebody gets into a building, and it should not require
 * standing up Postgres to find out what it does.
 *
 * @param day the local business day, `YYYY-MM-DD`
 */
export function autoDecide(person: AccessRequestPerson, day: string): AutoDecision {
  if (!person.active) {
    return {
      status: "pending",
      decidedBy: "",
      reason: "The person is not active on the roll, so this needs a decision.",
    };
  }

  if (!withinDates(day, person.validFrom, person.validTo)) {
    return {
      status: "pending",
      decidedBy: "",
      reason: "Outside this person's valid dates, so this needs a decision.",
    };
  }

  if (!SELF_APPROVING_ROLES.has(person.role)) {
    return {
      status: "pending",
      decidedBy: "",
      reason: `A ${person.role || "visitor"} is not approved automatically.`,
    };
  }

  return {
    status: "approved",
    decidedBy: "auto",
    reason: "Active employee inside their valid dates.",
  };
}

/**
 * Whether an approved request actually covers today.
 *
 * A request can be approved and still not apply: a contractor approved for last
 * Tuesday holds an approved row for ever, and reading only the status would let
 * them in a month later. The dates are the grant; the status only says the
 * grant was agreed.
 */
export function coversDay(
  req: { status: string; validFrom: string | null; validTo: string | null },
  day: string
): boolean {
  if (req.status !== "approved") return false;
  return withinDates(day, req.validFrom, req.validTo);
}
