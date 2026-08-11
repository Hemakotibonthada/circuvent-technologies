/**
 * Delivery estimate by pincode.
 *
 * WHY THIS IS THE FEATURE WORTH ADDING
 *
 * On every large Indian store the delivery date sits directly under the price,
 * above the buy button, and it is there because it answers the question that
 * actually blocks the purchase: not "how much" but "when, and do you even come
 * to my street". A store that cannot answer it asks the buyer to commit money
 * on faith.
 *
 * WHAT THIS DELIBERATELY DOES NOT PRETEND TO BE
 *
 * There is no courier integration behind this, so it does not claim one. It is
 * an *estimate* derived from the destination zone, and every string it produces
 * says so. The alternative — quoting a confident date from a table nobody
 * maintains — is worse than saying nothing: a missed date that was promised
 * precisely is a support ticket and a refund, whereas a range that was labelled
 * an estimate is a delivery.
 *
 * When a real carrier API is wired in, `estimateDelivery` is the single place
 * that changes and the shape it returns stays the same.
 */

/** Working days added on top of the dispatch window, by destination zone. */
export interface DeliveryEstimate {
  /** Serviceable at all. */
  ok: boolean;
  /** Human label for the zone, e.g. "Hyderabad". */
  zone: string;
  /** Fastest and slowest working days from dispatch. */
  minDays: number;
  maxDays: number;
  /** True when this pincode is a next-day lane. */
  express: boolean;
  /** Cash on delivery available to this pincode. */
  cod: boolean;
  reason?: string;
}

/**
 * First two digits of an Indian PIN identify the circle, which is enough to
 * separate a metro lane from a remote one. Going finer would imply a precision
 * the underlying data does not have.
 */
const METRO_PREFIXES = new Set([
  "50", "51", // Telangana / Andhra — our own lab, so same-region
  "56", "57", // Karnataka
  "60", "61", // Tamil Nadu
  "40", "41", // Maharashtra
  "11", "12", // Delhi NCR
  "70", "71", // West Bengal
  "38", "39", // Gujarat
  "68", "69", // Kerala
]);

/**
 * Circles where surface transport is genuinely slower — hill states, islands
 * and the north-east. Quoting these the metro estimate is how a store earns a
 * reputation for being late in exactly the places that already expect it.
 */
const REMOTE_PREFIXES = new Set([
  "19", // Jammu & Kashmir, Ladakh
  "17", // Himachal
  "79", "78", // Assam / north-east
  "73", "74", // Sikkim, north Bengal hills
  "744", // Andaman — checked as a 3-digit special case below
]);

/** Islands and a handful of circles with no cash-on-delivery lane. */
const NO_COD_PREFIXES = new Set(["744", "682"]);

export function normalisePincode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

export function isValidPincode(raw: string): boolean {
  const p = normalisePincode(raw);
  // Six digits, and the first cannot be 0 — no Indian PIN starts with zero, so
  // this rejects a whole class of typo without needing a lookup table.
  return /^[1-9][0-9]{5}$/.test(p);
}

/** Rough circle name, for the "delivering to …" line. */
export function zoneName(pin: string): string {
  const two = pin.slice(0, 2);
  const map: Record<string, string> = {
    "50": "Hyderabad & Telangana", "51": "Andhra Pradesh",
    "56": "Bengaluru", "57": "Karnataka",
    "60": "Chennai", "61": "Tamil Nadu",
    "40": "Mumbai & Pune", "41": "Maharashtra",
    "11": "Delhi NCR", "12": "Haryana & NCR",
    "70": "Kolkata", "71": "West Bengal",
    "38": "Ahmedabad", "39": "Gujarat",
    "68": "Kochi", "69": "Kerala",
    "19": "Jammu & Kashmir", "17": "Himachal Pradesh",
    "79": "Assam & North-East", "78": "Assam",
    "73": "Sikkim & North Bengal", "74": "Andaman & Nicobar",
  };
  return map[two] ?? "your area";
}

/**
 * Estimates delivery for one pincode.
 *
 * Days are counted from dispatch, and dispatch is stated separately in the UI
 * (24–48 h) rather than folded in here — a buyer who sees one combined number
 * cannot tell a slow warehouse from a slow courier, and those have very
 * different remedies.
 */
export function estimateDelivery(raw: string): DeliveryEstimate {
  const pin = normalisePincode(raw);

  if (!isValidPincode(pin)) {
    return {
      ok: false,
      zone: "",
      minDays: 0,
      maxDays: 0,
      express: false,
      cod: false,
      reason: "Enter a 6-digit PIN code",
    };
  }

  const two = pin.slice(0, 2);
  const three = pin.slice(0, 3);
  const zone = zoneName(pin);

  if (REMOTE_PREFIXES.has(two) || REMOTE_PREFIXES.has(three)) {
    return { ok: true, zone, minDays: 6, maxDays: 10, express: false, cod: !NO_COD_PREFIXES.has(three) };
  }

  if (METRO_PREFIXES.has(two)) {
    // Our own circle. Genuinely faster, and the only place express is offered
    // — promising next-day into a circle we do not dispatch from would be a
    // promise made on somebody else's behalf.
    const home = two === "50";
    return {
      ok: true,
      zone,
      minDays: home ? 1 : 2,
      maxDays: home ? 2 : 4,
      express: home,
      cod: !NO_COD_PREFIXES.has(three),
    };
  }

  return { ok: true, zone, minDays: 3, maxDays: 6, express: false, cod: !NO_COD_PREFIXES.has(three) };
}

/**
 * Formats the estimate as a date range a person can act on.
 *
 * Weekends are skipped, because couriers do not deliver on Sunday and a date
 * that lands on one is wrong by at least a day — the kind of small
 * inaccuracy that makes a buyer stop trusting every other number on the page.
 */
export function deliveryWindow(est: DeliveryEstimate, from = new Date()): { from: Date; to: Date } {
  const addWorkingDays = (start: Date, days: number): Date => {
    const d = new Date(start);
    let left = days;
    while (left > 0) {
      d.setDate(d.getDate() + 1);
      // 0 = Sunday. Saturday is a working day for most Indian couriers.
      if (d.getDay() !== 0) left--;
    }
    return d;
  };
  return { from: addWorkingDays(from, est.minDays), to: addWorkingDays(from, est.maxDays) };
}

export function formatWindow(est: DeliveryEstimate, now = new Date()): string {
  if (!est.ok) return "";
  const { from, to } = deliveryWindow(est, now);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  // A single day when the window collapses, rather than "Mon 5 Aug – Mon 5 Aug".
  return from.toDateString() === to.toDateString() ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}
