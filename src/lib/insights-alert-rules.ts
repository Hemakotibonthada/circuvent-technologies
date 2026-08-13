/**
 * Metric alert rules.
 *
 * Smart detection (insights-anomalies.ts) finds problems nobody thought to
 * look for. This is the other half: the thresholds a team already knows it
 * cares about — "tell me when checkout p95 goes over two seconds" — which no
 * general-purpose detector will ever guess.
 *
 * Rules produce the same `Alert` shape the anomaly detector does, so they
 * inherit the whole downstream path: the ICM bridge files them once per
 * fingerprint, never opens a Sev0 from a machine, and never closes an incident
 * a person has picked up. Nothing here needs to know any of that.
 */
import {
  metricSeries,
  applyMetric,
  withinHours,
  METRICS,
  SPLITS,
  type MetricId,
  type SplitBy,
  type TelemetryEvent,
} from "./app-insights";
import type { Alert } from "./anomaly-monitor";
import type { Severity as AlertSeverity } from "./ai/analysis";

export type Comparison = "above" | "below";

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;

  metric: MetricId;
  /** Evaluate the metric per dimension value rather than over everything. */
  splitBy: SplitBy;
  /** Only consider events whose split value matches, when set. */
  scope?: string;

  comparison: Comparison;
  threshold: number;

  /** The window the metric is computed over, in minutes. */
  windowMins: number;
  /**
   * How many samples the window must contain before the rule may fire.
   *
   * Without it, one slow request at 3am is a p95 of one sample and pages
   * somebody. A threshold on a metric nobody has enough data for is noise
   * dressed as a signal.
   */
  minSamples: number;

  severity: AlertSeverity;
  owningTeam?: string;
  createdBy: string;
  createdAt: string;
}

export interface RuleEvaluation {
  rule: AlertRule;
  /** The dimension value this result is for; "All" when unsplit. */
  key: string;
  value: number;
  samples: number;
  breached: boolean;
  /** Why it did not fire, when it did not. Shown in the rules table. */
  reason: string;
}

const unit = (m: MetricId) => METRICS.find((x) => x.id === m)?.unit ?? "count";

export function formatMetricValue(metric: MetricId, v: number): string {
  const u = unit(metric);
  return u === "%" ? `${v}%` : u === "ms" ? `${Math.round(v)} ms` : v.toLocaleString();
}

/** Human-readable, and the same words the rule editor uses. */
export function describeRule(r: AlertRule): string {
  const m = METRICS.find((x) => x.id === r.metric)?.label ?? r.metric;
  const scope = r.scope ? ` for ${r.scope}` : r.splitBy === "none" ? "" : ` for any ${SPLITS.find((s) => s.id === r.splitBy)?.label.toLowerCase() ?? r.splitBy}`;
  return `${m}${scope} ${r.comparison} ${formatMetricValue(r.metric, r.threshold)} over ${r.windowMins}m`;
}

/**
 * Evaluates one rule against a set of events.
 *
 * Returns a result per dimension value rather than a single verdict, because a
 * rule split by operation is really one rule per operation — and a person
 * looking at the table needs to see the ones that did not fire as well, with
 * the reason. A rule that is silently doing nothing is the failure mode this
 * whole codebase keeps producing.
 */
export function evaluateRule(
  rule: AlertRule,
  events: TelemetryEvent[],
  now: string
): RuleEvaluation[] {
  const hours = rule.windowMins / 60;
  const { series } = metricSeries(events, {
    metric: rule.metric,
    splitBy: rule.splitBy,
    hours,
    // One bucket: the rule is about the window as a whole, not its shape.
    bucketMinutes: Math.max(1, Math.round(rule.windowMins)),
    now,
    topN: 50,
  });

  const scoped = rule.scope ? series.filter((s) => s.key === rule.scope) : series;

  if (scoped.length === 0) {
    return [
      {
        rule,
        key: rule.scope ?? "All",
        value: 0,
        samples: 0,
        breached: false,
        reason: "no telemetry in the window",
      },
    ];
  }

  return scoped.map((s) => {
    const samples = s.points.reduce((n, p) => n + p.samples, 0);
    const value = s.total;

    if (samples < rule.minSamples) {
      return {
        rule,
        key: s.key,
        value,
        samples,
        breached: false,
        reason: `${samples} of ${rule.minSamples} samples needed`,
      };
    }

    const breached = rule.comparison === "above" ? value > rule.threshold : value < rule.threshold;
    return {
      rule,
      key: s.key,
      value,
      samples,
      breached,
      reason: breached
        ? `${formatMetricValue(rule.metric, value)} is ${rule.comparison} ${formatMetricValue(rule.metric, rule.threshold)}`
        : `${formatMetricValue(rule.metric, value)} is within ${formatMetricValue(rule.metric, rule.threshold)}`,
    };
  });
}

/**
 * The fingerprint an alert from this rule carries.
 *
 * Includes the rule id and the dimension value, so two operations breaching
 * one rule are two incidents rather than one that keeps being re-titled — and
 * so editing a rule's threshold does not orphan the incident it already filed.
 */
export function ruleFingerprint(rule: AlertRule, key: string): string {
  return `rule:${rule.id}:${key}`;
}

/** Evaluates every enabled rule and returns alerts for the ones that fired. */
export function evaluateRules(
  rules: AlertRule[],
  events: TelemetryEvent[],
  now: string
): { alerts: Alert[]; evaluations: RuleEvaluation[] } {
  const evaluations: RuleEvaluation[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    /*
     * Each rule sees only its own window. Passing the whole buffer to
     * metricSeries and letting it filter would work, but a rule with a 5-minute
     * window would still walk a week of events on every sweep, once per rule.
     */
    const scopedEvents = withinHours(events, Math.max(1, rule.windowMins / 60), now);
    evaluations.push(...evaluateRule(rule, scopedEvents, now));
  }

  const alerts: Alert[] = evaluations
    .filter((e) => e.breached)
    .map((e) => ({
      fingerprint: ruleFingerprint(e.rule, e.key),
      severity: e.rule.severity,
      title: `${e.rule.name}${e.key === "All" ? "" : ` — ${e.key}`}`,
      detail: `${describeRule(e.rule)}. Currently ${formatMetricValue(e.rule.metric, e.value)} over ${e.samples} samples.`,
      deviceIds: [],
      evidence: {
        rule: e.rule.id,
        metric: e.rule.metric,
        key: e.key,
        value: e.value,
        threshold: e.rule.threshold,
        samples: e.samples,
        windowMins: e.rule.windowMins,
      },
      suggestion: "Open Insights → Metrics and chart this metric to see when it started.",
      state: "open",
      firstSeenAt: now,
      lastSeenAt: now,
      occurrences: 1,
    }));

  return { alerts, evaluations };
}

/** Guards a rule coming off the wire. Invalid rules are rejected, not clamped into nonsense. */
export function validateRule(input: Partial<AlertRule>): string {
  if (!String(input.name ?? "").trim()) return "A name is required.";
  if (!METRICS.some((m) => m.id === input.metric)) return "Unknown metric.";
  if (!SPLITS.some((s) => s.id === input.splitBy)) return "Unknown split.";
  if (input.comparison !== "above" && input.comparison !== "below") return "Comparison must be above or below.";
  if (!Number.isFinite(input.threshold)) return "A numeric threshold is required.";
  if (!Number.isFinite(input.windowMins) || (input.windowMins ?? 0) < 1 || (input.windowMins ?? 0) > 10080) {
    return "The window must be between 1 minute and 7 days.";
  }
  if (!Number.isFinite(input.minSamples) || (input.minSamples ?? 0) < 1) {
    return "At least one sample is required before a rule may fire.";
  }
  /*
   * Sev0 means the product is gone for everybody. A threshold crossing is not
   * evidence of that, and the bridge would refuse it anyway — refusing here
   * means the person writing the rule finds out now rather than during an
   * outage that never paged.
   */
  if (input.severity === "critical" && (input.minSamples ?? 0) < 10) {
    return "A critical rule needs at least 10 samples, or it will page on noise.";
  }
  return "";
}

/** Ships with the alerts a platform this shape always wants. */
export function defaultRules(now: string): AlertRule[] {
  const base = { enabled: true, createdBy: "system", createdAt: now, owningTeam: "Platform" };
  return [
    {
      ...base,
      id: "rule-failure-rate",
      name: "Failure rate above 5%",
      metric: "failureRate",
      splitBy: "none",
      comparison: "above",
      threshold: 5,
      windowMins: 60,
      minSamples: 50,
      severity: "warning",
    },
    {
      ...base,
      id: "rule-operation-failures",
      name: "An operation is failing",
      metric: "failureRate",
      splitBy: "path",
      comparison: "above",
      threshold: 25,
      windowMins: 60,
      minSamples: 20,
      severity: "warning",
    },
    {
      ...base,
      id: "rule-slow-p95",
      name: "P95 latency above 3 seconds",
      metric: "p95",
      splitBy: "none",
      comparison: "above",
      threshold: 3000,
      windowMins: 60,
      minSamples: 50,
      severity: "warning",
    },
  ];
}

/** Exported for the rules table, which shows the current value beside the threshold. */
export function currentValue(
  rule: AlertRule,
  events: TelemetryEvent[],
  now: string
): number {
  const scoped = withinHours(events, Math.max(1, rule.windowMins / 60), now);
  return applyMetric(scoped, rule.metric);
}
