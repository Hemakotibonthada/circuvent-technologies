/**
 * Telemetry storage.
 *
 * A ring buffer with a hard cap, not an append-only log. Telemetry arrives from
 * every browser on every page, so the only question is how it is *bounded* —
 * an unbounded file store here would grow until the disk or the JSON parser
 * gave out, and it would do so fastest exactly when something is wrong and
 * every session is throwing.
 *
 * The cap is on events, and old events fall off the end. Losing last week's
 * page views is fine; losing this afternoon's exceptions because last week's
 * page views filled the disk is not.
 *
 * SERVER ONLY.
 */
import { createHash } from "node:crypto";
import { createFileStore } from "./data-file";
import {
  metricSeries,
  type MetricId,
  type SplitBy,
  failureGroups,
  journeys,
  normaliseEvent,
  pathStats,
  summarise,
  withinHours,
  type TelemetryEvent,
  requestStats,
  statusBreakdown,
  operationPerf,
  durationHistogram,
  queryEvents,
  dependencyStats,
  applicationMap,
  availability,
  availabilityTimeline,
  availabilityResults,
  percentile,
} from "./app-insights";
import { detectAnomalies } from "./insights-anomalies";
import { runQuery, type QueryResult } from "./app-insights-query";
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
  type CohortDefinition,
  type FunnelStepSpec,
  type UsageDimension,
} from "./app-insights-usage";
import { estimateUsage, samplingAdvice } from "./app-insights-cost";
import {
  evaluateRules,
  validateRule,
  defaultRules,
  type AlertRule,
} from "./insights-alert-rules";

interface TelemetryDB {
  events: TelemetryEvent[];
  /** Everything ever received, so the panel can say what the cap has dropped. */
  received: number;
}

/*
 * Roughly a day of moderate traffic. Chosen to keep the JSON file in the low
 * megabytes: each event is a few hundred bytes, and this store is read into
 * memory whole.
 */
const MAX_EVENTS = 20_000;

const store = createFileStore<TelemetryDB>("admin-telemetry.json", () => ({ events: [], received: 0 }));

/**
 * A rotating, anonymous session id.
 *
 * Derived from IP + user agent + the day, salted, and never stored in reverse.
 * This is deliberately not an identity: it is enough to say "these six page
 * views were the same person's journey" and not enough to say who they were, or
 * to join today's session to yesterday's. That is the right trade for a crash
 * report, and it means the panel can be shown to staff without handing them a
 * tracking database.
 */
export function sessionId(ip: string, userAgent: string, day = new Date().toISOString().slice(0, 10)): string {
  return createHash("sha256")
    .update(`${ip}|${userAgent}|${day}|circuvent-telemetry`)
    .digest("hex")
    .slice(0, 16);
}

/** Accepts a batch from a beacon. Returns how many were usable. */
export function ingest(
  raw: unknown[],
  ctx: { session: string; source: string; now?: string }
): number {
  const now = ctx.now ?? new Date().toISOString();
  const events = raw
    .slice(0, 50) // a single beacon cannot flood the buffer
    .map((r) => normaliseEvent(r, { now, session: ctx.session, source: ctx.source }))
    .filter((e): e is TelemetryEvent => e !== null);

  if (!events.length) return 0;

  store.mutate((db) => {
    db.received += events.length;
    db.events.push(...events);
    if (db.events.length > MAX_EVENTS) db.events.splice(0, db.events.length - MAX_EVENTS);
  });

  return events.length;
}

export function allEvents(): TelemetryEvent[] {
  return store.read().events;
}

export function receivedCount(): number {
  return store.read().received;
}

/** Everything the panel needs for one window, computed in one pass over the buffer. */
export function insightsView(hours: number, now = new Date().toISOString()) {
  const windowed = withinHours(allEvents(), hours, now);
  return {
    summary: summarise(windowed, hours, now),
    paths: pathStats(windowed).slice(0, 100),
    failures: failureGroups(windowed).slice(0, 100),
    journeys: journeys(windowed, 40),
    requests: requestStats(windowed).slice(0, 100),
    statuses: statusBreakdown(windowed),
    performance: operationPerf(windowed).slice(0, 100),
    histogram: durationHistogram(windowed, "request"),
    recent: queryEvents(windowed, { limit: 200 }, now),
    dependencies: dependencyStats(windowed).slice(0, 100),
    map: applicationMap(windowed),
    availability: availability(allEvents()),
    /* The line the blade draws, and the individual results behind it. Both
       run over the whole buffer: a daily prober puts very few checks in any
       one window, and an availability chart of two points is not a chart. */
    availabilitySeries: availabilityTimeline(allEvents(), { hours, now }),
    availabilityResults: availabilityResults(allEvents(), { limit: 60 }),
    // Detection runs over the whole retained buffer, not the selected window:
    // it needs a baseline older than the window it is judging.
    anomalies: detectAnomalies(allEvents(), now),
    /*
     * When the scheduled sweep last ran, over the whole buffer rather than the
     * selected window.
     *
     * Without this, a monitoring system that has never run looks exactly like
     * one where nothing is wrong: no failures recorded, every uptime figure
     * either 100% or absent. The sweep needs CRON_SECRET set in the deployment
     * and a scheduler configured to call it, and neither leaves any other
     * trace in the product when it is missing.
     */
    lastSweepAt:
      allEvents()
        .filter((e) => e.source === "probe")
        .reduce<string | null>((latest, e) => (!latest || e.at > latest ? e.at : latest), null),
    received: receivedCount(),
    retained: allEvents().length,
    capacity: MAX_EVENTS,
    hours,
    now,
  };
}

/**
 * The metrics explorer's data source.
 *
 * Separate from insightsView because it is parameterised by the question being
 * asked, and because the panel only ever holds the most recent 200 events —
 * far too few to chart a day.
 */
export function metricsView(
  opts: { metric: MetricId; splitBy?: SplitBy; hours?: number; bucketMinutes?: number; topN?: number },
  now = new Date().toISOString()
) {
  return { ...metricSeries(allEvents(), { ...opts, now }), now };
}

export function clearTelemetry(): void {
  store.mutate((db) => {
    db.events = [];
  });
}

/* ------------------------------------------------------------------ *
 * Logs, Usage and Configure views                                     *
 * ------------------------------------------------------------------ */

/**
 * Runs a query from the Logs blade.
 *
 * Over the whole buffer rather than the selected window: the window is a
 * property of the charts, and a query that carries its own `where at > ago(6h)`
 * being silently intersected with a dropdown nobody was looking at is how
 * somebody concludes the data is missing.
 */
export function queryView(text: string, maxRows?: number, now = new Date().toISOString()): QueryResult {
  return runQuery(allEvents(), text, { now, maxRows });
}

/** Sessions, funnels, flows and the rest, for one window. */
export function usageView(
  opts: { hours: number; dimension?: UsageDimension; flowNode?: string; bucketMinutes?: number },
  now = new Date().toISOString(),
) {
  const windowed = withinHours(allEvents(), opts.hours, now);
  const sessions = sessionSummaries(windowed);
  const nodes = flowNodes(windowed);
  const node = opts.flowNode && nodes.some((n) => n.path === opts.flowNode) ? opts.flowNode : nodes[0]?.path;

  return {
    hours: opts.hours,
    now,
    overTime: usageOverTime(windowed, { hours: opts.hours, now, bucketMinutes: opts.bucketMinutes }),
    breakdown: usageBreakdown(windowed, opts.dimension ?? "path").slice(0, 40),
    dimension: opts.dimension ?? "path",
    sessions: sessions.slice(0, 100),
    totals: {
      sessions: sessions.length,
      events: windowed.length,
      pageViews: windowed.filter((e) => e.kind === "pageview").length,
      failures: windowed.filter((e) => !e.ok).length,
    },
    returns: returnBehaviour(windowed),
    flowNodes: nodes,
    flow: node ? userFlows(windowed, node) : null,
  };
}

/** A funnel, evaluated over the window. Steps come from the caller. */
export function funnelView(steps: FunnelStepSpec[], hours: number, now = new Date().toISOString()) {
  return { hours, now, ...funnel(withinHours(allEvents(), hours, now), steps) };
}

/** Impact of slowness on reaching a goal route. */
export function impactView(goalPath: string, hours: number, now = new Date().toISOString()) {
  return { hours, now, ...impact(withinHours(allEvents(), hours, now), { goalPath }) };
}

/**
 * Cohort statistics.
 *
 * Each cohort's membership is decided by the query engine, so a cohort and a
 * hand-written `where` clause in the Logs blade always select the same
 * sessions. A cohort whose filter no longer parses reports the parser's
 * message rather than quietly matching nothing, which would read as "this
 * group has stopped using the product".
 */
export function cohortView(
  cohorts: CohortDefinition[],
  hours: number,
  now = new Date().toISOString(),
) {
  const windowed = withinHours(allEvents(), hours, now);
  const totalSessions = new Set(windowed.map((e) => e.session)).size;

  const stats = cohorts.map((c) => {
    try {
      const matched = runQuery(windowed, `telemetry | where ${c.filter}`, { now });
      const ids = new Set(matched.rows.map((r) => String(r.id)));
      return cohortStats(c, windowed.filter((e) => ids.has(e.id)), totalSessions);
    } catch (err) {
      return {
        ...cohortStats(c, [], totalSessions),
        error: err instanceof Error ? err.message : "That filter could not be read.",
      };
    }
  });

  return { hours, now, totalSessions, cohorts: stats };
}

/** Ingestion volume, buffer headroom and the sampling recommendation. */
export function costView(now = new Date().toISOString()) {
  const usage = estimateUsage(allEvents(), {
    received: receivedCount(),
    capacity: MAX_EVENTS,
    now,
  });
  return { now, usage, advice: samplingAdvice(usage) };
}

/**
 * Live Metrics — the last minute, per second.
 *
 * Deliberately tiny. This is polled roughly once a second, so it must not be
 * the `insightsView` pass over 20,000 events: an observability console that
 * costs a full aggregation every second becomes the busiest client of the API
 * it is watching, and its own load is then the anomaly it reports. Only events
 * inside the live window are touched.
 */
export const LIVE_WINDOW_SECONDS = 60;

export function liveView(now = new Date().toISOString()) {
  const end = Date.parse(now);
  const start = end - LIVE_WINDOW_SECONDS * 1000;

  const buckets = new Map<number, { events: number; failures: number; durations: number[]; sessions: Set<string> }>();
  for (let t = Math.floor(start / 1000) * 1000; t <= end; t += 1000) {
    buckets.set(t, { events: 0, failures: 0, durations: [], sessions: new Set() });
  }

  const recent: TelemetryEvent[] = [];
  for (const e of allEvents()) {
    const t = Date.parse(e.at);
    if (Number.isNaN(t) || t < start || t > end) continue;
    const b = buckets.get(Math.floor(t / 1000) * 1000);
    if (!b) continue;
    b.events++;
    if (!e.ok) b.failures++;
    if (e.durationMs > 0) b.durations.push(e.durationMs);
    b.sessions.add(e.session);
    recent.push(e);
  }

  const points = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, b]) => ({
      at: new Date(t).toISOString(),
      events: b.events,
      failures: b.failures,
      sessions: b.sessions.size,
      p95: b.durations.length ? percentile([...b.durations].sort((x, y) => x - y), 95) : 0,
    }));

  const total = points.reduce((a, p) => a + p.events, 0);
  const failures = points.reduce((a, p) => a + p.failures, 0);
  const allDurations = recent.map((e) => e.durationMs).filter((d) => d > 0).sort((a, b) => a - b);

  return {
    now,
    windowSeconds: LIVE_WINDOW_SECONDS,
    points,
    /* Per-second rates rather than totals: "12 requests" over an unstated
       window is not a rate, and the whole point of this blade is the rate. */
    perSecond: Math.round((total / LIVE_WINDOW_SECONDS) * 100) / 100,
    failuresPerSecond: Math.round((failures / LIVE_WINDOW_SECONDS) * 100) / 100,
    failureRate: total ? failures / total : 0,
    sessions: new Set(recent.map((e) => e.session)).size,
    p95: percentile(allDurations, 95),
    /* A live tail, newest first. Capped: this is a glance, not the Logs blade. */
    samples: [...recent].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25),
  };
}

/** The cohorts offered before anybody saves their own. */
export { DEFAULT_COHORTS };

export function isDurable(): boolean {
  return store.isDurable();
}

/* ------------------------------------------------------------------ *
 * Alert rules
 *
 * Kept in their own document rather than beside the events: the buffer is
 * volatile and capped, and rules are neither.
 * ------------------------------------------------------------------ */

interface RulesDB {
  rules: AlertRule[];
  /** Whether the defaults have been installed, so deleting one is permanent. */
  seeded: boolean;
}

const rulesStore = createFileStore<RulesDB>("admin-alert-rules.json", () => ({
  rules: [],
  seeded: false,
}));

export function listRules(now = new Date().toISOString()): AlertRule[] {
  const db = rulesStore.read();
  if (!db.seeded) {
    /*
     * Seeded once, then never again. Re-adding the defaults on every read would
     * resurrect rules somebody deliberately deleted, which is the observability
     * equivalent of a smoke alarm that reinstalls itself.
     */
    return rulesStore.mutate((d) => {
      d.rules = defaultRules(now);
      d.seeded = true;
      return d.rules;
    });
  }
  return db.rules;
}

export function saveRule(input: AlertRule): { rule: AlertRule | null; error: string } {
  const error = validateRule(input);
  if (error) return { rule: null, error };

  return rulesStore.mutate((db) => {
    if (!db.seeded) {
      db.rules = defaultRules(input.createdAt);
      db.seeded = true;
    }
    const idx = db.rules.findIndex((r) => r.id === input.id);
    if (idx >= 0) db.rules[idx] = input;
    else db.rules.push(input);
    return { rule: input, error: "" };
  });
}

export function deleteRule(id: string): { error: string } {
  return rulesStore.mutate((db) => {
    if (!db.rules.some((r) => r.id === id)) return { error: "No such rule." };
    db.rules = db.rules.filter((r) => r.id !== id);
    db.seeded = true;
    return { error: "" };
  });
}

/** Evaluates every rule against the retained buffer. */
export function evaluateAlertRules(now = new Date().toISOString()) {
  return evaluateRules(listRules(now), allEvents(), now);
}