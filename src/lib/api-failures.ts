// Cross-application API failures, for the App Insights panel.
//
// Kept apart from the browser telemetry buffer on purpose. That buffer holds
// twenty thousand mostly-successful page views and is rewritten by every
// beacon; making it durable would mean a database write per beacon for data
// that is only ever read in aggregate. This holds one thing — a request that
// failed — from every application in the suite, with enough context to answer
// the question support actually asks: *which* API failed, for *whom*, and why.
//
// It is durable, because a failure record that lives in one lambda's memory is
// not a record of anything. That was already true of the warranty register and
// of this file's larger sibling; it is the failure this codebase repeats.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";

/** The applications allowed to report. An unknown name is filed, not dropped. */
export const KNOWN_APPS = [
  "website",
  "smarthome",
  "auth",
  "ats",
  "hrms",
  "mail",
  "career",
  "office",
  "cv365",
  "mobile",
] as const;

export interface ApiFailure {
  id: string;
  at: string;
  /** Which application. Not the same as "surface" — see TelemetryEvent.source. */
  app: string;
  /** Normalised route, never the raw URL: /api/candidates/[id]. */
  route: string;
  method: string;
  status: number;
  /**
   * The signed-in person, when there was one.
   *
   * Deliberately different from `TelemetryEvent.session`, which is anonymous
   * and must stay that way — that one describes customers. This describes staff
   * using internal tools, where "Priya cannot save a candidate" is the whole
   * question and an anonymous hash cannot answer it. Only ever set by a trusted
   * server that already authenticated the request.
   */
  actor?: string;
  actorRole?: string;
  errorType?: string;
  errorMessage?: string;
  stack?: string;
  /** Ties one failure to the same request seen in another app. */
  requestId?: string;
  durationMs?: number;
}

interface FailureDB {
  failures: ApiFailure[];
  received: number;
}

/*
 * Bounded twice: by count, so the document cannot grow without limit, and by
 * age, so a quiet month does not leave the panel showing failures nobody can
 * act on any more.
 */
export const MAX_FAILURES = 3000;
export const MAX_AGE_DAYS = 30;

const store = createFileStore<FailureDB>(
  "admin-api-failures.json",
  () => ({ failures: [], received: 0 }),
  { durable: true }
);

export async function revalidateFailures(): Promise<void> {
  await store.hydrate();
}

export async function flushFailures(): Promise<void> {
  await store.flush();
}

// ─────────────────────────────────────────────────── normalising input ──

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{24,}\b/g;
const EMAIL = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g;

/**
 * Collapses the varying parts of a path so one broken endpoint is one row.
 *
 * Without this, `/api/candidates/8f21…` and `/api/candidates/1c04…` are two
 * separate failures and the panel shows a thousand singletons instead of one
 * problem with a thousand occurrences — which is the difference between
 * noticing an outage and scrolling past it.
 */
export function normaliseRoute(path: string): string {
  if (!path) return "/";
  const withoutQuery = path.split("?")[0].split("#")[0];
  return (
    withoutQuery
      .replace(UUID, "[id]")
      // A bare number is an id; a version like /v1/ is not.
      .replace(/\/\d{2,}(?=\/|$)/g, "/[id]")
      .replace(/\/[0-9a-f]{16,}(?=\/|$)/gi, "/[id]")
      .slice(0, 200) || "/"
  );
}

/**
 * Removes the parts of an error message that should not be kept.
 *
 * Database drivers and HTTP clients put the offending value straight into the
 * message, so a failed insert can carry somebody's address and a failed auth
 * call can carry the credential it just tried. The panel needs the shape of
 * the error, not its payload.
 */
export function redactMessage(message: string, keep?: string): string {
  if (!message) return "";
  const preserved = keep?.trim().toLowerCase();
  return message
    .replace(EMAIL, (m) => (preserved && m.toLowerCase() === preserved ? m : "[email]"))
    .replace(UUID, "[id]")
    .replace(LONG_TOKEN, "[redacted]")
    .slice(0, 300);
}

/** First few frames only: enough to place the fault, not a whole core dump. */
export function trimStack(stack: string | undefined, frames = 5): string | undefined {
  if (!stack) return undefined;
  return stack
    .split("\n")
    .slice(0, frames + 1)
    .join("\n")
    .slice(0, 1200);
}

/**
 * The grouping key — what counts as "the same problem".
 *
 * Application, route, method and error type, plus a message with its variable
 * parts already removed. Including the raw message would split one fault across
 * every id it mentioned; excluding the message entirely would merge every
 * `Error` on a route into one unreadable pile.
 */
export function failureSignature(f: Pick<ApiFailure, "app" | "method" | "route" | "errorType" | "errorMessage">): string {
  const shape = (f.errorMessage ?? "")
    .replace(/\d+/g, "N")
    .replace(/\[[a-z]+\]/g, "V")
    .trim()
    .slice(0, 120);
  return [f.app, f.method, f.route, f.errorType || "Error", shape].join(" | ");
}

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
};

/** Turns one untrusted payload into a record, or null if it is not usable. */
export function normaliseFailure(raw: unknown, ctx: { app: string; now: string }): ApiFailure | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const route = str(r.route ?? r.path, 200);
  if (!route) return null;

  const status = Number(r.status);
  const actor = str(r.actor, 160)?.toLowerCase();

  return {
    id: shortId("fail"),
    at: str(r.at, 40) ?? ctx.now,
    app: ctx.app,
    route: normaliseRoute(route),
    method: (str(r.method, 10) ?? "GET").toUpperCase(),
    status: Number.isFinite(status) ? Math.max(0, Math.min(599, Math.round(status))) : 500,
    actor,
    actorRole: str(r.actorRole, 40),
    errorType: str(r.errorType, 80),
    errorMessage: redactMessage(str(r.errorMessage, 400) ?? "", actor) || undefined,
    stack: trimStack(str(r.stack, 4000)),
    requestId: str(r.requestId, 80),
    durationMs: Number.isFinite(Number(r.durationMs)) ? Math.round(Number(r.durationMs)) : undefined,
  };
}

// ───────────────────────────────────────────────────────────── writing ──

export function recordFailures(raw: unknown[], ctx: { app: string; now?: string }): number {
  const now = ctx.now ?? new Date().toISOString();
  const batch = raw
    .slice(0, 50) // one report cannot flood the document
    .map((r) => normaliseFailure(r, { app: ctx.app, now }))
    .filter((f): f is ApiFailure => f !== null);

  if (!batch.length) return 0;

  store.mutate((db) => {
    db.received += batch.length;
    db.failures.push(...batch);

    const cutoff = new Date(Date.parse(now) - MAX_AGE_DAYS * 86_400_000).toISOString();
    let kept = db.failures.filter((f) => f.at >= cutoff);
    if (kept.length > MAX_FAILURES) kept = kept.slice(kept.length - MAX_FAILURES);
    db.failures = kept;
  });

  return batch.length;
}

// ───────────────────────────────────────────────────────────── reading ──

export function allFailures(): ApiFailure[] {
  return store.read().failures;
}

export function receivedCount(): number {
  return store.read().received;
}

export function isDurable(): boolean {
  return store.isDurable();
}

export interface FailureGroup {
  signature: string;
  app: string;
  route: string;
  method: string;
  errorType: string;
  sampleMessage?: string;
  sampleStack?: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  statuses: number[];
  /** Distinct signed-in people affected, most recent first. */
  actors: string[];
  /** True when nobody signed in was involved — a public or unauthenticated call. */
  anonymousOnly: boolean;
}

function withinHours(list: ApiFailure[], hours: number, now: string): ApiFailure[] {
  const cutoff = new Date(Date.parse(now) - hours * 3_600_000).toISOString();
  return list.filter((f) => f.at >= cutoff);
}

/**
 * Failures grouped by root cause, worst first.
 *
 * "Worst" is the number of occurrences, then how recent — a fault that has
 * happened four hundred times and is still happening outranks one that
 * happened four hundred times last Tuesday and stopped.
 */
export function failureGroups(hours = 24, now = new Date().toISOString()): FailureGroup[] {
  const groups = new Map<string, FailureGroup>();

  for (const f of withinHours(allFailures(), hours, now)) {
    const signature = failureSignature(f);
    const existing = groups.get(signature);
    if (existing) {
      existing.count += 1;
      if (f.at < existing.firstSeen) existing.firstSeen = f.at;
      if (f.at > existing.lastSeen) {
        existing.lastSeen = f.at;
        existing.sampleMessage = f.errorMessage ?? existing.sampleMessage;
        existing.sampleStack = f.stack ?? existing.sampleStack;
      }
      if (!existing.statuses.includes(f.status)) existing.statuses.push(f.status);
      if (f.actor && !existing.actors.includes(f.actor)) existing.actors.push(f.actor);
      if (f.actor) existing.anonymousOnly = false;
    } else {
      groups.set(signature, {
        signature,
        app: f.app,
        route: f.route,
        method: f.method,
        errorType: f.errorType || "Error",
        sampleMessage: f.errorMessage,
        sampleStack: f.stack,
        count: 1,
        firstSeen: f.at,
        lastSeen: f.at,
        statuses: [f.status],
        actors: f.actor ? [f.actor] : [],
        anonymousOnly: !f.actor,
      });
    }
  }

  return [...groups.values()].sort(
    (a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen)
  );
}

export interface AffectedPerson {
  actor: string;
  count: number;
  apps: string[];
  lastSeen: string;
  /** The thing going wrong for them most often. */
  topRoute: string;
  topError: string;
}

/**
 * Who is actually being stopped from working.
 *
 * The list support needs when somebody says "it is broken for me": one row per
 * person, what they were trying to do, and in which application.
 */
export function affectedPeople(hours = 24, now = new Date().toISOString()): AffectedPerson[] {
  const people = new Map<string, { rows: ApiFailure[]; apps: Set<string> }>();

  for (const f of withinHours(allFailures(), hours, now)) {
    if (!f.actor) continue;
    const entry = people.get(f.actor) ?? { rows: [], apps: new Set<string>() };
    entry.rows.push(f);
    entry.apps.add(f.app);
    people.set(f.actor, entry);
  }

  const commonest = (values: string[]): string => {
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  };

  return [...people.entries()]
    .map(([actor, { rows, apps }]) => ({
      actor,
      count: rows.length,
      apps: [...apps].sort(),
      lastSeen: rows.reduce((max, r) => (r.at > max ? r.at : max), rows[0].at),
      topRoute: commonest(rows.map((r) => `${r.method} ${r.route}`)),
      topError: commonest(rows.map((r) => r.errorType || "Error")),
    }))
    .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen));
}

export interface AppHealth {
  app: string;
  failures: number;
  people: number;
  lastSeen: string;
}

/** One row per application, so a suite-wide problem is visible at a glance. */
export function appBreakdown(hours = 24, now = new Date().toISOString()): AppHealth[] {
  const apps = new Map<string, { count: number; people: Set<string>; lastSeen: string }>();

  for (const f of withinHours(allFailures(), hours, now)) {
    const entry = apps.get(f.app) ?? { count: 0, people: new Set<string>(), lastSeen: f.at };
    entry.count += 1;
    if (f.actor) entry.people.add(f.actor);
    if (f.at > entry.lastSeen) entry.lastSeen = f.at;
    apps.set(f.app, entry);
  }

  return [...apps.entries()]
    .map(([app, v]) => ({ app, failures: v.count, people: v.people.size, lastSeen: v.lastSeen }))
    .sort((a, b) => b.failures - a.failures);
}

/** Every failure for one person, newest first — the support drill-down. */
export function failuresForActor(
  actor: string,
  hours = 24,
  now = new Date().toISOString()
): ApiFailure[] {
  const target = actor.trim().toLowerCase();
  return withinHours(allFailures(), hours, now)
    .filter((f) => f.actor === target)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function clearFailures(): void {
  store.write({ failures: [], received: 0 });
}
