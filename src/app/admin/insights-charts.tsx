"use client";

/**
 * Charts for the Application Insights panel.
 *
 * The panel already had the data and mostly showed it as tables. A table is
 * the right answer to "which route is slowest" and the wrong answer to "is it
 * getting worse" — reading a trend out of a column of numbers is work that a
 * 200px line does for free.
 *
 * Every chart here is built from data the panel already receives, so none of
 * this needed a new endpoint or a wider payload.
 *
 * The choices about *what* to plot matter more than the plotting:
 *
 *   - Slowest by p95, not busiest by count. The busiest route is usually the
 *     healthiest; the one people complain about is the one with a slow tail.
 *   - Failure rate and failure count are different questions. Ten failures out
 *     of ten is an outage; ten out of a million is a bad afternoon.
 *   - Axes start at zero. An axis that starts at the minimum turns a 2% wobble
 *     into a cliff, which is how a healthy service comes to look like an
 *     incident.
 */

import { BarChart, DonutChart, GroupedBar, HBar, LineChart } from "./charts";
import type {
  DependencyStat,
  FailureGroup,
  InsightsSummary,
  OperationPerf,
  PathStat,
  RequestStat,
} from "@/lib/app-insights";

/* ------------------------------------------------------------------ shell -- */

export function ChartCard({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border cv-border cv-surface p-3">
      <header className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </h4>
          {hint && (
            <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
              {hint}
            </p>
          )}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

/**
 * What a chart shows when there is nothing to show.
 *
 * Without this an empty window renders an axis labelled 0 to 1 with a flat
 * line along the bottom, which looks exactly like "your traffic dropped to
 * zero" rather than "no data was collected in this window". Those need to look
 * different, because one of them is an incident.
 */
export function NoData({ what = "No data in this window" }: { what?: string }) {
  return (
    <div
      className="flex h-[120px] items-center justify-center rounded-lg text-xs"
      style={{ background: "var(--bg-glass)", color: "var(--text-muted)" }}
    >
      {what}
    </div>
  );
}

/* --------------------------------------------------------------- helpers -- */

const COL = {
  traffic: "#38bdf8",
  failures: "#f87171",
  ok: "#4ade80",
  warn: "#fbbf24",
  p50: "#38bdf8",
  p95: "#a78bfa",
  p99: "#f472b6",
};

/** "14:05" — enough to place a point without crowding the axis. */
function clockLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Thin a label array so an axis stays readable.
 *
 * A 7-day window at 5-minute buckets is 2000 points; drawing 2000 labels
 * produces a solid grey smear. The line still uses every point — only the
 * labels are thinned.
 */
function sparseLabels(labels: string[], keep = 8): string[] {
  if (labels.length <= keep) return labels;
  const step = Math.ceil(labels.length / keep);
  return labels.map((l, i) => (i % step === 0 ? l : ""));
}

const shortName = (s: string, n = 34) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/* --------------------------------------------------------------- traffic -- */

/**
 * Traffic and failures on one axis.
 *
 * Deliberately the same axis rather than two. A second y-axis lets two
 * unrelated scales be drawn as though they cross, and people read meaning into
 * where the lines meet — meaning that is an artefact of the scaling. Both of
 * these are counts of the same thing, so one axis is honest.
 */
export function TrafficChart({ summary }: { summary: InsightsSummary }) {
  const pts = summary.series ?? [];
  if (pts.length < 2) return <NoData />;

  const labels = sparseLabels(pts.map((p) => clockLabel(p.at)));
  const anyFailures = pts.some((p) => p.failures > 0);

  return (
    <LineChart
      labels={labels}
      height={200}
      area
      series={[
        { name: "Requests", data: pts.map((p) => p.count), color: COL.traffic },
        // The failure line is omitted entirely when there are none. A flat zero
        // line teaches the eye to ignore that colour, which is a problem the
        // day it lifts off the floor.
        ...(anyFailures
          ? [{ name: "Failures", data: pts.map((p) => p.failures), color: COL.failures }]
          : []),
      ]}
    />
  );
}

/** Failure rate over time, as a percentage. */
export function FailureRateChart({ summary }: { summary: InsightsSummary }) {
  const pts = summary.series ?? [];
  if (pts.length < 2) return <NoData />;
  const data = pts.map((p) => (p.count > 0 ? Number(((p.failures / p.count) * 100).toFixed(2)) : 0));
  if (data.every((v) => v === 0)) return <NoData what="No failures in this window" />;

  return (
    <LineChart
      labels={sparseLabels(pts.map((p) => clockLabel(p.at)))}
      height={180}
      series={[{ name: "Failure rate", data, color: COL.failures }]}
      yFmt={(n) => `${n}%`}
    />
  );
}

/* -------------------------------------------------------------- requests -- */

export function StatusDonut({ statuses }: { statuses: { status: number; count: number }[] }) {
  if (!statuses.length) return <NoData what="No responses recorded" />;

  /*
   * Grouped by class, not by code. Twelve slices for 200/201/204/301/302/304
   * answers a question nobody asked; what matters is how much of the traffic
   * succeeded.
   */
  const buckets = new Map<string, number>();
  for (const s of statuses) {
    const cls = s.status >= 500 ? "5xx server" : s.status >= 400 ? "4xx client" : s.status >= 300 ? "3xx redirect" : "2xx ok";
    buckets.set(cls, (buckets.get(cls) ?? 0) + s.count);
  }
  const order = ["2xx ok", "3xx redirect", "4xx client", "5xx server"];
  const colour: Record<string, string> = {
    "2xx ok": COL.ok,
    "3xx redirect": COL.traffic,
    "4xx client": COL.warn,
    "5xx server": COL.failures,
  };
  const data = order
    .filter((k) => buckets.has(k))
    .map((k) => ({ name: k, value: buckets.get(k)!, color: colour[k] }));
  const total = data.reduce((s, d) => s + d.value, 0);

  return <DonutChart data={data} size={150} centerLabel={total.toLocaleString("en-IN")} centerSub="responses" />;
}

/**
 * The slowest routes, by p95.
 *
 * By p95 rather than average on purpose: the average is what a route feels
 * like on a good day, and the p95 is what it feels like to the person who
 * opens a ticket. On a route with a slow tail the two disagree by an order of
 * magnitude, and only one of them explains the complaint.
 */
export function SlowestRequests({ requests, limit = 8 }: { requests: RequestStat[]; limit?: number }) {
  const items = [...requests]
    .filter((r) => r.count > 0)
    .sort((a, b) => b.p95Ms - a.p95Ms)
    .slice(0, limit)
    .map((r) => ({ name: shortName(r.name), value: Math.round(r.p95Ms) }));

  if (!items.length) return <NoData what="No requests recorded" />;
  return <HBar items={items} />;
}

/**
 * Routes ranked by failure rate, not failure count.
 *
 * A route called a million times with a thousand failures looks alarming in a
 * count and is a 0.1% error rate; a route called ten times that fails ten
 * times is completely broken and would never reach the top of a count-ordered
 * list. The rate finds the second one.
 */
export function FailingRequests({ requests, limit = 8 }: { requests: RequestStat[]; limit?: number }) {
  const items = [...requests]
    // A handful of calls can produce a 100% rate from one bad request, which
    // would crowd out routes with a real and sustained problem.
    .filter((r) => r.failed > 0 && r.count >= 5)
    .sort((a, b) => b.failureRate - a.failureRate)
    .slice(0, limit)
    .map((r) => ({
      name: `${shortName(r.name, 28)} (${r.failed}/${r.count})`,
      value: Number((r.failureRate * 100).toFixed(1)),
      color: r.failureRate > 0.1 ? COL.failures : COL.warn,
    }));

  if (!items.length) return <NoData what="Nothing failing repeatedly" />;
  return <HBar items={items} />;
}

/* ----------------------------------------------------------- performance -- */

/** Where the time actually goes, as a distribution rather than an average. */
export function DurationHistogram({
  histogram,
}: {
  histogram: { label: string; upTo: number; count: number }[];
}) {
  if (!histogram.length || histogram.every((b) => b.count === 0)) return <NoData />;
  return (
    <BarChart
      labels={histogram.map((b) => b.label)}
      data={histogram.map((b) => b.count)}
      height={190}
      color={COL.traffic}
    />
  );
}

/**
 * p50, p95 and p99 side by side for the slowest operations.
 *
 * Three bars rather than one because the shape between them is the diagnosis:
 * bars of similar height mean the operation is uniformly slow, and a low p50
 * beside a towering p99 means it is usually fine and occasionally terrible.
 * Those have completely different causes and a single average hides both.
 */
export function PercentileBars({ performance, limit = 6 }: { performance: OperationPerf[]; limit?: number }) {
  const top = [...performance]
    .filter((p) => p.count > 0)
    .sort((a, b) => b.p95Ms - a.p95Ms)
    .slice(0, limit);

  if (!top.length) return <NoData what="No operations timed" />;

  return (
    <GroupedBar
      labels={top.map((p) => shortName(p.name, 18))}
      height={210}
      series={[
        { name: "p50", data: top.map((p) => Math.round(p.p50Ms)), color: COL.p50 },
        { name: "p95", data: top.map((p) => Math.round(p.p95Ms)), color: COL.p95 },
        { name: "p99", data: top.map((p) => Math.round(p.p99Ms)), color: COL.p99 },
      ]}
    />
  );
}

/* ---------------------------------------------------------- dependencies -- */

/** Outbound calls ranked by how slow they are, with failures coloured. */
export function DependencyLatency({ dependencies, limit = 8 }: { dependencies: DependencyStat[]; limit?: number }) {
  const items = [...dependencies]
    .filter((d) => d.count > 0)
    .sort((a, b) => b.p95Ms - a.p95Ms)
    .slice(0, limit)
    .map((d) => ({
      name: shortName(d.name),
      value: Math.round(d.p95Ms),
      // A dependency that is slow AND failing is a different problem from one
      // that is merely slow, and the colour says which without a second chart.
      color: d.failureRate > 0.05 ? COL.failures : COL.p95,
    }));

  if (!items.length) return <NoData what="No outbound calls recorded" />;
  return <HBar items={items} />;
}

/* -------------------------------------------------------------- failures -- */

/** The bugs that happen most, grouped by what makes them the same bug. */
export function TopFailures({ failures, limit = 8 }: { failures: FailureGroup[]; limit?: number }) {
  const items = [...failures]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((f) => ({
      name: shortName(`${f.errorType}: ${f.errorMessage}`, 44),
      value: f.count,
      color: COL.failures,
    }));

  if (!items.length) return <NoData what="No exceptions in this window" />;
  return <HBar items={items} />;
}

/**
 * Failures ranked by how many people hit them.
 *
 * A loop that throws a thousand times in one session is one person having a
 * bad time; ten failures across ten sessions is ten people. Ordering by count
 * alone consistently puts the first above the second.
 */
export function FailuresBySession({ failures, limit = 8 }: { failures: FailureGroup[]; limit?: number }) {
  const items = [...failures]
    .filter((f) => f.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit)
    .map((f) => ({ name: shortName(`${f.errorType}: ${f.errorMessage}`, 44), value: f.sessions }));

  if (!items.length) return <NoData what="No exceptions in this window" />;
  return <HBar items={items} />;
}

/* ----------------------------------------------------------------- paths -- */

export function BusiestPaths({ paths, limit = 8 }: { paths: PathStat[]; limit?: number }) {
  const items = [...paths]
    .sort((a, b) => b.views - a.views)
    .slice(0, limit)
    .map((p) => ({ name: shortName(p.path), value: p.views }));
  if (!items.length) return <NoData what="No page views recorded" />;
  return <HBar items={items} />;
}

export function SlowestPaths({ paths, limit = 8 }: { paths: PathStat[]; limit?: number }) {
  const items = [...paths]
    .filter((p) => p.views > 0)
    .sort((a, b) => b.p95 - a.p95)
    .slice(0, limit)
    .map((p) => ({ name: shortName(p.path), value: Math.round(p.p95), color: COL.p95 }));
  if (!items.length) return <NoData what="No page views recorded" />;
  return <HBar items={items} />;
}
