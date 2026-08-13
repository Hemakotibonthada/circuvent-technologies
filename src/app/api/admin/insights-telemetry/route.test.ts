/**
 * @jest-environment node
 *
 * jsdom has no Request/Response, so importing a route handler there fails
 * before the first assertion. See the availability probe test for the same note.
 */
import { GET } from "./route";
import { clearTelemetry, ingest } from "@/lib/telemetry-store";

/*
 * The guard is faked rather than exercised: this file is about the explorer's
 * parameter handling, and admin-auth has its own suite. What must be proved
 * here is that the guard is consulted at all — hence the "forbidden" case.
 */
let allowed = true;
jest.mock("@/lib/admin-auth", () => ({
  guard: () => (allowed ? { email: "ops@circuvent.com" } : null),
}));

const req = (qs: string) =>
  new Request(`https://circuvent.com/api/admin/insights-telemetry${qs}`);

const seed = (n: number, over: Record<string, unknown> = {}) => {
  // ingest caps a call at 50, which is also how a real browser reports.
  for (let i = 0; i < Math.ceil(n / 40); i++) {
    ingest(
      Array.from({ length: Math.min(40, n - i * 40) }, () => ({
        kind: "request",
        path: "/api/devices",
        method: "GET",
        status: 200,
        ok: true,
        durationMs: 120,
        ...over,
      })),
      { session: "s1", source: "web", now: new Date(Date.now() - 60_000).toISOString() }
    );
  }
};

describe("insights telemetry route", () => {
  beforeEach(() => {
    allowed = true;
    clearTelemetry();
  });

  it("refuses without an admin session", async () => {
    allowed = false;
    expect((await GET(req("?hours=24"))).status).toBe(403);
    expect((await GET(req("?metric=count"))).status).toBe(403);
  });

  it("returns the panel view when no metric is asked for", async () => {
    seed(10);
    const body = await (await GET(req("?hours=24"))).json();

    expect(body.success).toBe(true);
    expect(body.summary).toBeDefined();
    // The explorer's shape must not leak into the panel's response.
    expect(body.series).toBeUndefined();
  });

  it("returns a metric series when one is asked for", async () => {
    seed(10);
    const body = await (await GET(req("?metric=count&hours=24"))).json();

    expect(body.success).toBe(true);
    expect(body.metric).toBe("count");
    expect(body.series).toHaveLength(1);
    expect(body.series[0].total).toBe(10);
    expect(body.bucketMinutes).toBe(15);
    // The panel's own aggregates must not be computed for an explorer call.
    expect(body.summary).toBeUndefined();
  });

  it("splits when asked", async () => {
    seed(10, { path: "/api/a" });
    seed(4, { path: "/api/b" });
    const body = await (await GET(req("?metric=count&splitBy=path&hours=24"))).json();

    expect(body.splitBy).toBe("path");
    expect(body.series.map((s: { key: string }) => s.key)).toEqual(["/api/a", "/api/b"]);
  });

  it("rejects a metric it does not implement rather than silently defaulting", async () => {
    const res = await GET(req("?metric=dropTable"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Unknown metric");
  });

  it("rejects an unknown split", async () => {
    const res = await GET(req("?metric=count&splitBy=password"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Unknown split");
  });

  it("clamps the window rather than trusting it", async () => {
    // 100000 hours of 1-minute buckets is a denial of service on ourselves.
    const body = await (await GET(req("?metric=count&hours=100000"))).json();
    expect(body.hours).toBe(168);
  });

  it("ignores an out-of-range bucket size and picks one for the window", async () => {
    seed(4);
    const body = await (await GET(req("?metric=count&hours=24&bucketMinutes=0"))).json();
    expect(body.bucketMinutes).toBe(15);

    const huge = await (await GET(req("?metric=count&hours=24&bucketMinutes=99999"))).json();
    expect(huge.bucketMinutes).toBe(15);
  });

  it("honours a sane explicit bucket size", async () => {
    seed(4);
    const body = await (await GET(req("?metric=count&hours=24&bucketMinutes=60"))).json();
    expect(body.bucketMinutes).toBe(60);
  });

  it("caps how many series it will return", async () => {
    for (let i = 0; i < 10; i++) seed(4, { path: `/api/p${i}` });
    const body = await (await GET(req("?metric=count&splitBy=path&hours=24&topN=3"))).json();

    expect(body.series).toHaveLength(3);
    expect(body.truncated).toBe(7);
  });
});

describe("sweep recency", () => {
  /* The cleanup above belongs to the other describe, so this needs its own —
     otherwise the probe events seeded here leak into the test that asserts
     none exist, and it fails for a reason that has nothing to do with it. */
  beforeEach(() => {
    allowed = true;
    clearTelemetry();
  });

  it("reports null when the scheduled sweep has never run", async () => {
    seed(5);
    const body = await (await GET(req("?hours=24"))).json();

    /*
     * The distinction the whole banner rests on: ordinary page telemetry is
     * present, and that must not be mistaken for the sweep having run.
     */
    expect(body.summary.totalEvents).toBeGreaterThan(0);
    expect(body.lastSweepAt).toBeNull();
  });

  it("reports the most recent probe event once the sweep has run", async () => {
    const older = new Date(Date.now() - 3 * 3600_000).toISOString();
    const newer = new Date(Date.now() - 60_000).toISOString();

    ingest([{ kind: "dependency", target: "control-plane", path: "/health", method: "GET", status: 200, ok: true, durationMs: 5 }], {
      session: "probe:availability",
      source: "probe",
      now: older,
    });
    ingest([{ kind: "dependency", target: "office-api", path: "/office-api/api/health", method: "GET", status: 200, ok: true, durationMs: 9 }], {
      session: "probe:synthetic",
      source: "probe",
      now: newer,
    });

    const body = await (await GET(req("?hours=24"))).json();
    expect(body.lastSweepAt).toBe(newer);
  });

  it("does not count ordinary browser telemetry as a sweep", async () => {
    seed(20);
    ingest([{ kind: "pageview", path: "/smarthome", status: 0, ok: true, durationMs: 0 }], {
      session: "someone",
      source: "web",
    });

    expect((await (await GET(req("?hours=24"))).json()).lastSweepAt).toBeNull();
  });
});