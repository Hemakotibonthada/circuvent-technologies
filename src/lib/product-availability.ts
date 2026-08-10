/**
 * Whether a product can be bought, and what to say when it cannot.
 *
 * "Sold out" was decided independently in at least four places — the card, the
 * detail page, the compare bar and the account panel each re-derived it from
 * `available` and `stock`. That works while there is exactly one reason not to
 * sell something. Adding a second reason to a rule written four times means
 * finding all four, and the one that gets missed does not fail loudly: it
 * shows an Add to cart button on something that cannot be added.
 *
 * So the states live here and every surface asks. The wording matters as much
 * as the flag. "Out of stock" tells a customer this existed and has run out,
 * so they should wait for a restock; saying it about something not yet
 * released is simply untrue, and it also throws away the more interesting
 * message — that it is coming.
 *
 * Coming soon is expressed as a release date rather than a boolean, for the
 * same reason warranty is: a flag has to be remembered and turned off on
 * launch day by somebody, and a date turns itself off.
 */

export interface AvailabilityInput {
  available?: boolean;
  stock?: number;
  /** ISO date the product goes on sale. Before it, the product is "coming soon". */
  releaseAt?: string | null;
  /** Permanently withdrawn. Distinct from sold out: it is not coming back. */
  discontinued?: boolean;
}

export type AvailabilityState = "available" | "coming-soon" | "sold-out" | "discontinued";

export interface Availability {
  state: AvailabilityState;
  /** Can this be added to a cart or ordered? */
  canBuy: boolean;
  /** Short badge text, or null when there is nothing worth saying. */
  badge: string | null;
  /** What the primary button should read. */
  cta: string;
  /** Sentence explaining the state, for a detail page or an error. */
  reason: string | null;
  /** Show a "tell me when it's back" control. */
  offerRestockAlert: boolean;
  /** Show a "tell me when it launches" control. */
  offerLaunchAlert: boolean;
  /** Days until release, when known and in the future. */
  daysUntilRelease: number | null;
}

const DAY_MS = 86_400_000;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Order matters.
 *
 * Discontinued outranks everything: a withdrawn product with stock left is
 * still not for sale. Coming soon outranks sold out, because a product that
 * has not launched has no stock by definition — reading that zero as "out of
 * stock" is how an unreleased product ends up advertised as temporarily
 * unavailable.
 */
export function productAvailability(p: AvailabilityInput, now: number = Date.now()): Availability {
  if (p.discontinued) {
    return {
      state: "discontinued",
      canBuy: false,
      badge: "Discontinued",
      cta: "No longer available",
      reason: "This product has been withdrawn and is not coming back.",
      offerRestockAlert: false,
      offerLaunchAlert: false,
      daysUntilRelease: null,
    };
  }

  const release = p.releaseAt ? new Date(p.releaseAt).getTime() : null;
  if (release !== null && !Number.isNaN(release) && release > now) {
    const days = Math.ceil((release - now) / DAY_MS);
    return {
      state: "coming-soon",
      canBuy: false,
      badge: "Coming soon",
      cta: "Notify me at launch",
      reason: `Available from ${formatDate(p.releaseAt as string)}.`,
      offerRestockAlert: false,
      offerLaunchAlert: true,
      daysUntilRelease: days,
    };
  }

  const soldOut = p.available === false || (typeof p.stock === "number" && p.stock <= 0);
  if (soldOut) {
    return {
      state: "sold-out",
      canBuy: false,
      badge: "Out of stock",
      cta: "Out of stock",
      reason: "This is temporarily out of stock. We can email you the moment it is back.",
      offerRestockAlert: true,
      offerLaunchAlert: false,
      daysUntilRelease: null,
    };
  }

  return {
    state: "available",
    canBuy: true,
    badge: null,
    cta: "Add to cart",
    reason: null,
    offerRestockAlert: false,
    offerLaunchAlert: false,
    daysUntilRelease: null,
  };
}

/** True when the product cannot be bought, for whatever reason. */
export function cannotBuy(p: AvailabilityInput, now?: number): boolean {
  return !productAvailability(p, now).canBuy;
}

/** In stock but nearly gone. Never true for something that has not launched. */
export function isLowStockNow(p: AvailabilityInput, threshold = 5, now?: number): boolean {
  const a = productAvailability(p, now);
  return a.state === "available" && typeof p.stock === "number" && p.stock > 0 && p.stock <= threshold;
}
