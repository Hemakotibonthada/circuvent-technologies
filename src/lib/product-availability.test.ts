import { productAvailability, cannotBuy, isLowStockNow } from "./product-availability";

const NOW = new Date("2026-06-01T00:00:00Z").getTime();
const iso = (s: string) => new Date(s).toISOString();

describe("productAvailability — a product that can be bought", () => {
  it("says so, with no badge and a normal call to action", () => {
    const a = productAvailability({ stock: 12, available: true }, NOW);
    expect(a.state).toBe("available");
    expect(a.canBuy).toBe(true);
    expect(a.badge).toBeNull();
    expect(a.cta).toBe("Add to cart");
  });
});

describe("productAvailability — coming soon", () => {
  it("is coming soon before its release date", () => {
    const a = productAvailability({ stock: 0, releaseAt: iso("2026-07-01T00:00:00Z") }, NOW);
    expect(a.state).toBe("coming-soon");
    expect(a.canBuy).toBe(false);
    expect(a.badge).toBe("Coming soon");
  });

  it("does NOT call an unreleased product out of stock", () => {
    // This is the whole point. An unlaunched product has no stock by
    // definition; reading that zero as "out of stock" tells the customer it
    // existed and ran out, which is untrue, and hides the useful message.
    const a = productAvailability({ stock: 0, available: false, releaseAt: iso("2026-07-01T00:00:00Z") }, NOW);
    expect(a.state).toBe("coming-soon");
    expect(a.badge).not.toMatch(/out of stock/i);
    expect(a.cta).not.toMatch(/out of stock/i);
  });

  it("offers a launch alert rather than a restock alert", () => {
    const a = productAvailability({ stock: 0, releaseAt: iso("2026-07-01T00:00:00Z") }, NOW);
    expect(a.offerLaunchAlert).toBe(true);
    expect(a.offerRestockAlert).toBe(false);
  });

  it("counts the days to launch", () => {
    const a = productAvailability({ stock: 5, releaseAt: iso("2026-06-11T00:00:00Z") }, NOW);
    expect(a.daysUntilRelease).toBe(10);
  });

  it("names the release date, so the badge is not the only information", () => {
    const a = productAvailability({ stock: 5, releaseAt: iso("2026-07-01T00:00:00Z") }, NOW);
    expect(a.reason).toContain("July");
  });

  it("becomes buyable by itself once the date passes", () => {
    // A date turns itself off; a flag waits for somebody to remember.
    const p = { stock: 5, releaseAt: iso("2026-07-01T00:00:00Z") };
    expect(productAvailability(p, NOW).canBuy).toBe(false);
    expect(productAvailability(p, new Date("2026-07-02T00:00:00Z").getTime()).canBuy).toBe(true);
  });

  it("is buyable exactly on the release moment", () => {
    const at = iso("2026-07-01T00:00:00Z");
    expect(productAvailability({ stock: 5, releaseAt: at }, new Date(at).getTime()).canBuy).toBe(true);
  });

  it("ignores a release date that is not a date", () => {
    expect(productAvailability({ stock: 5, releaseAt: "soon" }, NOW).state).toBe("available");
  });

  it("ignores a release date already in the past", () => {
    expect(productAvailability({ stock: 5, releaseAt: iso("2025-01-01T00:00:00Z") }, NOW).state).toBe("available");
  });
});

describe("productAvailability — sold out", () => {
  it("is sold out at zero stock", () => {
    const a = productAvailability({ stock: 0 }, NOW);
    expect(a.state).toBe("sold-out");
    expect(a.badge).toBe("Out of stock");
    expect(a.offerRestockAlert).toBe(true);
  });

  it("is sold out when explicitly unavailable, whatever the stock says", () => {
    expect(productAvailability({ stock: 40, available: false }, NOW).state).toBe("sold-out");
  });
});

describe("productAvailability — discontinued", () => {
  it("outranks everything, including remaining stock", () => {
    // A withdrawn product with stock left is still not for sale.
    const a = productAvailability({ stock: 20, available: true, discontinued: true }, NOW);
    expect(a.state).toBe("discontinued");
    expect(a.canBuy).toBe(false);
  });

  it("offers no alert, because it is not coming back", () => {
    const a = productAvailability({ stock: 0, discontinued: true }, NOW);
    expect(a.offerRestockAlert).toBe(false);
    expect(a.offerLaunchAlert).toBe(false);
  });

  it("outranks a future release date too", () => {
    const a = productAvailability({ stock: 0, discontinued: true, releaseAt: iso("2026-07-01T00:00:00Z") }, NOW);
    expect(a.state).toBe("discontinued");
  });
});

describe("cannotBuy", () => {
  it.each([
    ["sold out", { stock: 0 }],
    ["coming soon", { stock: 5, releaseAt: iso("2026-07-01T00:00:00Z") }],
    ["discontinued", { stock: 5, discontinued: true }],
  ])("refuses a %s product", (_label, p) => {
    expect(cannotBuy(p, NOW)).toBe(true);
  });

  it("allows an available product", () => {
    expect(cannotBuy({ stock: 5 }, NOW)).toBe(false);
  });
});

describe("isLowStockNow", () => {
  it("flags a nearly-gone product", () => {
    expect(isLowStockNow({ stock: 2 }, 5, NOW)).toBe(true);
  });

  it("never calls an unreleased product low stock", () => {
    // "Only 2 left" on something nobody can buy yet is manufactured urgency.
    expect(isLowStockNow({ stock: 2, releaseAt: iso("2026-07-01T00:00:00Z") }, 5, NOW)).toBe(false);
  });

  it("does not flag a sold-out product as low stock", () => {
    expect(isLowStockNow({ stock: 0 }, 5, NOW)).toBe(false);
  });
});
