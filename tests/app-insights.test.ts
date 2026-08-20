import {
  failureGroups,
  failureKey,
  journeys,
  normaliseEvent,
  pathStats,
  redact,
  summarise,
  trimStack,
  withinHours,
  type TelemetryEvent,
} from "@/lib/app-insights";

const T = (mins: number) => new Date(Date.UTC(2026, 0, 2, 12, 0, 0) + mins * 60_000).toISOString();
const NOW = T(0);

function ev(over: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    id: Math.random().toString(36).slice(2),
    kind: "pageview",
    at: T(-1),
    path: "/smarthome",
    session: "s1",
    durationMs: 100,
    status: 200,
    ok: true,
    source: "web",
    ...over,
  };
}

describe("ingesting a beacon", () => {
  const ctx = { now: NOW, session: "sess", source: "web" };

  /*
   * This endpoint has to be unauthenticated — a crash on the login page still
   * needs reporting — which means everything arriving here arrives from
   * anybody. Every field is treated as hostile.
   */
  it.each([[null], [undefined], ["string"], [42], [{}], [{ kind: "nope" }]])(
    "rejects %p rather than storing a half-event",
    (bad) => {
      expect(normaliseEvent(bad, ctx)).toBeNull();
    }
  );

  it("stamps the server's time, not the client's", () => {
    /*
     * A device with a clock a month out would otherwise silently empty every
     * window, and the symptom — "telemetry stopped" — points at the collector.
     */
    const e = normaliseEvent({ kind: "pageview", path: "/x", at: "1999-01-01T00:00:00Z" }, ctx)!;
    expect(e.at).toBe(NOW);
  });

  it("clamps absurd durations and statuses", () => {
    const e = normaliseEvent({ kind: "request", path: "/x", durationMs: 1e12, status: 99999 }, ctx)!;
    expect(e.durationMs).toBeLessThanOrEqual(600_000);
    expect(e.status).toBeLessThanOrEqual(599);

    const neg = normaliseEvent({ kind: "request", path: "/x", durationMs: -5, status: -5 }, ctx)!;
    expect(neg.durationMs).toBe(0);
    expect(neg.status).toBe(0);
  });

  it("truncates a path rather than storing a megabyte of it", () => {
    const e = normaliseEvent({ kind: "pageview", path: "/" + "a".repeat(5000) }, ctx)!;
    expect(e.path.length).toBeLessThanOrEqual(200);
  });

  it("derives ok from the status", () => {
    expect(normaliseEvent({ kind: "request", path: "/x", status: 200 }, ctx)!.ok).toBe(true);
    expect(normaliseEvent({ kind: "request", path: "/x", status: 404 }, ctx)!.ok).toBe(false);
    expect(normaliseEvent({ kind: "request", path: "/x", status: 500 }, ctx)!.ok).toBe(false);
  });

  it("treats every exception as a failure whatever the status says", () => {
    const e = normaliseEvent({ kind: "exception", path: "/x", status: 200 }, ctx)!;
    expect(e.ok).toBe(false);
  });

  it("never takes the session from the client", () => {
    /* The client could otherwise claim to be anybody, and the sessions column
       would be attacker-controlled. */
    const e = normaliseEvent({ kind: "pageview", path: "/x", session: "someone-else" }, ctx)!;
    expect(e.session).toBe("sess");
  });
});

describe("redaction", () => {
  /*
   * Exception messages are written by developers for developers and routinely
   * contain whatever was in scope. This panel is visible to admin roles that
   * have no business reading a customer's email, and a crash report is a poor
   * reason to widen that.
   */
  it.each([
    ["failed for ada@example.com", "[email]"],
    ["token=abc123def456ghi789", "[redacted]"],
    ["password: hunter2", "[redacted]"],
    ["id 0123456789abcdef0123456789abcdef", "[hex]"],
  ])("scrubs %p", (input, expected) => {
    expect(redact(input)).toContain(expected);
  });

  it("scrubs a JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnop";
    expect(redact(`auth failed ${jwt}`)).not.toContain("eyJzdWIiOiIxIn0");
  });

  it("keeps the useful part of the message", () => {
    expect(redact("Cannot read property 'id' of undefined")).toContain("Cannot read property");
  });

  it("caps the length", () => {
    expect(redact("x".repeat(5000)).length).toBeLessThanOrEqual(500);
  });

  it("survives non-strings", () => {
    expect(redact(null)).toBe("");
    expect(redact(undefined)).toBe("");
    expect(redact({ a: 1 })).toBe("[object Object]");
  });
});

describe("trimming stacks", () => {
  it("keeps the top frames and drops the rest", () => {
    const stack = ["Error: boom", ...Array.from({ length: 50 }, (_, i) => `    at frame${i} (file.js:${i})`)].join("\n");
    const trimmed = trimStack(stack, 6);
    expect(trimmed).toContain("frame0");
    expect(trimmed).not.toContain("frame40");
  });

  it("survives a non-string", () => {
    expect(trimStack(undefined)).toBe("");
    expect(trimStack(123)).toBe("");
  });
});

describe("grouping failures", () => {
  /*
   * The point of grouping: most messages carry an id, so grouping on raw text
   * gives one group per occurrence and the "distinct failures" list becomes a
   * log. Type + route + top frame is stable across occurrences.
   */
  it("collapses the same bug reported with different ids in the message", () => {
    const stack = "Error\n    at loadDevice (device.ts:42)";
    const a = ev({ kind: "exception", ok: false, errorType: "TypeError", errorMessage: "device abc123 not found", stack, path: "/d" });
    const b = ev({ kind: "exception", ok: false, errorType: "TypeError", errorMessage: "device zzz999 not found", stack, path: "/d" });
    expect(failureKey(a)).toBe(failureKey(b));
    expect(failureGroups([a, b])).toHaveLength(1);
    expect(failureGroups([a, b])[0].count).toBe(2);
  });

  it("keeps genuinely different faults of the same type apart", () => {
    const a = ev({ kind: "exception", ok: false, errorType: "TypeError", stack: "Error\n    at one (a.ts:1)", path: "/a" });
    const b = ev({ kind: "exception", ok: false, errorType: "TypeError", stack: "Error\n    at two (b.ts:2)", path: "/b" });
    expect(failureGroups([a, b])).toHaveLength(2);
  });

  it("counts affected sessions distinctly from occurrences", () => {
    /* One person hitting refresh is not an outage. */
    const base = { kind: "exception" as const, ok: false, errorType: "E", stack: "Error\n    at x (a.ts:1)", path: "/p" };
    const groups = failureGroups([ev({ ...base, session: "s1" }), ev({ ...base, session: "s1" }), ev({ ...base, session: "s2" })]);
    expect(groups[0].count).toBe(3);
    expect(groups[0].sessions).toBe(2);
  });

  it("tracks first and last seen", () => {
    const base = { kind: "exception" as const, ok: false, errorType: "E", stack: "Error\n    at x (a.ts:1)", path: "/p" };
    const g = failureGroups([ev({ ...base, at: T(-10) }), ev({ ...base, at: T(-1) }), ev({ ...base, at: T(-30) })])[0];
    expect(g.firstSeen).toBe(T(-30));
    expect(g.lastSeen).toBe(T(-1));
  });

  it("counts a failed request as a failure even without an exception", () => {
    expect(failureGroups([ev({ kind: "request", ok: false, status: 500 })])).toHaveLength(1);
  });

  it("ignores successes", () => {
    expect(failureGroups([ev({ ok: true }), ev({ ok: true })])).toHaveLength(0);
  });
});

describe("path statistics", () => {
  it("separates views from sessions", () => {
    const stats = pathStats([
      ev({ path: "/a", session: "s1" }),
      ev({ path: "/a", session: "s1" }),
      ev({ path: "/a", session: "s2" }),
    ]);
    expect(stats[0].views).toBe(3);
    expect(stats[0].sessions).toBe(2);
  });

  it("orders by traffic", () => {
    const stats = pathStats([ev({ path: "/quiet" }), ev({ path: "/busy" }), ev({ path: "/busy" })]);
    expect(stats[0].path).toBe("/busy");
  });

  it("reports a failure rate per path", () => {
    const stats = pathStats([
      ev({ path: "/a", ok: true }),
      ev({ path: "/a", ok: false, status: 500 }),
      ev({ path: "/a", ok: true }),
      ev({ path: "/a", ok: true }),
    ]);
    expect(stats[0].failures).toBe(1);
    expect(stats[0].failureRate).toBe(25);
  });

  /* Nearest-rank: with few samples an interpolating percentile reports a
     duration that never happened, next to a table listing every request. */
  it("reports a percentile that actually occurred", () => {
    const durations = [10, 20, 30, 40, 1000];
    const stats = pathStats(durations.map((d) => ev({ path: "/a", durationMs: d })));
    expect(durations).toContain(stats[0].p95);
    expect(stats[0].p95).toBe(1000);
  });

  it("excludes exceptions from view counts", () => {
    const stats = pathStats([ev({ path: "/a" }), ev({ path: "/a", kind: "exception", ok: false })]);
    expect(stats[0].views).toBe(1);
  });

  it("is empty for no events", () => {
    expect(pathStats([])).toEqual([]);
  });
});

describe("journeys", () => {
  it("reconstructs the order a session moved through", () => {
    const j = journeys([
      ev({ session: "s1", path: "/c", at: T(-1) }),
      ev({ session: "s1", path: "/a", at: T(-3) }),
      ev({ session: "s1", path: "/b", at: T(-2) }),
    ]);
    expect(j[0].steps.map((s) => s.path)).toEqual(["/a", "/b", "/c"]);
  });

  /* The question this panel exists to answer is "what were they doing when it
     broke", so the broken ones come first. */
  it("puts failed journeys first", () => {
    const j = journeys([
      ev({ session: "ok", at: T(-1) }),
      ev({ session: "bad", at: T(-9), ok: false, status: 500 }),
    ]);
    expect(j[0].session).toBe("bad");
    expect(j[0].failed).toBe(true);
  });

  it("ignores events with no session", () => {
    expect(journeys([ev({ session: "" })])).toHaveLength(0);
  });

  it("caps how many it returns", () => {
    const many = Array.from({ length: 200 }, (_, i) => ev({ session: `s${i}` }));
    expect(journeys(many, 25)).toHaveLength(25);
  });
});

describe("windowing", () => {
  it("keeps only what is inside the window, newest first", () => {
    const events = [ev({ at: T(-10) }), ev({ at: T(-200) }), ev({ at: T(-1) })];
    const got = withinHours(events, 1, NOW);
    expect(got).toHaveLength(2);
    expect(got[0].at).toBe(T(-1));
  });

  it("is empty when nothing is recent", () => {
    expect(withinHours([ev({ at: T(-10_000) })], 1, NOW)).toHaveLength(0);
  });
});

describe("the summary", () => {
  it("counts each kind and the distinct sessions", () => {
    const s = summarise(
      [
        ev({ kind: "pageview", session: "a" }),
        ev({ kind: "request", session: "a" }),
        ev({ kind: "exception", session: "b", ok: false }),
      ],
      24,
      NOW
    );
    expect(s.pageViews).toBe(1);
    expect(s.requests).toBe(1);
    expect(s.exceptions).toBe(1);
    expect(s.sessions).toBe(2);
    expect(s.failureRate).toBeCloseTo(33.3, 0);
  });

  it("produces a series even with no events, so the chart has an axis", () => {
    const s = summarise([], 24, NOW);
    expect(s.series.length).toBeGreaterThan(0);
    expect(s.series.every((b) => b.count === 0)).toBe(true);
    expect(s.failureRate).toBe(0);
  });

  it("puts events in the right bucket", () => {
    const s = summarise([ev({ at: T(-5) })], 24, NOW);
    expect(s.series.reduce((n, b) => n + b.count, 0)).toBe(1);
    /* Recent events belong at the end, which is where the eye goes. */
    expect(s.series[s.series.length - 1].count).toBe(1);
  });

  it("returns the series oldest first", () => {
    const s = summarise([], 24, NOW);
    const times = s.series.map((b) => new Date(b.at).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

/**
 * Who is allowed to declare a non-2xx response healthy.
 *
 * This is the pair of rules that broke the availability board: a synthetic
 * check designed to pass on HTTP 400 was being stored as a failure, because
 * `ok` was recomputed from the status and the probe's own verdict discarded.
 */
describe("normaliseEvent — trusting a declared outcome", () => {
  const probeCtx = { now: NOW, session: "probe:synthetic", source: "probe" };
  const beaconCtx = { now: NOW, session: "sess", source: "web" };

  /*
   * The storefront<->console SSO check expects 400: that is the federation
   * endpoint rejecting an empty body, and so proof the feature is switched on.
   * A 404 would be the alarm. Storing this as a failure produced red rows and
   * a depressed availability figure for a dependency that was healthy.
   */
  it("believes a probe that says a 400 was the expected answer", () => {
    const e = normaliseEvent(
      { kind: "dependency", path: "/auth/federated", method: "POST", status: 400, ok: true },
      probeCtx
    )!;
    expect(e.ok).toBe(true);
    expect(e.status).toBe(400);
  });

  it("still believes a probe that reports a genuine failure", () => {
    const e = normaliseEvent(
      { kind: "dependency", path: "/auth/federated", status: 500, ok: false },
      probeCtx
    )!;
    expect(e.ok).toBe(false);
  });

  /*
   * The defence that must not regress. /api/telemetry is unauthenticated, so
   * if a browser's own `ok` were believed, any page could report its 500s as
   * successes and flatten the failure rate to nothing.
   */
  it("does not let an unauthenticated beacon call its own 500 a success", () => {
    const e = normaliseEvent({ kind: "request", path: "/checkout", status: 500, ok: true }, beaconCtx)!;
    expect(e.ok).toBe(false);
  });

  it("keeps deriving from status when a probe declares nothing", () => {
    expect(normaliseEvent({ kind: "dependency", path: "/x", status: 503 }, probeCtx)!.ok).toBe(false);
    expect(normaliseEvent({ kind: "dependency", path: "/x", status: 204 }, probeCtx)!.ok).toBe(true);
  });

  it("never calls an exception healthy, whoever reports it", () => {
    const e = normaliseEvent({ kind: "exception", path: "/x", status: 200, ok: true }, probeCtx)!;
    expect(e.ok).toBe(false);
  });
});
