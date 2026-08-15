/**
 * The Kusto-subset query engine.
 *
 * A query language is only useful if it is exact, so these tests care about
 * two things above all: that a correct query returns the right rows, and that
 * an incorrect one is *rejected with the offset it went wrong at* rather than
 * quietly doing something else. A language that silently reinterprets a typo
 * is worse than no language, because the answer still looks like an answer.
 */

import {
  MAX_ROWS,
  QueryError,
  SAMPLE_QUERIES,
  completions,
  parseQuery,
  runQuery,
} from "./app-insights-query";
import type { TelemetryEvent } from "./app-insights";

const NOW = "2026-03-10T12:00:00.000Z";
const minsAgo = (m: number) => new Date(Date.parse(NOW) - m * 60_000).toISOString();

function ev(over: Partial<TelemetryEvent> & { id: string }): TelemetryEvent {
  return {
    kind: "request",
    at: minsAgo(5),
    path: "/api/devices",
    session: "s1",
    durationMs: 100,
    status: 200,
    ok: true,
    source: "web",
    ...over,
  };
}

const EVENTS: TelemetryEvent[] = [
  ev({ id: "1", path: "/api/devices", durationMs: 100, status: 200, session: "s1", method: "GET" }),
  ev({ id: "2", path: "/api/devices", durationMs: 300, status: 200, session: "s2", method: "GET" }),
  ev({ id: "3", path: "/api/devices", durationMs: 900, status: 500, ok: false, session: "s1", method: "GET" }),
  ev({ id: "4", path: "/api/orders", durationMs: 50, status: 200, session: "s3", method: "POST" }),
  ev({ id: "5", path: "/shop", kind: "pageview", durationMs: 20, status: 0, session: "s3" }),
  ev({
    id: "6",
    kind: "exception",
    path: "/api/orders",
    ok: false,
    status: 500,
    errorType: "TypeError",
    errorMessage: "x is not a function",
    session: "s2",
    at: minsAgo(10),
  }),
  ev({ id: "7", kind: "dependency", target: "neon", durationMs: 400, session: "s1", at: minsAgo(200) }),
  ev({ id: "8", kind: "dependency", target: "neon", durationMs: 800, ok: false, session: "s2", at: minsAgo(20) }),
  ev({ id: "9", kind: "dependency", target: "resend", durationMs: 120, session: "s3", at: minsAgo(30) }),
];

const run = (q: string) => runQuery(EVENTS, q, { now: NOW });

describe("table selection", () => {
  it("selects only the kind the table names", () => {
    expect(run("requests").totalRows).toBe(4);
    expect(run("pageViews").totalRows).toBe(1);
    expect(run("exceptions").totalRows).toBe(1);
    expect(run("dependencies").totalRows).toBe(3);
  });

  it("unions everything for the telemetry table", () => {
    expect(run("telemetry").totalRows).toBe(EVENTS.length);
  });

  it("reports the rows scanned separately from the rows returned", () => {
    const r = run("requests | where ok == false");
    expect(r.scanned).toBe(4);
    expect(r.totalRows).toBe(1);
  });

  it("names the tables that do exist when given one that does not", () => {
    expect(() => run("requestz")).toThrow(/Unknown table/);
    expect(() => run("requestz")).toThrow(/requests/);
  });
});

describe("where", () => {
  it("compares numbers", () => {
    expect(run("requests | where durationMs > 200").totalRows).toBe(2);
    expect(run("requests | where durationMs >= 300").totalRows).toBe(2);
    expect(run("requests | where status == 500").totalRows).toBe(1);
  });

  it("compares booleans", () => {
    expect(run("requests | where ok == false").totalRows).toBe(1);
    expect(run("requests | where ok == true").totalRows).toBe(3);
  });

  it("matches strings case-insensitively, as Kusto's contains does", () => {
    expect(run('requests | where path contains "DEVICES"').totalRows).toBe(3);
    expect(run('requests | where path startswith "/api"').totalRows).toBe(4);
    expect(run('requests | where path endswith "orders"').totalRows).toBe(1);
  });

  it("supports regex matching", () => {
    expect(run('requests | where path matches regex "^/api/(devices|orders)$"').totalRows).toBe(4);
  });

  it("rejects a regular expression that cannot compile", () => {
    expect(() => run('requests | where path matches regex "("')).toThrow(/not a valid regular expression/);
  });

  it("combines with and, or and not, honouring precedence", () => {
    // `and` binds tighter than `or`: this is (500 AND devices) OR (orders).
    const r = run('requests | where status == 500 and path contains "devices" or path contains "orders"');
    expect(r.totalRows).toBe(2);
    expect(run('requests | where not (path contains "devices")').totalRows).toBe(1);
  });

  it("respects parentheses over precedence", () => {
    const r = run('requests | where status == 500 and (path contains "devices" or path contains "orders")');
    expect(r.totalRows).toBe(1);
  });

  it("supports in and notin", () => {
    expect(run('requests | where path in ("/api/orders", "/nope")').totalRows).toBe(1);
    expect(run('requests | where path notin ("/api/orders")').totalRows).toBe(3);
  });

  it("filters on time with ago()", () => {
    expect(run("dependencies | where at > ago(1h)").totalRows).toBe(2);
    expect(run("dependencies | where at > ago(24h)").totalRows).toBe(3);
  });

  it("understands every timespan unit", () => {
    expect(run("dependencies | where at > ago(60m)").totalRows).toBe(2);
    expect(run("dependencies | where at > ago(3600s)").totalRows).toBe(2);
    expect(run("dependencies | where at > ago(1d)").totalRows).toBe(3);
  });

  it("treats a missing optional column as null rather than failing", () => {
    // `target` is absent on requests; it is a real column, so this filters to none.
    expect(run("requests | where isnotempty(target)").totalRows).toBe(0);
    expect(run("requests | where isempty(target)").totalRows).toBe(4);
  });
});

describe("summarize", () => {
  it("counts into one row when there is no by clause", () => {
    const r = run("requests | summarize count()");
    expect(r.rows).toEqual([{ count_: 4 }]);
  });

  it("returns a row even when nothing matched", () => {
    // A count of zero is an answer; zero rows looks like the query is broken.
    const r = run('requests | where path == "/nothing" | summarize count()');
    expect(r.rows).toEqual([{ count_: 0 }]);
  });

  it("groups by a column", () => {
    const r = run("requests | summarize hits = count() by path | order by hits desc");
    expect(r.rows).toEqual([
      { path: "/api/devices", hits: 3 },
      { path: "/api/orders", hits: 1 },
    ]);
  });

  it("groups by several columns", () => {
    const r = run("requests | summarize n = count() by path, method");
    expect(r.rows).toHaveLength(2);
  });

  it("computes each aggregation", () => {
    const r = run(
      "requests | summarize n = count(), s = sum(durationMs), a = avg(durationMs), lo = min(durationMs), hi = max(durationMs), d = dcount(session)",
    );
    expect(r.rows[0]).toEqual({ n: 4, s: 1350, a: 337.5, lo: 50, hi: 900, d: 3 });
  });

  it("computes countif over a condition", () => {
    const r = run("requests | summarize failed = countif(ok == false), all = count()");
    expect(r.rows[0]).toEqual({ failed: 1, all: 4 });
  });

  it("computes percentiles that agree with the rest of the product", () => {
    // Nearest-rank over [50,100,300,900], as app-insights.ts defines it.
    const r = run("requests | summarize p50 = percentile(durationMs, 50), p95 = percentile(durationMs, 95)");
    expect(r.rows[0]).toEqual({ p50: 100, p95: 900 });
  });

  it("names unaliased aggregations predictably", () => {
    const r = run("requests | summarize count(), avg(durationMs), percentile(durationMs, 95)");
    expect(Object.keys(r.rows[0]).sort()).toEqual(
      ["avg_durationMs", "count_", "percentile_durationMs_95"].sort(),
    );
  });

  it("declares the columns it produced", () => {
    const r = run("requests | summarize hits = count() by path");
    expect(r.columns).toEqual([
      { name: "path", type: "string" },
      { name: "hits", type: "number" },
    ]);
  });

  it("rejects grouping by a column that does not exist", () => {
    expect(() => run("requests | summarize count() by nope")).toThrow(/Unknown column/);
  });

  it("rejects a function that is not an aggregation", () => {
    expect(() => run("requests | summarize tolower(path)")).toThrow(/not an aggregation/);
  });
});

describe("project, extend, distinct", () => {
  it("keeps only the projected columns, in order", () => {
    const r = run("requests | project path, status | take 1");
    expect(r.columns.map((c) => c.name)).toEqual(["path", "status"]);
    expect(Object.keys(r.rows[0])).toEqual(["path", "status"]);
  });

  it("rejects projecting a column that does not exist", () => {
    expect(() => run("requests | project nope")).toThrow(/Unknown column/);
  });

  it("adds a computed column with extend", () => {
    const r = run("requests | extend slow = durationMs > 200 | summarize n = countif(slow == true)");
    expect(r.rows[0]).toEqual({ n: 2 });
  });

  it("buckets time with bin(), keeping it a datetime", () => {
    const r = run("requests | extend hour = bin(at, 1h) | summarize n = count() by hour");
    expect(r.rows).toHaveLength(1);
    expect(String(r.rows[0].hour)).toMatch(/^2026-03-10T\d\d:00:00\.000Z$/);
  });

  it("returns distinct combinations", () => {
    expect(run("requests | distinct path").totalRows).toBe(2);
    expect(run("telemetry | distinct session").totalRows).toBe(3);
  });
});

describe("order, top, take, count", () => {
  it("orders descending by default, as Kusto does", () => {
    const r = run("requests | project durationMs | order by durationMs");
    expect(r.rows.map((x) => x.durationMs)).toEqual([900, 300, 100, 50]);
  });

  it("orders ascending when asked", () => {
    const r = run("requests | project durationMs | order by durationMs asc");
    expect(r.rows.map((x) => x.durationMs)).toEqual([50, 100, 300, 900]);
  });

  it("orders by several keys", () => {
    const r = run("requests | order by path asc, durationMs asc | project path, durationMs");
    expect(r.rows.map((x) => `${x.path}:${x.durationMs}`)).toEqual([
      "/api/devices:100",
      "/api/devices:300",
      "/api/devices:900",
      "/api/orders:50",
    ]);
  });

  it("sorts datetimes chronologically rather than as text", () => {
    const r = run("dependencies | order by at asc | project id");
    expect(r.rows.map((x) => x.id)).toEqual(["7", "9", "8"]);
  });

  it("takes the top N by a column", () => {
    const r = run("requests | top 2 by durationMs | project durationMs");
    expect(r.rows.map((x) => x.durationMs)).toEqual([900, 300]);
  });

  it("limits rows with take, and limit as its alias", () => {
    expect(run("requests | take 2").rows).toHaveLength(2);
    expect(run("requests | limit 1").rows).toHaveLength(1);
  });

  it("counts into a single Count column", () => {
    const r = run("requests | where ok == false | count");
    expect(r.rows).toEqual([{ Count: 1 }]);
    expect(r.columns).toEqual([{ name: "Count", type: "number" }]);
  });

  it("applies stages in written order, not in a convenient one", () => {
    // take before summarize must summarise only the taken rows.
    const r = run("requests | order by durationMs | take 2 | summarize n = count()");
    expect(r.rows[0]).toEqual({ n: 2 });
  });
});

describe("errors", () => {
  const offsetOf = (q: string): number => {
    try {
      run(q);
    } catch (e) {
      if (e instanceof QueryError) return e.offset;
    }
    return -1;
  };

  it("refuses an empty query with advice rather than a stack trace", () => {
    expect(() => run("   ")).toThrow(/Write a query/);
  });

  it("points at the operator it did not recognise", () => {
    expect(() => run("requests | wherr status == 500")).toThrow(/Unknown operator/);
    expect(offsetOf("requests | wherr status == 500")).toBe(11);
  });

  it("points at the unknown column, not at the start of the query", () => {
    expect(offsetOf("requests | where nope == 1")).toBe(17);
  });

  it("reports an unterminated string at the quote that opened it", () => {
    expect(() => run('requests | where path contains "abc')).toThrow(/Unterminated string/);
    expect(offsetOf('requests | where path contains "abc')).toBe(31);
  });

  it("rejects a missing pipe between operators", () => {
    expect(() => run("requests take 5")).toThrow(/Expected \`\|\`/);
  });

  it("rejects an unbalanced parenthesis", () => {
    expect(() => run('requests | where (status == 500')).toThrow(/Expected/);
  });

  it("rejects a percentile outside 0..100", () => {
    expect(() => run("requests | summarize percentile(durationMs, 150)")).toThrow(/between 0 and 100/);
  });

  it("rejects a character that is not part of the language", () => {
    expect(() => run("requests | where path ~ 1")).toThrow(/Unexpected character/);
  });

  it("lists the columns available when one is misspelled", () => {
    expect(() => run("requests | project duratonMs")).toThrow(/durationMs/);
  });
});

describe("guards", () => {
  it("caps the rows returned but still reports the true total", () => {
    const many: TelemetryEvent[] = Array.from({ length: 200 }, (_, i) => ev({ id: `m${i}` }));
    const r = runQuery(many, "requests", { now: NOW, maxRows: 50 });
    expect(r.rows).toHaveLength(50);
    expect(r.totalRows).toBe(200);
  });

  it("never returns more than MAX_ROWS however large the ask", () => {
    const many: TelemetryEvent[] = Array.from({ length: 20 }, (_, i) => ev({ id: `m${i}` }));
    const r = runQuery(many, "requests", { now: NOW, maxRows: 10 * MAX_ROWS });
    expect(r.rows.length).toBeLessThanOrEqual(MAX_ROWS);
  });

  it("handles an empty buffer without throwing", () => {
    const r = runQuery([], "requests | summarize count() by path", { now: NOW });
    expect(r.rows).toEqual([]);
    expect(r.scanned).toBe(0);
  });

  it("ignores comments", () => {
    expect(run("requests // everything\n| take 1").rows).toHaveLength(1);
  });

  it("accepts operators in any case", () => {
    expect(run("requests | WHERE status == 500 | COUNT").rows).toEqual([{ Count: 1 }]);
  });
});

describe("the queries the blade offers", () => {
  it("parses and runs every sample", () => {
    for (const s of SAMPLE_QUERIES) {
      expect(() => parseQuery(s.query)).not.toThrow();
      expect(() => run(s.query)).not.toThrow();
    }
  });

  it("offers completions for tables, columns, operators and functions", () => {
    const c = completions();
    const kinds = new Set(c.map((x) => x.kind));
    expect(kinds).toEqual(new Set(["table", "operator", "column", "function"]));
    expect(c.some((x) => x.label === "requests")).toBe(true);
    expect(c.some((x) => x.label === "durationMs")).toBe(true);
    expect(c.some((x) => x.label === "percentile")).toBe(true);
  });
});
