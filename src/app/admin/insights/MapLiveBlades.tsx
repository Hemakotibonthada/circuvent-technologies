"use client";

/**
 * Application Map and Live Metrics Stream.
 *
 * The map's data has been computed and sent to the browser on every load of
 * this panel for as long as `insightsView` has existed — `map: MapNode[]` was
 * in the payload and in the `View` interface, and nothing ever rendered it.
 * The cost was already being paid; only the answer was missing.
 *
 * The topology is deliberately three tiers deep, because three is all the
 * instrumentation honestly supports: the browser, this app, and each service
 * it calls. The control plane's own database and the MQTT broker would have to
 * be drawn from instrumentation that does not exist, and a map with invented
 * edges is worse than a small true one — it is the diagram somebody trusts
 * while looking for a fault that is not on it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Globe, Radio, Server, Share2, Zap } from "lucide-react";
import { Bar, Card, Caveat, Empty, ErrorNote, StatTile, healthColour, ms, num, pct, shortTime, tok, useAdminData } from "./kit";
import type { MapNode, TelemetryEvent } from "@/lib/app-insights";

/* ------------------------------------------------------------------ *
 * Application Map                                                     *
 * ------------------------------------------------------------------ */

const KIND_ICON = { browser: Globe, app: Server, dependency: Share2 } as const;
const KIND_LABEL = {
  browser: "Client",
  app: "This application",
  dependency: "Outbound dependency",
} as const;

export function MapBlade({ nodes }: { nodes: MapNode[] }) {
  if (!nodes.length) {
    return (
      <Card title="Application map">
        <Empty>Nothing has been observed in this window, so there is no topology to draw.</Empty>
      </Card>
    );
  }

  const tiers: MapNode["kind"][] = ["browser", "app", "dependency"];
  const maxCalls = Math.max(1, ...nodes.map((n) => n.calls));

  return (
    <div className="space-y-4">
      <Card
        title="Application map"
        subtitle="Every observed tier, with the health of the traffic between them."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {tiers.map((tier) => {
            const inTier = nodes.filter((n) => n.kind === tier);
            if (!inTier.length) return <div key={tier} />;
            const Icon = KIND_ICON[tier];
            return (
              <div key={tier}>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide cv-text-muted">
                  <Icon className="h-3.5 w-3.5" /> {KIND_LABEL[tier]}
                </div>
                <div className="space-y-2">
                  {inTier.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-xl border p-3"
                      style={{
                        borderColor: n.failureRate > 0 ? healthColour(n.failureRate) : "var(--border-primary)",
                        background: "var(--bg-surface)",
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px] font-bold cv-text-primary">{n.id}</span>
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold"
                          style={{
                            color: healthColour(n.failureRate),
                            background: `${healthColour(n.failureRate)}1a`,
                          }}
                        >
                          {pct(n.failureRate, 1)}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between text-[11.5px] cv-text-muted">
                        <span className="tabular-nums">{num(n.calls)} calls</span>
                        <span className="tabular-nums">p95 {ms(n.p95Ms)}</span>
                      </div>
                      <div className="mt-2">
                        <Bar value={n.calls} max={maxCalls} colour={healthColour(n.failureRate)} />
                      </div>
                      {n.failed > 0 && (
                        <div className="mt-1.5 text-[11.5px]" style={{ color: healthColour(n.failureRate) }}>
                          {num(n.failed)} failed
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4">
          <Caveat>
            Three tiers, because three are all that are observable from here. The control plane&rsquo;s
            own database and the MQTT broker are not drawn: nothing reports them, and a map with
            invented edges is worse than a small true one.
          </Caveat>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Live Metrics Stream                                                 *
 * ------------------------------------------------------------------ */

interface LiveView {
  now: string;
  windowSeconds: number;
  points: { at: string; events: number; failures: number; sessions: number; p95: number }[];
  perSecond: number;
  failuresPerSecond: number;
  failureRate: number;
  sessions: number;
  p95: number;
  samples: TelemetryEvent[];
}

/**
 * Live Metrics.
 *
 * Polls a deliberately tiny endpoint once a second while the blade is open,
 * and stops the moment it is not. The existing "Live" toggle refetched the
 * whole insights view every fifteen seconds — a full pass over 20,000 events —
 * which is a heavier client than anything it was watching.
 *
 * It also pauses when the tab is hidden. A background tab polling every second
 * for an afternoon is load nobody asked for and nobody is looking at.
 */
export function LiveBlade() {
  const [data, setData] = useState<LiveView | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const r = await fetch("/api/admin/insights-usage?view=live", {
        headers: { "x-admin-token": tok() },
      });
      const b = await r.json();
      if (r.ok && b.success) {
        setData(b as LiveView);
        setConnected(true);
        setError("");
      } else {
        setConnected(false);
        setError(b.message || "The live feed refused the request.");
      }
    } catch {
      setConnected(false);
      setError("Could not reach the telemetry service.");
    }
  }, []);

  useEffect(() => {
    /*
     * The first sample is scheduled rather than called: state set from a timer
     * callback is React synchronising with an external system, which is what
     * effects are for, while calling it straight from the effect body sets
     * state synchronously during render and cascades. A zero-delay timeout is
     * still the first paint as far as anybody watching is concerned.
     */
    const first = setTimeout(() => void poll(), 0);
    timer.current = setInterval(() => void poll(), 1000);
    return () => {
      clearTimeout(first);
      if (timer.current) clearInterval(timer.current);
    };
  }, [poll]);

  const max = Math.max(1, ...(data?.points ?? []).map((p) => p.events));

  return (
    <div className="space-y-4">
      <Card
        title={
          <span className="inline-flex items-center gap-1.5">
            <Radio className="h-4 w-4" /> Live metrics
          </span>
        }
        subtitle={
          data ? `The last ${data.windowSeconds} seconds, one bar per second.` : "Connecting…"
        }
        right={
          <span
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold"
            style={{
              color: connected ? "#059669" : "#dc2626",
              background: connected ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
            }}
          >
            <span
              className={`h-2 w-2 rounded-full ${connected ? "animate-pulse" : ""}`}
              style={{ background: connected ? "#059669" : "#dc2626" }}
            />
            {connected ? "Streaming" : "Offline"}
          </span>
        }
      >
        {error && !data ? (
          <ErrorNote>{error}</ErrorNote>
        ) : !data ? (
          <Empty>Waiting for the first sample…</Empty>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Events / sec" value={data.perSecond.toFixed(2)} />
              <StatTile
                label="Failures / sec"
                value={data.failuresPerSecond.toFixed(2)}
                tone={healthColour(data.failureRate)}
                hint={pct(data.failureRate, 1) + " of events"}
              />
              <StatTile label="Sessions" value={num(data.sessions)} hint="in the live window" />
              <StatTile label="p95" value={ms(data.p95)} />
            </div>

            <div className="mt-4 flex h-28 items-end gap-[1px]">
              {data.points.map((p) => (
                <div
                  key={p.at}
                  className="flex-1"
                  title={`${shortTime(p.at)} — ${p.events} events, ${p.failures} failed`}
                >
                  <div
                    className="w-full rounded-t transition-[height] duration-300"
                    style={{
                      height: `${Math.max(1, (p.events / max) * 100)}px`,
                      background: p.failures > 0 ? "#dc2626" : "linear-gradient(180deg,#22d3ee,#6366f1)",
                    }}
                  />
                </div>
              ))}
            </div>
            {data.points.every((p) => p.events === 0) && (
              <p className="mt-2 text-center text-[12px] cv-text-muted">
                Nothing in the last {data.windowSeconds} seconds. The stream is connected; the site
                is simply quiet.
              </p>
            )}
          </>
        )}
      </Card>

      <Card
        title={
          <span className="inline-flex items-center gap-1.5">
            <Zap className="h-4 w-4" /> Live feed
          </span>
        }
        subtitle="The most recent samples, newest first."
      >
        {!data || data.samples.length === 0 ? (
          <Empty>No samples in the live window.</Empty>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left text-[12.5px]">
              <tbody>
                {data.samples.map((e) => (
                  <tr key={e.id} className="border-b cv-border last:border-0">
                    <td className="px-2 py-1.5 tabular-nums cv-text-muted">{shortTime(e.at)}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                        style={{
                          background: e.ok ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                          color: e.ok ? "#047857" : "#b91c1c",
                        }}
                      >
                        {e.kind}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-mono cv-text-primary">{e.path}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums cv-text-secondary">
                      {e.durationMs > 0 ? ms(e.durationMs) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Usage, cost and sampling                                            *
 * ------------------------------------------------------------------ */

interface CostView {
  usage: {
    retained: number;
    received: number;
    dropped: number;
    capacity: number;
    utilisation: number;
    averageBytes: number;
    retainedBytes: number;
    eventsPerHour: number;
    windowHours: number;
    projectedWindowHours: number;
    projectedGbPerMonth: number;
    estimatedMonthlyUsd: number;
    byKind: { kind: string; events: number; bytes: number; share: number }[];
    oldestAt: string | null;
    newestAt: string | null;
  };
  advice: {
    recommendedRate: number;
    resultingWindowHours: number;
    reason: string;
    severity: "ok" | "warn" | "critical";
    dominantKind: string | null;
  };
}

const SEVERITY_TONE = { ok: "#059669", warn: "#b45309", critical: "#b91c1c" } as const;

function bytes(n: number): string {
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function ConfigureBlade() {
  const { data, error, loading } = useAdminData<CostView>("/api/admin/insights-usage?view=cost");

  if (loading && !data) return <Card title="Usage and estimated costs"><Empty>Measuring…</Empty></Card>;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return null;

  const { usage, advice } = data;
  const full = usage.utilisation >= 0.99;

  return (
    <div className="space-y-4">
      <Card
        title={
          <span className="inline-flex items-center gap-1.5">
            <Activity className="h-4 w-4" /> Usage and retention
          </span>
        }
        subtitle="What the buffer holds, and how far back an investigation can still see."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Buffer used"
            value={pct(usage.utilisation, 0)}
            tone={full ? "#b45309" : undefined}
            hint={`${num(usage.retained)} of ${num(usage.capacity)}`}
          />
          <StatTile label="History held" value={`${usage.windowHours}h`} hint="oldest event to now" />
          <StatTile
            label="Projected window"
            value={`${usage.projectedWindowHours}h`}
            tone={usage.projectedWindowHours < 24 ? "#b45309" : "#059669"}
            hint="once the buffer is full"
          />
          <StatTile label="Rate" value={`${num(usage.eventsPerHour)}/h`} hint={`${bytes(usage.averageBytes)} each`} />
        </div>

        {full && (
          <div className="mt-3">
            <Caveat>
              <strong>The buffer is full.</strong> That is not the healthy state it looks like: every
              new event now discards the oldest one, so the window keeps shrinking towards the
              current rate. {num(usage.dropped)} event{usage.dropped === 1 ? " has" : "s have"} already
              been dropped.
            </Caveat>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Where the volume comes from">
          {usage.byKind.length === 0 ? (
            <Empty>Nothing buffered.</Empty>
          ) : (
            <div className="space-y-2">
              {usage.byKind.map((k) => (
                <div key={k.kind}>
                  <div className="flex justify-between text-[12.5px]">
                    <span className="font-medium cv-text-primary">{k.kind}</span>
                    <span className="tabular-nums cv-text-muted">
                      {num(k.events)} · {bytes(k.bytes)} · {pct(k.share, 0)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <Bar value={k.events} max={Math.max(1, ...usage.byKind.map((x) => x.events))} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Sampling">
          <div
            className="rounded-lg border px-3 py-2 text-[13px] leading-relaxed"
            style={{
              borderColor: `${SEVERITY_TONE[advice.severity]}55`,
              background: `${SEVERITY_TONE[advice.severity]}12`,
              color: "var(--text-secondary)",
            }}
          >
            <div className="mb-1 font-bold" style={{ color: SEVERITY_TONE[advice.severity] }}>
              {advice.recommendedRate >= 1
                ? "Keep every event"
                : `Recommended: keep ${Math.round(advice.recommendedRate * 100)}%`}
            </div>
            {advice.reason}
          </div>
          <div className="mt-3">
            <Caveat>
              Recommended, not applied. Sampling costs exact counts — &ldquo;how many times did this
              fail&rdquo; stops being answerable — so it is a decision for a person, and this
              blade&rsquo;s job is to make the trade visible rather than to quietly make it. When it
              is applied it will sample <strong>whole sessions</strong>: half a journey is not a
              shorter journey, it is a wrong one, and a funnel over per-event samples reports
              drop-off that never happened.
            </Caveat>
          </div>
        </Card>
      </div>

      <Card title="Estimated cost on Azure Monitor" subtitle="If this buffer were shipped to a hosted collector instead.">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Ingest" value={`${usage.projectedGbPerMonth} GB`} hint="per 30 days at the current rate" />
          <StatTile
            label="Estimated"
            value={usage.estimatedMonthlyUsd === 0 ? "Free tier" : `$${usage.estimatedMonthlyUsd}`}
            hint="per month, after the 5 GB grant"
          />
          <StatTile label="Retained now" value={bytes(usage.retainedBytes)} />
        </div>
        <div className="mt-3">
          <Caveat>
            An estimate at Azure&rsquo;s public per-GB rate, for deciding whether moving this to a
            hosted collector is worth it. Nothing is billed today and nothing depends on this number.
          </Caveat>
        </div>
      </Card>
    </div>
  );
}
