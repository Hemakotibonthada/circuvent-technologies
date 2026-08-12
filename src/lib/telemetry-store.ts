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
  failureGroups,
  journeys,
  normaliseEvent,
  pathStats,
  summarise,
  withinHours,
  type TelemetryEvent,
  requestStats,
  statusBreakdown,
} from "./app-insights";

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
    received: receivedCount(),
    retained: allEvents().length,
    capacity: MAX_EVENTS,
    hours,
    now,
  };
}

export function clearTelemetry(): void {
  store.mutate((db) => {
    db.events = [];
  });
}

export function isDurable(): boolean {
  return store.isDurable();
}
