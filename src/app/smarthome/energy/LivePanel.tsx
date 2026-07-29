"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Zap } from "lucide-react";
import {
  Callout,
  EmptyState,
  ErrorState,
  formatEnergy,
  formatWatts,
  KpiGrid,
  Kpi,
  LoadingState,
  Meter,
  SectionTitle,
  Surface,
} from "../_kit/primitives";
import {
  CHART_COLORS,
  Donut,
  Gauge,
  Legend,
  LineChart,
  type Series,
} from "../_kit/charts";
import { deviceWatts } from "../_kit/device";
import { useEnergy, useFleet } from "../_data/hooks";
import { masterPower } from "@/lib/smarthome-command-map";
import type { EnergySummary } from "@/lib/control-plane";

/** Watts threshold below which a "powered-off" device's draw is treated as noise. */
const STANDBY_THRESHOLD_W = 2;

/** Rolling buffer depth — each slot is one API poll (~20 s). */
const ROLLING_MAX = 90;

export default function LivePanel() {
  const { summary, byDevice, liveWatts, todayKwh, loading, error, refresh } =
    useEnergy();
  const { devices, byId } = useFleet();

  // Accumulate a real time-series from successive polls. Each point comes from
  // an actual controlPlane.energySummary() response. The buffer resets when
  // the tab is closed/reloaded, which is acknowledged in the footer copy.
  const [rollingBuffer, setRollingBuffer] = useState<{ t: number; v: number }[]>(
    []
  );
  const prevSummaryRef = useRef<EnergySummary | null>(null);
  useEffect(() => {
    if (!summary || summary === prevSummaryRef.current) return;
    prevSummaryRef.current = summary;
    setRollingBuffer((buf) =>
      [...buf, { t: Date.now(), v: summary.liveWatts }].slice(-ROLLING_MAX)
    );
  }, [summary]);

  // Session peak — highest live reading seen since this tab loaded.
  const [sessionPeak, setSessionPeak] = useState(0);
  useEffect(() => {
    if (liveWatts != null) setSessionPeak((p) => Math.max(p, liveWatts));
  }, [liveWatts]);

  // Standby: masterPower reports off, but the metered watts in device.state
  // are still above the noise floor. Both readings are real telemetry.
  const standbyDevices = useMemo(() => {
    return devices.filter((d) => {
      const mp = masterPower(d);
      if (!mp || mp.on) return false;
      const w = deviceWatts(d);
      return w !== null && w > STANDBY_THRESHOLD_W;
    });
  }, [devices]);

  // Also check fleet state.watts for devices that don't appear in byDevice
  // (e.g. a metering device that went offline before the energy summary ran).
  const standbyFromEnergy = useMemo(() => {
    return byDevice.filter((ed) => {
      if (ed.watts <= STANDBY_THRESHOLD_W) return false;
      const fleetDev = byId.get(ed.id);
      if (!fleetDev) return false;
      const mp = masterPower(fleetDev);
      return mp !== null && !mp.on;
    });
  }, [byDevice, byId]);

  // Merge the two standby lists, dedup by id.
  const allStandby = useMemo(() => {
    const seen = new Set(standbyDevices.map((d) => d.id));
    const extra = standbyFromEnergy.filter((d) => !seen.has(d.id));
    return [
      ...standbyDevices.map((d) => ({
        id: d.id,
        name: d.name,
        watts: deviceWatts(d) ?? 0,
      })),
      ...extra.map((d) => ({ id: d.id, name: d.name, watts: d.watts })),
    ];
  }, [standbyDevices, standbyFromEnergy]);

  const donutData = useMemo(() => {
    const active = byDevice.filter((d) => d.watts > 0);
    return active.slice(0, 8).map((d, i) => ({
      label: d.name || d.id,
      value: d.watts,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [byDevice]);

  const rollingSeries: Series[] = useMemo(
    () => [
      {
        name: "Whole-home draw",
        color: CHART_COLORS[0],
        points: rollingBuffer,
      },
    ],
    [rollingBuffer]
  );

  const topConsumers = byDevice.slice(0, 6);

  if (loading && !summary) return <LoadingState label="Loading live energy" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (!summary)
    return (
      <EmptyState
        title="No energy data"
        body="No metering devices have reported yet."
        icon={Zap}
      />
    );

  const gaugeMax = Math.max(sessionPeak * 1.25, liveWatts ?? 0, 500);
  const activeCount = byDevice.filter((d) => d.watts > 0).length;

  return (
    <div className="space-y-5">
      <KpiGrid>
        <Kpi
          label="Live draw"
          value={liveWatts != null ? formatWatts(liveWatts) : "—"}
          icon={Zap}
          hint={activeCount > 0 ? `${activeCount} active device${activeCount > 1 ? "s" : ""}` : undefined}
        />
        <Kpi
          label="Today's consumption"
          value={todayKwh != null ? formatEnergy(todayKwh) : "—"}
          hint="since midnight"
        />
        <Kpi
          label="Session peak"
          value={sessionPeak > 0 ? formatWatts(sessionPeak) : "—"}
          hint="this browser session"
        />
        <Kpi
          label="Standby loads"
          value={allStandby.length}
          tone={allStandby.length > 0 ? "warning" : "ok"}
          hint={allStandby.length > 0 ? "powered off but drawing" : "none detected"}
        />
      </KpiGrid>

      {allStandby.length > 0 && (
        <Callout tone="warning" title="Standby power detected">
          {allStandby.map((d) => `${d.name} (${formatWatts(d.watts)})`).join(", ")} —
          reporting power-off but still drawing above {STANDBY_THRESHOLD_W} W.
          Consider disabling standby or using a smart plug with scheduling.
        </Callout>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Surface>
          <div
            className="mb-3 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ color: "var(--cv-muted)" }}
          >
            <span>Live load gauge</span>
            <span style={{ textTransform: "none", letterSpacing: "normal", fontWeight: 500 }}>
              peak {formatWatts(sessionPeak)}
            </span>
          </div>
          <div className="flex justify-center">
            {liveWatts != null ? (
              <Gauge
                value={liveWatts}
                max={gaugeMax}
                size={186}
                label="vs session peak"
                unit=" W"
                thresholds={[
                  { at: 0, color: CHART_COLORS[2] },
                  { at: gaugeMax * 0.55, color: "#f59e0b" },
                  { at: gaugeMax * 0.82, color: "#dc2626" },
                ]}
              />
            ) : (
              <div
                className="flex h-24 items-center justify-center text-sm"
                style={{ color: "var(--cv-muted)" }}
              >
                Not reported yet
              </div>
            )}
          </div>
          <div className="mt-4 space-y-2">
            {liveWatts != null && (
              <Meter
                value={liveWatts}
                max={gaugeMax}
                label="Current vs peak"
                unit=" W"
              />
            )}
            {todayKwh != null && (
              <Meter
                value={todayKwh}
                max={Math.max(10, todayKwh * 1.5)}
                label="Today's kWh"
                unit=" kWh"
              />
            )}
          </div>
        </Surface>

        <Surface>
          <div
            className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ color: "var(--cv-muted)" }}
          >
            Device split
          </div>
          {donutData.length > 0 ? (
            <Donut
              data={donutData}
              size={164}
              centerValue={liveWatts != null ? formatWatts(liveWatts) : "—"}
              centerLabel="total live"
            />
          ) : (
            <EmptyState
              title="No active devices"
              body="No device is currently drawing power above the reporting threshold."
            />
          )}
        </Surface>
      </div>

      <LineChart
        series={rollingSeries}
        title="Rolling live draw"
        unit=" W"
        valueFormat={(v) => formatWatts(v)}
        footer={
          <p className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
            Built from successive API polls (~20 s each). Resets on page reload —
            no historical data is synthesised.
          </p>
        }
      />

      <SectionTitle>Top consumers</SectionTitle>
      {topConsumers.length === 0 ? (
        <EmptyState title="No active consumers" icon={Zap} />
      ) : (
        <div className="space-y-2">
          {topConsumers.map((d, i) => {
              const pct =
                liveWatts != null && liveWatts > 0
            ? (d.watts / liveWatts) * 100
            : 0;
            return (
              <Surface key={d.id} padded={false}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-black"
                    style={{
                      background: "var(--cv-card-hi)",
                      color: "var(--cv-muted)",
                    }}
                  >
                    #{i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className="mb-1.5 truncate text-sm font-semibold"
                      style={{ color: "var(--cv-text)" }}
                    >
                      {d.name || d.id}
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full"
                      style={{ background: "var(--cv-input-bg)" }}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
                        style={{
                          width: `${pct}%`,
                          background:
                            CHART_COLORS[i % CHART_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className="text-sm font-bold tabular-nums"
                      style={{ color: "var(--cv-accent-hi)" }}
                    >
                      {formatWatts(d.watts)}
                    </div>
                    <div
                      className="text-[10px] tabular-nums"
                      style={{ color: "var(--cv-muted)" }}
                    >
                      {pct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </Surface>
            );
          })}
        </div>
      )}

      {allStandby.length > 0 && (
        <>
          <SectionTitle>Standby devices</SectionTitle>
          <div className="space-y-2">
            {allStandby.map((d) => (
              <Surface key={d.id} padded={false}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ background: "#f59e0b" }}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-sm font-medium"
                    style={{ color: "var(--cv-text)" }}
                  >
                    {d.name}
                  </span>
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: "#b45309" }}
                  >
                    {formatWatts(d.watts)}
                  </span>
                </div>
              </Surface>
            ))}
          </div>
        </>
      )}

      {topConsumers.length > 0 && (
        <div className="mt-2">
          <Legend
            items={topConsumers.slice(0, 6).map((d, i) => ({
              name: d.name || d.id,
              color: CHART_COLORS[i % CHART_COLORS.length],
              value: formatWatts(d.watts),
            }))}
          />
        </div>
      )}
    </div>
  );
}
