"use client";

/**
 * Latency Panel — command round-trip performance analysis.
 *
 * Two distinct measurements are tracked and presented separately because
 * operators frequently confuse them:
 *
 * 1. Control-plane RTT (HTTP probe)
 *    Measured by useControlPlaneProbe: the time for a GET /devices request to
 *    complete. This tells you network quality to the control plane server.
 *    It is NOT the command latency — it is the baseline overhead.
 *
 * 2. End-to-end command confirmation latency (issue → device confirms)
 *    Measured by useLatencySamples: from the moment the browser fires a POST
 *    /command to the moment the device echoes its new state back (via WS push
 *    or confirmation poll). This includes: HTTP to server, MQTT pub, ESP32
 *    firmware execution, MQTT echo, WS push to browser. It is the real
 *    round-trip that determines perceived responsiveness.
 *
 * Both are real measurements. If no commands have been issued this session,
 * the chart is not shown — fabricating samples is never acceptable.
 */

import { useState, useMemo, useCallback } from "react";
import { RefreshCw, Trash2, Wifi, Zap, BarChart2, Info } from "lucide-react";
import {
  useLatencySamples, useLatencyStats, clearLatencySamples, summarizeLatency,
  type LatencySample,
} from "@/lib/smarthome-realtime";
import { useControlPlaneProbe } from "../_data/hooks";
import {
  Button, Kpi, KpiGrid, SectionTitle, Surface, EmptyState, Callout,
  Badge, formatNumber, formatDuration,
} from "../_kit/primitives";
import {
  Histogram, LineChart, BarChart, Legend, CHART_COLORS, type Series,
} from "../_kit/charts";

function pct(n: number, total: number): string {
  if (total === 0) return "—";
  return `${((n / total) * 100).toFixed(1)}%`;
}

export function LatencyPanel() {
  const samples = useLatencySamples();
  const stats = useLatencyStats();
  const { samples: probeSamples, stats: probeStats, probe, busy: probeBusy } = useControlPlaneProbe(30_000, 60);

  const [showAllSamples, setShowAllSamples] = useState(false);

  const rttSamples = useMemo(
    () => samples.map((s) => s.rttMs).filter((v): v is number => v != null),
    [samples]
  );

  const apiSamples = useMemo(
    () => samples.map((s) => s.apiMs).filter((v): v is number => v != null),
    [samples]
  );

  // RTT over time — one point per sample (ms since epoch, rttMs value)
  const rttSeries = useMemo((): Series[] => {
    const pts = samples
      .filter((s) => s.rttMs != null)
      .map((s) => ({ t: s.sentAt, v: s.rttMs! }));
    if (!pts.length) return [];
    return [{ name: "End-to-end RTT", color: CHART_COLORS[0], points: pts }];
  }, [samples]);

  const apiSeries = useMemo((): Series[] => {
    const pts = samples
      .filter((s) => s.apiMs != null)
      .map((s) => ({ t: s.sentAt, v: s.apiMs! }));
    if (!pts.length) return [];
    return [{ name: "API ack time", color: CHART_COLORS[1], points: pts }];
  }, [samples]);

  // Control-plane probe series
  const probeSeries = useMemo((): Series[] => {
    const pts = probeSamples
      .filter((s) => s.ok && s.ms != null)
      .map((s) => ({ t: s.at, v: s.ms! }));
    if (!pts.length) return [];
    return [{ name: "Control-plane HTTP RTT", color: CHART_COLORS[2], points: pts }];
  }, [probeSamples]);

  // Per-device breakdown
  const perDevice = useMemo(() => {
    const map = new Map<string, { deviceId: string; label: string; rtts: number[]; total: number; confirmed: number }>();
    for (const s of samples) {
      const existing = map.get(s.deviceId) ?? {
        deviceId: s.deviceId,
        label: s.deviceId.slice(0, 12),
        rtts: [],
        total: 0,
        confirmed: 0,
      };
      existing.total++;
      if (s.outcome === "confirmed") existing.confirmed++;
      if (s.rttMs != null) existing.rtts.push(s.rttMs);
      map.set(s.deviceId, existing);
    }
    return Array.from(map.values())
      .map((d) => {
        const sorted = [...d.rtts].sort((a, b) => a - b);
        const p50 = sorted.length
          ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.5))]
          : 0;
        return { ...d, p50 };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [samples]);

  // Per-device-type breakdown
  const perType = useMemo(() => {
    const map = new Map<string, { type: string; rtts: number[]; total: number; confirmed: number }>();
    for (const s of samples) {
      const existing = map.get(s.deviceType) ?? {
        type: s.deviceType || "(unknown)",
        rtts: [],
        total: 0,
        confirmed: 0,
      };
      existing.total++;
      if (s.outcome === "confirmed") existing.confirmed++;
      if (s.rttMs != null) existing.rtts.push(s.rttMs);
      map.set(s.deviceType, existing);
    }
    return Array.from(map.values())
      .map((t) => {
        const sorted = [...t.rtts].sort((a, b) => a - b);
        const p50 = sorted.length
          ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.5))]
          : 0;
        return { ...t, p50 };
      })
      .sort((a, b) => b.total - a.total);
  }, [samples]);

  // Per-command-field breakdown — what commands are sent most and how fast
  const perField = useMemo(() => {
    const map = new Map<string, { field: string; rtts: number[]; count: number }>();
    for (const s of samples) {
      for (const f of s.fields) {
        const existing = map.get(f) ?? { field: f, rtts: [], count: 0 };
        existing.count++;
        if (s.rttMs != null) existing.rtts.push(s.rttMs);
        map.set(f, existing);
      }
    }
    return Array.from(map.values())
      .map((f) => {
        const sorted = [...f.rtts].sort((a, b) => a - b);
        const p50 = sorted.length
          ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.5))]
          : 0;
        return { ...f, p50 };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [samples]);

  const recentSamples = useMemo(
    () => (showAllSamples ? samples : samples.slice(-20)).slice().reverse(),
    [samples, showAllSamples]
  );

  const hasCommands = samples.length > 0;

  return (
    <div className="space-y-6">
      {/* Explanation callout — crucial for operator understanding */}
      <Callout tone="info" title="What is being measured">
        <p>
          <b>End-to-end command latency</b> (the primary metric): time from when the browser fires a
          device command (POST /command) to when the device echoes its new state back — via MQTT pub,
          ESP32 firmware, MQTT echo, and WebSocket push. This is what determines perceived responsiveness.
        </p>
        <p className="mt-1.5">
          <b>Control-plane HTTP RTT</b> (the baseline): pure network latency to the control plane server,
          measured by probing GET /devices every 30 s. This is <em>not</em> command latency — it is the
          network floor. If this is high, every command will be slow too.
        </p>
        {!hasCommands && (
          <p className="mt-1.5 font-semibold" style={{ color: "var(--cv-accent-hi)" }}>
            No command samples yet. Issue a device command (toggle a switch, adjust a thermostat) to start
            collecting measurements. Samples persist across page reloads.
          </p>
        )}
      </Callout>

      {/* ---- Control-plane probe ---- */}
      <div>
        <SectionTitle
          right={
            <Button icon={RefreshCw} onClick={() => void probe()} busy={probeBusy} variant="secondary">
              Probe now
            </Button>
          }
        >
          Control-plane HTTP RTT (live probe)
        </SectionTitle>

        <KpiGrid cols={4}>
          <Kpi
            label="Last RTT"
            value={probeStats.last?.ms != null ? probeStats.last.ms : "—"}
            unit="ms"
            icon={Wifi}
            tone={
              probeStats.last?.ms == null
                ? undefined
                : probeStats.last.ms < 150
                  ? "ok"
                  : probeStats.last.ms < 400
                    ? "warning"
                    : "critical"
            }
            hint={probeStats.last?.ok === false ? "request failed" : undefined}
          />
          <Kpi
            label="p50"
            value={probeStats.p50 != null ? probeStats.p50 : "—"}
            unit="ms"
            icon={BarChart2}
          />
          <Kpi
            label="p95"
            value={probeStats.p95 != null ? probeStats.p95 : "—"}
            unit="ms"
            icon={BarChart2}
          />
          <Kpi
            label="Failures"
            value={probeStats.failures}
            unit={`/ ${probeStats.count}`}
            tone={probeStats.failures > 0 ? "critical" : "ok"}
          />
        </KpiGrid>

        {probeSeries.length > 0 && (
          <div className="mt-4">
            <LineChart
              series={probeSeries}
              unit="ms"
              title="HTTP RTT over time"
              yMin={0}
              area={false}
              footer={
                <Legend items={probeSeries.map((s) => ({ name: s.name, color: s.color }))} />
              }
            />
          </div>
        )}
      </div>

      {/* ---- Command latency ---- */}
      <div>
        <SectionTitle
          right={
            hasCommands ? (
              <Button icon={Trash2} onClick={clearLatencySamples} variant="danger">
                Clear samples
              </Button>
            ) : undefined
          }
        >
          End-to-end command confirmation latency
        </SectionTitle>

        {!hasCommands ? (
          <EmptyState
            icon={Zap}
            title="No command samples yet"
            body="Issue a device command — toggle a relay, adjust brightness, change a thermostat — to start collecting round-trip measurements. Samples persist in localStorage across reloads."
          />
        ) : (
          <>
            {/* KPIs */}
            <KpiGrid cols={4}>
              <Kpi label="Samples" value={stats.count} icon={BarChart2} />
              <Kpi
                label="p50 RTT"
                value={formatNumber(stats.p50, 0)}
                unit="ms"
                icon={Zap}
                tone={stats.p50 < 500 ? "ok" : stats.p50 < 1500 ? "warning" : "critical"}
              />
              <Kpi
                label="p95 RTT"
                value={formatNumber(stats.p90, 0)}
                unit="ms"
                tone={stats.p90 < 1000 ? "ok" : stats.p90 < 3000 ? "warning" : "critical"}
              />
              <Kpi
                label="p99 RTT"
                value={formatNumber(stats.p99, 0)}
                unit="ms"
                tone={stats.p99 < 2000 ? "ok" : stats.p99 < 5000 ? "warning" : "critical"}
              />
              <Kpi
                label="Success rate"
                value={`${stats.successRate.toFixed(1)}%`}
                icon={Wifi}
                tone={stats.successRate >= 99 ? "ok" : stats.successRate >= 95 ? "warning" : "critical"}
                hint={`${stats.confirmed} confirmed, ${stats.failed} timeout/error`}
              />
              <Kpi label="Min RTT" value={formatNumber(stats.min, 0)} unit="ms" />
              <Kpi label="Avg RTT" value={formatNumber(stats.avg, 0)} unit="ms" />
              <Kpi label="Max RTT" value={formatNumber(stats.max, 0)} unit="ms" />
            </KpiGrid>

            {/* RTT histogram */}
            <div className="mt-4">
              <Histogram
                samples={rttSamples}
                title="RTT distribution (ms, end-to-end)"
                buckets={20}
                unit="ms"
                color="var(--cv-accent)"
              />
            </div>

            {/* RTT and API ack over time */}
            {rttSeries.length > 0 && (
              <div className="mt-4">
                <LineChart
                  series={[...rttSeries, ...apiSeries]}
                  unit="ms"
                  title="Latency over time"
                  yMin={0}
                  area={false}
                  footer={
                    <div className="space-y-1">
                      <Legend
                        items={[
                          { name: "End-to-end RTT", color: CHART_COLORS[0], value: `p50: ${Math.round(stats.p50)}ms` },
                          { name: "API ack time", color: CHART_COLORS[1], value: `p50: ${Math.round(stats.apiP50)}ms` },
                        ]}
                      />
                      <p className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
                        API ack = time until the control plane accepted the command (HTTP).
                        End-to-end RTT = time until the device echoed its new state back.
                        The gap between them is the device + MQTT path.
                      </p>
                    </div>
                  }
                />
              </div>
            )}

            {/* API ack histogram */}
            {apiSamples.length > 0 && (
              <div className="mt-4">
                <Histogram
                  samples={apiSamples}
                  title="API ack time distribution (ms, HTTP only)"
                  buckets={16}
                  unit="ms"
                  color={CHART_COLORS[1]}
                />
              </div>
            )}

            {/* Per-device breakdown */}
            {perDevice.length > 0 && (
              <div className="mt-4">
                <SectionTitle>Per-device breakdown</SectionTitle>
                <BarChart
                  title="Median RTT by device (ms)"
                  data={perDevice.map((d, i) => ({
                    label: d.label,
                    value: d.p50,
                    color: CHART_COLORS[i % CHART_COLORS.length],
                  }))}
                  unit="ms"
                  horizontal
                />
                <div className="mt-3 space-y-1.5">
                  {perDevice.map((d) => {
                    const s = summarizeLatency(samples.filter((x) => x.deviceId === d.deviceId));
                    return (
                      <div
                        key={d.deviceId}
                        className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 text-xs"
                        style={{ background: "var(--cv-card)", border: "1px solid var(--cv-border)" }}
                      >
                        <span className="font-mono font-semibold min-w-0 truncate" style={{ color: "var(--cv-text)" }}>
                          {d.deviceId}
                        </span>
                        <span style={{ color: "var(--cv-muted)" }}>
                          {d.total} cmd · {pct(d.confirmed, d.total)} ok
                        </span>
                        <div className="ml-auto flex gap-3 tabular-nums" style={{ color: "var(--cv-muted)" }}>
                          <span>p50 <b style={{ color: "var(--cv-text)" }}>{Math.round(s.p50)}ms</b></span>
                          <span>p95 <b style={{ color: "var(--cv-text)" }}>{Math.round(s.p90)}ms</b></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Per-device-type breakdown */}
            {perType.length > 0 && (
              <div className="mt-4">
                <SectionTitle>Per-device type breakdown</SectionTitle>
                <BarChart
                  title="Median RTT by device type (ms)"
                  data={perType.map((t, i) => ({
                    label: t.type,
                    value: t.p50,
                    color: CHART_COLORS[i % CHART_COLORS.length],
                  }))}
                  unit="ms"
                  horizontal
                />
              </div>
            )}

            {/* Per-command field */}
            {perField.length > 0 && (
              <div className="mt-4">
                <SectionTitle>Per-command type breakdown</SectionTitle>
                <BarChart
                  title="Commands issued by field"
                  data={perField.map((f, i) => ({
                    label: f.field,
                    value: f.count,
                    color: CHART_COLORS[i % CHART_COLORS.length],
                  }))}
                  horizontal
                />
              </div>
            )}

            {/* Recent samples */}
            <div className="mt-4">
              <SectionTitle
                right={
                  <button
                    className="text-xs font-semibold"
                    style={{ color: "var(--cv-accent-hi)" }}
                    onClick={() => setShowAllSamples((v) => !v)}
                  >
                    {showAllSamples ? "Show fewer" : `Show all ${samples.length}`}
                  </button>
                }
              >
                Recent samples
              </SectionTitle>

              <div
                className="overflow-x-auto rounded-2xl"
                style={{ border: "1px solid var(--cv-border)" }}
                role="table"
                aria-label="Recent latency samples"
              >
                <table className="w-full min-w-[540px] text-[12px]">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--cv-border)", background: "var(--cv-card-hi)" }}>
                      {["Device", "Type", "Fields", "API ack", "End-to-end RTT", "Outcome"].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2.5 text-left font-bold"
                          style={{ color: "var(--cv-muted)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentSamples.map((s) => (
                      <tr
                        key={s.id}
                        style={{ borderBottom: "1px solid var(--cv-border)", background: "var(--cv-card)" }}
                      >
                        <td className="px-3 py-2 font-mono" style={{ color: "var(--cv-text)" }}>
                          {s.deviceId.slice(0, 14)}
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--cv-muted)" }}>
                          {s.deviceType || "—"}
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--cv-muted)" }}>
                          {s.fields.join(", ") || "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums" style={{ color: "var(--cv-text)" }}>
                          {s.apiMs != null ? `${s.apiMs}ms` : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums" style={{ color: "var(--cv-text)" }}>
                          {s.rttMs != null ? `${s.rttMs}ms` : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            tone={
                              s.outcome === "confirmed"
                                ? "ok"
                                : s.outcome === "timeout"
                                  ? "warning"
                                  : "critical"
                            }
                          >
                            {s.outcome}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
