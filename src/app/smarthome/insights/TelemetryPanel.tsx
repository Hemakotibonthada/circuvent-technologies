"use client";

/**
 * Telemetry Panel — raw sensor data explorer.
 *
 * Pick a device → see its real numeric telemetry fields → chart any field
 * over time → view raw rows → export to CSV.
 *
 * All data comes from controlPlane.telemetry() via useTelemetry(). Nothing
 * is synthesised. If a device has no numeric fields in its telemetry history,
 * an explicit empty state is shown.
 */

import { useState, useMemo, useCallback } from "react";
import { Database, Download, RefreshCw } from "lucide-react";
import {
  Field, SelectInput, Button, IconButton, SectionTitle, Kpi, KpiGrid,
  EmptyState, ErrorState, LoadingState, Callout, formatNumber, formatDateTime,
  Badge,
} from "../_kit/primitives";
import { LineChart, CHART_COLORS, Legend, type Series } from "../_kit/charts";
import { DataGrid, type Column } from "../_kit/data-grid";
import { useFleet, useTelemetry } from "../_data/hooks";
import type { TelemetryRow } from "../_data/hooks";
import { downloadCsv, toCsv } from "../_kit/primitives";

const LIMIT_OPTIONS = [
  { value: 100, label: "Last 100" },
  { value: 250, label: "Last 250" },
  { value: 500, label: "Last 500" },
];

export function TelemetryPanel() {
  const { devices, loading: fleetLoading } = useFleet();

  const [deviceId, setDeviceId] = useState<string>("");
  const [field, setField] = useState<string>("");
  const [limit, setLimit] = useState<number>(100);

  const tel = useTelemetry(deviceId || null, limit);

  // When the device or limit changes, reset field if it is no longer present
  const availableFields = tel.numericFields;

  const effectiveField = availableFields.includes(field) ? field : availableFields[0] ?? "";

  const chartSeries: Series[] = useMemo(() => {
    if (!effectiveField) return [];
    const pts = tel.seriesFor(effectiveField);
    if (!pts.length) return [];
    return [{ name: effectiveField, color: CHART_COLORS[0], points: pts }];
  }, [tel, effectiveField]);

  // Summary stats for the selected field
  const fieldStats = useMemo(() => {
    if (!effectiveField) return null;
    const vals = tel.rows
      .map((r) => Number(r.payload?.[effectiveField]))
      .filter((v) => Number.isFinite(v));
    if (!vals.length) return null;
    const sorted = [...vals].sort((a, b) => a - b);
    const p = (frac: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * frac))];
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      p50: p(0.5),
      count: vals.length,
    };
  }, [tel.rows, effectiveField]);

  // Table columns — static columns + one per numeric field (up to 8)
  const columns = useMemo((): Column<TelemetryRow>[] => {
    const tsCol: Column<TelemetryRow> = {
      key: "ts",
      header: "Timestamp",
      render: (r) => (
        <span className="font-mono text-[11px]" style={{ color: "var(--cv-muted)" }}>
          {formatDateTime(r.ts)}
        </span>
      ),
      value: (r) => r.ts,
    };

    const fieldCols: Column<TelemetryRow>[] = availableFields.slice(0, 8).map((f, i) => ({
      key: f,
      header: f,
      render: (r) => {
        const v = Number(r.payload?.[f]);
        return Number.isFinite(v) ? (
          <span className="tabular-nums" style={{ color: i === 0 ? "var(--cv-accent-hi)" : "var(--cv-text)" }}>
            {v % 1 === 0 ? v.toString() : v.toFixed(3)}
          </span>
        ) : (
          <span style={{ color: "var(--cv-muted)" }}>—</span>
        );
      },
      value: (r) => {
        const v = Number(r.payload?.[f]);
        return Number.isFinite(v) ? v : null;
      },
    }));

    return [tsCol, ...fieldCols];
  }, [availableFields]);

  const exportCsv = useCallback(() => {
    if (!tel.rows.length) return;
    const headers = ["ts", ...availableFields];
    const rows = tel.rows.map((r) => [
      r.ts,
      ...availableFields.map((f) => {
        const v = Number(r.payload?.[f]);
        return Number.isFinite(v) ? v : null;
      }),
    ]);
    const device = devices.find((d) => d.id === deviceId);
    const filename = `telemetry-${device?.name ?? deviceId ?? "device"}.csv`;
    downloadCsv(filename, toCsv(headers, rows));
  }, [tel.rows, availableFields, devices, deviceId]);

  if (fleetLoading) return <LoadingState label="Loading devices" />;

  if (!devices.length) {
    return (
      <EmptyState
        icon={Database}
        title="No devices in your fleet"
        body="Claim a device to start seeing telemetry."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Pickers */}
      <div className="flex flex-wrap gap-3">
        <Field label="Device">
          <SelectInput
            value={deviceId}
            onChange={(v) => {
              setDeviceId(v);
              setField("");
            }}
            options={[
              { value: "", label: "Pick a device…" },
              ...devices.map((d) => ({ value: d.id, label: `${d.name || d.id} (${d.type})` })),
            ]}
          />
        </Field>

        <Field label="Field to chart">
          <SelectInput
            value={effectiveField}
            onChange={setField}
            disabled={!deviceId || !availableFields.length}
            options={
              availableFields.length
                ? availableFields.map((f) => ({ value: f, label: f }))
                : [{ value: "", label: deviceId ? "No numeric fields" : "Pick a device first" }]
            }
          />
        </Field>

        <Field label="Sample count">
          <SelectInput
            value={String(limit)}
            onChange={(v) => setLimit(Number(v))}
            options={LIMIT_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          />
        </Field>

        {deviceId && (
          <div className="flex items-end gap-2">
            <IconButton icon={RefreshCw} label="Refresh telemetry" onClick={tel.refresh} />
            <Button icon={Download} onClick={exportCsv} variant="secondary" disabled={!tel.rows.length}>
              Export CSV
            </Button>
          </div>
        )}
      </div>

      {!deviceId && (
        <EmptyState
          icon={Database}
          title="Select a device"
          body="Choose a device above to explore its sensor data."
        />
      )}

      {deviceId && tel.loading && <LoadingState label="Loading telemetry" />}

      {deviceId && tel.error && !tel.loading && (
        <ErrorState message={tel.error} onRetry={tel.refresh} />
      )}

      {deviceId && !tel.loading && !tel.error && tel.rows.length === 0 && (
        <EmptyState
          icon={Database}
          title="No telemetry yet"
          body="This device has not sent any telemetry rows within the selected limit. Try increasing the sample count or check that the device is online."
        />
      )}

      {deviceId && !tel.loading && !tel.error && tel.rows.length > 0 && (
        <>
          {/* Field stats */}
          {fieldStats && (
            <div>
              <SectionTitle>{effectiveField} — statistics ({fieldStats.count} rows)</SectionTitle>
              <KpiGrid cols={4}>
                <Kpi label="Min" value={formatNumber(fieldStats.min, fieldStats.min % 1 === 0 ? 0 : 3)} />
                <Kpi label="Max" value={formatNumber(fieldStats.max, fieldStats.max % 1 === 0 ? 0 : 3)} />
                <Kpi label="Avg" value={formatNumber(fieldStats.avg, fieldStats.avg % 1 === 0 ? 0 : 3)} />
                <Kpi label="p50" value={formatNumber(fieldStats.p50, fieldStats.p50 % 1 === 0 ? 0 : 3)} />
              </KpiGrid>
            </div>
          )}

          {availableFields.length === 0 && (
            <Callout tone="info">
              This device has telemetry rows but no numeric fields — the payload may contain only
              string or boolean values. Raw rows are still shown in the table below.
            </Callout>
          )}

          {/* Chart */}
          {chartSeries.length > 0 && (
            <div>
              <SectionTitle>{effectiveField} over time</SectionTitle>
              <LineChart
                series={chartSeries}
                title={`${effectiveField} — ${tel.rows.length} samples`}
                area
                footer={
                  <Legend items={chartSeries.map((s) => ({ name: s.name, color: s.color }))} />
                }
              />
            </div>
          )}

          {/* All numeric fields sparkline summary */}
          {availableFields.length > 1 && (
            <div>
              <SectionTitle>All numeric fields</SectionTitle>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {availableFields.map((f, idx) => {
                  const pts = tel.seriesFor(f);
                  const last = pts.length ? pts[pts.length - 1].v : null;
                  return (
                    <button
                      key={f}
                      onClick={() => setField(f)}
                      className="rounded-2xl px-4 py-3 text-left transition hover:brightness-110"
                      style={{
                        background: "var(--cv-card)",
                        border: `1px solid ${f === effectiveField ? "var(--cv-accent)" : "var(--cv-border)"}`,
                      }}
                    >
                      <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--cv-muted)" }}>
                        {f}
                      </div>
                      <div className="mt-1 text-xl font-extrabold tabular-nums" style={{ color: CHART_COLORS[idx % CHART_COLORS.length] }}>
                        {last != null ? (last % 1 === 0 ? last.toString() : last.toFixed(2)) : "—"}
                      </div>
                      <div className="mt-0.5 text-[10px]" style={{ color: "var(--cv-muted)" }}>
                        {pts.length} readings
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Raw data table */}
          <div>
            <SectionTitle right={
              <Badge tone="neutral">{tel.rows.length} rows</Badge>
            }>
              Raw telemetry rows
            </SectionTitle>

            <DataGrid
              rows={tel.rows}
              columns={columns}
              rowKey={(r) => r.ts}
              loading={tel.loading}
              searchable
              searchPlaceholder="Filter rows…"
              searchOn={(r) => r.ts + " " + Object.values(r.payload ?? {}).join(" ")}
              pageSize={25}
              exportName={`telemetry-${deviceId}`}
              emptyTitle="No rows match your filter"
              storageKey={`insights-telemetry-grid-${deviceId}`}
              dense
            />
          </div>
        </>
      )}
    </div>
  );
}
