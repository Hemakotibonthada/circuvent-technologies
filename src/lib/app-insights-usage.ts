/**
 * Usage analytics — the Users / Sessions / Events, Funnels, Flows, Impact and
 * Retention blades.
 *
 * ── What the identifier permits, and what it does not ──
 *
 * Everything here is keyed on `session`, which telemetry-store.ts derives from
 * IP + user agent + **the current day**, salted. Its own comment is explicit
 * that it is "not enough to ... join today's session to yesterday's".
 *
 * That rules out Azure's Retention and Cohorts blades as Azure defines them.
 * Azure asks "of the users who arrived on Monday, how many came back on
 * Thursday" — a question this identifier cannot answer, because Monday's
 * person is a different hash on Thursday. Implementing it anyway would produce
 * a chart that reads 0% retention forever and looks like a product problem
 * rather than a measurement one. Worse, it would look plausible.
 *
 * So retention here is **within-window return**: a session that went quiet for
 * a while and then came back. That is a real engagement signal, it is
 * computable from what is recorded, and it is labelled as what it is. See
 * `returnBehaviour`.
 *
 * Pure, like app-insights.ts: events in, aggregates out. No I/O.
 */

import { percentile, type TelemetryEvent } from "./app-insights";

/* ------------------------------------------------------------------ *
 * Session rollups — the primitive the other blades are built on       *
 * ------------------------------------------------------------------ */

export interface SessionSummary {
  session: string;
  events: number;
  pageViews: number;
  failures: number;
  /** Distinct routes touched. A session on one page is not a session browsing. */
  routes: number;
  firstAt: string;
  lastAt: string;
  /** Wall-clock span of the session, milliseconds. */
  durationMs: number;
  /** Slowest single operation, used by the impact blade. */
  worstDurationMs: number;
  /** Mean duration across the session's timed operations. */
  avgDurationMs: number;
  source: string;
  userAgentClass: string | null;
  entryPath: string;
  exitPath: string;
  paths: string[];
}

export function sessionSummaries(events: TelemetryEvent[]): SessionSummary[] {
  const by = new Map<string, TelemetryEvent[]>();
  for (const e of events) {
    const list = by.get(e.session);
    if (list) list.push(e);
    else by.set(e.session, [e]);
  }

  const out: SessionSummary[] = [];
  for (const [session, raw] of by) {
    const ordered = [...raw].sort((a, b) => a.at.localeCompare(b.at));
    const timed = ordered.map((e) => e.durationMs).filter((d) => d > 0);
    const pageViews = ordered.filter((e) => e.kind === "pageview");
    out.push({
      session,
      events: ordered.length,
      pageViews: pageViews.length,
      failures: ordered.filter((e) => !e.ok).length,
      routes: new Set(ordered.map((e) => e.path)).size,
      firstAt: ordered[0].at,
      lastAt: ordered[ordered.length - 1].at,
      durationMs: Math.max(0, Date.parse(ordered[ordered.length - 1].at) - Date.parse(ordered[0].at)),
      worstDurationMs: timed.length ? Math.max(...timed) : 0,
      avgDurationMs: timed.length ? Math.round(timed.reduce((a, b) => a + b, 0) / timed.length) : 0,
      source: ordered[0].source,
      userAgentClass: ordered[0].userAgentClass ?? null,
      entryPath: (pageViews[0] ?? ordered[0]).path,
      exitPath: (pageViews[pageViews.length - 1] ?? ordered[ordered.length - 1]).path,
      paths: ordered.map((e) => e.path),
    });
  }
  return out.sort((a, b) => b.events - a.events);
}

/* ------------------------------------------------------------------ *
 * Users / Sessions / Events over time                                 *
 * ------------------------------------------------------------------ */

export interface UsagePoint {
  at: string;
  sessions: number;
  events: number;
  pageViews: number;
  /** Sessions whose first-ever recorded event falls in this bucket. */
  newSessions: number;
  failures: number;
}

export function usageOverTime(
  events: TelemetryEvent[],
  opts: { hours: number; now: string; bucketMinutes?: number },
): UsagePoint[] {
  const { hours, now } = opts;
  // Aim for ~40 points: enough to show a shape, few enough to label.
  const bucketMinutes = opts.bucketMinutes ?? Math.max(1, Math.round((hours * 60) / 40));
  const bucketMs = bucketMinutes * 60_000;
  const end = Date.parse(now);
  const start = end - hours * 3_600_000;

  const firstSeen = new Map<string, number>();
  for (const e of events) {
    const t = Date.parse(e.at);
    const prev = firstSeen.get(e.session);
    if (prev === undefined || t < prev) firstSeen.set(e.session, t);
  }

  const buckets = new Map<number, { sessions: Set<string>; events: number; pageViews: number; newSessions: Set<string>; failures: number }>();
  for (let t = Math.floor(start / bucketMs) * bucketMs; t <= end; t += bucketMs) {
    buckets.set(t, { sessions: new Set(), events: 0, pageViews: 0, newSessions: new Set(), failures: 0 });
  }

  for (const e of events) {
    const t = Date.parse(e.at);
    if (Number.isNaN(t) || t < start || t > end) continue;
    const key = Math.floor(t / bucketMs) * bucketMs;
    const b = buckets.get(key);
    if (!b) continue;
    b.sessions.add(e.session);
    b.events++;
    if (e.kind === "pageview") b.pageViews++;
    if (!e.ok) b.failures++;
    if (firstSeen.get(e.session) === t) b.newSessions.add(e.session);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, b]) => ({
      at: new Date(t).toISOString(),
      sessions: b.sessions.size,
      events: b.events,
      pageViews: b.pageViews,
      newSessions: b.newSessions.size,
      failures: b.failures,
    }));
}

/* ------------------------------------------------------------------ *
 * Breakdown by property                                               *
 * ------------------------------------------------------------------ */

export type UsageDimension = "source" | "userAgentClass" | "path" | "kind" | "method" | "entryPath";

export interface UsageSlice {
  key: string;
  sessions: number;
  events: number;
  failures: number;
  share: number;
}

export function usageBreakdown(events: TelemetryEvent[], dimension: UsageDimension): UsageSlice[] {
  const groups = new Map<string, { sessions: Set<string>; events: number; failures: number }>();

  if (dimension === "entryPath") {
    // Entry path is a property of the session, not of an event: counting it
    // per event would weight a session by how much it browsed afterwards.
    for (const s of sessionSummaries(events)) {
      const g = groups.get(s.entryPath) ?? { sessions: new Set(), events: 0, failures: 0 };
      g.sessions.add(s.session);
      g.events += s.events;
      g.failures += s.failures;
      groups.set(s.entryPath, g);
    }
  } else {
    for (const e of events) {
      const key = String(e[dimension as keyof TelemetryEvent] ?? "(none)") || "(none)";
      const g = groups.get(key) ?? { sessions: new Set(), events: 0, failures: 0 };
      g.sessions.add(e.session);
      g.events++;
      if (!e.ok) g.failures++;
      groups.set(key, g);
    }
  }

  const total = [...groups.values()].reduce((a, g) => a + g.events, 0);
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      sessions: g.sessions.size,
      events: g.events,
      failures: g.failures,
      share: total ? g.events / total : 0,
    }))
    .sort((a, b) => b.events - a.events);
}

/* ------------------------------------------------------------------ *
 * Funnels                                                             *
 * ------------------------------------------------------------------ */

export interface FunnelStepSpec {
  label: string;
  /** Matched against the normalised route. */
  path: string;
  /** `exact` is the honest default; `prefix` covers a section of the site. */
  match?: "exact" | "prefix" | "contains";
}

export interface FunnelStepResult {
  label: string;
  path: string;
  sessions: number;
  /** Of the sessions that reached the previous step, the share that reached this one. */
  conversionFromPrevious: number;
  /** Of the sessions that entered the funnel, the share still here. */
  conversionFromStart: number;
  /** Sessions lost between the previous step and this one. */
  droppedOff: number;
  /** Median milliseconds from the previous step. Null on the first step. */
  medianMsFromPrevious: number | null;
}

export interface FunnelResult {
  steps: FunnelStepResult[];
  /** Sessions that completed every step, in order. */
  completed: number;
  /** Sessions that entered at step one. */
  entered: number;
  overallConversion: number;
  /** Median milliseconds from first step to last, for completing sessions. */
  medianCompletionMs: number | null;
}

function matches(path: string, spec: FunnelStepSpec): boolean {
  const mode = spec.match ?? "exact";
  if (mode === "prefix") return path.startsWith(spec.path);
  if (mode === "contains") return path.includes(spec.path);
  return path === spec.path;
}

/**
 * An ordered funnel over sessions.
 *
 * Order matters and is enforced: a session that hit checkout before the cart
 * has not converted through the funnel, it has arrived from somewhere else.
 * Counting it would make the funnel agree with itself no matter what the steps
 * were, which is the failure mode of every funnel built on unordered set
 * intersection.
 */
export function funnel(events: TelemetryEvent[], steps: FunnelStepSpec[]): FunnelResult {
  const clean = steps.filter((s) => s.path.trim());
  if (clean.length < 2) {
    return { steps: [], completed: 0, entered: 0, overallConversion: 0, medianCompletionMs: null };
  }

  const bySession = new Map<string, TelemetryEvent[]>();
  for (const e of events) {
    const list = bySession.get(e.session);
    if (list) list.push(e);
    else bySession.set(e.session, [e]);
  }

  const reached: number[] = new Array(clean.length).fill(0);
  const gaps: number[][] = clean.map(() => []);
  const completionTimes: number[] = [];

  for (const [, raw] of bySession) {
    const ordered = [...raw].sort((a, b) => a.at.localeCompare(b.at));
    let cursor = 0;
    let stepIndex = 0;
    let previousAt: number | null = null;
    let firstAt: number | null = null;

    while (stepIndex < clean.length) {
      let hitAt: number | null = null;
      while (cursor < ordered.length) {
        const e = ordered[cursor++];
        if (matches(e.path, clean[stepIndex])) {
          hitAt = Date.parse(e.at);
          break;
        }
      }
      if (hitAt === null) break;
      reached[stepIndex]++;
      if (stepIndex === 0) firstAt = hitAt;
      else if (previousAt !== null) gaps[stepIndex].push(Math.max(0, hitAt - previousAt));
      previousAt = hitAt;
      stepIndex++;
    }

    if (stepIndex === clean.length && firstAt !== null && previousAt !== null) {
      completionTimes.push(Math.max(0, previousAt - firstAt));
    }
  }

  const entered = reached[0];
  const stepResults: FunnelStepResult[] = clean.map((s, i) => {
    const previous = i === 0 ? entered : reached[i - 1];
    const sorted = [...gaps[i]].sort((a, b) => a - b);
    return {
      label: s.label || s.path,
      path: s.path,
      sessions: reached[i],
      conversionFromPrevious: previous ? reached[i] / previous : 0,
      conversionFromStart: entered ? reached[i] / entered : 0,
      droppedOff: Math.max(0, previous - reached[i]),
      medianMsFromPrevious: i === 0 ? null : sorted.length ? percentile(sorted, 50) : null,
    };
  });

  const sortedCompletion = [...completionTimes].sort((a, b) => a - b);
  return {
    steps: stepResults,
    completed: reached[clean.length - 1],
    entered,
    overallConversion: entered ? reached[clean.length - 1] / entered : 0,
    medianCompletionMs: sortedCompletion.length ? percentile(sortedCompletion, 50) : null,
  };
}

/* ------------------------------------------------------------------ *
 * User flows                                                          *
 * ------------------------------------------------------------------ */

export interface FlowEdge {
  path: string;
  sessions: number;
  events: number;
  share: number;
}

export interface FlowResult {
  node: string;
  /** Sessions that visited the node at all. */
  sessions: number;
  visits: number;
  incoming: FlowEdge[];
  outgoing: FlowEdge[];
  /** Visits where the node was the first thing in the session. */
  entries: number;
  /** Visits where nothing followed — the session ended here. */
  exits: number;
  exitRate: number;
}

/**
 * What happened immediately before and after a route.
 *
 * Page views only. Mixing API requests into a user flow produces edges like
 * "/shop → /api/shop/products", which is the page loading itself rather than
 * anybody going anywhere, and it swamps the real navigation.
 */
export function userFlows(events: TelemetryEvent[], node: string): FlowResult {
  const bySession = new Map<string, TelemetryEvent[]>();
  for (const e of events) {
    if (e.kind !== "pageview") continue;
    const list = bySession.get(e.session);
    if (list) list.push(e);
    else bySession.set(e.session, [e]);
  }

  const incoming = new Map<string, { sessions: Set<string>; events: number }>();
  const outgoing = new Map<string, { sessions: Set<string>; events: number }>();
  const visitors = new Set<string>();
  let visits = 0;
  let entries = 0;
  let exits = 0;

  for (const [session, raw] of bySession) {
    const ordered = [...raw].sort((a, b) => a.at.localeCompare(b.at));
    for (let i = 0; i < ordered.length; i++) {
      if (ordered[i].path !== node) continue;
      visits++;
      visitors.add(session);

      if (i === 0) entries++;
      else {
        const prev = ordered[i - 1].path;
        const g = incoming.get(prev) ?? { sessions: new Set(), events: 0 };
        g.sessions.add(session);
        g.events++;
        incoming.set(prev, g);
      }

      if (i === ordered.length - 1) exits++;
      else {
        const next = ordered[i + 1].path;
        const g = outgoing.get(next) ?? { sessions: new Set(), events: 0 };
        g.sessions.add(session);
        g.events++;
        outgoing.set(next, g);
      }
    }
  }

  const toEdges = (m: Map<string, { sessions: Set<string>; events: number }>): FlowEdge[] => {
    const total = [...m.values()].reduce((a, g) => a + g.events, 0);
    return [...m.entries()]
      .map(([path, g]) => ({ path, sessions: g.sessions.size, events: g.events, share: total ? g.events / total : 0 }))
      .sort((a, b) => b.events - a.events);
  };

  return {
    node,
    sessions: visitors.size,
    visits,
    incoming: toEdges(incoming),
    outgoing: toEdges(outgoing),
    entries,
    exits,
    exitRate: visits ? exits / visits : 0,
  };
}

/** The routes worth offering as flow nodes, busiest first. */
export function flowNodes(events: TelemetryEvent[], limit = 30): { path: string; visits: number }[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.kind !== "pageview") continue;
    counts.set(e.path, (counts.get(e.path) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([path, visits]) => ({ path, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * Return behaviour (what retention can honestly be here)              *
 * ------------------------------------------------------------------ */

export interface ReturnBehaviour {
  /** Sessions observed in the window. */
  sessions: number;
  /** Sessions with more than one burst of activity separated by the gap. */
  returning: number;
  returnRate: number;
  gapMinutes: number;
  /** Distribution of how many times a session came back. */
  buckets: { visits: string; sessions: number }[];
  medianSessionMs: number;
  /** Sessions with exactly one page view and nothing else. */
  bounced: number;
  bounceRate: number;
}

/**
 * Within-window return behaviour.
 *
 * Not Azure's Retention blade, and deliberately named differently so nobody
 * reads it as one. The session identifier is re-salted daily by design, so
 * "did this person come back on day 7" is unanswerable from this data — see
 * the note at the top of this file. What *is* answerable is whether a session
 * came back after going quiet, which is the engagement question underneath.
 */
export function returnBehaviour(
  events: TelemetryEvent[],
  opts: { gapMinutes?: number } = {},
): ReturnBehaviour {
  const gapMinutes = opts.gapMinutes ?? 30;
  const gapMs = gapMinutes * 60_000;

  const bySession = new Map<string, number[]>();
  const pageViewCount = new Map<string, number>();
  const eventCount = new Map<string, number>();
  for (const e of events) {
    const t = Date.parse(e.at);
    if (Number.isNaN(t)) continue;
    const list = bySession.get(e.session);
    if (list) list.push(t);
    else bySession.set(e.session, [t]);
    eventCount.set(e.session, (eventCount.get(e.session) ?? 0) + 1);
    if (e.kind === "pageview") pageViewCount.set(e.session, (pageViewCount.get(e.session) ?? 0) + 1);
  }

  let returning = 0;
  let bounced = 0;
  const visitCounts: number[] = [];
  const spans: number[] = [];

  for (const [session, times] of bySession) {
    const sorted = [...times].sort((a, b) => a - b);
    let visits = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] >= gapMs) visits++;
    }
    if (visits > 1) returning++;
    visitCounts.push(visits);
    spans.push(sorted[sorted.length - 1] - sorted[0]);
    if ((pageViewCount.get(session) ?? 0) <= 1 && (eventCount.get(session) ?? 0) <= 1) bounced++;
  }

  const label = (n: number) => (n === 1 ? "1 visit" : n === 2 ? "2 visits" : n <= 4 ? "3–4 visits" : "5+ visits");
  const bucketMap = new Map<string, number>();
  for (const n of visitCounts) bucketMap.set(label(n), (bucketMap.get(label(n)) ?? 0) + 1);
  const order = ["1 visit", "2 visits", "3–4 visits", "5+ visits"];

  const sessions = bySession.size;
  return {
    sessions,
    returning,
    returnRate: sessions ? returning / sessions : 0,
    gapMinutes,
    buckets: order.filter((v) => bucketMap.has(v)).map((visits) => ({ visits, sessions: bucketMap.get(visits)! })),
    medianSessionMs: spans.length ? percentile([...spans].sort((a, b) => a - b), 50) : 0,
    bounced,
    bounceRate: sessions ? bounced / sessions : 0,
  };
}

/* ------------------------------------------------------------------ *
 * Impact                                                              *
 * ------------------------------------------------------------------ */

export interface ImpactBucket {
  label: string;
  lowMs: number;
  highMs: number | null;
  sessions: number;
  converted: number;
  conversionRate: number;
}

export interface ImpactResult {
  goal: string;
  buckets: ImpactBucket[];
  /** Conversion in the fastest bucket minus the slowest, in percentage points. */
  spreadPoints: number;
  sessions: number;
  converted: number;
  baseline: number;
}

const IMPACT_EDGES = [200, 500, 1000, 2500, 5000];

/**
 * Does being slow cost conversions?
 *
 * Buckets sessions by their slowest observed operation and reports how many
 * of each bucket reached the goal. This is a **correlation**, and the UI says
 * so: sessions that convert do more work and so have more chances to be slow,
 * which pushes the relationship in the opposite direction to the one being
 * looked for. Reported as a spread rather than as a cause.
 */
export function impact(
  events: TelemetryEvent[],
  opts: { goalPath: string; match?: FunnelStepSpec["match"] },
): ImpactResult {
  const goalSpec: FunnelStepSpec = { label: "goal", path: opts.goalPath, match: opts.match ?? "exact" };
  const summaries = sessionSummaries(events);

  const bucketFor = (ms: number): { label: string; lowMs: number; highMs: number | null } => {
    for (let i = 0; i < IMPACT_EDGES.length; i++) {
      if (ms < IMPACT_EDGES[i]) {
        return {
          label: i === 0 ? `< ${IMPACT_EDGES[0]} ms` : `${IMPACT_EDGES[i - 1]}–${IMPACT_EDGES[i]} ms`,
          lowMs: i === 0 ? 0 : IMPACT_EDGES[i - 1],
          highMs: IMPACT_EDGES[i],
        };
      }
    }
    return { label: `${IMPACT_EDGES[IMPACT_EDGES.length - 1]} ms+`, lowMs: IMPACT_EDGES[IMPACT_EDGES.length - 1], highMs: null };
  };

  const groups = new Map<string, ImpactBucket>();
  let converted = 0;
  for (const s of summaries) {
    const b = bucketFor(s.worstDurationMs);
    const existing =
      groups.get(b.label) ?? { ...b, sessions: 0, converted: 0, conversionRate: 0 };
    existing.sessions++;
    const hit = s.paths.some((p) => matches(p, goalSpec));
    if (hit) {
      existing.converted++;
      converted++;
    }
    groups.set(b.label, existing);
  }

  const buckets = [...groups.values()]
    .map((b) => ({ ...b, conversionRate: b.sessions ? b.converted / b.sessions : 0 }))
    .sort((a, b) => a.lowMs - b.lowMs);

  const withData = buckets.filter((b) => b.sessions > 0);
  const spreadPoints = withData.length > 1
    ? Math.round((withData[0].conversionRate - withData[withData.length - 1].conversionRate) * 1000) / 10
    : 0;

  return {
    goal: opts.goalPath,
    buckets,
    spreadPoints,
    sessions: summaries.length,
    converted,
    baseline: summaries.length ? converted / summaries.length : 0,
  };
}

/* ------------------------------------------------------------------ *
 * Cohorts                                                             *
 * ------------------------------------------------------------------ */

export interface CohortDefinition {
  id: string;
  name: string;
  /** A `where` expression in the query language — cohorts reuse that parser. */
  filter: string;
}

export interface CohortStats {
  id: string;
  name: string;
  filter: string;
  sessions: number;
  events: number;
  failures: number;
  failureRate: number;
  p95Ms: number;
  /** Share of all sessions in the window that fall in this cohort. */
  share: number;
  error?: string;
}

/**
 * Statistics for a set of events already filtered to the cohort.
 *
 * The filtering itself is the query engine's job — a cohort is a saved `where`
 * clause, and having two ways to express "sessions from mobile" is how the
 * cohort blade and the logs blade come to disagree about who is in it.
 */
export function cohortStats(
  cohort: CohortDefinition,
  matched: TelemetryEvent[],
  totalSessions: number,
): CohortStats {
  const sessions = new Set(matched.map((e) => e.session)).size;
  const failures = matched.filter((e) => !e.ok).length;
  const durations = matched.map((e) => e.durationMs).filter((d) => d > 0).sort((a, b) => a - b);
  return {
    id: cohort.id,
    name: cohort.name,
    filter: cohort.filter,
    sessions,
    events: matched.length,
    failures,
    failureRate: matched.length ? failures / matched.length : 0,
    p95Ms: percentile(durations, 95),
    share: totalSessions ? sessions / totalSessions : 0,
  };
}

/** The cohorts offered before anybody defines their own. */
export const DEFAULT_COHORTS: CohortDefinition[] = [
  { id: "mobile", name: "Mobile visitors", filter: 'userAgentClass == "mobile"' },
  { id: "failed", name: "Sessions that hit an error", filter: "ok == false" },
  { id: "slow", name: "Sessions with a slow operation", filter: "durationMs > 2000" },
  { id: "shop", name: "Shoppers", filter: 'path startswith "/shop"' },
  { id: "console", name: "Console users", filter: 'path startswith "/smarthome"' },
];
