"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Download } from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import {
  Button,
  Callout,
  downloadCsv,
  EmptyState,
  ErrorState,
  FilterChips,
  formatEnergy,
  formatWatts,
  LoadingState,
  SectionTitle,
  toCsv,
} from "../_kit/primitives";
import {
  BarChart,
  CHART_COLORS,
  Heatmap,
  LineChart,
  type Series,
} from "../_kit/charts";
import { DataGrid, type Column } from "../_kit/data-grid";
import { useEnergy, useHomeEnergyHistory } from "../_data/hooks";

type RangeKey = "24h" | "7d" | "30d";

const RANGES: { value: RangeKey; label: string; hours: number }[] = [
  { value: "24h", label: "24 h", hours: 24 },
  { value: "7d", label: "7 days", hours: 168 },
  { value: "30d", label: "30 days", hours: 720 },
];

/** Maximum devices fetched per aggregate-history request. */
const AGGREGATE_CAP = 8;

interface DeviceRollup {
  id: string;
  name: string;
  type: string;
  kwh: number | null;
  avgWatts: number | null;
}

export default function HistoryPanel() {
  const [range, setRange] = useState<RangeKey>("24h");
  const hours = RANGES.find((r) => r.value === range)!.hours;

  const { byDevice, loading: energyLoading, error, refresh } = useEnergy();
  const deviceIds = useMemo(() => byDevice.map((d) => d.id), [byDevice]);

  const { points: homePts, loading: homeLoading } = useHomeEnergyHistory(
    deviceIds,
    hours,
    AGGREGATE_CAP
  );

  // Per-device kWh rollup — one controlPlane call per device, fired whenever
  // the device list or the selected range changes.
  const [rollups, setRollups] = useState<DeviceRollup[]>([]);
  const [rollupLoading, setRollupLoading] = useState(false);

  const idKey = deviceIds.join(",");
  useEffect(() => {
    if (deviceIds.length === 0) {
      setRollups([]);
      return;
    }
    let cancelled = false;
    setRollupLoading(true);
    Promise.all(
      byDevice.map(async (d) => {
        const r = await controlPlane.deviceEnergy(d.id, hours, "watts");
        const pts = r.ok ? (r.data.series ?? []) : [];
        return {
          id: d.id,
          name: d.name || d.id,
          type: d.type,
          kwh: r.ok ? (r.data.kwh ?? null) : null,
          avgWatts:
            pts.length > 0
              ? pts.reduce((s, p) => s + Number(p.avg), 0) / pts.length
              : null,
        } as DeviceRollup;
      })
    ).then((results) => {
      if (cancelled) return;
      setRollups(results.sort((a, b) => (b.kwh ?? -1) - (a.kwh ?? -1)));
      setRollupLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, hours]);

  // Bin whole-home watts points into day×hour cells for the heatmap.
  const heatmapCells = useMemo<Record<string, number>>(() => {
    const cells: Record<string, number> = {};
    for (const p of homePts) {
      const d = new Date(p.t);
      const key = `${d.getDay()}-${d.getHours()}`;
      cells[key] = (cells[key] ?? 0) + p.v;
    }
    return cells;
  }, [homePts]);

  const homeSeries: Series[] = useMemo(
    () => [
      {
        name: "Whole-home draw",
        color: CHART_COLORS[0],
        points: homePts,
      },
    ],
    [homePts]
  );

  const barData = useMemo(
    () =>
      rollups
        .filter((r) => r.kwh != null && r.kwh > 0)
        .slice(0, 10)
        .map((r, i) => ({
          label: r.name,
          value: r.kwh!,
          color: CHART_COLORS[i % CHART_COLORS.length],
        })),
    [rollups]
  );

  const columns: Column<DeviceRollup>[] = [
    {
      key: "name",
      header: "Device",
      render: (r) => (
        <span className="font-medium" style={{ color: "var(--cv-text)" }}>
          {r.name}
        </span>
      ),
      value: (r) => r.name,
    },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <span className="capitalize" style={{ color: "var(--cv-muted)" }}>
          {r.type}
        </span>
      ),
      value: (r) => r.type,
      hideOnCard: true,
    },
    {
      key: "kwh",
      header: "Total kWh",
      align: "right",
      render: (r) => (
        <span
          className="font-bold tabular-nums"
          style={{ color: r.kwh != null ? "var(--cv-accent-hi)" : "var(--cv-muted)" }}
        >
          {r.kwh != null ? formatEnergy(r.kwh) : "—"}
        </span>
      ),
      value: (r) => r.kwh ?? 0,
    },
    {
      key: "avgWatts",
      header: "Avg W",
      align: "right",
      render: (r) => (
        <span className="tabular-nums" style={{ color: "var(--cv-muted)" }}>
          {r.avgWatts != null ? formatWatts(r.avgWatts) : "—"}
        </span>
      ),
      value: (r) => r.avgWatts ?? 0,
      hideOnCard: true,
    },
  ];

  const handleExportAggregate = () => {
    const csv = toCsv(
      ["Timestamp", "Watts (whole-home, capped at 8 devices)"],
      homePts.map((p) => [new Date(p.t).toISOString(), p.v.toFixed(2)])
    );
    downloadCsv(`whole-home-${range}.csv`, csv);
  };

  if (energyLoading && byDevice.length === 0)
    return <LoadingState label="Loading history" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const aboveCap = deviceIds.length > AGGREGATE_CAP;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
          value={range}
          onChange={setRange}
        />
        <Button icon={Download} onClick={handleExportAggregate} variant="secondary">
          Export aggregate CSV
        </Button>
      </div>

      {aboveCap && (
        <Callout tone="info">
          Whole-home aggregate history is capped at {AGGREGATE_CAP} devices
          (each requires a separate request). Your fleet has {deviceIds.length} metered
          devices — only the {AGGREGATE_CAP} with the highest live draw are included
          in the chart and heatmap.
        </Callout>
      )}

      {homeLoading && homePts.length === 0 ? (
        <LoadingState label="Fetching whole-home history" />
      ) : homePts.length === 0 ? (
        <EmptyState
          title="No aggregate history"
          body="No device has reported energy data for this window yet."
          icon={Clock}
        />
      ) : (
        <LineChart
          series={homeSeries}
          title={`Whole-home draw — ${RANGES.find((r) => r.value === range)!.label}`}
          unit=" W"
          valueFormat={(v) => formatWatts(v)}
        />
      )}

      {homePts.length > 0 && (
        <Heatmap
          cells={heatmapCells}
          title="Load heatmap (day × hour, whole-home W)"
          unitLabel="W"
        />
      )}

      <SectionTitle>Per-device rollup</SectionTitle>

      {rollupLoading ? (
        <LoadingState label="Fetching device history" />
      ) : (
        <>
          {barData.length > 0 && (
            <BarChart
              data={barData}
              title={`Top consumers — ${RANGES.find((r) => r.value === range)!.label}`}
              unit=" kWh"
              horizontal
            />
          )}

          <DataGrid
            rows={rollups}
            columns={columns}
            rowKey={(r) => r.id}
            loading={rollupLoading}
            searchable
            searchPlaceholder="Filter devices…"
            exportName={`energy-per-device-${range}`}
            emptyTitle="No per-device data"
            emptyBody="No device reported energy history for this range."
            storageKey="energy:history:grid"
          />
        </>
      )}
    </div>
  );
}
