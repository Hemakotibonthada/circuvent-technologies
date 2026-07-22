// Circuvent shop — coupon / discount engine (server-authoritative).
import { formatINR } from "./shop-data";

export interface CouponResult {
  valid: boolean;
  code: string;
  discount: number;
  label: string;
  message?: string;
}

interface CouponDef {
  code: string;
  type: "percent" | "flat" | "shipping";
  value: number;
  minSubtotal?: number;
  label: string;
}

// Active discount codes. Percent = % off subtotal, flat = ₹ off, shipping = free shipping.
const COUPONS: CouponDef[] = [
  { code: "WELCOME10", type: "percent", value: 10, label: "10% off (welcome)" },
  { code: "CIRCU200", type: "flat", value: 200, minSubtotal: 1500, label: "₹200 off orders over ₹1,500" },
  { code: "FREESHIP", type: "shipping", value: 0, label: "Free shipping" },
];

export function validateCoupon(code: string, subtotal: number, shipping: number): CouponResult {
  const norm = String(code || "").trim().toUpperCase();
  const c = COUPONS.find((x) => x.code === norm);
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
