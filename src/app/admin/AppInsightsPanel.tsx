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
import type { FailureGroup, InsightsSummary, Journey, PathStat } from "@/lib/app-insights";

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
  const [tab, setTab] = useState<"paths" | "failures" | "journeys">("paths");
  const [openFailure, setOpenFailure] = useState<string | null>(null);

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



