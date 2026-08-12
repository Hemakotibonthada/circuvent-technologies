"use client";

import { useCallback, useEffect, useState } from "react";
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
function Series({ series }: { series: InsightsSummary["series"] }) {
  const max = Math.max(1, ...series.map((b) => b.count));
  return (
    <div className="flex h-24 items-end gap-[2px] rounded-xl border cv-border cv-surface p-3">
      {series.map((b, i) => {
        const h = (b.count / max) * 100;
        const fh = b.count ? (b.failures / b.count) * h : 0;
        return (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{ height: `${Math.max(2, h)}%`, position: "relative", background: "var(--accent-cyan-muted)" }}
            title={`${fmtTime(b.at)} · ${b.count} events, ${b.failures} failed`}
          >
            {b.failures > 0 && (
              <div
                className="absolute bottom-0 left-0 right-0 rounded-sm bg-red-500"
                style={{ height: `${(fh / Math.max(h, 0.001)) * 100}%` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AppInsightsPanel() {
  const [view, setView] = useState<View | null>(null);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"requests" | "dependencies" | "performance" | "logs" | "paths" | "failures" | "journeys">("requests");
  const [openFailure, setOpenFailure] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState("");
  const [logOutcome, setLogOutcome] = useState<"all" | "failed" | "ok">("all");

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

  useEffect(() => {
    void load();
  }, [load]);

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
            onClick={() => void load()}
            className="inline-flex h-[44px] items-center gap-2 rounded-lg border cv-border px-3 text-sm cv-text-secondary hover:cv-surface-alt"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            Refresh
          </button>
          <button
            onClick={() => void clear()}
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

          <Series series={s.series} />

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

      <div className="flex gap-1 border-b cv-border">
        {([
          ["requests", "Requests", view?.requests.length],
          ["dependencies", "Dependencies", view?.dependencies.length],
          ["performance", "Performance", view?.performance.length],
          ["logs", "Logs", view?.recent.length],
          ["paths", "Accessed paths", view?.paths.length],
          ["failures", "Failures", view?.failures.length],
          ["journeys", "User journeys", view?.journeys.length],
        ] as const).map(([k, label, n]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`h-[44px] border-b-2 px-4 text-sm font-semibold ${
              tab === k ? "border-cyan-500 text-cyan-300" : "border-transparent cv-text-muted hover:cv-text-primary"
            }`}
          >
            {label}
            {typeof n === "number" && <span className="ml-1.5 text-[11px] cv-text-muted">{n}</span>}
          </button>
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

      {view && tab === "requests" && (
        <div className="space-y-3">
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

      {view && tab === "logs" && (
        <div className="space-y-2">
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
                  <tr key={e.id} className="border-t cv-border">
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
                    <td className="max-w-[280px] truncate px-3 py-2 text-[12px] cv-text-muted">
                      {e.errorType ? `${e.errorType}: ${e.errorMessage ?? ""}` : ""}
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
      )}

      {view && tab === "failures" && (
        <div className="space-y-2">
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
              {openFailure === f.key && f.stack && (
                <pre className="mt-3 overflow-x-auto rounded-lg border cv-border cv-surface-alt p-3 text-[11px] leading-relaxed cv-text-muted">
                  {f.stack}
                </pre>
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
    </div>
  );
}



