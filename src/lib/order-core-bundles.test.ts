/**
 * Integration cover for the bundle discount inside priceItems.
 *
 * bundle-pricing.test.ts proves the matching rules in isolation; this proves
 * they are actually wired into the function that decides what a customer is
 * charged. The two are worth keeping separate: the unit tests describe the
 * rules, and this one would fail if the rules were correct but never called —
 * which is the failure that would have shipped a bundle price to the storefront
 * while charging the catalogue total.
 */

jest.mock("nodemailer", () => ({ __esModule: true, default: { createTransport: () => ({}) } }));
jest.mock("resend", () => ({ Resend: class {} }));
jest.mock("@/lib/email-log", () => ({ recordEmail: () => {} }));

const listBundles = jest.fn();
const listProducts = jest.fn();
const validateCoupon = jest.fn();

jest.mock("@/lib/admin-bundles", () => ({ listBundles: () => listBundles() }));
jest.mock("@/lib/store", () => ({ listProducts: () => listProducts() }));
jest.mock("@/lib/coupons", () => ({ validateCoupon: (...a: unknown[]) => validateCoupon(...a) }));

import { priceItems } from "@/lib/order-core";

const PLUG = { id: "plug", slug: "plug", name: "Plug", price: 1000, stock: 50, available: true };
const MON = { id: "mon", slug: "mon", name: "Monitor", price: 1500, stock: 50, available: true };

const bundle = (over: Record<string, unknown> = {}) => ({
  id: "b1",
  name: "Starter kit",
  productIds: ["plug", "mon"],
  bundlePrice: 2200,
  active: true,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  listProducts.mockReturnValue([PLUG, MON]);
  listBundles.mockReturnValue([]);
  validateCoupon.mockReturnValue({ valid: false, code: "", discount: 0, label: "" });
});

const cart = [
  { id: "plug", slug: "plug", qty: 1 },
  { id: "mon", slug: "mon", qty: 1 },
];

describe("priceItems with bundles", () => {
  it("charges the catalogue total when no bundle applies", () => {
    const r = priceItems(cart);
    if (!r.ok) throw new Error(r.error);
    expect(r.subtotal).toBe(2500);
    expect(r.bundleDiscount).toBe(0);
    expect(r.total).toBe(2500 + r.shipping);
  });

  it("applies the bundle saving to the total", () => {
    listBundles.mockReturnValue([bundle()]);
    const r = priceItems(cart);
    if (!r.ok) throw new Error(r.error);
    expect(r.bundleDiscount).toBe(300); // 2500 - 2200
    expect(r.discount).toBe(300);
    expect(r.total).toBe(2500 + r.shipping - 300);
    expect(r.bundles).toHaveLength(1);
    expect(r.bundles[0]).toMatchObject({ name: "Starter kit", times: 1, savings: 300 });
  });

  it("leaves the subtotal at catalogue price so shipping is unaffected", () => {
    listBundles.mockReturnValue([bundle()]);
    const withBundle = priceItems(cart);
    listBundles.mockReturnValue([]);
    const without = priceItems(cart);
    if (!withBundle.ok || !without.ok) throw new Error("priced failed");
    // Qualifying for a bundle must not push the shopper back below the
    // free-shipping threshold; that would turn a saving into a penalty.
    expect(withBundle.subtotal).toBe(without.subtotal);
    expect(withBundle.shipping).toBe(without.shipping);
  });

  it("measures a coupon against the already-discounted subtotal", () => {
    listBundles.mockReturnValue([bundle()]);
    validateCoupon.mockReturnValue({ valid: true, code: "SAVE", discount: 100, label: "SAVE" });
    const r = priceItems(cart, "SAVE");
    if (!r.ok) throw new Error(r.error);
    // Stacking a percentage coupon on the undiscounted subtotal would give away
    // more than the basket is worth, so the coupon sees 2500 - 300.
    expect(validateCoupon).toHaveBeenCalledWith("SAVE", 2200, r.shipping);
    expect(r.discount).toBe(400);
    expect(r.bundleDiscount).toBe(300);
  });

  it("never discounts below the subtotal", () => {
    listBundles.mockReturnValue([bundle({ bundlePrice: 0 })]);
    const r = priceItems(cart);
    if (!r.ok) throw new Error(r.error);
    expect(r.bundleDiscount).toBeLessThanOrEqual(r.subtotal);
    expect(r.total).toBeGreaterThanOrEqual(0);
  });

  it("ignores an inactive bundle", () => {
    listBundles.mockReturnValue([bundle({ active: false })]);
    const r = priceItems(cart);
    if (!r.ok) throw new Error(r.error);
    expect(r.bundleDiscount).toBe(0);
  });

  it("does not apply a bundle when only part of it is in the cart", () => {
    listBundles.mockReturnValue([bundle()]);
    const r = priceItems([{ id: "plug", slug: "plug", qty: 1 }]);
    if (!r.ok) throw new Error(r.error);
    expect(r.bundleDiscount).toBe(0);
  });
});
