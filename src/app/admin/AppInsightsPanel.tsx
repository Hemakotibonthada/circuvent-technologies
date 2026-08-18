"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { toCsv, downloadCsv } from "../smarthome/_kit/primitives";
import { METRICS, SPLITS, type MetricId, type SplitBy, type MetricSeries } from "@/lib/app-insights";
import {
  BusiestPaths,
  ChartCard,
  DependencyLatency,
  DurationHistogram,
  FailingRequests,
  FailureRateChart,
  FailuresBySession,
  PercentileBars,
  SlowestPaths,
  SlowestRequests,
  StatusDonut,
  TopFailures,
  TrafficChart,
} from "./insights-charts";
import {
  describeRule,
  formatMetricValue,
  validateRule,
  type AlertRule,
} from "@/lib/insights-alert-rules";
/*
 * The new blades live in their own files. This panel was already 1,900 lines
 * with nine blades inline; doubling the blade count inside it would have made
 * the file the reason nobody adds another one.
 */
import LogsBlade from "./insights/LogsBlade";
import TransactionBlade from "./insights/TransactionBlade";
import EventDetailDrawer from "./insights/EventDetailDrawer";
import RangeBrush, { FULL_RANGE, isFullRange, sliceFor, withinRange, type BrushRange } from "./insights/RangeBrush";
import { CohortsBlade, FunnelBlade, ImpactBlade, UsageBlade } from "./insights/UsageBlades";
import { ConfigureBlade, LiveBlade, MapBlade } from "./insights/MapLiveBlades";
import SuiteFailures from "./SuiteFailures";

interface DeployMarker {
  sha: string;
  shortSha: string;
  branch: string;
  message: string;
  author: string;
  firstSeenAt: string;
}

interface ExplorerView {
  series: MetricSeries[];
  bucketMinutes: number;
  truncated: number;
  deployments?: DeployMarker[];
}

/** Distinguishable at a glance, and legible on both themes. */
const SERIES_COLOURS = ["#22d3ee", "#a78bfa", "#f59e0b", "#34d399", "#f472b6", "#60a5fa"];

/** A rule as the API returns it — the stored rule plus what it evaluates to now. */
type RuleRow = AlertRule & {
  current?: number;
  evaluations?: { key: string; value: number; samples: number; breached: boolean; reason: string }[];
};

/*
 * A new rule starts conservative: 60 minutes and 50 samples.
 *
 * The defaults decide whether the first rule anybody writes is useful or is the
 * one that pages at 3am over four requests, and nobody edits a default they do
 * not yet know they should distrust.
 */
function blankRule(): RuleRow {
  return {
    id: "",
    name: "",
    enabled: true,
    metric: "failureRate",
    splitBy: "none",
    comparison: "above",
    threshold: 5,
    windowMins: 60,
    minSamples: 50,
    severity: "warning",
    owningTeam: "Platform",
    createdBy: "",
    createdAt: new Date().toISOString(),
  };
}

function RuleEditor({
  rule,
  onSave,
  onCancel,
}: {
  rule: RuleRow;
  onSave: (r: RuleRow) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<RuleRow>(rule);
  const set = <K extends keyof RuleRow>(k: K, v: RuleRow[K]) => setDraft((d) => ({ ...d, [k]: v }));
  /*
   * Validated as you type, using the same function the server uses, so the
   * save button cannot offer to do something the server will refuse.
   */
  const problem = validateRule(draft);

  return (
    <div className="rounded-xl border cv-border cv-surface p-4">
      <div className="mb-3 text-sm font-bold cv-text-primary">
        {rule.id ? "Edit rule" : "New rule"}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] cv-text-muted">
          Name
          <input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Checkout is slow"
            className="mt-1 h-[38px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
          />
        </label>

        <label className="text-[12px] cv-text-muted">
          Metric
          <select
            value={draft.metric}
            onChange={(e) => set("metric", e.target.value as MetricId)}
            className="mt-1 h-[38px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
          >
            {METRICS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>

        <label className="text-[12px] cv-text-muted">
          Split by
          <select
            value={draft.splitBy}
            onChange={(e) => set("splitBy", e.target.value as SplitBy)}
            className="mt-1 h-[38px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
          >
            {SPLITS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>

        <label className="text-[12px] cv-text-muted">
          Only for (optional)
          <input
            value={draft.scope ?? ""}
            onChange={(e) => set("scope", e.target.value || undefined)}
            placeholder="/api/checkout"
            disabled={draft.splitBy === "none"}
            className="mt-1 h-[38px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary disabled:opacity-40"
          />
        </label>

        <label className="text-[12px] cv-text-muted">
          Fires when the value is
          <div className="mt-1 flex gap-2">
            <select
              value={draft.comparison}
              onChange={(e) => set("comparison", e.target.value as "above" | "below")}
              className="h-[38px] rounded-lg border cv-border cv-surface-alt px-2 text-sm cv-text-primary"
            >
              <option value="above">above</option>
              <option value="below">below</option>
            </select>
            <input
              type="number"
              value={draft.threshold}
              onChange={(e) => set("threshold", Number(e.target.value))}
              className="h-[38px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
            />
          </div>
        </label>

        <label className="text-[12px] cv-text-muted">
          Severity
          <select
            value={draft.severity}
            onChange={(e) => set("severity", e.target.value as RuleRow["severity"])}
            className="mt-1 h-[38px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
          >
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="critical">critical</option>
          </select>
        </label>

        <label className="text-[12px] cv-text-muted">
          Over the last (minutes)
          <input
            type="number"
            value={draft.windowMins}
            onChange={(e) => set("windowMins", Number(e.target.value))}
            className="mt-1 h-[38px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
          />
        </label>

        <label className="text-[12px] cv-text-muted">
          Needing at least (samples)
          <input
            type="number"
            value={draft.minSamples}
            onChange={(e) => set("minSamples", Number(e.target.value))}
            className="mt-1 h-[38px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
          />
        </label>
      </div>

      <div className="mt-3 rounded-lg border cv-border cv-surface-alt px-3 py-2 text-[12px] cv-text-secondary">
        {describeRule(draft)}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => onSave(draft)}
          disabled={Boolean(problem)}
          className="h-[38px] rounded-lg bg-cyan-600 px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="h-[38px] rounded-lg border cv-border px-4 text-sm cv-text-secondary"
        >
          Cancel
        </button>
        {problem && <span className="text-[12px] text-amber-300">{problem}</span>}
      </div>
    </div>
  );
}

import {
  Activity,
  AlertTriangle,
  Bug,
  Gauge,
  Loader2,
  Network,
  RefreshCw,
  Route,
  Trash2,
  Users,
} from "lucide-react";
import type {
  FailureGroup,
  InsightsSummary,
  Journey,
  Availability,
  DependencyStat,
  MapNode,
  OperationPerf,
  PathStat,
  RequestStat,
  TelemetryEvent,
} from "@/lib/app-insights";

/**
 * Application telemetry, in the shape App Insights presents it.
 *
 * Four questions, in the order an engineer actually asks them: is anything
 * wrong, what is failing, which routes are affected, and what was the person
 * doing when it broke. The last one is the reason this exists at all — per-path
 * counters can tell you that /smarthome/device/[id] fails 3% of the time and
 * can never tell you that everybody who hit it had just come from the setup
 * flow.
 */

function tok() {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface View {
  summary: InsightsSummary;
  paths: PathStat[];
  failures: FailureGroup[];
  journeys: Journey[];
  requests: RequestStat[];
  statuses: { status: number; count: number }[];
  performance: OperationPerf[];
  histogram: { label: string; upTo: number; count: number }[];
  recent: TelemetryEvent[];
  dependencies: DependencyStat[];
  map: MapNode[];
  availability: Availability[];
  availabilitySeries?: { at: string; uptime: number | null; checks: number; failed: number; avgMs: number }[];
  availabilityResults?: { at: string; target: string; ok: boolean; status: number; durationMs: number; detail: string }[];
  lastSweepAt: string | null;
  anomalies: { fingerprint: string; severity: string; title: string; detail: string; suggestion?: string }[];
  received: number;
  retained: number;
  capacity: number;
  hours: number;
  now: string;
}

const WINDOWS = [
  { h: 1, label: "1h" },
  { h: 6, label: "6h" },
  { h: 24, label: "24h" },
  { h: 72, label: "3d" },
  { h: 168, label: "7d" },
];

/*
 * Blades, grouped the way Application Insights groups them.
 *
 * The panel had nine tabs in one row; it now has eighteen, and eighteen in one
 * row is a row nobody reads to the end of. The grouping is Azure's own —
 * Investigate / Monitoring / Usage / Configure — because anybody who has used
 * the product already knows which group a thing is in, and inventing a
 * different taxonomy for the same features only costs them that.
 */
type TabId =
  | "map"
  | "live"
  | "search"
  | "requests"
  | "dependencies"
  | "performance"
  | "failures"
  | "suite"
  | "journeys"
  | "paths"
  | "metrics"
  | "query"
  | "alerts"
  | "logs"
  | "usage"
  | "funnels"
  | "cohorts"
  | "impact"
  | "configure";

const TAB_GROUPS: { group: string; tabs: { id: TabId; label: string }[] }[] = [
  {
    group: "Investigate",
    tabs: [
      { id: "map", label: "Application map" },
      { id: "live", label: "Live metrics" },
      { id: "search", label: "Transaction search" },
      { id: "requests", label: "Requests" },
      { id: "dependencies", label: "Dependencies" },
      { id: "performance", label: "Performance" },
      { id: "failures", label: "Failures" },
      { id: "suite", label: "Suite failures" },
      { id: "journeys", label: "User journeys" },
      { id: "paths", label: "Accessed paths" },
    ],
  },
  {
    group: "Monitoring",
    tabs: [
      { id: "metrics", label: "Metrics" },
      { id: "query", label: "Logs" },
      { id: "alerts", label: "Alert rules" },
      { id: "logs", label: "Recent events" },
    ],
  },
  {
    group: "Usage",
    tabs: [
      { id: "usage", label: "Users & sessions" },
      { id: "funnels", label: "Funnels" },
      { id: "cohorts", label: "Cohorts" },
      { id: "impact", label: "Impact" },
    ],
  },
  { group: "Configure", tabs: [{ id: "configure", label: "Usage & costs" }] },
];

/**
 * The badge on each tab.
 *
 * Only for the blades whose count is already in hand — the Usage and Logs
 * blades fetch their own data on open, and fetching it to draw a number on a
 * tab nobody has clicked is the cost this panel is supposed to be watching for.
 */
function COUNTS(view: View | null, rules: RuleRow[]): Partial<Record<TabId, number>> {
  return {
    map: view?.map.length,
    requests: view?.requests.length,
    dependencies: view?.dependencies.length,
    performance: view?.performance.length,
    failures: view?.failures.length,
    journeys: view?.journeys.length,
    paths: view?.paths.length,
    logs: view?.recent.length,
    alerts: rules.length || undefined,
    search: view?.recent.length ? new Set(view.recent.map((e) => e.session)).size : undefined,
  };
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function ago(iso: string, now: string) {
  const m = Math.round((new Date(now).getTime() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

function Metric({ label, value, tone, icon: Icon }: { label: string; value: string | number; tone?: string; icon: typeof Activity }) {
  return (
    <div className="rounded-xl border cv-border cv-surface p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide cv-text-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold" style={{ color: tone || "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

/** Volume over the window, with failures stacked in red. */
/**
 * The events-over-time bar chart above the tab strip.
 *
 * It used to be a bare row of bars in a box: no title, no axis, no legend and
 * no empty state. On a quiet window that renders as a blank panel with one
 * faint block in the corner, which reads as a chart that failed to load — and
 * the 2%-tall stubs it drew for empty buckets were the same colour as real
 * data, so "nothing happened" and "something small happened" looked identical.
 *
 * A chart that cannot be misread has to say what it is counting, how far back
 * it reaches, and what its tallest bar is worth. Without the scale, one event
 * and a million events draw exactly the same picture.
 */
export function Series({ series, hours }: { series: InsightsSummary["series"]; hours: number }) {
  const total = series.reduce((n, b) => n + b.count, 0);
  const failed = series.reduce((n, b) => n + b.failures, 0);
  const max = Math.max(1, ...series.map((b) => b.count));
  const bucketMins = series.length ? Math.max(1, Math.round((hours * 60) / series.length)) : 0;

  /*
   * Said out loud rather than drawn as an empty box. "Nothing was recorded" is
   * a real and common answer on a low-traffic window, and it is not the same
   * answer as "this panel is broken" — which is what a blank chart looks like.
   */
  if (!series.length || total === 0) {
    return (
      <div className="rounded-xl border cv-border cv-surface p-4">
        <div className="text-sm font-semibold cv-text-secondary">Events over time</div>
        <div className="mt-1 text-[13px] cv-text-muted">
          No events were recorded in the last {hours}h. Nothing is wrong with the chart — the
          telemetry buffer is simply empty for this window.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border cv-border cv-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="text-sm font-semibold cv-text-secondary">Events over time</div>
        <div className="flex items-center gap-3 text-[11px] cv-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "var(--accent-cyan)" }} aria-hidden />
            {total.toLocaleString()} event{total === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-red-500" aria-hidden />
            {failed.toLocaleString()} failed
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-stretch gap-2">
        {/* The scale. One event and a million draw the same bars without it. */}
        <div className="flex w-10 shrink-0 flex-col justify-between py-[1px] text-right text-[10px] cv-text-muted">
          <span>{max.toLocaleString()}</span>
          <span>0</span>
        </div>

        <div
          className="flex h-24 flex-1 items-end gap-[2px] border-b border-l pb-[1px] pl-[1px]"
          style={{ borderColor: "var(--border-primary)" }}
          role="img"
          aria-label={`Events over the last ${hours} hours: ${total} events, ${failed} failed, peak ${max} in a ${bucketMins} minute bucket.`}
        >
          {series.map((b, i) => {
            const h = (b.count / max) * 100;
            const failPct = b.count ? (b.failures / b.count) * 100 : 0;
            const label = `${fmtTime(b.at)} · ${b.count} events, ${b.failures} failed`;

            /*
             * An empty bucket is drawn as a hairline on the baseline, not as a
             * short bar in the data colour. The old version made zero look like
             * a small non-zero reading.
             */
            if (!b.count) {
              return (
                <div key={i} className="flex-1 self-end" title={label}>
                  <div className="h-[1px] w-full" style={{ background: "var(--border-primary)" }} />
                </div>
              );
            }

            return (
              <div
                key={i}
                className="relative flex-1 rounded-sm"
                style={{ height: `${Math.max(3, h)}%`, background: "var(--accent-cyan)" }}
                title={label}
              >
                {b.failures > 0 && (
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-sm bg-red-500"
                    style={{ height: `${failPct}%` }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Where the window starts and ends, so "the right edge" means something. */}
      <div className="mt-1 flex justify-between pl-12 text-[10px] cv-text-muted">
        <span>{fmtTime(series[0].at)}</span>
        <span>each bar {bucketMins}m</span>
        <span>now</span>
      </div>
    </div>
  );
}

/** A multi-series line chart, drawn as inline SVG. */
function MetricChart({
  series,
  unit,
  deployments = [],
}: {
  series: MetricSeries[];
  unit: "count" | "ms" | "%";
  deployments?: DeployMarker[];
}) {
  const W = 900;
  const H = 220;
  const PAD = { l: 48, r: 12, t: 12, b: 24 };
  const len = Math.max(1, series[0]?.points.length ?? 1);
  /*
   * The y-axis starts at zero even when every value is high. An axis that
   * starts at the minimum turns a 2% wobble into a cliff, which is how a
   * healthy service ends up looking like an outage.
   */
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const x = (i: number) => PAD.l + (i / Math.max(1, len - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const fmt = (v: number) => (unit === "%" ? `${v}%` : unit === "ms" ? `${Math.round(v)} ms` : v.toLocaleString());

  return (
    <div className="rounded-xl border cv-border cv-surface p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Metric over time">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(max * f) + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">
              {unit === "%" ? `${Math.round(max * f)}%` : Math.round(max * f).toLocaleString()}
            </text>
          </g>
        ))}
        {series.map((s, si) => (
          <g key={s.key}>
            <polyline
              fill="none"
              stroke={SERIES_COLOURS[si % SERIES_COLOURS.length]}
              strokeWidth={2}
              points={s.points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
            />
            {s.points.map((p, i) => (
              <circle key={i} cx={x(i)} cy={y(p.value)} r={2.5} fill={SERIES_COLOURS[si % SERIES_COLOURS.length]}>
                <title>{`${fmtTime(p.at)} · ${s.key} · ${fmt(p.value)} (${p.samples} samples)`}</title>
              </circle>
            ))}
          </g>
        ))}

        {/*
          * Release markers, drawn last so they sit above the series.
          *
          * A dashed vertical line rather than a shaded band: a deployment is a
          * moment, and shading implies a duration during which something was
          * true. Positioned by interpolating into the bucket index, so a
          * marker lands where the eye expects rather than snapping to a bucket
          * boundary and appearing to precede a spike it actually followed.
          */}
        {(() => {
          const first = series[0]?.points[0]?.at;
          const last = series[0]?.points.at(-1)?.at;
          if (!first || !last || len < 2) return null;
          const t0 = Date.parse(first);
          const t1 = Date.parse(last);
          if (!(t1 > t0)) return null;

          return deployments.map((d) => {
            const t = Date.parse(d.firstSeenAt);
            if (!Number.isFinite(t) || t < t0 || t > t1) return null;
            const px = x(((t - t0) / (t1 - t0)) * (len - 1));
            return (
              <g key={d.sha}>
                <line
                  x1={px}
                  x2={px}
                  y1={PAD.t}
                  y2={H - PAD.b}
                  stroke="#e879f9"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <circle cx={px} cy={PAD.t} r={3} fill="#e879f9">
                  <title>
                    {`${d.shortSha} · ${d.branch}${d.author ? ` · ${d.author}` : ""}\n${fmtTime(
                      d.firstSeenAt
                    )}\n${d.message}`}
                  </title>
                </circle>
              </g>
            );
          });
        })()}
      </svg>
      <div className="flex flex-wrap gap-3 px-2 pt-1">
        {series.map((s, si) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] cv-text-muted">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: SERIES_COLOURS[si % SERIES_COLOURS.length] }}
            />
            {s.key} · {fmt(s.total)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Availability over time.
 *
 * Two views of the same data, as Azure offers: a line, which reads the trend,
 * and a scatter, which shows each check as its own dot so a single failure in
 * a healthy window is still visible rather than averaged into a line that
 * barely dips.
 *
 * Buckets with no checks are gaps, not zeroes — the series is `null` there and
 * the polyline is broken into segments rather than dragged down through the
 * silence.
 */
function AvailabilityChart({
  points,
  mode,
}: {
  points: { at: string; uptime: number | null; checks: number; failed: number; avgMs: number }[];
  mode: "line" | "scatter";
}) {
  const W = 900;
  const H = 200;
  const PAD = { l: 52, r: 12, t: 12, b: 26 };
  const len = Math.max(1, points.length);
  const x = (i: number) => PAD.l + (i / Math.max(1, len - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b);

  /* Contiguous runs of real values, so a gap breaks the line instead of being
     interpolated across — an interpolated gap asserts uptime nobody measured. */
  const segments: { i: number; v: number }[][] = [];
  let run: { i: number; v: number }[] = [];
  points.forEach((p, i) => {
    if (p.uptime === null) {
      if (run.length) segments.push(run);
      run = [];
    } else {
      run.push({ i, v: p.uptime });
    }
  });
  if (run.length) segments.push(run);

  const measured = points.filter((p) => p.uptime !== null);

  return (
    <div className="rounded-xl border cv-border cv-surface p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Availability over time">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(f)} y2={y(f)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(f) + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">
              {Math.round(f * 100)}%
            </text>
          </g>
        ))}

        {mode === "line" &&
          segments.map((seg, si) => (
            <polyline
              key={si}
              fill="none"
              stroke="#34d399"
              strokeWidth={2}
              points={seg.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}
            />
          ))}

        {points.map((p, i) =>
          p.uptime === null ? null : (
            <circle
              key={i}
              cx={x(i)}
              cy={y(p.uptime)}
              r={mode === "scatter" ? 4 : 2.5}
              fill={p.failed > 0 ? "#f87171" : "#34d399"}
              fillOpacity={mode === "scatter" ? 0.85 : 1}
            >
              <title>
                {`${fmtTime(p.at)} · ${Math.round(p.uptime * 100)}% · ${p.checks} check${
                  p.checks === 1 ? "" : "s"
                }${p.failed ? `, ${p.failed} failed` : ""} · avg ${p.avgMs} ms`}
              </title>
            </circle>
          )
        )}
      </svg>
      <div className="px-2 pt-1 text-[11px] cv-text-muted">
        {measured.length === 0
          ? "No probe has run in this window. The gaps are not outages — nothing was measured."
          : `${measured.length} of ${points.length} intervals measured. Gaps are intervals with no check, not downtime.`}
      </div>
    </div>
  );
}

export default function AppInsightsPanel() {
  const [view, setView] = useState<View | null>(null);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("map");
  const [openFailure, setOpenFailure] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState("");
  /** The log row whose end-to-end detail is open, if any. */
  const [openEvent, setOpenEvent] = useState<TelemetryEvent | null>(null);
  const [logOutcome, setLogOutcome] = useState<"all" | "failed" | "ok">("all");
  const [metric, setMetric] = useState<MetricId>("count");
  const [splitBy, setSplitBy] = useState<SplitBy>("none");
  const [explorer, setExplorer] = useState<ExplorerView | null>(null);
  const [explorerBusy, setExplorerBusy] = useState(false);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [editing, setEditing] = useState<RuleRow | null>(null);
  /** Per-failure status line: "filing", or whatever came back. */
  const [filedFailures, setFiledFailures] = useState<Record<string, string>>({});
  const [live, setLive] = useState(false);
  const [availMode, setAvailMode] = useState<"line" | "scatter">("line");
  const [availTarget, setAvailTarget] = useState("");
  const [availOutcome, setAvailOutcome] = useState<"all" | "ok" | "failed">("all");
  /* The brushed sub-window. Reset whenever the loaded window changes, or the
     fractions would silently mean a different span than the one they were
     dragged over. */
  const [availRange, setAvailRange] = useState<BrushRange>(FULL_RANGE);
  useEffect(() => setAvailRange(FULL_RANGE), [hours]);

  const fileFromFailure = useCallback(async (f: FailureGroup) => {
    setFiledFailures((s) => ({ ...s, [f.key]: "filing" }));
    try {
      const r = await fetch("/api/admin/icm", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify({
          kind: "from-failure",
          key: f.key,
          title: `${f.errorType} on ${f.path}`,
          detail: `${f.errorMessage || "(no message)"} — ${f.count} occurrences across ${f.sessions} sessions.`,
          errorType: f.errorType,
          path: f.path,
          count: f.count,
          sessions: f.sessions,
          firstSeen: f.firstSeen,
          lastSeen: f.lastSeen,
        }),
      });
      const b = await r.json();
      setFiledFailures((s) => ({
        ...s,
        [f.key]: !r.ok || !b.success
          ? b.message || "Could not file that."
          : b.incident
            ? `Filed ${b.incident.id}`
            /* Not an error: the sweep, or somebody else, already filed it.
               Saying so is more useful than a second incident would be. */
            : b.message || "Already open.",
      }));
    } catch {
      setFiledFailures((s) => ({ ...s, [f.key]: "Could not reach the incident service." }));
    }
  }, []);

  /*
   * Filtered client-side, over the 200 events the server already sent. Round
   * tripping for each keystroke would put the console's own traffic into the
   * table it is filtering, which is both noisy and slower than the filter.
   */
  const visibleLogs = (view?.recent ?? []).filter((e) => {
    if (logOutcome === "failed" && e.ok) return false;
    if (logOutcome === "ok" && !e.ok) return false;
    const q = logFilter.trim().toLowerCase();
    if (q && !e.path.toLowerCase().includes(q)) return false;
    return true;
  });

  /**
   * Everything the Availability blade shows, narrowed to the brushed window.
   *
   * The per-test table is *recomputed* here rather than filtered, because the
   * server's `availability` rows are aggregates over the whole loaded window.
   * Showing those next to a brushed chart would put "100%" beside a graph with
   * a visible hole in it — the two would disagree on screen, which is worse
   * than not offering the brush at all.
   */
  const brushedAvail = useMemo(() => {
    const series = view?.availabilitySeries ?? [];
    const allResults = view?.availabilityResults ?? [];
    const { from, to } = sliceFor(series.length, availRange);
    const points = series.length ? series.slice(from, to + 1) : [];

    const firstMs = series.length ? Date.parse(series[0].at) : NaN;
    const lastMs = series.length ? Date.parse(series[series.length - 1].at) : NaN;
    const results = isFullRange(availRange)
      ? allResults
      : allResults.filter((r) => withinRange(r.at, firstMs, lastMs, availRange));

    /* Per-target rollup over exactly the results being shown. */
    const byTarget = new Map<string, { target: string; checks: number; failed: number; totalMs: number; durations: number[]; lastFailureAt: string | null }>();
    for (const r of results) {
      const row = byTarget.get(r.target) ?? { target: r.target, checks: 0, failed: 0, totalMs: 0, durations: [], lastFailureAt: null };
      row.checks += 1;
      row.totalMs += r.durationMs;
      row.durations.push(r.durationMs);
      if (!r.ok) {
        row.failed += 1;
        if (!row.lastFailureAt || r.at > row.lastFailureAt) row.lastFailureAt = r.at;
      }
      byTarget.set(r.target, row);
    }

    const tests = [...byTarget.values()]
      .map((row) => {
        const sorted = [...row.durations].sort((a, b) => a - b);
        // Nearest-rank, matching lib/app-insights.ts. An interpolating
        // percentile invents a duration that never happened, which is
        // indefensible beside a table listing every check.
        const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
        return {
          target: row.target,
          uptime: row.checks > 0 ? (row.checks - row.failed) / row.checks : 1,
          checks: row.checks,
          avgMs: row.checks > 0 ? Math.round(row.totalMs / row.checks) : 0,
          p95Ms: sorted.length ? sorted[idx] : 0,
          lastFailureAt: row.lastFailureAt,
        };
      })
      .sort((a, b) => a.uptime - b.uptime || a.target.localeCompare(b.target));

    /* Fall back to the server's aggregate when the brush is untouched and no
       individual results were returned — an older API build sends the rollup
       without the raw rows, and an empty table there would read as an outage. */
    const fallback = view?.availability ?? [];
    return { points, results, tests: tests.length || results.length ? tests : fallback };
  }, [view?.availabilitySeries, view?.availabilityResults, view?.availability, availRange]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/insights-telemetry?hours=${hours}`, { headers: { "x-admin-token": tok() } });
      const b = await r.json();
      if (!r.ok || !b.success) setError(b.message || "Could not load telemetry.");
      else setView(b as View);
    } catch {
      setError("Could not reach the telemetry service.");
    }
    setLoading(false);
  }, [hours]);

  const loadExplorer = useCallback(async () => {
    setExplorerBusy(true);
    try {
      const q = new URLSearchParams({ metric, splitBy, hours: String(hours) });
      const r = await fetch(`/api/admin/insights-telemetry?${q}`, { headers: { "x-admin-token": tok() } });
      const b = await r.json();
      if (r.ok && b.success) setExplorer(b as ExplorerView);
    } catch {
      /* The chart keeps its last good render; the panel-level error owns the banner. */
    }
    setExplorerBusy(false);
  }, [metric, splitBy, hours]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Live mode.
   *
   * Off by default and capped at the shortest window, because a console that
   * refetches every ten seconds over a week of telemetry is the heaviest
   * client of the API it is monitoring — and its own requests land in the
   * table it is showing, which makes a quiet system look busy.
   */
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [live, load]);

  /*
   * Only fetched while the blade is open. The explorer runs a full pass over the
   * buffer, and paying for it behind a tab nobody is looking at is how an
   * observability console becomes the thing that needs observing.
   */
  useEffect(() => {
    if (tab === "metrics") void loadExplorer();
  }, [tab, loadExplorer]);

  const loadRules = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/insights-rules", { headers: { "x-admin-token": tok() } });
      const b = await r.json();
      if (r.ok && b.success) setRules(b.rules as RuleRow[]);
    } catch {
      /* The panel-level banner owns errors; a stale rule list is not one. */
    }
  }, []);

  useEffect(() => {
    if (tab === "alerts") void loadRules();
  }, [tab, loadRules]);

  const saveRule = useCallback(
    async (rule: RuleRow) => {
      const r = await fetch("/api/admin/insights-rules", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify(rule),
      });
      const b = await r.json();
      /* The validator's message is shown verbatim: it already explains what is
         wrong with the rule far better than "could not save" would. */
      if (!r.ok || !b.success) setError(b.message || "Could not save that rule.");
      else {
        setError("");
        setEditing(null);
        void loadRules();
      }
    },
    [loadRules]
  );

  const removeRule = useCallback(
    async (id: string) => {
      if (!confirm("Delete this rule? It will not come back on its own.")) return;
      const r = await fetch(`/api/admin/insights-rules?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-admin-token": tok() },
      });
      if (r.ok) void loadRules();
    },
    [loadRules]
  );

  const clear = async () => {
    if (!confirm("Discard all buffered telemetry? Aggregates will rebuild as new events arrive.")) return;
    await fetch("/api/admin/insights-telemetry", { method: "DELETE", headers: { "x-admin-token": tok() } });
    void load();
  };

  const s = view?.summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold cv-text-primary">
            <Activity className="h-5 w-5 text-cyan-400" aria-hidden />
            Application Insights
          </h2>
          <p className="text-[13px] cv-text-muted">
            Which routes are reached, what fails, and what the session was doing when it did.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border cv-border">
            {WINDOWS.map((w) => (
              <button
                key={w.h}
                onClick={() => setHours(w.h)}
                className={`h-[44px] px-3 text-sm font-semibold ${
                  hours === w.h ? "bg-cyan-600 text-white" : "cv-surface-alt cv-text-secondary cv-hover-h"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setLive((v) => !v)}
            aria-pressed={live}
            title="Refetch every 15 seconds"
            className={`inline-flex h-[44px] items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${
              live ? "border-emerald-500 text-emerald-300" : "cv-border cv-text-muted"
            }`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: live ? "#34d399" : "var(--text-muted)" }}
            />
            Live
          </button>
          <button
            onClick={() => void load()}
            className="inline-flex h-[44px] items-center gap-2 rounded-lg border cv-border px-3 text-sm cv-text-secondary hover:cv-surface-alt"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            Refresh
          </button>
          <button
            onClick={() => void clear()}
            aria-label="Discard buffered telemetry"
            className="inline-flex h-[44px] items-center gap-2 rounded-lg border cv-border px-3 text-sm cv-text-muted hover:cv-surface-alt"
            title="Discard the buffer"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">{error}</div>}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Events" value={s.totalEvents.toLocaleString()} icon={Activity} />
            <Metric label="Sessions" value={s.sessions.toLocaleString()} icon={Users} />
            <Metric label="Page views" value={s.pageViews.toLocaleString()} icon={Route} />
            <Metric label="Requests" value={s.requests.toLocaleString()} icon={Network} />
            <Metric
              label="Failure rate"
              value={`${s.failureRate}%`}
              tone={s.failureRate > 5 ? "#ef4444" : s.failureRate > 1 ? "#f59e0b" : "#22c55e"}
              icon={AlertTriangle}
            />
            <Metric label="P95" value={`${s.p95}ms`} tone={s.p95 > 2000 ? "#f59e0b" : "var(--text-primary)"} icon={Gauge} />
          </div>

          <Series series={s.series} hours={hours} />

          {/*
            Said plainly rather than hidden. The buffer is a fixed-size ring, so
            once it is full the window silently stops reaching as far back as it
            claims — and a chart that quietly covers four hours while the button
            says seven days is worse than no chart.
          */}
          {view && view.retained >= view.capacity && (
            <div className="rounded-lg border border-amber-800 bg-amber-950/30 px-3 py-2 text-[12px] text-amber-200">
              The buffer is full at {view.capacity.toLocaleString()} events, so this window may not reach back the
              full {hours}h. {view.received.toLocaleString()} received in total.
            </div>
          )}
        </>
      )}

      {view && view.anomalies.length > 0 && (
        <div className="space-y-2">
          {view.anomalies.slice(0, 5).map((a) => (
            <div
              key={a.fingerprint}
              className="rounded-xl border p-3"
              style={{
                /*
                 * Literal colours. A severity chip that renders the same for
                 * critical and warning is worse than none, and a theme text
                 * token on a coloured fill is how that happens.
                 */
                borderColor: a.severity === "critical" ? "rgba(220,38,38,0.5)" : "rgba(245,158,11,0.4)",
                background: a.severity === "critical" ? "rgba(220,38,38,0.08)" : "rgba(245,158,11,0.06)",
              }}
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                  style={{
                    background: a.severity === "critical" ? "rgba(220,38,38,0.9)" : "rgba(245,158,11,0.9)",
                    color: a.severity === "critical" ? "#fff" : "#1f2937",
                  }}
                >
                  {a.severity}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold cv-text-secondary">{a.title}</div>
                  <div className="text-[13px] cv-text-muted">{a.detail}</div>
                  {a.suggestion && (
                    <div className="mt-1 text-[12px] cv-text-muted">{a.suggestion}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <p className="text-[11px] cv-text-muted">
            Detected by comparing the last hour against the day before it. Findings with these
            fingerprints file an incident through the monitor bridge, once each — the same path
            device alerts take.
          </p>
        </div>
      )}
      <div className="space-y-1.5 border-b cv-border pb-2">
        {TAB_GROUPS.map((g) => (
          <div key={g.group} className="flex flex-wrap items-center gap-1">
            <span className="w-[5.5rem] shrink-0 text-[10.5px] font-bold uppercase tracking-wide cv-text-muted">
              {g.group}
            </span>
            {g.tabs.map((t) => {
              const n = COUNTS(view, rules)[t.id];
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-pressed={tab === t.id}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors"
                  style={
                    tab === t.id
                      ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff" }
                      : { color: "var(--text-tertiary)" }
                  }
                >
                  {t.label}
                  {typeof n === "number" && n > 0 && (
                    <span
                      className="rounded-full px-1.5 text-[10.5px] tabular-nums"
                      style={{
                        background: tab === t.id ? "rgba(255,255,255,0.22)" : "var(--bg-glass)",
                        color: tab === t.id ? "#fff" : "var(--text-muted)",
                      }}
                    >
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {!view && loading && <div className="py-10 text-center cv-text-muted">Loading telemetry…</div>}

      {view && view.summary.totalEvents === 0 && (
        <div className="rounded-xl border cv-border py-10 text-center">
          <Activity className="mx-auto mb-2 h-8 w-8 cv-text-muted" aria-hidden />
          <div className="font-semibold cv-text-secondary">No telemetry in this window</div>
          <div className="text-[13px] cv-text-muted">
            The collector reports page views and failures from every browser session. Widen the window, or wait for
            traffic.
          </div>
        </div>
      )}

      {/*
        The new blades. Each fetches only while it is the open tab — the Usage,
        Logs and Live blades run their own passes over the buffer, and paying
        for all of them on every panel load is exactly the cost this panel
        exists to make visible.
      */}
      {view && tab === "map" && <MapBlade nodes={view.map} />}
      {tab === "live" && <LiveBlade />}
      {view && tab === "search" && <TransactionBlade events={view.recent} />}
      {tab === "query" && <LogsBlade />}
      {tab === "usage" && <UsageBlade hours={hours} />}
      {tab === "funnels" && <FunnelBlade hours={hours} />}
      {tab === "cohorts" && <CohortsBlade hours={hours} />}
      {tab === "impact" && <ImpactBlade hours={hours} />}
      {tab === "configure" && <ConfigureBlade />}

      {view && tab === "requests" && (
        <div className="space-y-3">
          {/*            Charts first, table second.

            The table already answered "which route is slowest". It could not
            answer "is it getting worse", "what proportion of traffic is
            failing", or "which route is failing badly rather than often" —
            all of which are in the same payload and were simply never drawn.
          */}
          <div className="grid gap-3 lg:grid-cols-2">
            <ChartCard title="Traffic" hint="Requests per bucket, with failures overlaid when there are any.">
              <TrafficChart summary={view.summary} />
            </ChartCard>
            <ChartCard title="Failure rate" hint="Proportion of requests that failed, not the raw count.">
              <FailureRateChart summary={view.summary} />
            </ChartCard>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <ChartCard title="Responses" hint="Grouped by class — the question is how much succeeded.">
              <StatusDonut statuses={view.statuses} />
            </ChartCard>
            <ChartCard title="Slowest routes" hint="By p95, in ms. The average is a good day; the p95 is the complaint.">
              <SlowestRequests requests={view.requests} />
            </ChartCard>
            <ChartCard title="Worst failure rate" hint="Percent failing, minimum five calls — a route failing 10 of 10 beats one failing 1000 of a million.">
              <FailingRequests requests={view.requests} />
            </ChartCard>
          </div>
          {view.statuses.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {view.statuses.map((s) => (
                <span
                  key={s.status}
                  className="rounded-md px-2 py-1 text-[11px] font-bold"
                  style={{
                    /*
                     * Literal colours, not theme tokens. A status chip is
                     * meaningless if 500 and 200 render the same, and a theme
                     * text token on a coloured fill is how that happens.
                     */
                    background:
                      s.status === 0 || s.status >= 500
                        ? "rgba(220,38,38,0.18)"
                        : s.status >= 400
                          ? "rgba(245,158,11,0.18)"
                          : "rgba(16,185,129,0.18)",
                    color:
                      s.status === 0 || s.status >= 500
                        ? "#fca5a5"
                        : s.status >= 400
                          ? "#fcd34d"
                          : "#6ee7b7",
                  }}
                >
                  {s.status === 0 ? "No response" : s.status} · {s.count}
                </span>
              ))}
            </div>
          )}

          {view.requests.length === 0 ? (
            <div className="rounded-xl border cv-border py-8 text-center">
              <div className="font-semibold cv-text-secondary">No API calls recorded yet</div>
              <div className="mx-auto mt-1 max-w-lg text-[13px] cv-text-muted">
                Calls are timed in the browser as they happen, so this fills in once someone uses
                the site in this window. They are client-observed durations: they include the
                network, and calls made by the mobile app or a script are not here.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border cv-border">
              <table className="w-full text-left text-sm">
                <thead className="cv-surface-alt text-[11px] uppercase tracking-wide cv-text-muted">
                  <tr>
                    <th className="px-3 py-2">Operation</th>
                    <th className="px-3 py-2 text-right">Calls</th>
                    <th className="px-3 py-2 text-right">Failed</th>
                    <th className="px-3 py-2 text-right">Avg</th>
                    <th className="px-3 py-2 text-right">P95</th>
                    <th className="px-3 py-2 text-right">Max</th>
                    <th className="px-3 py-2 text-right">Last</th>
                  </tr>
                </thead>
                <tbody>
                  {view.requests.map((r) => (
                    <tr key={r.name} className="border-t cv-border">
                      <td className="px-3 py-2">
                        <span
                          className="mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ background: "rgba(148,163,184,0.18)", color: "#cbd5e1" }}
                        >
                          {r.method}
                        </span>
                        <span className="cv-text-secondary">{r.path}</span>
                      </td>
                      <td className="px-3 py-2 text-right cv-text-secondary">{r.count}</td>
                      <td
                        className="px-3 py-2 text-right font-semibold"
                        style={{ color: r.failed > 0 ? "#fca5a5" : undefined }}
                      >
                        {r.failed > 0
                          ? `${r.failed} (${Math.round(r.failureRate * 100)}%)`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right cv-text-secondary">{r.avgMs} ms</td>
                      <td className="px-3 py-2 text-right cv-text-secondary">{r.p95Ms} ms</td>
                      <td className="px-3 py-2 text-right cv-text-muted">{r.maxMs} ms</td>
                      <td className="px-3 py-2 text-right cv-text-muted">
                        {view.now ? ago(r.lastAt, view.now) : fmtTime(r.lastAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view && tab === "dependencies" && (
        <div className="space-y-3">
          {view.dependencies.length > 0 && (
            <ChartCard
              title="Slowest outbound calls"
              hint="By p95, in ms. Red means it is failing as well as slow — a different problem from merely slow."
            >
              <DependencyLatency dependencies={view.dependencies} />
            </ChartCard>
          )}
          {(() => {
            /*
             * A monitor that has never run looks identical to one where
             * nothing is wrong — no failures, every uptime 100% or absent.
             * The only honest thing is to say when it last ran.
             */
            if (!view.lastSweepAt) {
              return (
                <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-[13px] text-amber-200">
                  <strong>The scheduled sweep has never run.</strong> Availability below is
                  measured only from checks a page happened to make. Set <code>CRON_SECRET</code>{" "}
                  in the deployment and point a scheduler at{" "}
                  <code>/api/admin/availability/probe</code>; until then nothing is watching the
                  other apps, and no incident will be filed automatically.
                </div>
              );
            }
            const ageHours = (Date.parse(view.now) - Date.parse(view.lastSweepAt)) / 3_600_000;
            if (ageHours > 48) {
              return (
                <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-[13px] text-amber-200">
                  <strong>The sweep last ran {ago(view.lastSweepAt, view.now)}.</strong> It is
                  meant to run daily. A gap in probes is not evidence of uptime.
                </div>
              );
            }
            return (
              <div className="text-[11px] cv-text-muted">
                Scheduled sweep last ran {ago(view.lastSweepAt, view.now)}.
              </div>
            );
          })()}

          {view.availability.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold cv-text-primary">Availability</div>
                <div className="flex overflow-hidden rounded-lg border cv-border">
                  {(["line", "scatter"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setAvailMode(m)}
                      className={`h-[32px] px-3 text-xs font-semibold capitalize ${
                        availMode === m ? "bg-cyan-600 text-white" : "cv-surface-alt cv-text-secondary"
                      }`}
                    >
                      {m === "scatter" ? "Scatter plot" : "Line"}
                    </button>
                  ))}
                </div>
              </div>

              <AvailabilityChart points={brushedAvail.points} mode={availMode} />

              {/*
                The scrubber. Azure puts one under this chart, and it is what
                turns "99.2% today" into "41% between 03:10 and 03:25" — the
                only version of that number anyone can act on. It narrows what
                is shown from data already loaded, so it is instant and cannot
                fail; widening past the window is the time-range control's job.
              */}
              {(view.availabilitySeries ?? []).length > 2 && (
                <RangeBrush
                  label="Availability window"
                  points={(view.availabilitySeries ?? []).map((p) => ({ at: p.at, value: p.uptime }))}
                  value={availRange}
                  onChange={setAvailRange}
                  formatAt={fmtTime}
                />
              )}

              {/*
                Availability results, as Azure's right-hand panel states them.
                A percentage answers "how good", a count answers "how many
                people hit it" — and a 99.9% month with 4,000 checks is a very
                different conversation from 99.9% with 40.
              */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border cv-border cv-surface p-3">
                  <div className="mb-2 text-sm font-bold cv-text-primary">
                    Availability results
                    {!isFullRange(availRange) && (
                      <span className="ml-2 text-[11px] font-normal cv-text-muted">in the selected window</span>
                    )}
                  </div>
                  {(() => {
                    const total = brushedAvail.results.length;
                    const ok = brushedAvail.results.filter((r) => r.ok).length;
                    const failed = total - ok;
                    const pctOf = (n: number) => (total > 0 ? (n / total) * 100 : 0);
                    return (
                      <div className="space-y-2">
                        {([
                          ["Successful", ok, "#34d399"],
                          ["Failed", failed, "#f87171"],
                        ] as const).map(([label, n, colour]) => (
                          <div key={label} className="flex items-center gap-3">
                            <span className="w-20 shrink-0 text-[12px] cv-text-secondary">{label}</span>
                            <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--border-primary)" }}>
                              {/* Zero draws nothing rather than a hairline: a
                                  visible bar for "no failures" reads as some. */}
                              <span className="block h-full rounded-full" style={{ width: `${pctOf(n)}%`, background: colour }} />
                            </span>
                            <span className="w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums cv-text-primary">
                              {n.toLocaleString()}
                            </span>
                          </div>
                        ))}
                        <div className="pt-1 text-[11px] cv-text-muted">
                          {total === 0
                            ? "No checks ran in this window."
                            : `${total.toLocaleString()} checks · ${pctOf(ok).toFixed(pctOf(ok) === 100 ? 0 : 2)}% successful`}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="rounded-xl border cv-border cv-surface p-3">
                  <div className="mb-2 text-sm font-bold cv-text-primary">Slowest check</div>
                  {(() => {
                    /* The check that took longest, named. An average hides the
                       one request that timed out, which is the one worth
                       opening. */
                    const worst = [...brushedAvail.results].sort((a, b) => b.durationMs - a.durationMs)[0];
                    if (!worst) return <p className="text-[12px] cv-text-muted">Nothing measured in this window.</p>;
                    return (
                      <div className="space-y-1 text-[12px]">
                        <div className="font-mono cv-text-secondary">{worst.target}</div>
                        <div className="text-2xl font-bold tabular-nums cv-text-primary">{worst.durationMs} ms</div>
                        <div className="cv-text-muted">
                          {fmtTime(worst.at)} · {worst.ok ? `HTTP ${worst.status}` : worst.detail || "failed"}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border cv-border">
                <table className="w-full text-left text-sm">
                  <thead className="cv-surface-alt text-[11px] uppercase tracking-wide cv-text-muted">
                    <tr>
                      <th className="px-3 py-2">Availability test</th>
                      <th className="px-3 py-2 text-right">Availability</th>
                      <th className="px-3 py-2 text-right">Checks</th>
                      <th className="px-3 py-2 text-right">Duration (avg)</th>
                      <th className="px-3 py-2 text-right">P95</th>
                      <th className="px-3 py-2">Last failure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brushedAvail.tests.map((a) => (
                      <tr
                        key={a.target}
                        onClick={() => setAvailTarget(availTarget === a.target ? "" : a.target)}
                        className={`cursor-pointer border-t cv-border ${
                          availTarget === a.target ? "cv-surface-alt" : ""
                        }`}
                      >
                        <td className="px-3 py-2">
                          <span
                            className="mr-2 inline-block h-2 w-2 rounded-full"
                            style={{ background: a.uptime === 1 ? "#34d399" : a.uptime >= 0.99 ? "#f59e0b" : "#f87171" }}
                          />
                          {a.target}
                        </td>
                        <td
                          className="px-3 py-2 text-right font-semibold"
                          style={{ color: a.uptime < 0.99 ? "#fca5a5" : "#6ee7b7" }}
                        >
                          {(a.uptime * 100).toFixed(a.uptime === 1 ? 0 : 2)}%
                        </td>
                        <td className="px-3 py-2 text-right text-[12px] cv-text-muted">{a.checks}</td>
                        <td className="px-3 py-2 text-right text-[12px] cv-text-secondary">{a.avgMs} ms</td>
                        <td className="px-3 py-2 text-right text-[12px] cv-text-muted">{a.p95Ms} ms</td>
                        <td className="px-3 py-2 text-[12px] cv-text-muted">
                          {a.lastFailureAt && view.now ? ago(a.lastFailureAt, view.now) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(() => {
                /* Drill in. An uptime percentage says something is wrong; only
                   the individual results say when it started and what it
                   answered. */
                const results = brushedAvail.results.filter(
                  (r) => !availTarget || r.target === availTarget
                );
                const failed = results.filter((r) => !r.ok);
                const shown = availOutcome === "failed" ? failed : availOutcome === "ok" ? results.filter((r) => r.ok) : results;

                return (
                  <div className="rounded-xl border cv-border cv-surface p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold cv-text-primary">
                        Drill into{availTarget ? ` ${availTarget}` : " all tests"}
                      </span>
                      {availTarget && (
                        <button
                          onClick={() => setAvailTarget("")}
                          className="text-[11px] cv-text-muted hover:cv-text-primary"
                        >
                          clear
                        </button>
                      )}
                      <div className="ml-auto flex gap-2">
                        <button
                          onClick={() => setAvailOutcome(availOutcome === "ok" ? "all" : "ok")}
                          className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                            availOutcome === "ok" ? "bg-emerald-600 text-white" : "cv-surface-alt cv-text-secondary"
                          }`}
                        >
                          {results.length - failed.length} successful
                        </button>
                        <button
                          onClick={() => setAvailOutcome(availOutcome === "failed" ? "all" : "failed")}
                          className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                            availOutcome === "failed" ? "bg-red-600 text-white" : "cv-surface-alt cv-text-secondary"
                          }`}
                        >
                          {failed.length} failed
                        </button>
                      </div>
                    </div>

                    {shown.length === 0 ? (
                      <div className="py-6 text-center text-[13px] cv-text-muted">
                        No results yet. The scheduled probe records one per check.
                      </div>
                    ) : (
                      <ul className="max-h-[280px] space-y-1 overflow-y-auto">
                        {shown.slice(0, 40).map((r, i) => (
                          <li
                            key={`${r.at}-${r.target}-${i}`}
                            className="flex items-baseline gap-2 rounded-md px-2 py-1 text-[12px]"
                            style={{ background: r.ok ? "transparent" : "rgba(127,29,29,0.25)" }}
                          >
                            <span className="shrink-0 cv-text-muted">{fmtTime(r.at)}</span>
                            <span className="shrink-0 font-semibold cv-text-secondary">{r.target}</span>
                            <span
                              className="shrink-0 font-semibold"
                              style={{ color: r.ok ? "#6ee7b7" : "#fca5a5" }}
                            >
                              {r.ok ? "Successful" : "Failed"}
                            </span>
                            <span className="min-w-0 flex-1 truncate cv-text-muted">{r.detail}</span>
                            <span className="shrink-0 cv-text-muted">{r.durationMs} ms</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })()}
            </>
          )}

          {view.availability.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {view.availability.map((a) => (
                <div
                  key={a.target}
                  className="rounded-lg border px-3 py-2"
                  style={{
                    borderColor: a.uptime < 1 ? "rgba(220,38,38,0.5)" : "var(--cv-border)",
                  }}
                >
                  <div className="text-[11px] uppercase tracking-wide cv-text-muted">
                    {a.target} availability
                  </div>
                  <div
                    className="text-lg font-bold"
                    style={{ color: a.uptime < 0.99 ? "#fca5a5" : "#6ee7b7" }}
                  >
                    {(a.uptime * 100).toFixed(a.uptime === 1 ? 0 : 2)}%
                  </div>
                  <div className="text-[11px] cv-text-muted">
                    {a.checks} check{a.checks === 1 ? "" : "s"} · p95 {a.p95Ms} ms
                    {a.lastFailureAt && view.now
                      ? ` · last failed ${ago(a.lastFailureAt, view.now)}`
                      : ""}
                  </div>
                </div>
              ))}
              <p className="w-full text-[11px] cv-text-muted">
                Measured from health checks the app makes when a page asks about a capability —
                not from a scheduled prober. It answers whether the service was reachable when
                somebody looked, which differs from whether it is up precisely when nobody is.
              </p>
            </div>
          )}
          {view.map.length > 0 && (
            <div className="rounded-xl border cv-border p-3">
              <div className="mb-2 text-[11px] uppercase tracking-wide cv-text-muted">
                Application map
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {view.map.map((n, i) => (
                  <span key={n.id} className="flex items-center gap-2">
                    <span
                      className="rounded-lg border px-3 py-2 text-sm"
                      style={{
                        borderColor:
                          n.failureRate > 0.05 ? "rgba(220,38,38,0.5)" : "var(--cv-border)",
                        background:
                          n.failureRate > 0.05 ? "rgba(220,38,38,0.08)" : "transparent",
                      }}
                    >
                      <span className="block font-semibold cv-text-secondary">{n.id}</span>
                      <span className="block text-[11px] cv-text-muted">
                        {n.calls} calls · p95 {n.p95Ms} ms
                        {n.failed > 0 && (
                          <span style={{ color: "#fca5a5" }}>
                            {" "}
                            · {Math.round(n.failureRate * 100)}% failing
                          </span>
                        )}
                      </span>
                    </span>
                    {i < view.map.length - 1 && (
                      <span className="cv-text-muted" aria-hidden>
                        →
                      </span>
                    )}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] cv-text-muted">
                Three tiers, because three are all that are observable from here. The control
                plane&apos;s own database and broker would have to be drawn from instrumentation
                that does not exist, and a map with invented edges is worse than a small true one.
              </p>
            </div>
          )}

          {view.dependencies.length === 0 ? (
            <div className="rounded-xl border cv-border py-8 text-center">
              <div className="font-semibold cv-text-secondary">No outbound calls recorded</div>
              <div className="mx-auto mt-1 max-w-lg text-[13px] cv-text-muted">
                Calls from the console to the control plane are timed at the client that makes
                them. This fills in once somebody uses a page that talks to a device.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border cv-border">
              <table className="w-full text-left text-sm">
                <thead className="cv-surface-alt text-[11px] uppercase tracking-wide cv-text-muted">
                  <tr>
                    <th className="px-3 py-2">Service</th>
                    <th className="px-3 py-2">Operation</th>
                    <th className="px-3 py-2 text-right">Calls</th>
                    <th className="px-3 py-2 text-right">Failed</th>
                    <th className="px-3 py-2 text-right">Avg</th>
                    <th className="px-3 py-2 text-right">P95</th>
                    <th className="px-3 py-2 text-right">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {view.dependencies.map((d) => (
                    <tr key={d.name} className="border-t cv-border">
                      <td className="px-3 py-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ background: "rgba(168,85,247,0.18)", color: "#d8b4fe" }}
                        >
                          {d.target}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[13px] cv-text-secondary">
                        {d.method} {d.path}
                      </td>
                      <td className="px-3 py-2 text-right cv-text-secondary">{d.count}</td>
                      <td
                        className="px-3 py-2 text-right font-semibold"
                        style={{ color: d.failed > 0 ? "#fca5a5" : undefined }}
                      >
                        {d.failed > 0 ? `${d.failed} (${Math.round(d.failureRate * 100)}%)` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right cv-text-secondary">{d.avgMs} ms</td>
                      <td className="px-3 py-2 text-right cv-text-secondary">{d.p95Ms} ms</td>
                      <td className="px-3 py-2 text-right cv-text-muted">{d.maxMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view && tab === "performance" && (
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <ChartCard title="Where the time goes" hint="The distribution, not an average — an average hides a slow tail entirely.">
              <DurationHistogram histogram={view.histogram} />
            </ChartCard>
            <ChartCard
              title="Percentiles by operation"
              hint="Bars of similar height mean uniformly slow. A low p50 beside a towering p99 means usually fine, occasionally terrible — different causes, and an average hides both."
            >
              <PercentileBars performance={view.performance} />
            </ChartCard>
          </div>
          {view.histogram.some((b) => b.count > 0) && (
            <div className="rounded-xl border cv-border p-3">
              <div className="mb-2 text-[11px] uppercase tracking-wide cv-text-muted">
                API call duration
              </div>
              <div className="space-y-1">
                {view.histogram.map((b) => {
                  const max = Math.max(...view.histogram.map((x) => x.count), 1);
                  return (
                    <div key={b.label} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-right text-[11px] cv-text-muted">
                        {b.label}
                      </span>
                      <div className="h-3 flex-1 overflow-hidden rounded" style={{ background: "rgba(148,163,184,0.12)" }}>
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${(b.count / max) * 100}%`,
                            // Slow buckets in amber: the shape of the tail is
                            // the reason to look at a histogram at all.
                            background: b.upTo > 1000 ? "rgba(245,158,11,0.75)" : "rgba(6,182,212,0.75)",
                          }}
                        />
                      </div>
                      <span className="w-10 text-right text-[11px] cv-text-muted">{b.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view.performance.length === 0 ? (
            <div className="rounded-xl border cv-border py-8 text-center cv-text-muted">
              Nothing timed in this window yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border cv-border">
              <table className="w-full text-left text-sm">
                <thead className="cv-surface-alt text-[11px] uppercase tracking-wide cv-text-muted">
                  <tr>
                    <th className="px-3 py-2">Operation</th>
                    <th className="px-3 py-2 text-right">N</th>
                    <th className="px-3 py-2 text-right">Min</th>
                    <th className="px-3 py-2 text-right">P50</th>
                    <th className="px-3 py-2 text-right">P90</th>
                    <th className="px-3 py-2 text-right">P95</th>
                    <th className="px-3 py-2 text-right">P99</th>
                    <th className="px-3 py-2 text-right">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {view.performance.map((r) => (
                    <tr key={r.name} className="border-t cv-border">
                      <td className="px-3 py-2">
                        <span
                          className="mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold"
                          style={{
                            background: r.kind === "request" ? "rgba(6,182,212,0.18)" : "rgba(148,163,184,0.18)",
                            color: r.kind === "request" ? "#67e8f9" : "#cbd5e1",
                          }}
                        >
                          {r.kind === "request" ? "API" : "PAGE"}
                        </span>
                        <span className="cv-text-secondary">{r.name}</span>
                      </td>
                      <td className="px-3 py-2 text-right cv-text-muted">{r.count}</td>
                      <td className="px-3 py-2 text-right cv-text-muted">{r.minMs}</td>
                      <td className="px-3 py-2 text-right cv-text-secondary">{r.p50Ms}</td>
                      <td className="px-3 py-2 text-right cv-text-secondary">{r.p90Ms}</td>
                      <td className="px-3 py-2 text-right font-semibold cv-text-secondary">{r.p95Ms}</td>
                      <td
                        className="px-3 py-2 text-right"
                        style={{ color: r.p99Ms > 3000 ? "#fcd34d" : undefined }}
                      >
                        {r.p99Ms}
                      </td>
                      <td className="px-3 py-2 text-right cv-text-muted">{r.maxMs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 text-[11px] cv-text-muted">
                All values in milliseconds, measured in the browser. P50 beside P99 on purpose:
                a route that is fast on a cache hit and slow on a miss has an average that
                describes neither.
              </div>
            </div>
          )}
        </div>
      )}

      {view && tab === "metrics" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="metric-pick">Metric</label>
            <select
              id="metric-pick"
              value={metric}
              onChange={(e) => setMetric(e.target.value as MetricId)}
              className="h-[38px] rounded-lg border cv-border cv-surface px-3 text-sm cv-text-primary"
            >
              {METRICS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <span className="text-xs cv-text-muted">split by</span>
            <label className="sr-only" htmlFor="split-pick">Split by</label>
            <select
              id="split-pick"
              value={splitBy}
              onChange={(e) => setSplitBy(e.target.value as SplitBy)}
              className="h-[38px] rounded-lg border cv-border cv-surface px-3 text-sm cv-text-primary"
            >
              {SPLITS.map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.label}</option>
              ))}
            </select>
            <button
              onClick={() => void loadExplorer()}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg border cv-border px-3 text-sm cv-text-secondary hover:cv-surface-alt"
            >
              {explorerBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              Run
            </button>
            <button
              type="button"
              disabled={!explorer || explorer.series.length === 0}
              onClick={() => {
                if (!explorer) return;
                const label = METRICS.find((m) => m.id === metric)?.label ?? metric;
                downloadCsv(
                  `insights-metric-${metric}-${splitBy}.csv`,
                  toCsv(
                    ["at", "series", "metric", "value", "samples"],
                    explorer.series.flatMap((sr) =>
                      sr.points.map((p) => [p.at, sr.key, label, p.value, p.samples])
                    )
                  )
                );
              }}
              className="h-[38px] rounded-lg border cv-border px-3 text-xs font-semibold cv-text-secondary disabled:opacity-40"
            >
              Export
            </button>
          </div>

          {explorer && explorer.series.length > 0 ? (
            <>
              <MetricChart
                series={explorer.series}
                unit={METRICS.find((m) => m.id === metric)?.unit ?? "count"}
                deployments={explorer.deployments}
              />
              <div className="text-[11px] cv-text-muted">
                {explorer.bucketMinutes}-minute buckets over {hours}h.
                {explorer.truncated > 0 &&
                  ` ${explorer.truncated} lower-volume series not shown.`}{" "}
                {(explorer.deployments?.length ?? 0) > 0 &&
                  `${explorer.deployments!.length} release${explorer.deployments!.length === 1 ? "" : "s"} marked. `}
                Series totals are the metric over the whole window, not the average of
                the points — an average of percentiles is not a percentile.
              </div>
            </>
          ) : (
            <div className="rounded-xl border cv-border py-10 text-center text-sm cv-text-muted">
              {explorerBusy ? "Running…" : "No telemetry matches that metric in this window."}
            </div>
          )}
        </div>
      )}

      {view && tab === "alerts" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="max-w-[640px] text-[12px] cv-text-muted">
              Smart detection finds problems nobody thought to look for. These are the
              thresholds you already know you care about. Both file through the same incident
              bridge, so a breach opens one incident and re-breaching does not open another.
            </p>
            <button
              onClick={() => setEditing(blankRule())}
              className="h-[38px] rounded-lg bg-cyan-600 px-3 text-sm font-semibold text-white"
            >
              New rule
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border cv-border">
            <table className="w-full text-left text-sm">
              <thead className="cv-surface-alt text-[11px] uppercase tracking-wide cv-text-muted">
                <tr>
                  <th className="px-3 py-2">Rule</th>
                  <th className="px-3 py-2">Condition</th>
                  <th className="px-3 py-2">Now</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => {
                  const firing = (r.evaluations ?? []).filter((e) => e.breached);
                  return (
                    <tr key={r.id} className="border-t cv-border align-top">
                      <td className="px-3 py-2">
                        <div className="font-semibold cv-text-primary">{r.name}</div>
                        <div className="text-[11px] cv-text-muted">
                          {r.severity} · {r.owningTeam || "unrouted"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[12px] cv-text-secondary">{describeRule(r)}</td>
                      <td className="px-3 py-2 text-[12px] cv-text-secondary">
                        {formatMetricValue(r.metric, r.current ?? 0)}
                      </td>
                      <td className="px-3 py-2 text-[12px]">
                        {!r.enabled ? (
                          <span className="cv-text-muted">Disabled</span>
                        ) : firing.length > 0 ? (
                          <span className="font-semibold" style={{ color: "#f87171" }}>
                            Firing ({firing.length})
                          </span>
                        ) : (
                          <span className="cv-text-muted">
                            {/* The reason a quiet rule is quiet — a rule that
                                cannot fire looks identical to one that is not
                                firing, and only this column tells them apart. */}
                            {(r.evaluations ?? [])[0]?.reason ?? "not evaluated"}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <button
                          onClick={() => void saveRule({ ...r, enabled: !r.enabled })}
                          className="mr-2 text-[11px] cv-text-muted hover:cv-text-primary"
                        >
                          {r.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => setEditing(r)}
                          className="mr-2 text-[11px] cv-text-muted hover:cv-text-primary"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void removeRule(r.id)}
                          className="text-[11px] cv-text-muted hover:text-red-300"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rules.length === 0 && (
              <div className="py-8 text-center text-sm cv-text-muted">No rules yet.</div>
            )}
          </div>

          {editing && (
            <RuleEditor rule={editing} onCancel={() => setEditing(null)} onSave={saveRule} />
          )}
        </div>
      )}

      {view && tab === "logs" && (
        <div className="space-y-2">
          <ChartCard title="Event volume" hint="Everything received in this window, with failures overlaid.">
            <TrafficChart summary={view.summary} />
          </ChartCard>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              placeholder="Filter by path…"
              aria-label="Filter events by path"
              className="h-[38px] min-w-[200px] flex-1 rounded-lg border cv-border bg-transparent px-3 text-sm cv-text-primary"
            />
            {(["all", "failed", "ok"] as const).map((o) => (
              <button
                key={o}
                onClick={() => setLogOutcome(o)}
                className={`h-[38px] rounded-lg border px-3 text-xs font-semibold ${
                  logOutcome === o ? "border-cyan-500 text-cyan-300" : "cv-border cv-text-muted"
                }`}
              >
                {o === "all" ? "All" : o === "failed" ? "Failures" : "Successes"}
              </button>
            ))}
            <button
              type="button"
              disabled={visibleLogs.length === 0}
              onClick={() =>
                downloadCsv(
                  `insights-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`,
                  toCsv(
                    ["at", "kind", "method", "path", "status", "outcome", "durationMs", "errorType", "errorMessage"],
                    visibleLogs.map((e) => [
                      e.at,
                      e.kind,
                      e.method ?? "",
                      e.path,
                      e.status,
                      // Words rather than 1/0: a spreadsheet column of zeroes
                      // beside a status of 200 reads as "no data".
                      e.ok ? "ok" : "failed",
                      e.durationMs,
                      e.errorType ?? "",
                      e.errorMessage ?? "",
                    ])
                  )
                )
              }
              className="h-[38px] rounded-lg border cv-border px-3 text-xs font-semibold cv-text-secondary disabled:opacity-40"
              title="Download the filtered rows as CSV"
            >
              Export{visibleLogs.length > 0 ? ` (${visibleLogs.length})` : ""}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border cv-border">
            <table className="w-full text-left text-sm">
              <thead className="cv-surface-alt text-[11px] uppercase tracking-wide cv-text-muted">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Operation</th>
                  <th className="px-3 py-2 text-right">Status</th>
                  <th className="px-3 py-2 text-right">Duration</th>
                  <th className="px-3 py-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {visibleLogs.map((e) => (
                  <tr
                    key={e.id}
                    // Whole-row activation, as the equivalent Azure grid does.
                    // tabIndex + role + key handling because a <tr> is not
                    // focusable or activatable on its own, and a details view
                    // reachable only by mouse is not reachable at all for
                    // somebody driving this from the keyboard.
                    tabIndex={0}
                    role="button"
                    aria-label={`Open transaction details for ${e.method ? `${e.method} ` : ""}${e.path} at ${fmtTime(e.at)}`}
                    onClick={() => setOpenEvent(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        setOpenEvent(e);
                      }
                    }}
                    className="cursor-pointer border-t cv-border cv-hover"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-[12px] cv-text-muted">
                      {fmtTime(e.at)}
                    </td>
                    <td className="px-3 py-2 text-[12px] cv-text-muted">{e.kind}</td>
                    <td className="px-3 py-2 text-[12px] cv-text-secondary">
                      {e.method ? `${e.method} ` : ""}
                      {e.path}
                    </td>
                    <td
                      className="px-3 py-2 text-right text-[12px] font-semibold"
                      style={{ color: e.ok ? undefined : "#fca5a5" }}
                    >
                      {e.kind === "pageview" ? "—" : e.status === 0 ? "no response" : e.status}
                    </td>
                    <td className="px-3 py-2 text-right text-[12px] cv-text-muted">
                      {e.durationMs} ms
                    </td>
                    <td className="max-w-[280px] px-3 py-2 text-[12px] cv-text-muted">
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {e.errorType ? `${e.errorType}: ${e.errorMessage ?? ""}` : ""}
                        </span>
                        {/* The affordance. Without it nothing on the row says
                            it opens, and the feature is discovered by accident
                            or not at all. */}
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleLogs.length === 0 && (
              <div className="py-8 text-center text-sm cv-text-muted">
                Nothing matches that filter in this window.
              </div>
            )}
            <div className="px-3 py-2 text-[11px] cv-text-muted">
              Showing {visibleLogs.length} of {view.recent.length} most recent events. The store
              keeps the last {view.capacity.toLocaleString()} and nothing older.
            </div>
          </div>
        </div>
      )}

      {view && tab === "paths" && view.paths.length > 0 && (
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <ChartCard title="Busiest pages" hint="Page views in this window.">
              <BusiestPaths paths={view.paths} />
            </ChartCard>
            <ChartCard title="Slowest pages" hint="By p95, in ms.">
              <SlowestPaths paths={view.paths} />
            </ChartCard>
          </div>
          <div className="overflow-x-auto rounded-xl border cv-border">
          <table className="w-full text-left text-sm">
            <thead className="cv-surface-alt text-[11px] uppercase tracking-wide cv-text-muted">
              <tr>
                <th className="px-3 py-2">Path</th>
                <th className="px-3 py-2 text-right">Views</th>
                <th className="px-3 py-2 text-right">Sessions</th>
                <th className="px-3 py-2 text-right">Failures</th>
                <th className="px-3 py-2 text-right">P50</th>
                <th className="px-3 py-2 text-right">P95</th>
                <th className="px-3 py-2 text-right">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {view.paths.map((p) => (
                <tr key={p.path} className="border-t cv-border hover:cv-hover">
                  <td className="px-3 py-2 font-mono text-[12px] cv-text-primary">{p.path}</td>
                  <td className="px-3 py-2 text-right cv-text-secondary">{p.views.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right cv-text-muted">{p.sessions.toLocaleString()}</td>
                  <td
                    className="px-3 py-2 text-right font-semibold"
                    style={{ color: p.failureRate > 5 ? "#ef4444" : p.failures ? "#f59e0b" : "var(--text-muted)" }}
                  >
                    {p.failures ? `${p.failures} (${p.failureRate}%)` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right cv-text-muted">{p.p50 ? `${p.p50}ms` : "—"}</td>
                  <td className="px-3 py-2 text-right cv-text-muted">{p.p95 ? `${p.p95}ms` : "—"}</td>
                  <td className="px-3 py-2 text-right text-[12px] cv-text-muted">{ago(p.lastSeen, view.now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/*
        Not gated on `view`: this blade fetches from its own collector, so an
        empty telemetry buffer for this website must not hide failures reported
        by the other applications.
      */}
      {tab === "suite" && <SuiteFailures />}

      {view && tab === "failures" && (
        <div className="space-y-2">
          {view.failures.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-2">
              <ChartCard title="Most frequent" hint="Grouped by what makes them the same bug, not by message.">
                <TopFailures failures={view.failures} />
              </ChartCard>
              <ChartCard
                title="Most people affected"
                hint="By sessions. A loop throwing a thousand times is one person having a bad time; ten failures across ten sessions is ten people."
              >
                <FailuresBySession failures={view.failures} />
              </ChartCard>
            </div>
          )}
          {view.failures.length === 0 && (
            <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 py-8 text-center">
              <div className="font-semibold text-emerald-300">No failures in this window</div>
            </div>
          )}
          {view.failures.map((f) => (
            <div key={f.key} className="rounded-xl border cv-border cv-surface p-3">
              <button
                onClick={() => setOpenFailure(openFailure === f.key ? null : f.key)}
                className="flex w-full items-start gap-3 text-left"
              >
                <Bug className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold cv-text-primary">{f.errorType}</div>
                  <div className="truncate text-[13px] cv-text-muted">{f.errorMessage || "(no message)"}</div>
                  <div className="mt-1 text-[12px] cv-text-muted">
                    <span className="font-mono">{f.path}</span> · {f.count} occurrences · {f.sessions} sessions ·
                    last {ago(f.lastSeen, view.now)}
                  </div>
                </div>
                <span className="shrink-0 rounded-md bg-red-950/60 px-2 py-1 text-[12px] font-bold text-red-300">
                  {f.count}
                </span>
              </button>
              {openFailure === f.key && (
                <>
                  {f.stack && (
                    <pre className="mt-3 overflow-x-auto rounded-lg border cv-border cv-surface-alt p-3 text-[11px] leading-relaxed cv-text-muted">
                      {f.stack}
                    </pre>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => void fileFromFailure(f)}
                      disabled={filedFailures[f.key] === "filing"}
                      className="h-[34px] rounded-lg border cv-border px-3 text-[12px] font-semibold cv-text-secondary hover:cv-surface-alt disabled:opacity-40"
                    >
                      {filedFailures[f.key] === "filing" ? "Filing…" : "File an incident"}
                    </button>
                    {filedFailures[f.key] && filedFailures[f.key] !== "filing" && (
                      <span className="text-[12px] cv-text-muted">{filedFailures[f.key]}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {view && tab === "journeys" && (
        <div className="space-y-2">
          {view.journeys.length === 0 && (
            <div className="rounded-xl border cv-border py-8 text-center cv-text-muted">
              No sessions in this window.
            </div>
          )}
          {view.journeys.map((j) => (
            <div key={j.session} className="rounded-xl border cv-border cv-surface p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {j.failed && <AlertTriangle className="h-4 w-4 text-red-400" aria-hidden />}
                  <span className="font-mono text-[12px] cv-text-muted">session {j.session.slice(0, 8)}</span>
                </div>
                <span className="text-[11px] cv-text-muted">
                  {j.steps.length} steps · {ago(j.lastAt, view.now)}
                </span>
              </div>
              {/* The path taken, left to right. Failures are the red steps —
                  which is how you see that everybody who broke had just come
                  through the same screen. */}
              <div className="flex flex-wrap items-center gap-1">
                {j.steps.map((st, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="cv-text-muted">›</span>}
                    <span
                      className="rounded px-1.5 py-0.5 font-mono text-[11px]"
                      style={{
                        /* Literal, like the severity chips: the fill is dark by
                           design, so the label has to be chosen against it
                           rather than against the page. */
                        background: st.ok ? "rgba(71,85,105,.14)" : "rgba(127,29,29,.75)",
                        color: st.ok ? "var(--text-secondary)" : "#fee2e2",
                      }}
                      title={fmtTime(st.at)}
                    >
                      {st.path}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/*
        Last child of the panel, so the overlay is not nested inside anything
        that could become a containing block for `position: fixed`. Rendered
        unconditionally and gated internally, so opening and closing does not
        mount and unmount the focus and scroll-lock effects.
      */}
      <EventDetailDrawer
        event={openEvent}
        events={view?.recent ?? []}
        onClose={() => setOpenEvent(null)}
      />
    </div>
  );
}



