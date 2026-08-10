/**
 * Warranty term calculation.
 *
 * The published policy at /warranty is the authority: "a 6-month limited
 * warranty from the date of delivery". Two things follow from that sentence
 * and both are easy to get wrong.
 *
 * It runs from DELIVERY, not from purchase. An order placed in January and
 * delivered in March is covered until September, not until July. Starting the
 * clock at checkout would quietly shorten every customer's cover by the
 * shipping time, and nobody would notice until a claim was refused.
 *
 * And if a device has not been delivered, the warranty has not started. There
 * is no honest date to show, so this returns "not-started" rather than
 * inventing one. A document that prints a confident expiry date for a parcel
 * still in transit is worse than one that says the cover begins on delivery.
 *
 * This module is pure and has no server-only imports, so the same calculation
 * runs in the invoice component, in the admin panels and on the server. The
 * alternative — computing expiry separately in each place — is how a customer
 * ends up seeing one date on screen and a different one on their invoice.
 */

/** Months of cover. Matches the published policy; changing one without the other is a promise the site does not keep. */
export const WARRANTY_MONTHS = 6;

/** How close to expiry counts as "expiring soon", for reminders and badges. */
export const EXPIRING_SOON_DAYS = 30;

export type WarrantyState = "not-started" | "active" | "expiring" | "expired";

/** Which event started the clock. Recorded because a warranty date with no provenance cannot be defended in a dispute. */
export type WarrantyBasis = "delivered" | "shipped" | "placed";

export interface WarrantyTerm {
  months: number;
  /** ISO date the cover began, or null when the order has not been delivered. */
  start: string | null;
  /** Which order event the start date came from. */
  basis: WarrantyBasis | null;
  /** ISO date the cover ends, or null when it has not begun. */
  expiry: string | null;
  state: WarrantyState;
  /** Whole days left, floored. Null before the cover starts, 0 once expired. */
  daysRemaining: number | null;
  /** Plain-language explanation, safe to print on a document. */
  summary: string;
}

export interface OrderEventLike {
  status: string;
  at: string;
}

export interface OrderLike {
  orderNo?: string;
  placedAt?: string;
  status?: string;
  updatedAt?: string;
  history?: OrderEventLike[];
}

const DAY_MS = 86_400_000;

/**
 * Add whole months, clamping to the end of the target month.
 *
 * Date.setMonth overflows: 31 August plus six months is 31 February, which it
 * silently turns into 3 March. That is two extra days of cover on some orders
 * and a date that does not match the certificate on others. Clamping to 28
 * February is the behaviour a customer would expect and the one a court would.
 */
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  const lastDayOfTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return target.toISOString();
}

/**
 * When did cover begin, and on what evidence?
 *
 * Preference order is delivery, then dispatch, then the order date — but only
 * delivery is the policy. The other two exist because order records predate
 * this module and some of them have a status of "delivered" with no matching
 * history entry. Falling back silently would be wrong, so the basis comes back
 * with the date and every caller shows it.
 */
export function warrantyStart(order: OrderLike): { at: string; basis: WarrantyBasis } | null {
  const history = Array.isArray(order.history) ? order.history : [];

  // Last delivery event, not the first: a redelivery after a failed attempt is
  // the date the customer actually received it.
  const delivered = [...history].reverse().find((e) => e && e.status === "delivered" && e.at);
  if (delivered) return { at: delivered.at, basis: "delivered" };

  // Marked delivered but the event was never written — older records, or a
  // status set directly. updatedAt is the closest defensible evidence.
  if (order.status === "delivered") {
    const at = order.updatedAt || order.placedAt;
    if (at) return { at, basis: "delivered" };
  }

  const shipped = [...history].reverse().find((e) => e && e.status === "shipped" && e.at);
  if (shipped) return { at: shipped.at, basis: "shipped" };

  return null;
}

function stateFor(expiryMs: number, now: number): WarrantyState {
  if (now > expiryMs) return "expired";
  if (expiryMs - now <= EXPIRING_SOON_DAYS * DAY_MS) return "expiring";
  return "active";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * The warranty term for an order, as it stands right now.
 *
 * `now` is injectable so the result is testable and so a document rendered for
 * a specific date reads the same later.
 */
export function warrantyTerm(order: OrderLike, opts: { months?: number; now?: number } = {}): WarrantyTerm {
  const months = opts.months ?? WARRANTY_MONTHS;
  const now = opts.now ?? Date.now();
  const started = warrantyStart(order);

  if (!started) {
    return {
      months,
      start: null,
      basis: null,
      expiry: null,
      state: "not-started",
      daysRemaining: null,
      summary: `${months}-month warranty — begins on delivery`,
    };
  }

  const expiry = addMonths(started.at, months);
  const expiryMs = new Date(expiry).getTime();
  const state = stateFor(expiryMs, now);
  const daysRemaining = state === "expired" ? 0 : Math.floor((expiryMs - now) / DAY_MS);

  const basisWord = started.basis === "delivered" ? "delivered" : started.basis === "shipped" ? "dispatched" : "ordered";

  return {
    months,
    start: started.at,
    basis: started.basis,
    expiry,
    state,
    daysRemaining,
    summary:
      state === "expired"
        ? `${months}-month warranty expired ${formatDate(expiry)}`
        : `${months}-month warranty until ${formatDate(expiry)} (${basisWord} ${formatDate(started.at)})`,
  };
}

/** Short label for a badge or table cell. */
export function warrantyLabel(term: WarrantyTerm): string {
  switch (term.state) {
    case "not-started":
      return "Starts on delivery";
    case "expired":
      return "Expired";
    case "expiring":
      return `${term.daysRemaining} days left`;
    default:
      return `${term.daysRemaining} days left`;
  }
}

/** Display dates without duplicating the locale/timezone choice in every component. */
export function warrantyDate(iso: string | null): string {
  return iso ? formatDate(iso) : "—";
}
