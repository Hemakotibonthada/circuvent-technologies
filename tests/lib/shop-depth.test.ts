/**
 * Catalogue depth restoration.
 *
 * The rule under test is small and the failure it prevents is not: the
 * catalogue must come back at the depth the shopper left it, and must never
 * come back *shallower* than the first page.
 *
 * The journey that breaks without it is the most ordinary one there is — load
 * more twice, open the twentieth product, press back. The list returns nine
 * items long, the product being looked at is not rendered, and the browser's
 * own scroll restoration cannot help because the page it restores into is a
 * third of the height it was.
 *
 * The logic is transcribed from ShopGrid rather than imported, because it
 * lives inside a component that needs a DOM, a cart and a filter context to
 * mount. What matters is the arithmetic, and testing it here keeps the rule
 * written down where somebody editing it will look.
 */

const PAGE_SIZE = 9;

/** Mirrors the restore effect in ShopGrid. */
function restoreDepth(saved: unknown, pageSize = PAGE_SIZE): number {
  const n = Number(saved);
  return Number.isFinite(n) && n > pageSize ? n : pageSize;
}

/** Mirrors the persist effect: only depths past the first page are stored. */
function shouldPersist(visible: number, pageSize = PAGE_SIZE): boolean {
  return visible > pageSize;
}

describe("restoring catalogue depth", () => {
  it("comes back at the depth the shopper left", () => {
    expect(restoreDepth("27")).toBe(27);
    expect(restoreDepth(18)).toBe(18);
  });

  /*
   * The asymmetry that matters. Restoring a *smaller* number than the default
   * would hide products the shopper has not seen — a stale entry silently
   * shrinking the catalogue is far worse than one that is simply ignored.
   */
  it("never restores less than the first page", () => {
    expect(restoreDepth("3")).toBe(PAGE_SIZE);
    expect(restoreDepth(0)).toBe(PAGE_SIZE);
    expect(restoreDepth(-50)).toBe(PAGE_SIZE);
  });

  it("ignores anything that is not a number", () => {
    // sessionStorage is a string store shared with everything else on the
    // origin, so it can contain absolutely anything.
    for (const junk of ["", "abc", null, undefined, "{}", NaN, Infinity]) {
      expect(restoreDepth(junk)).toBe(PAGE_SIZE);
    }
  });

  it("treats an exactly-first-page value as nothing to restore", () => {
    expect(restoreDepth(PAGE_SIZE)).toBe(PAGE_SIZE);
  });
});

describe("persisting catalogue depth", () => {
  it("writes nothing until the shopper has paged past the first screen", () => {
    // Storing the default would leave an entry for every filter combination
    // ever viewed, all of them saying "the default".
    expect(shouldPersist(PAGE_SIZE)).toBe(false);
    expect(shouldPersist(PAGE_SIZE + 9)).toBe(true);
  });
});
