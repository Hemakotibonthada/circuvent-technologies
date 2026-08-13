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
} from "./app-insights";
import { detectAnomalies } from "./insights-anomalies";
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
    availability: availability(windowed),
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