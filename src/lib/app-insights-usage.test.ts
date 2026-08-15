/**
 * Usage analytics.
 *
 * The funnel tests carry most of the weight. A funnel built on set
 * intersection rather than ordered traversal agrees with itself whatever the
 * steps are — it will happily report that people reach checkout before the
 * cart — so ordering is asserted directly rather than inferred from a total.
 */

import {
  DEFAULT_COHORTS,
  cohortStats,
  flowNodes,
  funnel,
  impact,
  returnBehaviour,
  sessionSummaries,
  usageBreakdown,
  usageOverTime,
  userFlows,
} from "./app-insights-usage";
import type { TelemetryEvent } from "./app-insights";

const NOW = "2026-03-10T12:00:00.000Z";
const at = (minutesAgo: number) => new Date(Date.parse(NOW) - minutesAgo * 60_000).toISOString();

let seq = 0;
function pv(session: string, path: string, minutesAgo: number, over: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    id: `e${seq++}`,
    kind: "pageview",
    at: at(minutesAgo),
    path,
    session,
    durationMs: 100,
    status: 200,
    ok: true,
    source: "web",
    ...over,
  };
}

/*
 * Three shoppers with different journeys:
 *  s1 browses shop → product → cart → checkout (converts)
 *  s2 browses shop → product → cart          (drops at checkout)
 *  s3 lands on checkout first, then shop      (out of order — must not convert)
 */
const SHOP: TelemetryEvent[] = [
  pv("s1", "/shop", 50),
  pv("s1", "/shop/[slug]", 45),
  pv("s1", "/cart", 40),
  pv("s1", "/checkout", 35),
  pv("s2", "/shop", 30),
  pv("s2", "/shop/[slug]", 28),
  pv("s2", "/cart", 26),
  pv("s3", "/checkout", 20),
  pv("s3", "/shop", 15),
];

const STEPS = [
  { label: "Shop", path: "/shop" },
  { label: "Product", path: "/shop/[slug]" },
  { label: "Cart", path: "/cart" },
  { label: "Checkout", path: "/checkout" },
];

describe("sessionSummaries", () => {
  it("rolls each session up once", () => {
    const s = sessionSummaries(SHOP);
    expect(s).toHaveLength(3);
    expect(s.map((x) => x.session).sort()).toEqual(["s1", "s2", "s3"]);
  });

  it("records the entry and exit route in time order", () => {
    const s1 = sessionSummaries(SHOP).find((x) => x.session === "s1")!;
    expect(s1.entryPath).toBe("/shop");
    expect(s1.exitPath).toBe("/checkout");
    expect(s1.routes).toBe(4);
  });

  it("measures the span of the session", () => {
    const s1 = sessionSummaries(SHOP).find((x) => x.session === "s1")!;
    expect(s1.durationMs).toBe(15 * 60_000);
  });

  it("orders events before reading them, whatever order they arrived in", () => {
    const shuffled = [...SHOP].reverse();
    const s1 = sessionSummaries(shuffled).find((x) => x.session === "s1")!;
    expect(s1.entryPath).toBe("/shop");
    expect(s1.exitPath).toBe("/checkout");
  });

  it("counts failures and the worst duration", () => {
    const events = [
      pv("x", "/a", 10, { durationMs: 50 }),
      pv("x", "/b", 9, { durationMs: 4000, ok: false }),
    ];
    const x = sessionSummaries(events)[0];
    expect(x.failures).toBe(1);
    expect(x.worstDurationMs).toBe(4000);
    expect(x.avgDurationMs).toBe(2025);
  });
});

describe("funnel", () => {
  it("counts each step and the drop-off between them", () => {
    const r = funnel(SHOP, STEPS);
    expect(r.steps.map((s) => s.sessions)).toEqual([3, 2, 2, 1]);
    expect(r.entered).toBe(3);
    expect(r.completed).toBe(1);
  });

  it("requires the steps to happen in order", () => {
    // s3 saw /checkout and /shop, but backwards. It enters at /shop and gets
    // no further, because its checkout was already behind the cursor.
    const r = funnel(SHOP, STEPS);
    const checkout = r.steps[3];
    expect(checkout.sessions).toBe(1);
  });

  it("does not let a later step be satisfied by an earlier event", () => {
    const backwards: TelemetryEvent[] = [pv("z", "/checkout", 20), pv("z", "/shop", 10)];
    const r = funnel(backwards, [
      { label: "Shop", path: "/shop" },
      { label: "Checkout", path: "/checkout" },
    ]);
    expect(r.steps[0].sessions).toBe(1);
    expect(r.steps[1].sessions).toBe(0);
    expect(r.completed).toBe(0);
  });

  it("computes conversion from the previous step and from the start", () => {
    const r = funnel(SHOP, STEPS);
    expect(r.steps[1].conversionFromPrevious).toBeCloseTo(2 / 3);
    expect(r.steps[3].conversionFromStart).toBeCloseTo(1 / 3);
    expect(r.overallConversion).toBeCloseTo(1 / 3);
  });

  it("reports where sessions were lost", () => {
    const r = funnel(SHOP, STEPS);
    expect(r.steps[1].droppedOff).toBe(1);
    expect(r.steps[3].droppedOff).toBe(1);
  });

  it("times the median gap between steps", () => {
    const r = funnel(SHOP, STEPS);
    expect(r.steps[0].medianMsFromPrevious).toBeNull();
    /*
     * s1 took 5 minutes shop→product and s2 took 2, so the gaps are [2m, 5m].
     * The median is 2 minutes, not 3.5: percentiles across this product are
     * nearest-rank and deliberately do not interpolate, because with a handful
     * of samples an interpolated median reports a gap that never happened.
     * Sharing app-insights.ts's `percentile` is what keeps this blade and the
     * Performance blade from disagreeing about the same data.
     */
    expect(r.steps[1].medianMsFromPrevious).toBe(2 * 60_000);
    expect(r.medianCompletionMs).toBe(15 * 60_000);
  });

  it("reports the median gap for one session as that session's gap", () => {
    const single: TelemetryEvent[] = [pv("only", "/a", 20), pv("only", "/b", 12)];
    const r = funnel(single, [
      { label: "A", path: "/a" },
      { label: "B", path: "/b" },
    ]);
    expect(r.steps[1].medianMsFromPrevious).toBe(8 * 60_000);
  });

  it("leaves the gap null when nobody reached the step", () => {
    const r = funnel(SHOP, [
      { label: "Shop", path: "/shop" },
      { label: "Nowhere", path: "/nowhere" },
    ]);
    expect(r.steps[1].sessions).toBe(0);
    expect(r.steps[1].medianMsFromPrevious).toBeNull();
  });

  it("supports prefix and contains matching", () => {
    const r = funnel(SHOP, [
      { label: "Any shop page", path: "/shop", match: "prefix" },
      { label: "Cart", path: "/cart" },
    ]);
    expect(r.steps[0].sessions).toBe(3);
    expect(r.steps[1].sessions).toBe(2);
  });

  it("returns nothing rather than guessing when given fewer than two steps", () => {
    expect(funnel(SHOP, [{ label: "Shop", path: "/shop" }]).steps).toEqual([]);
    expect(funnel(SHOP, []).entered).toBe(0);
  });

  it("ignores blank steps left behind in the editor", () => {
    const r = funnel(SHOP, [
      { label: "Shop", path: "/shop" },
      { label: "", path: "   " },
      { label: "Cart", path: "/cart" },
    ]);
    expect(r.steps).toHaveLength(2);
  });

  it("survives an empty buffer", () => {
    const r = funnel([], STEPS);
    expect(r.entered).toBe(0);
    expect(r.overallConversion).toBe(0);
  });
});

describe("userFlows", () => {
  it("reports what came before and after the node", () => {
    const r = userFlows(SHOP, "/cart");
    expect(r.incoming.map((e) => e.path)).toEqual(["/shop/[slug]"]);
    expect(r.outgoing.map((e) => e.path)).toEqual(["/checkout"]);
  });

  it("counts entries and exits", () => {
    const r = userFlows(SHOP, "/cart");
    expect(r.entries).toBe(0);
    expect(r.exits).toBe(1); // s2 stopped at the cart
    expect(r.exitRate).toBeCloseTo(0.5);
  });

  it("treats a first page view as an entry", () => {
    const r = userFlows(SHOP, "/checkout");
    expect(r.entries).toBe(1); // s3 landed there
  });

  it("excludes API traffic, which is the page loading itself", () => {
    const mixed = [
      ...SHOP,
      { ...pv("s1", "/api/shop/products", 44), kind: "request" as const },
    ];
    const r = userFlows(mixed, "/shop/[slug]");
    expect(r.outgoing.map((e) => e.path)).not.toContain("/api/shop/products");
  });

  it("shares add up across the edges", () => {
    const r = userFlows(SHOP, "/shop");
    const total = r.outgoing.reduce((a, e) => a + e.share, 0);
    expect(total).toBeCloseTo(1);
  });

  it("offers the busiest routes as nodes", () => {
    const nodes = flowNodes(SHOP);
    expect(nodes[0].path).toBe("/shop");
    expect(nodes[0].visits).toBe(3);
  });
});

describe("usageOverTime", () => {
  it("buckets sessions, events and page views", () => {
    const points = usageOverTime(SHOP, { hours: 2, now: NOW, bucketMinutes: 60 });
    const totals = points.reduce((a, p) => a + p.events, 0);
    expect(totals).toBe(SHOP.length);
    expect(points.every((p) => p.sessions <= 3)).toBe(true);
  });

  it("counts a session as new only in the bucket it first appeared in", () => {
    const points = usageOverTime(SHOP, { hours: 2, now: NOW, bucketMinutes: 60 });
    expect(points.reduce((a, p) => a + p.newSessions, 0)).toBe(3);
  });

  it("returns an unbroken axis even where nothing happened", () => {
    const points = usageOverTime([pv("s", "/a", 5)], { hours: 3, now: NOW, bucketMinutes: 60 });
    expect(points.length).toBeGreaterThanOrEqual(3);
    expect(points.some((p) => p.events === 0)).toBe(true);
  });

  it("ignores events outside the window", () => {
    const old = pv("ancient", "/a", 60 * 24 * 10);
    const points = usageOverTime([...SHOP, old], { hours: 2, now: NOW, bucketMinutes: 60 });
    expect(points.reduce((a, p) => a + p.events, 0)).toBe(SHOP.length);
  });
});

describe("usageBreakdown", () => {
  it("splits by an event property", () => {
    const r = usageBreakdown(SHOP, "path");
    expect(r[0].key).toBe("/shop");
    expect(r[0].events).toBe(3);
  });

  it("splits by entry path per session, not per event", () => {
    const r = usageBreakdown(SHOP, "entryPath");
    const shop = r.find((x) => x.key === "/shop")!;
    expect(shop.sessions).toBe(2); // s1 and s2 entered at /shop; s3 at /checkout
  });

  it("labels a missing property rather than dropping the row", () => {
    const r = usageBreakdown([pv("s", "/a", 5)], "userAgentClass");
    expect(r[0].key).toBe("(none)");
  });

  it("shares sum to one", () => {
    const r = usageBreakdown(SHOP, "path");
    expect(r.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1);
  });
});

describe("returnBehaviour", () => {
  it("counts a session that went quiet and came back", () => {
    const events = [pv("s", "/a", 200), pv("s", "/b", 195), pv("s", "/c", 10)];
    const r = returnBehaviour(events, { gapMinutes: 30 });
    expect(r.sessions).toBe(1);
    expect(r.returning).toBe(1);
    expect(r.returnRate).toBe(1);
  });

  it("does not count continuous activity as a return", () => {
    const events = [pv("s", "/a", 20), pv("s", "/b", 15), pv("s", "/c", 10)];
    expect(returnBehaviour(events, { gapMinutes: 30 }).returning).toBe(0);
  });

  it("respects the gap it was given", () => {
    const events = [pv("s", "/a", 60), pv("s", "/b", 10)];
    expect(returnBehaviour(events, { gapMinutes: 30 }).returning).toBe(1);
    expect(returnBehaviour(events, { gapMinutes: 120 }).returning).toBe(0);
  });

  it("counts a single page view as a bounce", () => {
    const r = returnBehaviour([pv("one", "/a", 5), ...SHOP], { gapMinutes: 30 });
    expect(r.bounced).toBe(1);
    expect(r.sessions).toBe(4);
  });

  it("buckets visit counts", () => {
    const r = returnBehaviour(SHOP);
    expect(r.buckets.reduce((a, b) => a + b.sessions, 0)).toBe(3);
  });

  it("survives an empty buffer", () => {
    const r = returnBehaviour([]);
    expect(r.sessions).toBe(0);
    expect(r.returnRate).toBe(0);
    expect(r.bounceRate).toBe(0);
  });
});

describe("impact", () => {
  const slowFast: TelemetryEvent[] = [
    // Two fast sessions, both convert.
    pv("f1", "/shop", 30, { durationMs: 100 }),
    pv("f1", "/checkout", 29, { durationMs: 120 }),
    pv("f2", "/shop", 28, { durationMs: 150 }),
    pv("f2", "/checkout", 27, { durationMs: 90 }),
    // Two slow sessions, neither converts.
    pv("s1", "/shop", 26, { durationMs: 6000 }),
    pv("s2", "/shop", 25, { durationMs: 7000 }),
  ];

  it("splits sessions by their slowest operation", () => {
    const r = impact(slowFast, { goalPath: "/checkout" });
    const fast = r.buckets.find((b) => b.lowMs === 0)!;
    const slow = r.buckets.find((b) => b.highMs === null)!;
    expect(fast.sessions).toBe(2);
    expect(slow.sessions).toBe(2);
  });

  it("reports conversion per bucket", () => {
    const r = impact(slowFast, { goalPath: "/checkout" });
    expect(r.buckets.find((b) => b.lowMs === 0)!.conversionRate).toBe(1);
    expect(r.buckets.find((b) => b.highMs === null)!.conversionRate).toBe(0);
  });

  it("reports the spread in percentage points", () => {
    const r = impact(slowFast, { goalPath: "/checkout" });
    expect(r.spreadPoints).toBe(100);
  });

  it("reports the overall baseline", () => {
    const r = impact(slowFast, { goalPath: "/checkout" });
    expect(r.sessions).toBe(4);
    expect(r.converted).toBe(2);
    expect(r.baseline).toBe(0.5);
  });

  it("survives an empty buffer", () => {
    const r = impact([], { goalPath: "/checkout" });
    expect(r.sessions).toBe(0);
    expect(r.spreadPoints).toBe(0);
  });
});

describe("cohortStats", () => {
  it("summarises a cohort against the whole population", () => {
    const cohort = { id: "c", name: "Cart", filter: 'path == "/cart"' };
    const matched = SHOP.filter((e) => e.path === "/cart");
    const r = cohortStats(cohort, matched, 3);
    expect(r.sessions).toBe(2);
    expect(r.events).toBe(2);
    expect(r.share).toBeCloseTo(2 / 3);
  });

  it("reports a failure rate", () => {
    const matched = [pv("a", "/x", 5, { ok: false }), pv("b", "/x", 4)];
    const r = cohortStats({ id: "c", name: "c", filter: "" }, matched, 2);
    expect(r.failureRate).toBe(0.5);
  });

  it("does not divide by zero on an empty cohort", () => {
    const r = cohortStats({ id: "c", name: "c", filter: "" }, [], 0);
    expect(r.sessions).toBe(0);
    expect(r.failureRate).toBe(0);
    expect(r.share).toBe(0);
  });

  it("ships cohorts that are valid filter expressions", () => {
    expect(DEFAULT_COHORTS.length).toBeGreaterThan(0);
    for (const c of DEFAULT_COHORTS) {
      expect(c.filter.trim().length).toBeGreaterThan(0);
      expect(c.id).toMatch(/^[a-z-]+$/);
    }
  });
});
