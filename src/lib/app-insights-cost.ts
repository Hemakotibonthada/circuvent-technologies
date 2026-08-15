/**
 * Ingestion volume, retention headroom and sampling — Azure's "Usage and
 * estimated costs" and "Sampling" blades, for a buffer rather than a bill.
 *
 * The numbers here are about a **fixed-size ring buffer**, not about money.
 * telemetry-store.ts keeps the most recent MAX_EVENTS and drops the oldest, so
 * the question this answers is not "what will this cost" — nothing is billed —
 * but the one that actually bites: *how far back does the buffer still reach,
 * and what is about to fall out of it.*
 *
 * A panel that reports 20,000 of 20,000 events retained looks healthy and is
 * in fact the worst case: it means the window is full and the oldest evidence
 * is being discarded on every new event. That is exactly when somebody is
 * looking for a failure that happened an hour ago and finding nothing.
 *
 * An estimated cost is still produced, because the same buffer under Azure's
 * meter is a real number a team can act on when deciding whether to move this
 * to a hosted collector. It is labelled as an estimate at Azure's public
 * per-GB rate and nothing depends on it.
 *
 * Pure: counts in, arithmetic out.
 */

import type { EventKind, TelemetryEvent } from "./app-insights";

/** Azure Monitor's pay-as-you-go rate per GB ingested, after the free grant. */
export const AZURE_PER_GB_USD = 2.3;
/** The monthly free grant Azure applies before charging. */
export const AZURE_FREE_GB_PER_MONTH = 5;

/**
 * Bytes an event occupies once serialised into the store.
 *
 * Measured rather than guessed: the store writes JSON, so the honest unit is
 * the length of the JSON. Sampled instead of totalled because stringifying
 * 20,000 events to draw one gauge is the observability system becoming the
 * load, which is the thing this whole panel exists to catch.
 */
export function averageEventBytes(events: TelemetryEvent[], sampleSize = 200): number {
  if (!events.length) return 0;
  const step = Math.max(1, Math.floor(events.length / sampleSize));
  let total = 0;
  let taken = 0;
  for (let i = 0; i < events.length; i += step) {
    total += JSON.stringify(events[i]).length;
    taken++;
  }
  return taken ? Math.round(total / taken) : 0;
}

export interface VolumeByKind {
  kind: EventKind;
  events: number;
  bytes: number;
  share: number;
}

export interface UsageEstimate {
  /** Events currently held. */
  retained: number;
  /** Events ever accepted, including those the cap has since dropped. */
  received: number;
  /** Events dropped by the cap. */
  dropped: number;
  capacity: number;
  /** 0..1 — how full the ring buffer is. */
  utilisation: number;
  averageBytes: number;
  retainedBytes: number;
  /** Events per hour, measured over the retained window. */
  eventsPerHour: number;
  /** Hours of history the buffer currently holds. */
  windowHours: number;
  /**
   * Hours of history the buffer will hold at the current rate once full.
   * This is the number that matters: it is how far back an investigation can
   * still see tomorrow.
   */
  projectedWindowHours: number;
  /** Estimated GB per 30 days at the current rate. */
  projectedGbPerMonth: number;
  estimatedMonthlyUsd: number;
  byKind: VolumeByKind[];
  /** Oldest and newest event held, or null on an empty buffer. */
  oldestAt: string | null;
  newestAt: string | null;
}

export function estimateUsage(
  events: TelemetryEvent[],
  opts: { received: number; capacity: number; now?: string },
): UsageEstimate {
  const now = opts.now ? Date.parse(opts.now) : Date.now();
  const retained = events.length;
  const averageBytes = averageEventBytes(events);
  const retainedBytes = retained * averageBytes;

  let oldest: number | null = null;
  let newest: number | null = null;
  const kinds = new Map<EventKind, number>();
  for (const e of events) {
    const t = Date.parse(e.at);
    if (!Number.isNaN(t)) {
      if (oldest === null || t < oldest) oldest = t;
      if (newest === null || t > newest) newest = t;
    }
    kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  }

  /*
   * Rate is measured from the oldest retained event to *now*, not to the
   * newest. Measuring to the newest makes a system that stopped reporting an
   * hour ago look like it is still running at its old rate, which is the one
   * moment the rate matters.
   */
  const spanMs = oldest === null ? 0 : Math.max(0, now - oldest);
  const spanHours = spanMs / 3_600_000;
  const eventsPerHour = spanHours > 0 ? retained / spanHours : 0;

  const projectedWindowHours = eventsPerHour > 0 ? opts.capacity / eventsPerHour : 0;
  const gbPerMonth = (eventsPerHour * 24 * 30 * averageBytes) / 1_000_000_000;
  const billableGb = Math.max(0, gbPerMonth - AZURE_FREE_GB_PER_MONTH);

  const byKind: VolumeByKind[] = [...kinds.entries()]
    .map(([kind, count]) => ({
      kind,
      events: count,
      bytes: count * averageBytes,
      share: retained ? count / retained : 0,
    }))
    .sort((a, b) => b.events - a.events);

  return {
    retained,
    received: opts.received,
    dropped: Math.max(0, opts.received - retained),
    capacity: opts.capacity,
    utilisation: opts.capacity ? retained / opts.capacity : 0,
    averageBytes,
    retainedBytes,
    eventsPerHour: Math.round(eventsPerHour),
    windowHours: Math.round(spanHours * 10) / 10,
    projectedWindowHours: Math.round(projectedWindowHours * 10) / 10,
    projectedGbPerMonth: Math.round(gbPerMonth * 1000) / 1000,
    estimatedMonthlyUsd: Math.round(billableGb * AZURE_PER_GB_USD * 100) / 100,
    byKind,
    oldestAt: oldest === null ? null : new Date(oldest).toISOString(),
    newestAt: newest === null ? null : new Date(newest).toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * Sampling                                                            *
 * ------------------------------------------------------------------ */

export interface SamplingAdvice {
  /** The share of events that should be kept, 0..1. 1 means keep everything. */
  recommendedRate: number;
  /** Hours of history that rate would buy at the current volume. */
  resultingWindowHours: number;
  reason: string;
  severity: "ok" | "warn" | "critical";
  /** The kind contributing most volume, if one dominates. */
  dominantKind: EventKind | null;
}

/** Hours of history worth keeping. Below this an investigation outlives the evidence. */
export const TARGET_WINDOW_HOURS = 24;

/**
 * What to do about volume.
 *
 * Recommends a sampling rate rather than applying one. Sampling is a decision
 * with a cost — a sampled buffer can no longer answer "how many times exactly"
 * — so it belongs to a person, and the panel's job is to make the trade
 * visible rather than to quietly make it.
 */
export function samplingAdvice(usage: UsageEstimate): SamplingAdvice {
  const dominant = usage.byKind.length && usage.byKind[0].share > 0.6 ? usage.byKind[0].kind : null;

  if (usage.eventsPerHour <= 0) {
    return {
      recommendedRate: 1,
      resultingWindowHours: 0,
      reason: "Nothing is arriving, so there is nothing to sample.",
      severity: "ok",
      dominantKind: null,
    };
  }

  if (usage.projectedWindowHours >= TARGET_WINDOW_HOURS) {
    return {
      recommendedRate: 1,
      resultingWindowHours: usage.projectedWindowHours,
      reason:
        `At ${usage.eventsPerHour.toLocaleString()} events an hour the buffer holds about ` +
        `${Math.round(usage.projectedWindowHours)} hours. Keep everything — sampling would ` +
        `cost exact counts and buy history nobody needs.`,
      severity: "ok",
      dominantKind: dominant,
    };
  }

  /*
   * Rounded to a readable fraction. A recommendation of 0.3714 invites
   * somebody to type it in exactly, which implies a precision the estimate
   * does not have.
   */
  const raw = usage.projectedWindowHours / TARGET_WINDOW_HOURS;
  const steps = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75];
  const rate = steps.find((s) => s >= raw) ?? 1;
  const resulting = usage.projectedWindowHours / rate;

  return {
    recommendedRate: rate,
    resultingWindowHours: Math.round(resulting * 10) / 10,
    reason:
      `At ${usage.eventsPerHour.toLocaleString()} events an hour the buffer only reaches back ` +
      `about ${Math.round(usage.projectedWindowHours)} hours, so a failure from this morning is ` +
      `already gone. Keeping ${Math.round(rate * 100)}% would reach roughly ` +
      `${Math.round(resulting)} hours.` +
      (dominant ? ` Most of the volume is ${dominant} events — sample those first.` : ""),
    severity: usage.projectedWindowHours < TARGET_WINDOW_HOURS / 4 ? "critical" : "warn",
    dominantKind: dominant,
  };
}

/**
 * Deterministic sampling by session.
 *
 * Hashes the session rather than rolling a die per event, so a sampled session
 * keeps **all** of its events or none of them. Per-event sampling shreds
 * exactly the thing the journeys and funnel blades read — half a session is
 * not a smaller journey, it is a wrong one, and a funnel over per-event
 * samples reports drop-off that never happened.
 */
export function sampleEvents(events: TelemetryEvent[], rate: number): TelemetryEvent[] {
  if (rate >= 1) return events;
  if (rate <= 0) return [];
  const threshold = Math.floor(rate * 0xffffffff);
  return events.filter((e) => hash32(e.session) <= threshold);
}

/** FNV-1a. Small, stable across runs, and not a security boundary. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Human sizes for the blade. Binary units, since this is memory and file size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
