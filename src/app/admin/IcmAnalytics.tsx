"use client";

/**
 * Incident analytics.
 *
 * The panel had a row of stat cards and a queue. Both answer "how are we right
 * now", and neither answers the question an incident review actually asks:
 * **is any of this getting better?**
 *
 * A median time-to-acknowledge of nine minutes means nothing by itself. Nine
 * minutes when it was four last month is the finding, and there was nowhere in
 * the tool that could show that.
 *
 * Everything here is computed from the incidents the panel already has in
 * state, so it costs no extra request.
 */

import { useMemo, useState } from "react";
import { BarChart, DonutChart, HBar, LineChart } from "./charts";
import {
  byService,
  bySource,
  byTeam,
  formatMinutes,
  icmTrend,
  timeToResolve,
  type Grain,
} from "@/lib/icm-metrics";
import type { Incident, Severity } from "@/lib/icm";

const SEV_COLOUR: Record<Severity, string> = {
  0: "#dc2626",
  1: "#f97316",
  2: "#f59e0b",
  3: "#38bdf8",
  4: "#94a3b8",
};

const RANGES = [
  { days: 7, label: "7d", grain: "day" as Grain },
  { days: 30, label: "30d", grain: "day" as Grain },
  { days: 90, label: "90d", grain: "week" as Grain },
];

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border cv-border cv-surface p-3">
      <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}
      </h4>
      {hint && (
        <p className="mb-2 mt-0.5 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
      <div className={hint ? "" : "mt-2"}>{children}</div>
    </section>
  );
}

function Empty({ what }: { what: string }) {
  return (
    <div
      className="flex h-[120px] items-center justify-center rounded-lg text-xs"
      style={{ background: "var(--bg-glass)", color: "var(--text-muted)" }}
    >
      {what}
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border cv-border p-2.5">
      <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
      {hint && (
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function dayLabel(iso: string, grain: Grain): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return grain === "hour"
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
    : d.toLocaleDateString([], { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Thin labels so a 90-day axis does not become a grey smear. */
function sparse(labels: string[], keep = 8): string[] {
  if (labels.length <= keep) return labels;
  const step = Math.ceil(labels.length / keep);
  return labels.map((l, i) => (i % step === 0 ? l : ""));
}

export function IcmAnalytics({ incidents }: { incidents: Incident[] }) {
  const [rangeIdx, setRangeIdx] = useState(1);
  const range = RANGES[rangeIdx];

  const trend = useMemo(() => {
    const to = Date.now();
    const from = to - range.days * 86_400_000;
    return icmTrend(incidents, { from, to, grain: range.grain });
  }, [incidents, range]);

  const inRange = useMemo(() => {
    const from = Date.now() - range.days * 86_400_000;
    return incidents.filter((i) => {
      const t = new Date(i.createdAt).getTime();
      return Number.isFinite(t) && t >= from;
    });
  }, [incidents, range]);

  const labels = sparse(trend.buckets.map((b) => dayLabel(b.at, range.grain)));
  const hasAny = trend.totals.opened > 0;

  /*
   * Severities are stacked as separate lines rather than one total.
   *
   * A rising total is ambiguous — twenty more sev-4s is noise, one more sev-0
   * is a very bad month. Splitting them means the line that matters is legible
   * on its own, and severities nobody had are left out entirely so the legend
   * stays about what happened.
   */
  const sevSeries = ([0, 1, 2, 3, 4] as Severity[])
    .map((s) => ({
      name: `Sev ${s}`,
      data: trend.buckets.map((b) => b.bySeverity[s] ?? 0),
      color: SEV_COLOUR[s],
    }))
    .filter((s) => s.data.some((v) => v > 0));

  const teams = byTeam(inRange).slice(0, 8);
  const services = byService(inRange).slice(0, 8);
  const sources = bySource(inRange);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          Trends
        </h3>
        <div className="flex gap-1 rounded-lg border cv-border p-0.5">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              aria-pressed={i === rangeIdx}
              className="min-h-[32px] rounded-md px-2.5 text-xs font-semibold transition"
              style={{
                background: i === rangeIdx ? "var(--bg-glass-strong)" : "transparent",
                color: i === rangeIdx ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Opened" value={String(trend.totals.opened)} hint={`in the last ${range.label}`} />
        <Figure label="Resolved" value={String(trend.totals.resolved)} hint="closed in this window" />
        <Figure
          label="Median TTR"
          value={formatMinutes(trend.totals.medianTtr)}
          hint="opened to resolved"
        />
        {/* The worst case beside the median, because a median hides the
            outlier and the outlier is usually what a review is about. */}
        <Figure label="Longest" value={formatMinutes(trend.totals.worstTtr)} hint="single incident" />
      </div>

      <Card
        title="Incidents by severity"
        hint="Bucketed by when each incident started, not when it closed — a week-long incident belongs to the week something went wrong."
      >
        {hasAny && sevSeries.length ? (
          // Legend forced on: with a single severity the line's name is the
          // whole point, and a lone unlabelled line could be any of five.
          <LineChart labels={labels} series={sevSeries} height={200} legend />
        ) : (
          <Empty what={`No incidents in the last ${range.label}`} />
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card
          title="Opened against resolved"
          hint="Closing consistently below the opening line means the backlog is growing, whatever the queue count says today."
        >
          {hasAny ? (
            <LineChart
              labels={labels}
              height={190}
              series={[
                { name: "Opened", data: trend.buckets.map((b) => b.opened), color: "#f97316" },
                { name: "Resolved", data: trend.buckets.map((b) => b.resolved), color: "#22c55e" },
              ]}
            />
          ) : (
            <Empty what="Nothing to compare yet" />
          )}
        </Card>

        <Card
          title="Response time"
          hint="Medians per bucket, in minutes. Acknowledge is how fast somebody looked; resolve is how long it actually took."
        >
          {hasAny ? (
            <LineChart
              labels={labels}
              height={190}
              yFmt={(n) => `${Math.round(n)}m`}
              series={[
                {
                  name: "Acknowledge",
                  // Buckets with no measurement plot as zero rather than
                  // breaking the line; the figure cards carry the honest
                  // "no data" dash.
                  data: trend.buckets.map((b) => b.medianTta ?? 0),
                  color: "#38bdf8",
                },
                { name: "Mitigate", data: trend.buckets.map((b) => b.medianTtm ?? 0), color: "#a78bfa" },
                { name: "Resolve", data: trend.buckets.map((b) => b.medianTtr ?? 0), color: "#22c55e" },
              ]}
            />
          ) : (
            <Empty what="No response times recorded" />
          )}
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="By team" hint="Volume, with median time to resolve beside it.">
          {teams.length ? (
            <>
              <HBar items={teams.map((t) => ({ name: t.key, value: t.count }))} />
              <ul className="mt-2 space-y-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                {teams.slice(0, 4).map((t) => (
                  <li key={t.key} className="flex justify-between gap-2">
                    <span className="truncate">{t.key}</span>
                    <span>{formatMinutes(t.medianTtr)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty what="No incidents in this window" />
          )}
        </Card>

        <Card
          title="By service"
          hint="An incident can name several services, so these sum to more than the incident count."
        >
          {services.length ? (
            <HBar items={services.map((s) => ({ name: s.key, value: s.count }))} />
          ) : (
            <Empty what="No services recorded" />
          )}
        </Card>

        <Card
          title="How they were found"
          hint="Incidents a customer reported are the ones monitoring missed — that share is the detection gap."
        >
          {sources.length ? (
            <DonutChart
              size={140}
              data={sources.map((s) => ({ name: s.key, value: s.count }))}
              centerLabel={String(inRange.length)}
              centerSub="incidents"
            />
          ) : (
            <Empty what="No incidents in this window" />
          )}
        </Card>
      </div>

      <Card
        title="How long incidents stay open"
        hint="The distribution, not the average. A handful of very long incidents move a mean and tell you nothing about the typical one."
      >
        <ResolutionHistogram incidents={inRange} />
      </Card>
    </div>
  );
}

/** Buckets chosen to match how people talk about incidents, not round numbers. */
const TTR_BUCKETS: { label: string; upTo: number }[] = [
  { label: "<15m", upTo: 15 },
  { label: "<1h", upTo: 60 },
  { label: "<4h", upTo: 240 },
  { label: "<1d", upTo: 1440 },
  { label: "<3d", upTo: 4320 },
  { label: "3d+", upTo: Infinity },
];

function ResolutionHistogram({ incidents }: { incidents: Incident[] }) {
  const counts = useMemo(() => {
    const out = TTR_BUCKETS.map(() => 0);
    for (const i of incidents) {
      const ttr = timeToResolve(i);
      if (ttr === null) continue;
      const idx = TTR_BUCKETS.findIndex((b) => ttr < b.upTo);
      out[idx === -1 ? TTR_BUCKETS.length - 1 : idx] += 1;
    }
    return out;
  }, [incidents]);

  if (counts.every((c) => c === 0)) return <Empty what="Nothing resolved in this window" />;
  return <BarChart labels={TTR_BUCKETS.map((b) => b.label)} data={counts} height={180} color="#22c55e" />;
}
