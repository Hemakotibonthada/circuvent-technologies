// Whether a customer may still request a return, and what to tell them if not.
//
// /returns-policy promises "within 7 days of delivery" and the FAQ tells people
// to start a return from their account. Until now no such control existed, so
// the site was instructing customers to do something impossible. This decides
// when to offer it.
//
// The window runs from delivery, so it cannot open at all until the order has
// actually arrived — offering a return on something still in transit invites a
// request that has to be refused. warrantyStart already answers "when did the
// customer get this", including the awkward records that are marked delivered
// with no matching history event, so the same answer is reused here rather than
// a second, subtly different one being invented.

import { warrantyStart, type OrderLike } from "./warranty";
import { RETURN_DAYS } from "./shop-policy";

const DAY_MS = 86_400_000;

export type ReturnEligibilityState =
  | "eligible"
  | "not-delivered"
  | "window-closed"
  | "already-requested"
  | "cancelled";

export interface ReturnEligibility {
  state: ReturnEligibilityState;
  canRequest: boolean;
  /** Plain-language explanation, suitable for showing next to the order. */
  reason: string;
  /** Days left in the window, when one is open. */
  daysLeft?: number;
  /** Last date a request will be accepted, ISO. */
  closesAt?: string;
}

export interface ReturnContext {
  /** An existing return for this order that is not rejected. */
  existingStatus?: string | null;
  now?: number;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function returnEligibility(order: OrderLike, ctx: ReturnContext = {}): ReturnEligibility {
  const now = ctx.now ?? Date.now();

  // A request already in flight takes precedence over everything else: showing
  // "3 days left" beside a return that is already approved is just confusing.
  if (ctx.existingStatus && ctx.existingStatus !== "rejected") {
    return {
      state: "already-requested",
      canRequest: false,
      reason: `A return is already ${ctx.existingStatus} for this order.`,
    };
  }

  if (order.status === "cancelled") {
    return { state: "cancelled", canRequest: false, reason: "This order was cancelled, so there is nothing to return." };
  }

  const start = warrantyStart(order);
  // Only delivery opens the window. warrantyStart will fall back to dispatch,
  // which is the right answer for a warranty but not for a return: the clock
  // must not start while the parcel is still moving.
  if (!start || start.basis !== "delivered") {
    return {
      state: "not-delivered",
      canRequest: false,
      reason: "You can request a return once this order has been delivered.",
    };
  }

  const deliveredMs = new Date(start.at).getTime();
  if (Number.isNaN(deliveredMs)) {
    return { state: "not-delivered", canRequest: false, reason: "You can request a return once this order has been delivered." };
  }

  const closesMs = deliveredMs + RETURN_DAYS * DAY_MS;
  if (now > closesMs) {
    return {
      state: "window-closed",
      canRequest: false,
      reason: `The ${RETURN_DAYS}-day return window closed on ${formatDate(new Date(closesMs).toISOString())}.`,
      closesAt: new Date(closesMs).toISOString(),
    };
  }

  // Round up: with eight hours left a shopper has "1 day", not "0 days".
  const daysLeft = Math.max(1, Math.ceil((closesMs - now) / DAY_MS));
  return {
    state: "eligible",
    canRequest: true,
    reason: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left to request a return.`,
    daysLeft,
    closesAt: new Date(closesMs).toISOString(),
  };
}
