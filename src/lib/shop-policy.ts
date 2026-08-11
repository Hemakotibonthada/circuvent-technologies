// Commercial terms shown next to the buy button.
//
// These numbers are quoted to the shopper at the point of purchase, so they
// must agree with the policy pages that are the actual contract. They live here
// rather than inline in the component so there is one place to change them, and
// `shop-policy.test.ts` asserts the policy pages still state the same figures —
// editing /warranty alone will fail the build rather than silently leave the
// product page advertising terms the company no longer offers.

// Warranty length already had an owner in warranty.ts, which computes expiry
// dates for real orders. Re-exported rather than restated: a second copy is the
// duplication this module exists to remove.
export { WARRANTY_MONTHS } from "@/lib/warranty";

/** Return window from delivery, unused and in original packaging. Source: /returns-policy. */
export const RETURN_DAYS = 7;

export const POLICY_LINKS = {
  warranty: "/warranty",
  returns: "/returns-policy",
  shipping: "/shipping",
} as const;
