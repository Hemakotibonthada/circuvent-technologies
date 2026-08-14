/**
 * The insight and incident charts, rendered.
 *
 * Charts fail in a particular way: not by throwing, but by dividing by zero on
 * an empty series, drawing an axis from 0 to 1 across a window with no data, or
 * rendering `NaN` into a path attribute so the SVG silently draws nothing.
 * None of that shows up in a type check, and all of it happens on the day a
 * window is quiet — which is exactly when somebody is looking at the page to
 * find out why it is quiet.
 *
 * So these mostly feed the components nothing and assert they say so.
 */

import { render, screen } from "@testing-library/react";
import {
  BusiestPaths,
  DependencyLatency,
  DurationHistogram,
  FailingRequests,
  FailureRateChart,
  FailuresBySession,
  PercentileBars,
  SlowestPaths,
  SlowestRequests,
  StatusDonut,
  TopFailures,
  TrafficChart,
} from "@/app/admin/insights-charts";
import { IcmAnalytics } from "@/app/admin/IcmAnalytics";
import type {
  DependencyStat,
  FailureGroup,
  InsightsSummary,
  OperationPerf,
  PathStat,
  RequestStat,
} from "@/lib/app-insights";
import type { Incident, Severity } from "@/lib/icm";

const summary = (over: Partial<InsightsSummary> = {}): InsightsSummary => ({
  totalEvents: 0,
  pageViews: 0,
  requests: 0,
  exceptions: 0,
  sessions: 0,
  failureRate: 0,
  p95: 0,
  series: [],
  ...over,
});

const points = (n: number, count = 10, failures = 0) =>
  Array.from({ length: n }, (_, i) => ({
    at: new Date(Date.UTC(2026, 2, 2, i)).toISOString(),
    count,
    failures,
  }));

const req = (over: Partial<RequestStat> = {}): RequestStat =>
  ({
    name: "GET /api/devices",
    method: "GET",
    path: "/api/devices",
    count: 100,
    failed: 0,
    failureRate: 0,
    avgMs: 40,
    p95Ms: 120,
    ...over,
  }) as RequestStat;

const noSvg = (c: HTMLElement) => c.querySelectorAll("svg").length === 0;

describe("charts with nothing to show", () => {
  /*
   * The important group. An empty window must look different from a window
   * where traffic dropped to zero — one is "no data collected", the other is
   * an outage, and a flat line along the bottom of an axis says the second.
   */
  it("traffic says so rather than drawing a flat line", () => {
    const { container } = render(<TrafficChart summary={summary()} />);
    expect(screen.getByText(/no data in this window/i)).toBeInTheDocument();
    expect(noSvg(container)).toBe(true);
  });

  it("a single point is not enough to draw a trend", () => {
    // Two points make a line; one makes a dot people read as a trend.
    render(<TrafficChart summary={summary({ series: points(1) })} />);
    expect(screen.getByText(/no data in this window/i)).toBeInTheDocument();
  });

  it.each([
    ["status donut", <StatusDonut key="a" statuses={[]} />, /no responses/i],
    ["slowest requests", <SlowestRequests key="b" requests={[]} />, /no requests/i],
    ["failing requests", <FailingRequests key="c" requests={[]} />, /nothing failing/i],
    ["histogram", <DurationHistogram key="d" histogram={[]} />, /no data/i],
    ["percentiles", <PercentileBars key="e" performance={[]} />, /no operations/i],
    ["dependencies", <DependencyLatency key="f" dependencies={[]} />, /no outbound/i],
    ["top failures", <TopFailures key="g" failures={[]} />, /no exceptions/i],
    ["failures by session", <FailuresBySession key="h" failures={[]} />, /no exceptions/i],
    ["busiest paths", <BusiestPaths key="i" paths={[]} />, /no page views/i],
    ["slowest paths", <SlowestPaths key="j" paths={[]} />, /no page views/i],
  ])("%s explains itself", (_name, el, pattern) => {
    render(el);
    expect(screen.getByText(pattern)).toBeInTheDocument();
  });

  it("a histogram of all-zero buckets is empty, not a flat floor", () => {
    render(
      <DurationHistogram
        histogram={[
          { label: "<10ms", upTo: 10, count: 0 },
          { label: "<50ms", upTo: 50, count: 0 },
        ]}
      />,
    );
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});

describe("charts with data", () => {
  it("draws traffic", () => {
    const { container } = render(<TrafficChart summary={summary({ series: points(6) })} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("omits the failure line entirely when nothing failed", () => {
    /*
     * A flat zero line teaches the eye to ignore that colour, which is a
     * problem the day it lifts off the floor.
     */
    const clean = render(<TrafficChart summary={summary({ series: points(6, 10, 0) })} />).container;
    expect(clean.textContent).not.toContain("Failures");
    const dirty = render(<TrafficChart summary={summary({ series: points(6, 10, 2) })} />).container;
    expect(dirty.textContent).toContain("Failures");
  });

  it("says there were no failures rather than drawing a zero rate", () => {
    render(<FailureRateChart summary={summary({ series: points(6, 10, 0) })} />);
    expect(screen.getByText(/no failures in this window/i)).toBeInTheDocument();
  });

  it("groups responses by class instead of listing every code", () => {
    // Twelve slices for 200/201/204/301/304 answers a question nobody asked.
    render(
      <StatusDonut
        statuses={[
          { status: 200, count: 90 },
          { status: 204, count: 5 },
          { status: 404, count: 3 },
          { status: 500, count: 2 },
        ]}
      />,
    );
    expect(screen.getByText("2xx ok")).toBeInTheDocument();
    expect(screen.getByText("4xx client")).toBeInTheDocument();
    expect(screen.queryByText("204")).not.toBeInTheDocument();
  });

  it("ranks slow routes by p95, not by how busy they are", () => {
    // The busiest route is usually the healthiest. The complaint comes from
    // the one with a slow tail.
    render(
      <SlowestRequests
        requests={[
          req({ name: "GET /busy", count: 10000, p95Ms: 30 }),
          req({ name: "GET /slow", count: 12, p95Ms: 4200 }),
        ]}
      />,
    );
    const names = screen.getAllByText(/GET \//).map((n) => n.textContent);
    expect(names[0]).toContain("/slow");
  });

  it("ranks failures by rate and ignores routes with too few calls", () => {
    /*
     * A route called a million times with a thousand failures is a 0.1% error
     * rate; one called ten times that fails ten times is completely broken and
     * would never reach the top of a count-ordered list.
     */
    render(
      <FailingRequests
        requests={[
          req({ name: "GET /noisy", count: 1_000_000, failed: 1000, failureRate: 0.001 }),
          req({ name: "GET /broken", count: 10, failed: 10, failureRate: 1 }),
          req({ name: "GET /rare", count: 2, failed: 2, failureRate: 1 }),
        ]}
      />,
    );
    expect(screen.getByText(/GET \/broken/)).toBeInTheDocument();
    // Two calls is not evidence of a pattern.
    expect(screen.queryByText(/GET \/rare/)).not.toBeInTheDocument();
  });

  it("draws three percentiles per operation", () => {
    const perf: OperationPerf[] = [
      { name: "db.query", kind: "dependency", count: 10, minMs: 1, p50Ms: 5, p90Ms: 40, p95Ms: 80, p99Ms: 900, maxMs: 1000 } as OperationPerf,
    ];
    render(<PercentileBars performance={perf} />);
    expect(screen.getByText("p50")).toBeInTheDocument();
    expect(screen.getByText("p95")).toBeInTheDocument();
    expect(screen.getByText("p99")).toBeInTheDocument();
  });

  it("colours a dependency that is failing as well as slow", () => {
    const deps: DependencyStat[] = [
      { name: "control-plane GET /devices", target: "cp", method: "GET", path: "/devices", count: 50, failed: 20, failureRate: 0.4, avgMs: 100, p95Ms: 400, maxMs: 900, lastAt: "" } as DependencyStat,
    ];
    const { container } = render(<DependencyLatency dependencies={deps} />);
    // jsdom normalises hex to rgb(), so assert on the computed form.
    expect(container.innerHTML).toContain("rgb(248, 113, 113)");
  });

  it("separates how often a bug happens from how many people it hits", () => {
    const failures: FailureGroup[] = [
      { key: "a", errorType: "TypeError", errorMessage: "loop", path: "/a", count: 1000, sessions: 1, firstSeen: "", lastSeen: "", stack: "" } as FailureGroup,
      { key: "b", errorType: "RangeError", errorMessage: "wide", path: "/b", count: 10, sessions: 10, firstSeen: "", lastSeen: "", stack: "" } as FailureGroup,
    ];
    // Scoped to each container: two render() calls share one document.body,
    // so a global query would search both and find whichever came first.
    const byCount = render(<TopFailures failures={failures} />).container;
    expect(byCount.textContent).toMatch(/TypeError[\s\S]*RangeError/);

    const bySession = render(<FailuresBySession failures={failures} />).container;
    expect(bySession.textContent).toMatch(/RangeError[\s\S]*TypeError/);
  });

  it("ranks paths two different ways", () => {
    const paths: PathStat[] = [
      { path: "/popular", views: 900, sessions: 100, failures: 0, failureRate: 0, p50: 10, p95: 20, avg: 12, lastSeen: "" } as PathStat,
      { path: "/sluggish", views: 5, sessions: 5, failures: 0, failureRate: 0, p50: 800, p95: 3000, avg: 900, lastSeen: "" } as PathStat,
    ];
    expect(render(<BusiestPaths paths={paths} />).container.textContent).toMatch(/\/popular[\s\S]*\/sluggish/);
    expect(render(<SlowestPaths paths={paths} />).container.textContent).toMatch(/\/sluggish[\s\S]*\/popular/);
  });
});

/* ------------------------------------------------------------------- ICM -- */

const incident = (over: Partial<Incident> = {}): Incident =>
  ({
    id: "inc-1",
    title: "t",
    description: "",
    severity: 2 as Severity,
    status: "resolved",
    source: "monitor",
    owningTeam: "platform",
    assignedTo: "sam",
    createdBy: "monitor",
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    acknowledgedAt: null,
    mitigatedAt: null,
    resolvedAt: null,
    impactStartedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    affectedServices: ["api"],
    customersImpacted: 5,
    ...over,
  }) as Incident;

describe("IcmAnalytics", () => {
  it("renders with no incidents at all instead of dividing by zero", () => {
    // A brand new install, or a quiet quarter. Both must render.
    render(<IcmAnalytics incidents={[]} />);
    expect(screen.getAllByText(/no incidents in the last/i).length).toBeGreaterThan(0);
  });

  it("shows the medians and the worst case together", () => {
    // A median hides the outlier, and the outlier is what a review is about.
    render(
      <IcmAnalytics
        incidents={[
          incident({
            createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
            resolvedAt: new Date(Date.now() - 2 * 86_400_000 + 30 * 60_000).toISOString(),
          }),
        ]}
      />,
    );
    expect(screen.getByText("Median TTR")).toBeInTheDocument();
    expect(screen.getByText("Longest")).toBeInTheDocument();
  });

  it("leaves out severities nobody had", () => {
    // A legend listing five severities when only one occurred is noise.
    render(<IcmAnalytics incidents={[incident({ severity: 1 as Severity })]} />);
    expect(screen.getByText("Sev 1")).toBeInTheDocument();
    expect(screen.queryByText("Sev 4")).not.toBeInTheDocument();
  });

  it("renders a dash rather than zero when nothing has resolved", () => {
    // "0m" would claim an instant resolution; there is simply no measurement.
    render(<IcmAnalytics incidents={[incident({ resolvedAt: null })]} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
