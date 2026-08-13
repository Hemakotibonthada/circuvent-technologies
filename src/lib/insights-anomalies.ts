// ═══════════════════════════════════════════════════════════════
// Smart detection over telemetry
// ═══════════════════════════════════════════════════════════════
// Compares a recent window against the period before it and reports what
// changed. This is what fills the gap between "the Insights panel shows a
// number" and "somebody is told" — the findings are shaped as anomaly-monitor
// Alerts, so they flow through the existing ICM bridge and inherit every rule
// already written there: one incident per underlying problem, `info` never
// files, a monitor cannot open a Sev0, and a monitor cannot close an incident
// a human acknowledged.
//
// Detection is deliberately dull. The failure mode of an anomaly detector is
// not missing an outage, it is crying wolf until people mute it — after which
// it misses every outage. So every rule here needs a minimum sample, and a
// change that is large in both relative and absolute terms.

import { percentile, withinHours, type TelemetryEvent } from "./app-insights";
import type { Alert } from "./anomaly-monitor";
import type { Severity } from "./ai/analysis";

export interface DetectOptions {
  /** The window being judged. */
  windowHours?: number;
  /**
   * How far back the baseline reaches, ending where the window begins.
   *
   * It must not overlap the window. A baseline that includes the spike is
   * partly made of the thing it is meant to be compared against, which drags
   * the threshold up and quietly hides exactly the largest incidents.
   */
  baselineHours?: number;
  /** Below this many calls, nothing is reported. */
  minSamples?: number;
}

const DEFAULTS = {
  windowHours: 1,
  baselineHours: 24,
  /*
   * One failed call out of one is a 100% failure rate, and it means nothing.
   * Twenty is small enough to catch a real problem early and large enough that
   * a single unlucky request cannot trigger a page.
   */
  minSamples: 20,
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

function alert(
  fingerprint: string,
  severity: Severity,
  title: string,
  detail: string,
  evidence: Record<string, number | string | boolean>,
  now: string,
  suggestion?: string
): Alert {
  return {
    fingerprint,
    severity,
    title,
    detail,
    // Telemetry findings are about routes, not devices. The field exists for
    // device monitors; leaving it empty is truthful rather than inventing one.
    deviceIds: [],
    evidence,
    ...(suggestion ? { suggestion } : {}),
    // "open", not "firing". The monitor's own vocabulary, so these findings
    // are indistinguishable from device alerts to everything downstream.
    state: "open",
    firstSeenAt: now,
    lastSeenAt: now,
    occurrences: 1,
  };
}

/**
 * Splits events into the window under judgement and the baseline before it.
 */
function split(events: TelemetryEvent[], now: string, opts: Required<DetectOptions>) {
  const recent = withinHours(events, opts.windowHours, now);
  const recentIds = new Set(recent.map((e) => e.id));
  const baseline = withinHours(events, opts.baselineHours, now).filter(
    (e) => !recentIds.has(e.id)
  );
  return { recent, baseline };
}

/**
 * Failure rate, latency and availability regressions.
 *
 * Returns an empty list when nothing is wrong, which is the answer it gives
 * almost always and the reason it can be trusted when it does not.
 */
export function detectAnomalies(
  events: TelemetryEvent[],
  now = new Date().toISOString(),
  options: DetectOptions = {}
): Alert[] {
  const opts = { ...DEFAULTS, ...options };
  const { recent, baseline } = split(events, now, opts);
  const out: Alert[] = [];

  // ── failure rate, per operation ──
  const byOp = new Map<string, { recent: TelemetryEvent[]; base: TelemetryEvent[] }>();
  const key = (e: TelemetryEvent) => `${e.method ?? "GET"} ${e.path}`;

  for (const e of recent) {
    if (e.kind !== "request" && e.kind !== "dependency") continue;
    const k = key(e);
    if (!byOp.has(k)) byOp.set(k, { recent: [], base: [] });
    byOp.get(k)!.recent.push(e);
  }
  for (const e of baseline) {
    if (e.kind !== "request" && e.kind !== "dependency") continue;
    const k = key(e);
    if (!byOp.has(k)) continue;
    byOp.get(k)!.base.push(e);
  }

  for (const [op, sets] of byOp) {
    if (sets.recent.length < opts.minSamples) continue;

    const recentFailed = sets.recent.filter((e) => !e.ok).length;
    const recentRate = recentFailed / sets.recent.length;
    const baseRate = sets.base.length
      ? sets.base.filter((e) => !e.ok).length / sets.base.length
      : 0;

    /*
     * Both tests must pass. A rate that trebles from 1% to 3% is a large
     * relative move and usually noise; a rate that rises from 40% to 45% is a
     * small relative move on something already broken, which the absolute
     * floor catches instead.
     */
    const relativeJump = recentRate > baseRate * 3;
    const absoluteFloor = recentRate >= 0.1 && recentRate - baseRate >= 0.05;
    if (!relativeJump || !absoluteFloor) continue;

    const severity: Severity = recentRate >= 0.5 ? "critical" : "warning";
    out.push(
      alert(
        `telemetry:failures:${op}`,
        severity,
        `${op} is failing`,
        `${pct(recentRate)} of calls failed in the last ${opts.windowHours}h, against ` +
          `${pct(baseRate)} before. ${recentFailed} of ${sets.recent.length} calls.`,
        {
          operation: op,
          failureRate: Number(recentRate.toFixed(3)),
          baselineRate: Number(baseRate.toFixed(3)),
          calls: sets.recent.length,
          failed: recentFailed,
        },
        now,
        "Open Insights → Logs and filter to failures on this operation."
      )
    );
  }

  // ── latency regression, per operation ──
  for (const [op, sets] of byOp) {
    if (sets.recent.length < opts.minSamples || sets.base.length < opts.minSamples) continue;

    const r = percentile(sets.recent.map((e) => e.durationMs).sort((a, b) => a - b), 95);
    const b = percentile(sets.base.map((e) => e.durationMs).sort((a, b) => a - b), 95);
    if (b <= 0) continue;

    /*
     * Doubling, and at least half a second slower. Without the absolute floor
     * a route that went from 4ms to 9ms is a 125% regression nobody can feel.
     */
    if (r < b * 2 || r - b < 500) continue;

    out.push(
      alert(
        `telemetry:latency:${op}`,
        "warning",
        `${op} got slower`,
        `p95 is ${r} ms in the last ${opts.windowHours}h, against ${b} ms before.`,
        { operation: op, p95Ms: r, baselineP95Ms: b, calls: sets.recent.length },
        now,
        "Check Insights → Performance for the distribution; a bimodal split usually means a cache."
      )
    );
  }

  // ── a dependency that stopped answering ──
  const health = recent.filter((e) => e.kind === "dependency" && e.path === "/health");
  if (health.length >= 3) {
    const down = health.filter((e) => !e.ok).length;
    if (down === health.length) {
      const target = health[0].target ?? "a dependency";
      out.push(
        alert(
          `telemetry:availability:${target}`,
          "critical",
          `${target} is unreachable`,
          `Every one of the last ${health.length} health checks failed.`,
          { target, checks: health.length, failed: down },
          now,
          "Check the control-plane VM before anything else; the app cannot reach it at all."
        )
      );
    }
  }

  // ── a new kind of exception ──
  const seenBefore = new Set(
    baseline.filter((e) => e.kind === "exception").map((e) => e.errorType ?? "Error")
  );
  const newTypes = new Map<string, number>();
  for (const e of recent) {
    if (e.kind !== "exception") continue;
    const t = e.errorType ?? "Error";
    if (seenBefore.has(t)) continue;
    newTypes.set(t, (newTypes.get(t) ?? 0) + 1);
  }
  for (const [type, count] of newTypes) {
    /*
     * Three, not one. A single novel exception is usually one person on a
     * strange browser, and paging for it is how a detector earns its mute.
     */
    if (count < 3) continue;
    out.push(
      alert(
        `telemetry:new-error:${type}`,
        "warning",
        `New error: ${type}`,
        `${count} occurrences in the last ${opts.windowHours}h, and none before that.`,
        { errorType: type, occurrences: count },
        now,
        "It appeared with a deployment more often than not — check what shipped."
      )
    );
  }

  // Loudest first, so a truncated list keeps the worst.
  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
