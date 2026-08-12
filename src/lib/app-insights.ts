/**
 * Application telemetry — the model behind the App Insights panel.
 *
 * Pure, like icm.ts: it takes events and returns aggregates. The ingest buffer
 * and the HTTP surface live elsewhere.
 *
 * What this deliberately is *not* is a second analytics system. The shop
 * already has traffic.ts (path normalisation, visitor hashing, bot detection)
 * and metrics.ts (endpoint latency percentiles), both of which answer marketing
 * questions: how many people came, from where, on what. This answers the
 * engineering ones — which paths are actually being used, what is failing, and
 * how slowly — and reuses those primitives rather than reimplementing them,
 * because a second definition of "is this a bot" is a second thing to be wrong.
 */

export type EventKind = "pageview" | "request" | "dependency" | "exception" | "event";

export interface TelemetryEvent {
  id: string;
  kind: EventKind;
  at: string;
  /** Normalised route, e.g. /smarthome/device/[id] — never the raw URL. */
  path: string;
  /** Anonymous, rotating; see traffic.ts visitorHash. Never an identity. */
  session: string;
  durationMs: number;
  /** HTTP status for requests; 0 where it does not apply. */
  status: number;
  /** HTTP verb for requests. A GET and a DELETE to one route are not one row. */
  method?: string;
  /**
   * For dependencies: the service that was called.
   *
   * Requests are inbound to us and dependencies are outbound from us. A table
   * that mixes them cannot tell "our API is slow" from "the service our API
   * waits on is slow", which are different problems with different owners.
   */
  target?: string;
  ok: boolean;
  /** Exception detail. Present only on failures. */
  errorType?: string;
  errorMessage?: string;
  /** First few frames only — see `trimStack`. */
  stack?: string;
  /** "web" | "mobile" | "api" — which surface produced it. */
  source: string;
  userAgentClass?: string;
}

export interface PathStat {
  path: string;
  views: number;
  sessions: number;
  failures: number;
  failureRate: number;
  p50: number;
  p95: number;
  avg: number;
  lastSeen: string;
}

export interface FailureGroup {
  /** Stable identity of "the same bug", see `failureKey`. */
  key: string;
  errorType: string;
  errorMessage: string;
  path: string;
  count: number;
  sessions: number;
  firstSeen: string;
  lastSeen: string;
  stack: string;
}

export interface Journey {
  session: string;
  steps: { path: string; at: string; ok: boolean }[];
  startedAt: string;
  lastAt: string;
  failed: boolean;
}

export interface InsightsSummary {
  totalEvents: number;
  pageViews: number;
  requests: number;
  exceptions: number;
  sessions: number;
  failureRate: number;
  p95: number;
  /** Buckets for the sparkline, oldest first. */
  series: { at: string; count: number; failures: number }[];
}

export const percentile = (sorted: number[], p: number): number => {
  if (!sorted.length) return 0;
  /*
   * Nearest-rank. With a handful of samples an interpolating percentile invents
   * a duration that never happened, which is confusing when the table next to
   * it lists every request.
   */
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
};

/**
 * Groups failures by what makes them the same bug.
 *
 * Not by message: most messages carry an id, a path or a timestamp
 * ("device abc123 not found"), so grouping on the raw text produces one group
 * per occurrence and the list becomes a log rather than a summary. Type plus
 * route plus the top stack frame is stable across occurrences and still
 * separates genuinely different faults that share a type.
 */
// ─────────────────────────────────────────────────── requests ──

/** One row of the requests table: an operation, as Azure names it. */
export interface RequestStat {
  /** "GET /api/devices" — the operation, not the instance. */
  name: string;
  method: string;
  path: string;
  count: number;
  failed: number;
  failureRate: number;
  avgMs: number;
  /**
   * 95th percentile. The average is what a page feels like on a good day; the
   * p95 is what it feels like to the person who complains, and the two often
   * disagree by an order of magnitude on a route with a slow tail.
   */
  p95Ms: number;
  maxMs: number;
  lastAt: string;
}

/**
 * Groups request telemetry into operations.
 *
 * Grouped by verb as well as route: a GET and a DELETE on one path have
 * different costs and different failure modes, and averaging them together
 * hides both.
 */
export function requestStats(events: TelemetryEvent[]): RequestStat[] {
  const acc = new Map<string, { m: string; p: string; d: number[]; failed: number; last: string }>();

  for (const e of events) {
    if (e.kind !== "request") continue;
    const method = e.method ?? "GET";
    const key = `${method} ${e.path}`;
    let row = acc.get(key);
    if (!row) {
      row = { m: method, p: e.path, d: [], failed: 0, last: e.at };
      acc.set(key, row);
    }
    row.d.push(e.durationMs);
    if (!e.ok) row.failed += 1;
    if (e.at > row.last) row.last = e.at;
  }

  const out: RequestStat[] = [];
  for (const [name, row] of acc) {
    const sorted = [...row.d].sort((a, b) => a - b);
    const total = sorted.reduce((n, v) => n + v, 0);
    out.push({
      name,
      method: row.m,
      path: row.p,
      count: sorted.length,
      failed: row.failed,
      failureRate: sorted.length ? row.failed / sorted.length : 0,
      avgMs: sorted.length ? Math.round(total / sorted.length) : 0,
      p95Ms: percentile(sorted, 95),
      maxMs: sorted.length ? sorted[sorted.length - 1] : 0,
      lastAt: row.last,
    });
  }

  /*
   * Failing operations first, then slowest, then busiest. Somebody opening this
   * table is looking for what is broken before what is popular.
   */
  return out.sort(
    (a, b) => b.failed - a.failed || b.p95Ms - a.p95Ms || b.count - a.count
  );
}

/** Status-code histogram across requests, for the failures view. */
export function statusBreakdown(events: TelemetryEvent[]): { status: number; count: number }[] {
  const acc = new Map<number, number>();
  for (const e of events) {
    if (e.kind !== "request") continue;
    acc.set(e.status, (acc.get(e.status) ?? 0) + 1);
  }
  return [...acc.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
}

// ────────────────────────────────────────────── logs & performance ──

/**
 * A filter over the raw event table — the closest honest equivalent to the
 * Logs blade.
 *
 * Deliberately not a query language. A half-built KQL parser accepts a query,
 * silently misreads a clause and returns a confident wrong answer, which is
 * worse than a filter that can only express what it says on the form.
 */
export interface EventQuery {
  kind?: EventKind | "all";
  /** "ok" and "failed" mean the ok flag; a number means that exact status. */
  outcome?: "all" | "ok" | "failed";
  status?: number;
  method?: string;
  /** Case-insensitive substring on the normalised route. */
  pathContains?: string;
  /** Case-insensitive substring on error type or message. */
  errorContains?: string;
  session?: string;
  sinceHours?: number;
  limit?: number;
}

export function queryEvents(
  events: TelemetryEvent[],
  q: EventQuery,
  now = new Date().toISOString()
): TelemetryEvent[] {
  const scoped = q.sinceHours ? withinHours(events, q.sinceHours, now) : events;
  const path = q.pathContains?.trim().toLowerCase();
  const err = q.errorContains?.trim().toLowerCase();

  const out = scoped.filter((e) => {
    if (q.kind && q.kind !== "all" && e.kind !== q.kind) return false;
    if (q.outcome === "ok" && !e.ok) return false;
    if (q.outcome === "failed" && e.ok) return false;
    if (typeof q.status === "number" && e.status !== q.status) return false;
    if (q.method && (e.method ?? "GET") !== q.method) return false;
    if (path && !e.path.toLowerCase().includes(path)) return false;
    if (q.session && e.session !== q.session) return false;
    if (err) {
      const hay = `${e.errorType ?? ""} ${e.errorMessage ?? ""}`.toLowerCase();
      if (!hay.includes(err)) return false;
    }
    return true;
  });

  // Newest first: an operator looking at a log wants what just happened.
  out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return out.slice(0, Math.max(1, Math.min(1000, q.limit ?? 200)));
}

/** Full latency distribution for one operation. */
export interface OperationPerf {
  name: string;
  kind: EventKind;
  count: number;
  minMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

/**
 * Latency percentiles per operation, across requests and page loads alike.
 *
 * p50 beside p99 rather than an average on its own: the mean of a bimodal
 * route — a cache hit and a cache miss — is a number that describes neither
 * of the two things that actually happen.
 */
export function operationPerf(events: TelemetryEvent[]): OperationPerf[] {
  const acc = new Map<string, { kind: EventKind; d: number[] }>();

  for (const e of events) {
    if (e.kind !== "request" && e.kind !== "pageview") continue;
    const name = e.kind === "request" ? `${e.method ?? "GET"} ${e.path}` : e.path;
    let row = acc.get(name);
    if (!row) {
      row = { kind: e.kind, d: [] };
      acc.set(name, row);
    }
    row.d.push(e.durationMs);
  }

  const out: OperationPerf[] = [];
  for (const [name, row] of acc) {
    const s = [...row.d].sort((a, b) => a - b);
    out.push({
      name,
      kind: row.kind,
      count: s.length,
      minMs: s[0] ?? 0,
      p50Ms: percentile(s, 50),
      p90Ms: percentile(s, 90),
      p95Ms: percentile(s, 95),
      p99Ms: percentile(s, 99),
      maxMs: s[s.length - 1] ?? 0,
    });
  }

  // Slowest at p95 first: that is the one people are waiting on.
  return out.sort((a, b) => b.p95Ms - a.p95Ms || b.count - a.count);
}

/**
 * Log-ish duration histogram, for the distribution chart.
 *
 * Linear buckets would put almost everything in the first one and tell you
 * nothing; latency is spread across orders of magnitude, so the buckets are too.
 */
export const DURATION_BUCKETS = [50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;

export function durationHistogram(
  events: TelemetryEvent[],
  kind: EventKind = "request"
): { label: string; upTo: number; count: number }[] {
  const counts = new Array(DURATION_BUCKETS.length + 1).fill(0) as number[];

  for (const e of events) {
    if (e.kind !== kind) continue;
    let i = DURATION_BUCKETS.findIndex((b) => e.durationMs <= b);
    if (i === -1) i = DURATION_BUCKETS.length;
    counts[i] += 1;
  }

  return counts.map((count, i) => {
    const upTo = DURATION_BUCKETS[i] ?? Infinity;
    const prev = i === 0 ? 0 : DURATION_BUCKETS[i - 1];
    return {
      label: i === DURATION_BUCKETS.length ? `> ${prev} ms` : `${prev}–${upTo} ms`,
      upTo,
      count,
    };
  });
}

// ─────────────────────────────────────────────────── dependencies ──

/** One outbound operation against a service we depend on. */
export interface DependencyStat {
  /** "control-plane GET /devices" */
  name: string;
  target: string;
  method: string;
  path: string;
  count: number;
  failed: number;
  failureRate: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  lastAt: string;
}

/**
 * Groups dependency calls by service and operation.
 *
 * Kept apart from requestStats on purpose. A request is inbound and a
 * dependency is outbound, and merging them produces a table that cannot
 * distinguish "our API is slow" from "the service our API waits on is slow" —
 * which are different problems belonging to different people.
 */
export function dependencyStats(events: TelemetryEvent[]): DependencyStat[] {
  const acc = new Map<
    string,
    { target: string; m: string; p: string; d: number[]; failed: number; last: string }
  >();

  for (const e of events) {
    if (e.kind !== "dependency") continue;
    const target = e.target ?? "unknown";
    const method = e.method ?? "GET";
    const name = `${target} ${method} ${e.path}`;
    let row = acc.get(name);
    if (!row) {
      row = { target, m: method, p: e.path, d: [], failed: 0, last: e.at };
      acc.set(name, row);
    }
    row.d.push(e.durationMs);
    if (!e.ok) row.failed += 1;
    if (e.at > row.last) row.last = e.at;
  }

  const out: DependencyStat[] = [];
  for (const [name, row] of acc) {
    const s = [...row.d].sort((a, b) => a - b);
    const total = s.reduce((n, v) => n + v, 0);
    out.push({
      name,
      target: row.target,
      method: row.m,
      path: row.p,
      count: s.length,
      failed: row.failed,
      failureRate: s.length ? row.failed / s.length : 0,
      avgMs: s.length ? Math.round(total / s.length) : 0,
      p95Ms: percentile(s, 95),
      maxMs: s.length ? s[s.length - 1] : 0,
      lastAt: row.last,
    });
  }

  return out.sort((a, b) => b.failed - a.failed || b.p95Ms - a.p95Ms || b.count - a.count);
}

/** A node in the application map: one service, rolled up. */
export interface MapNode {
  id: string;
  kind: "browser" | "app" | "dependency";
  calls: number;
  failed: number;
  failureRate: number;
  p95Ms: number;
}

/**
 * The application map, as far as the data honestly supports one.
 *
 * Three nodes, because three are all that are observable from here: the
 * browser, this app, and each service it calls. Anything further — the control
 * plane's own database, the MQTT broker — would have to be drawn from
 * instrumentation that does not exist, and a map with invented edges is worse
 * than a small true one.
 */
export function applicationMap(events: TelemetryEvent[]): MapNode[] {
  const build = (id: string, kind: MapNode["kind"], subset: TelemetryEvent[]): MapNode => {
    const d = subset.map((e) => e.durationMs).sort((a, b) => a - b);
    const failed = subset.filter((e) => !e.ok).length;
    return {
      id,
      kind,
      calls: subset.length,
      failed,
      failureRate: subset.length ? failed / subset.length : 0,
      p95Ms: percentile(d, 95),
    };
  };

  const nodes: MapNode[] = [];
  const pageviews = events.filter((e) => e.kind === "pageview");
  const requests = events.filter((e) => e.kind === "request");

  if (pageviews.length) nodes.push(build("Browser", "browser", pageviews));
  if (requests.length) nodes.push(build("circuvent.com", "app", requests));

  const byTarget = new Map<string, TelemetryEvent[]>();
  for (const e of events) {
    if (e.kind !== "dependency") continue;
    const t = e.target ?? "unknown";
    if (!byTarget.has(t)) byTarget.set(t, []);
    byTarget.get(t)!.push(e);
  }
  for (const [target, subset] of byTarget) nodes.push(build(target, "dependency", subset));

  return nodes;
}

export function failureKey(e: Pick<TelemetryEvent, "errorType" | "path" | "stack">): string {  const top = (e.stack || "").split("\n").map((s) => s.trim()).find((s) => s.startsWith("at ")) || "";
  return `${e.errorType || "Error"}|${e.path || "-"}|${top}`;
}

/**
 * Keeps the first few frames of a stack.
 *
 * A full browser stack is kilobytes, mostly framework internals, and storing
 * thousands of them is how a JSON file store becomes unusable. The frames that
 * identify the bug are at the top.
 */
export function trimStack(stack: unknown, frames = 6): string {
  if (typeof stack !== "string") return "";
  return stack.split("\n").slice(0, frames + 1).join("\n").slice(0, 2000);
}

/**
 * Redacts anything that looks like a secret or an identity from a message.
 *
 * Exception messages are written by developers for developers and routinely
 * contain whatever was in scope — tokens, emails, query strings. This panel is
 * visible to every admin role that can see telemetry, and a crash report is a
 * bad reason to widen who can read a customer's email address.
 */
export function redact(text: unknown): string {
  let s = String(text ?? "").slice(0, 500);
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]");
  s = s.replace(/\b(?:eyJ[\w-]+\.){2}[\w-]+\b/g, "[jwt]");
  s = s.replace(/\b[A-Fa-f0-9]{32,}\b/g, "[hex]");
  s = s.replace(/((?:token|key|secret|password|authorization)["'\s:=]+)[^\s&"']+/gi, "$1[redacted]");
  return s;
}

/** Events inside the window, newest first. */
export function withinHours(events: TelemetryEvent[], hours: number, now: string): TelemetryEvent[] {
  const cutoff = new Date(now).getTime() - hours * 3_600_000;
  return events
    .filter((e) => new Date(e.at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/**
 * Which paths people actually reach, and how well.
 *
 * Sessions are counted distinctly as well as views: one person refreshing forty
 * times is not forty people, and the difference is the difference between
 * "popular" and "broken".
 */
export function pathStats(events: TelemetryEvent[]): PathStat[] {
  const byPath = new Map<string, { durations: number[]; sessions: Set<string>; views: number; failures: number; lastSeen: string }>();

  for (const e of events) {
    if (e.kind === "exception") continue;
    const cur = byPath.get(e.path) ?? { durations: [], sessions: new Set<string>(), views: 0, failures: 0, lastSeen: e.at };
    cur.views++;
    if (e.session) cur.sessions.add(e.session);
    if (e.durationMs > 0) cur.durations.push(e.durationMs);
    if (!e.ok) cur.failures++;
    if (new Date(e.at) > new Date(cur.lastSeen)) cur.lastSeen = e.at;
    byPath.set(e.path, cur);
  }

  const out: PathStat[] = [];
  for (const [path, v] of byPath) {
    const sorted = [...v.durations].sort((a, b) => a - b);
    out.push({
      path,
      views: v.views,
      sessions: v.sessions.size,
      failures: v.failures,
      failureRate: v.views ? Math.round((v.failures / v.views) * 1000) / 10 : 0,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      avg: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
      lastSeen: v.lastSeen,
    });
  }

  return out.sort((a, b) => b.views - a.views);
}

/** Distinct failures, worst first. */
export function failureGroups(events: TelemetryEvent[]): FailureGroup[] {
  const groups = new Map<string, FailureGroup & { _sessions: Set<string> }>();

  for (const e of events) {
    if (e.ok && e.kind !== "exception") continue;
    const key = failureKey(e);
    const g = groups.get(key);
    if (g) {
      g.count++;
      if (e.session) g._sessions.add(e.session);
      if (new Date(e.at) > new Date(g.lastSeen)) g.lastSeen = e.at;
      if (new Date(e.at) < new Date(g.firstSeen)) g.firstSeen = e.at;
    } else {
      groups.set(key, {
        key,
        errorType: e.errorType || (e.status >= 500 ? `HTTP ${e.status}` : "Error"),
        errorMessage: e.errorMessage || "",
        path: e.path,
        count: 1,
        sessions: 0,
        firstSeen: e.at,
        lastSeen: e.at,
        stack: e.stack || "",
        _sessions: new Set(e.session ? [e.session] : []),
      });
    }
  }

  return [...groups.values()]
    .map(({ _sessions, ...g }) => ({ ...g, sessions: _sessions.size }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Reconstructs what each session did, in order.
 *
 * This is the question the panel exists to answer — "what was the user doing
 * when it broke" — and it cannot be answered by per-path counters, however many
 * of them there are.
 */
export function journeys(events: TelemetryEvent[], limit = 50): Journey[] {
  const bySession = new Map<string, TelemetryEvent[]>();
  for (const e of events) {
    if (!e.session) continue;
    const list = bySession.get(e.session) ?? [];
    list.push(e);
    bySession.set(e.session, list);
  }

  const out: Journey[] = [];
  for (const [session, list] of bySession) {
    const ordered = [...list].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    out.push({
      session,
      steps: ordered.map((e) => ({ path: e.path, at: e.at, ok: e.ok })),
      startedAt: ordered[0].at,
      lastAt: ordered[ordered.length - 1].at,
      failed: ordered.some((e) => !e.ok),
    });
  }

  /* Failed journeys first — they are the ones worth reading. */
  return out
    .sort((a, b) => {
      if (a.failed !== b.failed) return a.failed ? -1 : 1;
      return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
    })
    .slice(0, limit);
}

export function summarise(events: TelemetryEvent[], hours: number, now: string): InsightsSummary {
  const sessions = new Set<string>();
  const durations: number[] = [];
  let pageViews = 0, requests = 0, exceptions = 0, failures = 0;

  for (const e of events) {
    if (e.session) sessions.add(e.session);
    if (e.durationMs > 0) durations.push(e.durationMs);
    if (e.kind === "pageview") pageViews++;
    else if (e.kind === "request") requests++;
    else if (e.kind === "exception") exceptions++;
    if (!e.ok) failures++;
  }

  /*
   * Bucket count is chosen so the sparkline has roughly the same resolution
   * whatever window is asked for — hourly for a day, coarser for a week.
   */
  const buckets = Math.min(48, Math.max(12, hours));
  const size = (hours * 3_600_000) / buckets;
  const end = new Date(now).getTime();
  const series = Array.from({ length: buckets }, (_, i) => {
    const from = end - (buckets - i) * size;
    const to = from + size;
    let count = 0, f = 0;
    for (const e of events) {
      const t = new Date(e.at).getTime();
      if (t >= from && t < to) {
        count++;
        if (!e.ok) f++;
      }
    }
    return { at: new Date(from).toISOString(), count, failures: f };
  });

  const sorted = durations.sort((a, b) => a - b);
  return {
    totalEvents: events.length,
    pageViews,
    requests,
    exceptions,
    sessions: sessions.size,
    failureRate: events.length ? Math.round((failures / events.length) * 1000) / 10 : 0,
    p95: percentile(sorted, 95),
    series,
  };
}

/**
 * Turns a raw beacon payload into an event, or null if it is not usable.
 *
 * Everything here arrives from a browser, which means it arrives from anybody:
 * this endpoint is unauthenticated by necessity (a crash during login still
 * needs reporting) and so every field is treated as hostile. Lengths are
 * capped, numbers are clamped, and the timestamp is the server's — a client
 * clock that is wrong by a month would otherwise silently empty every window.
 */
export function normaliseEvent(raw: unknown, ctx: { now: string; session: string; source: string }): TelemetryEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const kind = (["pageview", "request", "dependency", "exception", "event"] as const).includes(r.kind as EventKind)
    ? (r.kind as EventKind)
    : null;
  if (!kind) return null;

  const path = String(r.path ?? "").slice(0, 200) || "/";
  const status = Math.max(0, Math.min(599, Math.round(Number(r.status) || 0)));
  const durationMs = Math.max(0, Math.min(600_000, Math.round(Number(r.durationMs) || 0)));

  const ok = kind === "exception" ? false : status === 0 ? r.ok !== false : status < 400;

  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    kind,
    at: ctx.now,
    path,
    session: ctx.session,
    durationMs,
    status,
    ok,
    /*
     * Constrained to real verbs rather than passed through. This string becomes
     * a row label in the console, and an unbounded field from a client is how a
     * table ends up rendering whatever somebody felt like posting.
     */
    ...(typeof r.method === "string" &&
    ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(r.method.toUpperCase())
      ? { method: r.method.toUpperCase() }
      : {}),
    /*
     * Same treatment as the verb, and for the same reason: this becomes a row
     * label. Constrained to a short slug rather than free text.
     */
    ...(kind === "dependency" && typeof r.target === "string"
      ? { target: r.target.slice(0, 40).replace(/[^a-zA-Z0-9._-]/g, "") || "unknown" }
      : {}),
    ...(kind === "exception" || !ok
      ? {
          errorType: String(r.errorType ?? (status >= 400 ? `HTTP ${status}` : "Error")).slice(0, 100),
          errorMessage: redact(r.errorMessage),
          stack: trimStack(r.stack),
        }
      : {}),
    source: ctx.source,
    ...(typeof r.userAgentClass === "string" ? { userAgentClass: r.userAgentClass.slice(0, 40) } : {}),
  };
}
