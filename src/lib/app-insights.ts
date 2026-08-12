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

export type EventKind = "pageview" | "request" | "exception" | "event";

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

  const kind = (["pageview", "request", "exception", "event"] as const).includes(r.kind as EventKind)
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
