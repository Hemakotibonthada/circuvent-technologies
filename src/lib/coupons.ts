// Circuvent shop — coupon / discount engine (server-authoritative).
// Coupon definitions live in the store (admin-managed); see src/lib/store.ts.
import { formatINR } from "./shop-data";
import { getActiveCoupon } from "./store";

export interface CouponResult {
  valid: boolean;
  code: string;
  discount: number;
  label: string;
  message?: string;
}

export function validateCoupon(code: string, subtotal: number, shipping: number): CouponResult {
  const norm = String(code || "").trim().toUpperCase();
  const c = getActiveCoupon(norm);
  if (!c) return { valid: false, code: norm, discount: 0, label: "", message: "That coupon code isn't valid." };
  if (c.minSubtotal && subtotal < c.minSubtotal) {
    return {
      valid: false,
      code: c.code,
      discount: 0,
      label: c.label,
      message: `Add ${formatINR(c.minSubtotal - subtotal)} more to use ${c.code}.`,
    };
  }
  let discount = 0;
  if (c.type === "percent") discount = Math.round((subtotal * c.value) / 100);
  else if (c.type === "flat") discount = Math.min(c.value, subtotal);
  else if (c.type === "shipping") discount = shipping;
  return { valid: true, code: c.code, discount, label: c.label };
}
