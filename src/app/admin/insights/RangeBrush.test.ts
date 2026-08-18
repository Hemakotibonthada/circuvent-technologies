import { FULL_RANGE, isFullRange, sliceFor, withinRange, type BrushRange } from "./RangeBrush";

/**
 * The brush's arithmetic.
 *
 * These four functions decide which checks are counted when somebody drags a
 * window over an availability chart, which means they decide what the "41%"
 * beside it says. An off-by-one at the edges is not a cosmetic bug here — it
 * moves a failure into or out of the window an operator is about to report.
 *
 * The component itself (dragging, handles, keyboard) is exercised in the
 * browser by e2e; this is the part worth pinning without a DOM.
 */

const range = (start: number, end: number): BrushRange => ({ start, end });

describe("isFullRange", () => {
  it("recognises an untouched brush", () => {
    expect(isFullRange(FULL_RANGE)).toBe(true);
  });

  it("tolerates floating-point drift at the edges", () => {
    /*
     * Dragging a handle to the far edge lands on 0.9999999 rather than 1, and
     * treating that as "narrowed" would recompute every table for a window
     * identical to the whole one — and label it "in the selected window",
     * which reads as though something was excluded.
     */
    expect(isFullRange(range(0.00005, 0.99995))).toBe(true);
  });

  it("knows a real narrowing from a full one", () => {
    expect(isFullRange(range(0.1, 1))).toBe(false);
    expect(isFullRange(range(0, 0.9))).toBe(false);
  });
});

describe("sliceFor", () => {
  it("returns the whole series when untouched", () => {
    expect(sliceFor(10, FULL_RANGE)).toEqual({ from: 0, to: 9 });
  });

  it("keeps at least one point when the window is tiny", () => {
    // An empty chart under a brush the user is actively dragging reads as data
    // loss rather than as a narrow selection.
    const { from, to } = sliceFor(100, range(0.5, 0.505));
    expect(to).toBeGreaterThanOrEqual(from);
  });

  it("widens outward rather than inward", () => {
    /*
     * floor on the start and ceil on the end. Rounding both inward would drop
     * the bucket at each edge — precisely the buckets somebody just dragged
     * the handle to include.
     */
    const { from, to } = sliceFor(101, range(0.105, 0.895));
    expect(from).toBe(10);
    expect(to).toBe(90);
  });

  it("survives an empty or single-point series", () => {
    expect(sliceFor(0, FULL_RANGE)).toEqual({ from: 0, to: 0 });
    expect(sliceFor(1, FULL_RANGE)).toEqual({ from: 0, to: 0 });
  });
});

describe("withinRange", () => {
  const first = Date.parse("2026-08-17T00:00:00.000Z");
  const last = Date.parse("2026-08-18T00:00:00.000Z");
  const at = (h: number) => new Date(first + h * 3_600_000).toISOString();

  it("includes everything when the brush is full", () => {
    for (const h of [0, 6, 12, 23]) {
      expect(withinRange(at(h), first, last, FULL_RANGE)).toBe(true);
    }
  });

  it("selects the dragged window", () => {
    // 06:00–12:00 of a 24h window.
    const r = range(0.25, 0.5);
    expect(withinRange(at(5), first, last, r)).toBe(false);
    expect(withinRange(at(6), first, last, r)).toBe(true);
    expect(withinRange(at(9), first, last, r)).toBe(true);
    expect(withinRange(at(12), first, last, r)).toBe(true);
    expect(withinRange(at(13), first, last, r)).toBe(false);
  });

  it("includes both boundaries", () => {
    /*
     * Inclusive on purpose. A check exactly on the handle is the one the user
     * dragged to, and excluding it makes the count change as the handle is
     * nudged by a pixel — which looks like the data is unstable.
     */
    const r = range(0.25, 0.5);
    expect(withinRange(at(6), first, last, r)).toBe(true);
    expect(withinRange(at(12), first, last, r)).toBe(true);
  });

  it("keeps a row rather than dropping it when the timestamp is unusable", () => {
    /*
     * Fails open. A malformed timestamp is a reason to show a row with a
     * caveat, not to silently remove a failed check from a failure count.
     */
    expect(withinRange("not a date", first, last, range(0.25, 0.5))).toBe(true);
  });

  it("keeps everything when the window has no span", () => {
    // One bucket, or a series where every point shares a timestamp: there is
    // no sub-window to select, so selecting one must not empty the table.
    expect(withinRange(at(3), first, first, range(0.4, 0.6))).toBe(true);
  });
});
