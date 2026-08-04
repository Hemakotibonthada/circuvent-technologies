import { dbEnabled, dbRecordPageViews, dbTrafficSummary, type TrafficSummary, type PageViewInput } from "./db";

/**
 * Visitor tracking.
 *
 * TWO LAYERS, BECAUSE THEY HAVE DIFFERENT TRUTHS
 *
 * "Who is on the site right now" is genuinely ephemeral, so it lives in
 * memory. "How many views did /shop get last week" must survive a deploy, so
 * it goes to Postgres.
 *
 * The previous implementation kept both in memory, which made the second one
 * fiction: on Vercel each lambda instance has its own module scope, so a
 * visitor could connect on one instance and heartbeat on another, and every
 * counter reset to zero on each cold start. Totals drifted around all day, and
 * "audience trends" could not exist at all because nothing was retained for a
 * trend to be drawn from.
 *
 * HONEST LIMIT OF THE LIVE LAYER
 *
 * The active-visitor count is still per-instance and therefore an undercount
 * behind a multi-instance deployment. That is acceptable for a presence
 * indicator, is labelled approximate in the UI, and is exactly why the
 * headline numbers are read back from the database instead of from here.
 */

/* ------------------------------------------------------------------ */
/* Live presence                                                       */
/* ------------------------------------------------------------------ */

export interface ActiveVisitor {
  /** Salted daily hash — never an IP, never a client-supplied id. */
  id: string;
  path: string;
  since: number;
  lastSeen: number;
}

export interface LiveSnapshot {
  active: number;
  /** Active visitors per path, busiest first. */
  activeByPath: { path: string; visitors: number }[];
  /** Views this process has seen since it started — a floor, not a total. */
  viewsThisInstance: number;
  instanceSince: string;
  /** True when totals come from Postgres rather than this process only. */
  durable: boolean;
}

/**
 * The shape the existing monitoring tiles were written against.
 *
 * Retained so /api/admin/stats and the panels that read it keep working. Note
 * what these numbers honestly are: everything here is scoped to one process,
 * which is why the new Traffic panel reads from the database instead. The
 * field names are the old ones on purpose — renaming them would be churn
 * across three files for no gain while the durable report exists beside them.
 */
export interface VisitorSnapshot {
  totalActive: number;
  totalViewsAllTime: number;
  pageStats: { page: string; activeVisitors: number; totalViews: number }[];
  peakConcurrent: number;
  peakAt: string | null;
  uptimeSince: string;
}

/** A visitor is "here" for this long after their last signal. */
const ACTIVE_WINDOW_MS = 5 * 60_000;
/** Guards the live map against a flood of distinct hashes. */
const MAX_TRACKED = 5_000;

/* ------------------------------------------------------------------ */
/* Durable write buffer                                                */
/* ------------------------------------------------------------------ */

/**
 * Views are batched before they reach Postgres.
 *
 * A row written synchronously per view would put a database round-trip in
 * front of every navigation on the site. Batching turns a burst into one
 * multi-row INSERT, which is the difference between analytics being free and
 * analytics being the slowest thing on the page.
 */
const FLUSH_EVERY_MS = 5_000;
const FLUSH_AT = 50;
/** Beyond this the queue is dropped rather than grown: losing a few views is
 *  strictly better than exhausting memory because the database is down. */
const MAX_QUEUE = 2_000;

class VisitorTracker {
  private active = new Map<string, ActiveVisitor>();
  private queue: PageViewInput[] = [];
  private viewsThisInstance = 0;
  private instanceSince = new Date();
  private sseClients = new Set<ReadableStreamDefaultController>();
  private flushTimer: ReturnType<typeof setInterval> | undefined;
  private sweepTimer: ReturnType<typeof setInterval> | undefined;
  /** Retained when no database is configured, so local dev still reports. */
  private memoryFallback: (PageViewInput & { ts: number })[] = [];
  private viewsByPath = new Map<string, number>();
  private peakConcurrent = 0;
  private peakAt: Date | null = null;

  constructor() {
    this.sweepTimer = setInterval(() => this.sweep(), 30_000);
    this.flushTimer = setInterval(() => void this.flush(), FLUSH_EVERY_MS);
    // Timers must not hold a serverless invocation open.
    this.sweepTimer.unref?.();
    this.flushTimer.unref?.();
  }

  /**
   * Records one page view and marks the visitor present.
   *
   * `id` is the server-derived daily hash. Nothing the client sends is used as
   * identity, so a caller cannot inflate the unique count by inventing ids —
   * the previous endpoint accepted whatever visitorId the browser supplied.
   */
  record(id: string, view: PageViewInput): void {
    const now = Date.now();
    const existing = this.active.get(id);

    if (existing) {
      existing.path = view.path;
      existing.lastSeen = now;
    } else if (this.active.size < MAX_TRACKED) {
      this.active.set(id, { id, path: view.path, since: now, lastSeen: now });
    }

    this.viewsThisInstance++;
    this.viewsByPath.set(view.path, (this.viewsByPath.get(view.path) ?? 0) + 1);
    if (this.active.size > this.peakConcurrent) {
      this.peakConcurrent = this.active.size;
      this.peakAt = new Date();
    }
    if (this.queue.length < MAX_QUEUE) this.queue.push(view);
    if (this.queue.length >= FLUSH_AT) void this.flush();

    this.broadcast();
  }

  /**
   * Legacy snapshot for the existing monitoring tiles.
   *
   * Every figure is process-local. The durable report lives behind
   * `summary()`, which is what the Traffic panel uses.
   */
  getSnapshot(): VisitorSnapshot {
    this.sweep();
    const activeByPath = new Map<string, number>();
    for (const v of this.active.values()) {
      activeByPath.set(v.path, (activeByPath.get(v.path) ?? 0) + 1);
    }
    const pages = new Set([...activeByPath.keys(), ...this.viewsByPath.keys()]);
    return {
      totalActive: this.active.size,
      totalViewsAllTime: this.viewsThisInstance,
      pageStats: [...pages]
        .map((page) => ({
          page,
          activeVisitors: activeByPath.get(page) ?? 0,
          totalViews: this.viewsByPath.get(page) ?? 0,
        }))
        .sort((a, b) => b.activeVisitors - a.activeVisitors || b.totalViews - a.totalViews)
        .slice(0, 50),
      peakConcurrent: this.peakConcurrent,
      peakAt: this.peakAt?.toISOString() ?? null,
      uptimeSince: this.instanceSince.toISOString(),
    };
  }

  /** Refreshes presence without counting a view (same page, still open). */
  heartbeat(id: string, path: string): void {
    const v = this.active.get(id);
    if (!v) return;
    v.path = path;
    v.lastSeen = Date.now();
  }

  leave(id: string): void {
    if (this.active.delete(id)) this.broadcast();
  }

  liveSnapshot(): LiveSnapshot {
    this.sweep();
    return this.liveSnapshotRaw();
  }

  /** The full report: durable history plus the live layer. */
  async summary(days: number, includeBots = false): Promise<TrafficSummary & { live: LiveSnapshot }> {
    const live = this.liveSnapshot();
    // Always flush first, whichever backend is in play. Flushing only on the
    // database path meant that without a DATABASE_URL the report omitted
    // everything still sitting in the queue — up to fifty views or five
    // seconds of them — so the dashboard read empty immediately after real
    // activity and filled in later for no visible reason.
    await this.flush();
    if (dbEnabled()) {
      try {
        return { ...(await dbTrafficSummary(days, includeBots)), live };
      } catch {
        // Degrade to the in-memory view rather than showing an error page: a
        // transient database problem should cost accuracy, not the dashboard.
      }
    }
    return { ...this.fallbackSummary(days, includeBots), live };
  }

  addSSEClient(controller: ReadableStreamDefaultController): void {
    this.sseClients.add(controller);
  }

  removeSSEClient(controller: ReadableStreamDefaultController): void {
    this.sseClients.delete(controller);
  }

  /** Test seam. */
  _reset(): void {
    this.active.clear();
    this.queue = [];
    this.memoryFallback = [];
    this.viewsThisInstance = 0;
    this.viewsByPath.clear();
    this.peakConcurrent = 0;
    this.peakAt = null;
    this.sseClients.clear();
  }

  /** Test seam — how many SSE controllers are held. */
  _sseCount(): number {
    return this.sseClients.size;
  }

  /* ---------------------------------------------------------------- */

  private async flush(): Promise<void> {
    if (!this.queue.length) return;
    const batch = this.queue;
    this.queue = [];

    if (!dbEnabled()) {
      const now = Date.now();
      for (const v of batch) this.memoryFallback.push({ ...v, ts: now });
      // Bounded: local dev does not need unlimited history.
      if (this.memoryFallback.length > 20_000) {
        this.memoryFallback = this.memoryFallback.slice(-20_000);
      }
      return;
    }

    try {
      await dbRecordPageViews(batch);
    } catch {
      // Put the batch back only if there is room, so a database outage cannot
      // grow the queue without bound while the site keeps serving pages.
      if (this.queue.length + batch.length <= MAX_QUEUE) this.queue = batch.concat(this.queue);
    }
  }

  private fallbackSummary(days: number, includeBots: boolean): TrafficSummary {
    const cutoff = Date.now() - Math.min(365, Math.max(1, days)) * 86400_000;
    const inWindow = this.memoryFallback.filter((r) => r.ts > cutoff);
    const rows = inWindow.filter((r) => includeBots || r.device !== "bot");

    const tally = (
      source: typeof inWindow,
      key: (r: (typeof inWindow)[number]) => string
    ) => {
      const views = new Map<string, number>();
      const visitors = new Map<string, Set<string>>();
      for (const r of source) {
        const k = key(r);
        views.set(k, (views.get(k) ?? 0) + 1);
        let set = visitors.get(k);
        if (!set) {
          set = new Set<string>();
          visitors.set(k, set);
        }
        set.add(r.visitorHash);
      }
      return [...views.entries()]
        .map(([k, v]) => ({ key: k, views: v, visitors: visitors.get(k)?.size ?? 0 }))
        .sort((a, b) => b.views - a.views);
    };

    const gran = days <= 2 ? 3600_000 : 86400_000;
    const buckets = new Map<number, { views: number; visitors: Set<string> }>();
    for (const r of rows) {
      const b = Math.floor(r.ts / gran) * gran;
      const entry = buckets.get(b) ?? { views: 0, visitors: new Set<string>() };
      entry.views++;
      entry.visitors.add(r.visitorHash);
      buckets.set(b, entry);
    }

    return {
      views: rows.length,
      visitors: new Set(rows.map((r) => r.visitorHash)).size,
      series: [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([b, e]) => ({ bucket: new Date(b).toISOString(), views: e.views, visitors: e.visitors.size })),
      topPages: tally(rows, (r) => r.path).slice(0, 20),
      referrers: tally(rows, (r) => r.referrerHost || "(direct)").slice(0, 15),
      // Devices are tallied over the unfiltered window on purpose, matching
      // the SQL path: the panel shows how much of the raw traffic was
      // crawlers, which it cannot do if they have already been removed.
      devices: tally(inWindow, (r) => r.device ?? "desktop"),
      browsers: tally(rows, (r) => r.browser ?? "Unknown").slice(0, 10),
    };
  }

  private sweep(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, v] of this.active) {
      if (now - v.lastSeen > ACTIVE_WINDOW_MS) {
        this.active.delete(id);
        changed = true;
      }
    }
    if (changed) this.broadcast();
  }

  private broadcast(): void {
    if (!this.sseClients.size) return;
    const message = `data: ${JSON.stringify(this.liveSnapshotRaw())}\n\n`;
    const bytes = new TextEncoder().encode(message);
    for (const controller of [...this.sseClients]) {
      try {
        controller.enqueue(bytes);
      } catch {
        // A closed stream throws on enqueue. This is the backstop for the
        // cancel() path, not a substitute for it.
        this.sseClients.delete(controller);
      }
    }
  }

  /** liveSnapshot without the sweep, so broadcast cannot recurse. */
  private liveSnapshotRaw(): LiveSnapshot {
    const byPath = new Map<string, number>();
    for (const v of this.active.values()) byPath.set(v.path, (byPath.get(v.path) ?? 0) + 1);
    return {
      active: this.active.size,
      activeByPath: [...byPath.entries()]
        .map(([path, visitors]) => ({ path, visitors }))
        .sort((a, b) => b.visitors - a.visitors)
        .slice(0, 20),
      viewsThisInstance: this.viewsThisInstance,
      instanceSince: this.instanceSince.toISOString(),
      durable: dbEnabled(),
    };
  }
}

// Singleton — survives hot reloads in dev.
const globalForTracker = globalThis as unknown as { visitorTracker?: VisitorTracker };
export const visitorTracker = (globalForTracker.visitorTracker ??= new VisitorTracker());
