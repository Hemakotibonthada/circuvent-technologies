import { visitorTracker } from "./visitor-tracker";

/**
 * Aggregation behaviour.
 *
 * Exercised through the in-memory fallback, which is the path taken when no
 * DATABASE_URL is configured — so this covers local development directly and
 * the shape of the report everywhere. The SQL path computes the same figures
 * with the same definitions; what is pinned here is what those figures mean.
 */

const view = (path: string, visitorHash: string, extra: Record<string, unknown> = {}) => ({
  path,
  visitorHash,
  referrerHost: null,
  device: "desktop",
  browser: "Chrome",
  country: null,
  ...extra,
});

describe("traffic aggregation", () => {
  beforeEach(() => {
    (visitorTracker as unknown as { _reset(): void })._reset();
  });

  it("counts views and unique visitors separately", async () => {
    // Three views from two people. Conflating these is the classic analytics
    // mistake — "visitors" that actually counts page loads.
    visitorTracker.record("a", view("/", "a"));
    visitorTracker.record("a", view("/about", "a"));
    visitorTracker.record("b", view("/", "b"));

    const s = await visitorTracker.summary(30);
    expect(s.views).toBe(3);
    expect(s.visitors).toBe(2);
  });

  it("ranks top pages by views and reports their unique visitors", async () => {
    visitorTracker.record("a", view("/shop", "a"));
    visitorTracker.record("b", view("/shop", "b"));
    visitorTracker.record("c", view("/shop", "c"));
    visitorTracker.record("a", view("/about", "a"));

    const s = await visitorTracker.summary(30);
    expect(s.topPages[0]).toEqual({ key: "/shop", views: 3, visitors: 3 });
    expect(s.topPages[1]).toEqual({ key: "/about", views: 1, visitors: 1 });
  });

  it("does not double-count one visitor in a page's unique total", async () => {
    visitorTracker.record("a", view("/shop", "a"));
    visitorTracker.record("a", view("/shop", "a"));
    visitorTracker.record("a", view("/shop", "a"));

    const s = await visitorTracker.summary(30);
    expect(s.topPages[0]).toEqual({ key: "/shop", views: 3, visitors: 1 });
  });

  it("labels absent referrers as direct rather than dropping them", async () => {
    // A report where the numbers do not add up to the total is worse than one
    // with an ugly category in it.
    visitorTracker.record("a", view("/", "a", { referrerHost: "google.com" }));
    visitorTracker.record("b", view("/", "b", { referrerHost: null }));
    visitorTracker.record("c", view("/", "c", { referrerHost: null }));

    const s = await visitorTracker.summary(30);
    const direct = s.referrers.find((r) => r.key === "(direct)");
    expect(direct?.views).toBe(2);
    expect(s.referrers.reduce((t, r) => t + r.views, 0)).toBe(s.views);
  });

  it("excludes bots from the headline figures but still counts them", async () => {
    visitorTracker.record("a", view("/", "a"));
    visitorTracker.record("bot1", view("/", "bot1", { device: "bot" }));
    visitorTracker.record("bot2", view("/", "bot2", { device: "bot" }));

    const clean = await visitorTracker.summary(30);
    expect(clean.views).toBe(1);
    // The crawler traffic is still visible, so "why is this lower than my
    // server logs" has an answer on the same screen.
    expect(clean.devices.find((d) => d.key === "bot")?.views).toBe(2);

    const withBots = await visitorTracker.summary(30, true);
    expect(withBots.views).toBe(3);
  });

  it("breaks the audience down by device and browser", async () => {
    visitorTracker.record("a", view("/", "a", { device: "mobile", browser: "Safari" }));
    visitorTracker.record("b", view("/", "b", { device: "mobile", browser: "Chrome" }));
    visitorTracker.record("c", view("/", "c", { device: "desktop", browser: "Chrome" }));

    const s = await visitorTracker.summary(30);
    expect(s.devices.find((d) => d.key === "mobile")?.visitors).toBe(2);
    expect(s.browsers.find((b) => b.key === "Chrome")?.visitors).toBe(2);
  });

  it("produces a series the chart can draw", async () => {
    visitorTracker.record("a", view("/", "a"));
    visitorTracker.record("b", view("/", "b"));

    const s = await visitorTracker.summary(30);
    expect(s.series.length).toBeGreaterThan(0);
    expect(s.series.reduce((t, p) => t + p.views, 0)).toBe(s.views);
    // Buckets must be parseable timestamps, or the axis renders as Invalid Date.
    for (const p of s.series) expect(Number.isNaN(Date.parse(p.bucket))).toBe(false);
  });

  it("reports live presence per path", async () => {
    visitorTracker.record("a", view("/shop", "a"));
    visitorTracker.record("b", view("/shop", "b"));
    visitorTracker.record("c", view("/about", "c"));

    const live = visitorTracker.liveSnapshot();
    expect(live.active).toBe(3);
    expect(live.activeByPath[0]).toEqual({ path: "/shop", visitors: 2 });
  });

  it("moves a visitor rather than counting them on two pages at once", async () => {
    visitorTracker.record("a", view("/", "a"));
    visitorTracker.record("a", view("/about", "a"));

    const live = visitorTracker.liveSnapshot();
    expect(live.active).toBe(1);
    expect(live.activeByPath).toEqual([{ path: "/about", visitors: 1 }]);
  });

  it("drops a visitor who has left", async () => {
    visitorTracker.record("a", view("/", "a"));
    expect(visitorTracker.liveSnapshot().active).toBe(1);
    visitorTracker.leave("a");
    expect(visitorTracker.liveSnapshot().active).toBe(0);
  });

  it("keeps the legacy snapshot the monitoring tiles read", async () => {
    // Those panels are not part of this change; breaking their shape would
    // blank three tiles elsewhere in the admin.
    visitorTracker.record("a", view("/shop", "a"));
    const snap = visitorTracker.getSnapshot();
    expect(snap.totalActive).toBe(1);
    expect(snap.totalViewsAllTime).toBe(1);
    expect(snap.pageStats[0].page).toBe("/shop");
    expect(typeof snap.uptimeSince).toBe("string");
  });

  it("releases an SSE client when asked", () => {
    // The stream route used to pass the cancellation reason here instead of
    // the controller, so nothing was ever released.
    const fake = { enqueue() {} } as unknown as ReadableStreamDefaultController;
    const t = visitorTracker as unknown as { _sseCount(): number };
    visitorTracker.addSSEClient(fake);
    expect(t._sseCount()).toBe(1);
    visitorTracker.removeSSEClient(fake);
    expect(t._sseCount()).toBe(0);
  });
});
