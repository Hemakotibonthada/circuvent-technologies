// ============================================================================
// REAL-TIME VISITOR TRACKING — In-memory visitor tracker with page-level stats
// ============================================================================

export interface Visitor {
  id: string;
  page: string;
  referrer: string;
  userAgent: string;
  connectedAt: number;
  lastSeen: number;
  ip: string;
}

export interface PageStats {
  page: string;
  activeVisitors: number;
  totalViews: number;
}

export interface VisitorSnapshot {
  totalActive: number;
  totalViewsAllTime: number;
  pageStats: PageStats[];
  peakConcurrent: number;
  peakAt: string | null;
  uptimeSince: string;
}

class VisitorTracker {
  private visitors = new Map<string, Visitor>();
  private totalViewsAllTime = 0;
  private pageViewCounts = new Map<string, number>();
  private peakConcurrent = 0;
  private peakAt: Date | null = null;
  private uptimeSince = new Date();
  private sseClients = new Set<ReadableStreamDefaultController>();

  // Stale visitor timeout: 60 seconds without heartbeat
  private readonly STALE_TIMEOUT = 60_000;

  constructor() {
    // Periodically clean up stale visitors every 30s
    setInterval(() => this.cleanup(), 30_000);
  }

  connect(id: string, page: string, referrer: string, userAgent: string, ip: string): void {
    const existing = this.visitors.get(id);
    
    this.visitors.set(id, {
      id,
      page,
      referrer,
      userAgent,
      connectedAt: existing?.connectedAt ?? Date.now(),
      lastSeen: Date.now(),
      ip,
    });

    // Only count as new view if not already tracking this visitor on this page
    if (!existing || existing.page !== page) {
      this.totalViewsAllTime++;
      this.pageViewCounts.set(page, (this.pageViewCounts.get(page) ?? 0) + 1);
    }

    this.updatePeak();
    this.broadcast();
  }

  heartbeat(id: string, page: string): void {
    const visitor = this.visitors.get(id);
    if (visitor) {
      if (visitor.page !== page) {
        // Navigation — count new page view
        this.totalViewsAllTime++;
        this.pageViewCounts.set(page, (this.pageViewCounts.get(page) ?? 0) + 1);
      }
      visitor.page = page;
      visitor.lastSeen = Date.now();
    }
    this.broadcast();
  }

  disconnect(id: string): void {
    this.visitors.delete(id);
    this.broadcast();
  }

  getSnapshot(): VisitorSnapshot {
    const pageMap = new Map<string, number>();
    for (const visitor of this.visitors.values()) {
      pageMap.set(visitor.page, (pageMap.get(visitor.page) ?? 0) + 1);
    }

    const pageStats: PageStats[] = [];
    const allPages = new Set([...pageMap.keys(), ...this.pageViewCounts.keys()]);
    for (const page of allPages) {
      pageStats.push({
        page,
        activeVisitors: pageMap.get(page) ?? 0,
        totalViews: this.pageViewCounts.get(page) ?? 0,
      });
    }
    pageStats.sort((a, b) => b.activeVisitors - a.activeVisitors);

    return {
      totalActive: this.visitors.size,
      totalViewsAllTime: this.totalViewsAllTime,
      pageStats,
      peakConcurrent: this.peakConcurrent,
      peakAt: this.peakAt?.toISOString() ?? null,
      uptimeSince: this.uptimeSince.toISOString(),
    };
  }

  addSSEClient(controller: ReadableStreamDefaultController): void {
    this.sseClients.add(controller);
  }

  removeSSEClient(controller: ReadableStreamDefaultController): void {
    this.sseClients.delete(controller);
  }

  private updatePeak(): void {
    if (this.visitors.size > this.peakConcurrent) {
      this.peakConcurrent = this.visitors.size;
      this.peakAt = new Date();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, visitor] of this.visitors) {
      if (now - visitor.lastSeen > this.STALE_TIMEOUT) {
        this.visitors.delete(id);
        changed = true;
      }
    }
    if (changed) this.broadcast();
  }

  private broadcast(): void {
    const data = JSON.stringify(this.getSnapshot());
    const message = `data: ${data}\n\n`;
    for (const controller of this.sseClients) {
      try {
        controller.enqueue(new TextEncoder().encode(message));
      } catch {
        this.sseClients.delete(controller);
      }
    }
  }
}

// Singleton — survives across hot reloads in dev
const globalForTracker = globalThis as unknown as { visitorTracker?: VisitorTracker };
export const visitorTracker = globalForTracker.visitorTracker ??= new VisitorTracker();
