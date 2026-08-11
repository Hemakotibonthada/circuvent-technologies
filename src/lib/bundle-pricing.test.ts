import { applyBundles, bundlesForProduct, type BundleRule, type PricedItem } from "@/lib/bundle-pricing";

const rule = (over: Partial<BundleRule> = {}): BundleRule => ({
  id: "b1",
  name: "Starter kit",
  productIds: ["plug", "sensor"],
  bundlePrice: 2000,
  active: true,
  ...over,
});

const item = (id: string, price: number, qty = 1): PricedItem => ({ id, price, qty });

describe("applyBundles", () => {
  it("applies when every product is present and discounts the difference", () => {
    const r = applyBundles([item("plug", 1500), item("sensor", 1000)], [rule()]);
    expect(r.discount).toBe(500); // 2500 catalogue - 2000 bundle
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0]).toMatchObject({ id: "b1", times: 1, catalogTotal: 2500, savings: 500 });
  });

  it("does not apply when a product is missing", () => {
    expect(applyBundles([item("plug", 1500)], [rule()]).discount).toBe(0);
  });

  it("ignores inactive bundles", () => {
    const r = applyBundles([item("plug", 1500), item("sensor", 1000)], [rule({ active: false })]);
    expect(r.discount).toBe(0);
  });

  it("applies once per complete set", () => {
    const r = applyBundles([item("plug", 1500, 3), item("sensor", 1000, 2)], [rule()]);
    // Only two complete sets, limited by the sensor.
    expect(r.applied[0].times).toBe(2);
    expect(r.discount).toBe(1000);
  });

  /*
   * A bundle priced above the sum of its parts must never be applied silently.
   * Auto-applying it would *increase* the total, which no shopper would expect
   * and which would look like a pricing bug on the invoice.
   */
  it("never applies a bundle that costs more than buying separately", () => {
    const r = applyBundles([item("plug", 1500), item("sensor", 1000)], [rule({ bundlePrice: 3000 })]);
    expect(r.discount).toBe(0);
    expect(r.applied).toEqual([]);
  });

  it("does not apply a bundle worth exactly the catalogue total", () => {
    const r = applyBundles([item("plug", 1500), item("sensor", 1000)], [rule({ bundlePrice: 2500 })]);
    expect(r.discount).toBe(0);
  });

  it("requires two units when a bundle names the same product twice", () => {
    const two = rule({ productIds: ["plug", "plug"], bundlePrice: 2500 });
    expect(applyBundles([item("plug", 1500, 1)], [two]).discount).toBe(0);
    expect(applyBundles([item("plug", 1500, 2)], [two]).discount).toBe(500); // 3000 - 2500
  });

  it("does not apply a bundle naming a product no longer in the cart's catalogue", () => {
    // "ghost" has no price, so the catalogue total would be understated and the
    // saving overstated.
    const r = applyBundles([item("plug", 1500), item("sensor", 1000)], [rule({ productIds: ["plug", "ghost"] })]);
    expect(r.discount).toBe(0);
  });

  it("counts a shared product once and picks the better bundle", () => {
    const cheap = rule({ id: "cheap", name: "Cheap", productIds: ["plug", "sensor"], bundlePrice: 2400 }); // saves 100
    const rich = rule({ id: "rich", name: "Rich", productIds: ["plug", "sensor"], bundlePrice: 2000 }); // saves 500
    const r = applyBundles([item("plug", 1500), item("sensor", 1000)], [cheap, rich]);
    expect(r.applied.map((a) => a.id)).toEqual(["rich"]);
    expect(r.discount).toBe(500);
  });

  it("applies two different bundles when the cart supplies both", () => {
    const a = rule({ id: "a", productIds: ["plug", "sensor"], bundlePrice: 2000 });
    const b = rule({ id: "b", productIds: ["cam", "hub"], bundlePrice: 3000 });
    const r = applyBundles(
      [item("plug", 1500), item("sensor", 1000), item("cam", 2000), item("hub", 1500)],
      [a, b]
    );
    expect(r.discount).toBe(500 + 500);
    expect(r.applied.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty cart or no rules", () => {
    expect(applyBundles([], [rule()])).toEqual({ applied: [], discount: 0 });
    expect(applyBundles([item("plug", 1500)], [])).toEqual({ applied: [], discount: 0 });
  });

  it("ignores a bundle with no products rather than applying it to everything", () => {
    const r = applyBundles([item("plug", 1500)], [rule({ productIds: [], bundlePrice: 0 })]);
    expect(r.discount).toBe(0);
  });

  it("terminates when a bundle can be satisfied repeatedly", () => {
    // Guards the re-evaluation loop against spinning on a cart it never drains.
    const r = applyBundles([item("plug", 1500, 6), item("sensor", 1000, 6)], [rule()]);
    expect(r.applied[0].times).toBe(6);
    expect(r.discount).toBe(3000);
  });
});

describe("bundlesForProduct", () => {
  it("returns only active bundles containing the product", () => {
    const rules = [
      rule({ id: "in", productIds: ["plug", "sensor"] }),
      rule({ id: "out", productIds: ["cam"] }),
      rule({ id: "off", productIds: ["plug"], active: false }),
    ];
    expect(bundlesForProduct("plug", rules).map((r) => r.id)).toEqual(["in"]);
  });
});
