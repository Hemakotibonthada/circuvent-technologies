import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Screen, useTheme } from "../../../ui";
import { Legend, MultiLineChart } from "../../../charts";
import { BottomSheet, Callout, CodeBlock, DataGrid, type GridColumn, Kpi, KpiGrid, ScreenHeader, SelectField, TabStrip, ActionButton } from "../../../enterprise-ui";
import { carbonOf, costOf, formatKwh, formatMoney, formatWatts, numericSeries, slugifyFilename, statsOf, toCsv } from "../../../enterprise";
import type { Device, EnergyPoint } from "../../../api";
import { ESTIMATE_NOTE, HonestEmpty, InlineError, InlineLoading, MiniStat, ScreenBody, SectionCard, StatWrap } from "./parts";
import { labelForPoint, loadDeviceChoices, loadDeviceEnergyData, numericText, percentile, useAsyncData } from "./useEnergy";

const RANGES = [
  { value: "6", label: "6h" },
  { value: "24", label: "24h" },
  { value: "168", label: "7d" },
  { value: "720", label: "30d" },
] as const;

type RangeKey = (typeof RANGES)[number]["value"];

interface Props { onBack: () => void; initialDeviceId?: string }

export default function DeviceEnergy({ onBack, initialDeviceId }: Props) {
  const { c } = useTheme();
  const [deviceId, setDeviceId] = useState(initialDeviceId ?? "");
  const [range, setRange] = useState<RangeKey>("24");
  const [metric, setMetric] = useState("watts");
  const [csvOpen, setCsvOpen] = useState(false);
  const choices = useAsyncData(loadDeviceChoices, []);
  const selectedName = choices.data?.summary.byDevice.find((d) => d.id === deviceId)?.name || choices.data?.devices.find((d) => d.id === deviceId)?.name || deviceId;

  React.useEffect(() => {
    if (!deviceId && choices.data?.devices.length) setDeviceId(choices.data.devices[0].id);
  }, [choices.data, deviceId]);

  const loader = useCallback(() => {
    if (!deviceId) return Promise.reject(new Error("Choose a device to view its measured energy."));
    return loadDeviceEnergyData(deviceId, Number(range), metric);
  }, [deviceId, range, metric]);
  const energyState = useAsyncData(loader, [loader]);
  const data = energyState.data;
  const energy = data?.energy;
  const tariff = data?.tariff;
  const hours = Number(range);

  React.useEffect(() => {
    if (data?.fields.length && !data.fields.includes(metric)) {
      setMetric(data.fields.includes("watts") ? "watts" : data.fields[0]);
    }
  }, [data?.fields, metric]);

  const labels = useMemo(() => (energy?.series ?? []).map((p) => labelForPoint(p.t, hours)), [energy?.series, hours]);
  const avg = energy?.series.map((p) => Math.max(0, p.avg)) ?? [];
  const max = energy?.series.map((p) => Math.max(0, p.max)) ?? [];
  const pointStats = useMemo(() => statsOf((energy?.series ?? []).map((p) => ({ t: new Date(p.t).getTime(), v: p.avg }))), [energy?.series]);
  const p95 = percentile(avg, 95);
  const csv = useMemo(() => {
    const rows = (energy?.series ?? []).map((p) => ({ time: p.t, avg: p.avg, max: p.max, metric: energy?.metric, granularity: energy?.gran }));
    return toCsv(rows, ["time", "metric", "granularity", "avg", "max"]);
  }, [energy]);

  const telemetryPoints = useMemo(() => data ? numericSeries(data.telemetry, metric) : [], [data, metric]);
  const metricOptions = useMemo(() => {
    const fields = data?.fields.length ? data.fields : metric ? [metric] : [];
    return fields.map((f) => ({ value: f, label: f }));
  }, [data?.fields, metric]);

  const deviceOptions = useMemo(() => {
    const seen = new Map<string, string>();
    choices.data?.summary.byDevice.forEach((d) => seen.set(d.id, d.name));
    choices.data?.devices.forEach((d: Device) => seen.set(d.id, d.name));
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [choices.data]);

  const columns = useMemo<GridColumn<EnergyPoint>[]>(() => [
    { key: "time", header: "Time", width: 150, render: (p) => <Text style={{ color: c.textDim }}>{labelForPoint(p.t, hours)}</Text>, sortValue: (p) => new Date(p.t).getTime() },
    { key: "avg", header: "Avg", width: 100, align: "right", render: (p) => <Text style={{ color: c.text, fontWeight: "800" }}>{numericText(p.avg, 2)}</Text>, sortValue: (p) => p.avg },
    { key: "max", header: "Max", width: 100, align: "right", render: (p) => <Text style={{ color: c.text, fontWeight: "800" }}>{numericText(p.max, 2)}</Text>, sortValue: (p) => p.max },
  ], [c.text, c.textDim, hours]);

  if (choices.loading && !choices.data) return <Screen><ScreenHeader title="Device energy" subtitle="Measured consumption by device" onBack={onBack} /><InlineLoading /></Screen>;
  if (choices.error && !choices.data) return <Screen><ScreenHeader title="Device energy" subtitle="Measured consumption by device" onBack={onBack} /><InlineError text={choices.error} onRetry={choices.reload} /></Screen>;

  return (
    <Screen>
      <ScreenHeader title="Device energy" subtitle={selectedName || "Measured consumption"} onBack={onBack} actions={[{ icon: "exportFile", label: "Show CSV export", onPress: () => setCsvOpen(true) }, { icon: "refresh", label: "Refresh device energy", onPress: energyState.refresh }]} />
      <ScrollView refreshControl={<RefreshControl refreshing={energyState.refreshing} onRefresh={energyState.refresh} tintColor={c.accent} />} contentContainerStyle={{ paddingBottom: 24 }}>
        <ScreenBody>
          {deviceOptions.length ? <SelectField<string> label="Device" value={deviceId} options={deviceOptions} onChange={setDeviceId} help="Only real control-plane devices are listed." /> : null}
          <TabStrip<RangeKey> tabs={RANGES.map((r) => ({ ...r, icon: "history" }))} value={range} onChange={setRange} />

          {metricOptions.length ? (
            <SelectField<string> label="Numeric telemetry metric" value={metric} options={metricOptions} onChange={setMetric} help="Metrics are derived from this device's recent telemetry; no synthetic fields are added." />
          ) : (
            <Callout kind="info" title="No numeric telemetry" text="This device has not reported numeric telemetry fields in the recent sample window, so only endpoint-provided energy can be shown." icon="sensors" />
          )}

          {energyState.loading && !energy ? <InlineLoading text="Loading measured device energy…" /> : null}
          {energyState.error && !energy ? <InlineError text={energyState.error} onRetry={energyState.reload} /> : null}

          {energy ? (
            <>
              <KpiGrid>
                <Kpi icon="meter" label="Window kWh" value={formatKwh(energy.kwh)} tint={c.cyan} />
                <Kpi icon="cost" label="Estimated cost" value={tariff ? formatMoney(tariff, costOf(tariff, energy.kwh)) : "—"} tint={c.amber} footnote={ESTIMATE_NOTE} invertDelta />
                <Kpi icon="carbon" label="Estimated CO₂e" value={tariff ? `${carbonOf(tariff, energy.kwh).toFixed(2)} kg` : "—"} tint={c.green} footnote={ESTIMATE_NOTE} invertDelta />
                <Kpi icon="clock" label="Bucket granularity" value={energy.gran || "—"} tint={c.violet} />
              </KpiGrid>

              <SectionCard title="Average and peak" subtitle={`Metric: ${energy.metric}. Server bucket granularity: ${energy.gran || "unknown"}.`} icon="charts">
                {energy.series.length ? (
                  <>
                    <MultiLineChart
                      series={[{ name: "Average", data: avg, color: c.accentHi }, { name: "Maximum", data: max, color: c.amber }]}
                      labels={labels}
                      height={210}
                      area
                      unit={metric === "watts" ? " W" : ""}
                      fmt={(n) => metric === "watts" ? String(Math.round(n)) : numericText(n, 1)}
                    />
                    <Legend items={[{ name: "Average", color: c.accentHi, value: avg.length ? numericText(avg[avg.length - 1], 2) : "—" }, { name: "Maximum", color: c.amber, value: max.length ? numericText(max[max.length - 1], 2) : "—" }]} />
                  </>
                ) : <HonestEmpty title="No series returned" subtitle="The API returned no points for this device, range and metric." icon="empty" />}
              </SectionCard>

              <SectionCard title="Summary statistics" subtitle="Computed from returned average buckets only." icon="analytics">
                <StatWrap>
                  <MiniStat label="Min" value={metric === "watts" ? formatWatts(pointStats.min) : numericText(pointStats.min, 2)} icon="collapse" />
                  <MiniStat label="Avg" value={metric === "watts" ? formatWatts(pointStats.avg) : numericText(pointStats.avg, 2)} icon="activity" />
                  <MiniStat label="P95" value={metric === "watts" ? formatWatts(p95) : numericText(p95, 2)} icon="peak" />
                  <MiniStat label="Max" value={metric === "watts" ? formatWatts(pointStats.max) : numericText(pointStats.max, 2)} icon="expand" />
                  <MiniStat label="Last" value={metric === "watts" ? formatWatts(pointStats.last) : numericText(pointStats.last, 2)} icon="clock" />
                </StatWrap>
              </SectionCard>

              <SectionCard title="Visible data" subtitle="CSV is shown as selectable text because no file-share library is installed." icon="table" action={<ActionButton label="CSV" icon="exportFile" onPress={() => setCsvOpen(true)} outline />}>
                <DataGrid columns={columns} rows={energy.series} keyOf={(p) => p.t} emptyText="No points in this range." maxHeight={260} />
              </SectionCard>

              <SectionCard title="Telemetry field check" subtitle="Used only to discover numeric metric names for this device." icon="sensors">
                {telemetryPoints.length ? <Text style={{ color: c.textDim }}>Found {telemetryPoints.length} numeric samples for {metric} in the recent telemetry window.</Text> : <Text style={{ color: c.faint }}>No numeric samples for {metric} in the recent telemetry window.</Text>}
              </SectionCard>
            </>
          ) : null}
        </ScreenBody>
      </ScrollView>

      <BottomSheet visible={csvOpen} onClose={() => setCsvOpen(false)} title="CSV export" footer={<ActionButton label="Got it" icon="check" onPress={() => setCsvOpen(false)} />}>
        <Callout kind="info" text="Select the text to copy it. This app build does not include a file-share or clipboard library, so no download is faked." icon="info" />
        <CodeBlock label={`${slugifyFilename(selectedName || "device")}-${range}h.csv`} text={csv || "No visible series to export."} maxHeight={360} />
      </BottomSheet>
    </Screen>
  );
}
