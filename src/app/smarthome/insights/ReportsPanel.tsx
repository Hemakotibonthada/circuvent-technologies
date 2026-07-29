"use client";

/**
 * Reports Panel — client-side operational report from real fleet data.
 *
 * There is no server-side report generator. Everything here is computed from
 * the same hooks that power the rest of the console. The report states its
 * own data sources and limits clearly so operators are not misled.
 *
 * Report preset configuration (which sections to include, chosen period) is
 * persisted locally via usePersistentState and labelled accordingly.
 */

import { useState, useMemo, useCallback } from "react";
import {
  FileText, Download, RefreshCw, ChevronDown,
} from "lucide-react";
import {
  Button, IconButton, Kpi, KpiGrid, SectionTitle, SwitchRow,
  EmptyState, ErrorState, LoadingState, Callout, Badge, Meter,
  formatWatts, formatEnergy, formatNumber, downloadCsv, toCsv,
  usePersistentState, Field, SelectInput, Surface,
} from "../_kit/primitives";
import { Donut, BarChart, CHART_COLORS, Legend } from "../_kit/charts";
import { useFleet, useEvents, useEnergy, useAutomations, useScenes } from "../_data/hooks";
import {
  type ReportPeriod, PERIOD_OPTIONS, periodStart,
  computeFleetSummary, computeEventReport, computeEnergyReport, computeAutomationReport,
  fleetToCsvRows, FLEET_CSV_HEADERS,
  eventsToCsvRows, EVENTS_CSV_HEADERS,
  automationsToCsvRows, AUTOMATIONS_CSV_HEADERS,
} from "./report";

interface ReportPreset {
  period: ReportPeriod;
  includeFleet: boolean;
  includeEvents: boolean;
  includeEnergy: boolean;
  includeAutomations: boolean;
  includeScenes: boolean;
}

const DEFAULT_PRESET: ReportPreset = {
  period: "7d",
  includeFleet: true,
  includeEvents: true,
  includeEnergy: true,
  includeAutomations: true,
  includeScenes: true,
};

export function ReportsPanel() {
  const [preset, setPreset, presetLoaded] = usePersistentState<ReportPreset>(
    "cv-insights-report-preset",
    DEFAULT_PRESET
  );

  const [showConfig, setShowConfig] = useState(false);

  const fleet = useFleet();
  const events = useEvents(500);
  const energy = useEnergy();
  const automations = useAutomations();
  const scenes = useScenes();

  const loading = fleet.loading || events.loading || energy.loading || automations.loading;

  const since = useMemo(() => periodStart(preset.period), [preset.period]);

  const fleetSummary = useMemo(
    () => (preset.includeFleet ? computeFleetSummary(fleet.devices) : null),
    [fleet.devices, preset.includeFleet]
  );

  const eventReport = useMemo(
    () => (preset.includeEvents ? computeEventReport(events.events, since) : null),
    [events.events, since, preset.includeEvents]
  );

  const energyReport = useMemo(
    () =>
      preset.includeEnergy
        ? computeEnergyReport(
            energy.summary
              ? { ...energy.summary, byDevice: energy.byDevice }
              : null
          )
        : null,
    [energy.summary, energy.byDevice, preset.includeEnergy]
  );

  const automationReport = useMemo(
    () => (preset.includeAutomations ? computeAutomationReport(automations.automations) : null),
    [automations.automations, preset.includeAutomations]
  );

  const refresh = useCallback(() => {
    void fleet.refresh();
    void events.refresh();
    void energy.refresh();
    void automations.refresh();
    void scenes.refresh();
  }, [fleet, events, energy, automations, scenes]);

  const exportAll = useCallback(() => {
    const label = new Date().toISOString().slice(0, 10);
    if (preset.includeFleet && fleet.devices.length) {
      downloadCsv(
        `report-fleet-${label}.csv`,
        toCsv(FLEET_CSV_HEADERS, fleetToCsvRows(fleet.devices))
      );
    }
    if (preset.includeEvents && events.events.length) {
      const inPeriod = events.events.filter((e) => new Date(e.ts).getTime() >= since);
      downloadCsv(
        `report-events-${preset.period}-${label}.csv`,
        toCsv(EVENTS_CSV_HEADERS, eventsToCsvRows(inPeriod))
      );
    }
    if (preset.includeAutomations && automations.automations.length) {
      downloadCsv(
        `report-automations-${label}.csv`,
        toCsv(AUTOMATIONS_CSV_HEADERS, automationsToCsvRows(automations.automations))
      );
    }
    if (preset.includeEnergy && energyReport?.topDevices.length) {
      const headers = ["device_id", "name", "type", "watts_live"];
      const rows = energyReport.topDevices.map((d) => [d.id, d.name, d.type, d.watts]);
      downloadCsv(`report-energy-${label}.csv`, toCsv(headers, rows));
    }
  }, [preset, fleet.devices, events.events, automations.automations, energyReport, since]);

  if (loading && !presetLoaded) return <LoadingState label="Assembling report" />;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={ChevronDown}
          onClick={() => setShowConfig((v) => !v)}
          variant="secondary"
        >
          Report settings
        </Button>
        <IconButton icon={RefreshCw} label="Refresh all data" onClick={refresh} />
        <Button icon={Download} onClick={exportAll} variant="primary">
          Export all CSV
        </Button>
      </div>

      {/* Config callout — always shown so operators know presets are browser-local */}
      <Callout tone="info" title="Report configuration is stored locally in this browser">
        Your chosen period and section toggles are saved in this browser only — they are not synced
        to the server and will not appear in other browsers or after clearing browser data. All
        numbers in the report are computed from live server data fetched just now.
      </Callout>

      {/* Config panel */}
      {showConfig && (
        <Surface>
          <div className="mb-4 text-sm font-bold" style={{ color: "var(--cv-text)" }}>
            Report settings
          </div>
          <div className="mb-4">
            <Field label="Reporting period">
              <SelectInput
                value={preset.period}
                onChange={(v) => setPreset((p) => ({ ...p, period: v as ReportPeriod }))}
                options={PERIOD_OPTIONS}
              />
            </Field>
          </div>
          <div className="space-y-0 divide-y" style={{ borderColor: "var(--cv-border)" }}>
            <SwitchRow
              label="Fleet inventory"
              hint="Device count, online status, types, rooms"
              checked={preset.includeFleet}
              onChange={(v) => setPreset((p) => ({ ...p, includeFleet: v }))}
            />
            <SwitchRow
              label="Activity events"
              hint="Event counts by severity and kind for the chosen period"
              checked={preset.includeEvents}
              onChange={(v) => setPreset((p) => ({ ...p, includeEvents: v }))}
            />
            <SwitchRow
              label="Energy"
              hint="Live power draw and today's kWh from the energy API"
              checked={preset.includeEnergy}
              onChange={(v) => setPreset((p) => ({ ...p, includeEnergy: v }))}
            />
            <SwitchRow
              label="Automations"
              hint="Rule inventory: total, enabled vs disabled"
              checked={preset.includeAutomations}
              onChange={(v) => setPreset((p) => ({ ...p, includeAutomations: v }))}
            />
            <SwitchRow
              label="Scenes"
              hint="Scene count from the server"
              checked={preset.includeScenes}
              onChange={(v) => setPreset((p) => ({ ...p, includeScenes: v }))}
            />
          </div>
        </Surface>
      )}

      {/* Report header */}
      <div
        className="rounded-2xl px-5 py-4"
        style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)" }}
      >
        <div className="text-[17px] font-semibold" style={{ color: "var(--cv-text)" }}>
          Operational report
        </div>
        <div className="mt-1 text-lg font-extrabold" style={{ color: "var(--cv-text)" }}>
          {PERIOD_OPTIONS.find((p) => p.value === preset.period)?.label ?? preset.period}
        </div>
        <div className="mt-1 text-xs" style={{ color: "var(--cv-muted)" }}>
          Generated {new Date().toLocaleString()} · Data sources: control plane REST API
          (devices, events, energy, automations, scenes) · No server-side aggregation —
          all numbers computed client-side from the latest API response.
        </div>
      </div>

      {/* ---- Fleet section ---- */}
      {preset.includeFleet && (
        <section aria-labelledby="report-fleet-heading">
          <SectionTitle
            right={
              fleet.devices.length > 0 ? (
                <Button
                  icon={Download}
                  variant="ghost"
                  onClick={() =>
                    downloadCsv(
                      "report-fleet.csv",
                      toCsv(FLEET_CSV_HEADERS, fleetToCsvRows(fleet.devices))
                    )
                  }
                >
                  CSV
                </Button>
              ) : undefined
            }
          >
            <span id="report-fleet-heading">Fleet inventory</span>
          </SectionTitle>

          {fleet.loading ? (
            <LoadingState label="Loading fleet" />
          ) : fleet.error ? (
            <ErrorState message={fleet.error} onRetry={fleet.refresh} />
          ) : fleet.devices.length === 0 ? (
            <EmptyState icon={FileText} title="No devices in fleet" />
          ) : fleetSummary ? (
            <div className="space-y-4">
              <KpiGrid cols={4}>
                <Kpi label="Total devices" value={fleetSummary.total} icon={FileText} />
                <Kpi
                  label="Online"
                  value={fleetSummary.online}
                  unit={`/ ${fleetSummary.total}`}
                  tone={fleetSummary.online === fleetSummary.total ? "ok" : fleetSummary.online > 0 ? "warning" : "critical"}
                />
                <Kpi label="Offline" value={fleetSummary.offline} tone={fleetSummary.offline > 0 ? "warning" : "ok"} />
                <Kpi
                  label="Reachability"
                  value={`${fleetSummary.onlinePct.toFixed(1)}%`}
                  tone={fleetSummary.onlinePct >= 95 ? "ok" : fleetSummary.onlinePct >= 75 ? "warning" : "critical"}
                />
              </KpiGrid>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* By type */}
                {fleetSummary.types.length > 0 && (
                  <div>
                    <div className="mb-2 text-[13px] font-semibold" style={{ color: "var(--cv-muted)" }}>
                      By device type
                    </div>
                    <div className="space-y-2">
                      {fleetSummary.types.map((t, i) => (
                        <div key={t.type}>
                          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                            <span style={{ color: "var(--cv-text)" }}>{t.type}</span>
                            <span className="tabular-nums" style={{ color: "var(--cv-muted)" }}>
                              {t.online}/{t.count} online
                            </span>
                          </div>
                          <Meter
                            value={t.online}
                            max={t.count}
                            tone={t.online === t.count ? "ok" : t.online > 0 ? "warning" : "critical"}
                            showValue={false}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* By room */}
                {fleetSummary.rooms.length > 0 && (
                  <div>
                    <div className="mb-2 text-[13px] font-semibold" style={{ color: "var(--cv-muted)" }}>
                      By room
                    </div>
                    <div className="space-y-2">
                      {fleetSummary.rooms.map((r) => (
                        <div key={r.room}>
                          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                            <span style={{ color: "var(--cv-text)" }}>{r.room}</span>
                            <span className="tabular-nums" style={{ color: "var(--cv-muted)" }}>
                              {r.online}/{r.count} online
                            </span>
                          </div>
                          <Meter
                            value={r.online}
                            max={r.count}
                            tone={r.online === r.count ? "ok" : r.online > 0 ? "warning" : "critical"}
                            showValue={false}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Type donut */}
              {fleetSummary.types.length > 1 && (
                <Donut
                  title="Fleet composition by device type"
                  data={fleetSummary.types.map((t, i) => ({
                    label: t.type,
                    value: t.count,
                    color: CHART_COLORS[i % CHART_COLORS.length],
                  }))}
                  centerLabel="devices"
                  centerValue={String(fleetSummary.total)}
                />
              )}
            </div>
          ) : null}
        </section>
      )}

      {/* ---- Events section ---- */}
      {preset.includeEvents && (
        <section aria-labelledby="report-events-heading">
          <SectionTitle
            right={
              events.events.length > 0 ? (
                <Button
                  icon={Download}
                  variant="ghost"
                  onClick={() => {
                    const inPeriod = events.events.filter(
                      (e) => new Date(e.ts).getTime() >= since
                    );
                    downloadCsv(
                      `report-events-${preset.period}.csv`,
                      toCsv(EVENTS_CSV_HEADERS, eventsToCsvRows(inPeriod))
                    );
                  }}
                >
                  CSV
                </Button>
              ) : undefined
            }
          >
            <span id="report-events-heading">
              Activity events — {PERIOD_OPTIONS.find((p) => p.value === preset.period)?.label}
            </span>
          </SectionTitle>

          {events.loading ? (
            <LoadingState label="Loading events" />
          ) : events.error ? (
            <ErrorState message={events.error} onRetry={events.refresh} />
          ) : eventReport ? (
            <div className="space-y-4">
              <KpiGrid cols={4}>
                <Kpi label="Events in period" value={eventReport.inPeriod} />
                <Kpi
                  label="Critical"
                  value={eventReport.bySeverity.critical}
                  tone={eventReport.bySeverity.critical > 0 ? "critical" : "ok"}
                />
                <Kpi
                  label="Warning"
                  value={eventReport.bySeverity.warning}
                  tone={eventReport.bySeverity.warning > 0 ? "warning" : "ok"}
                />
                <Kpi label="Info / OK" value={eventReport.bySeverity.info + eventReport.bySeverity.ok} tone="info" />
              </KpiGrid>

              {eventReport.byKind.length > 0 && (
                <BarChart
                  title="Events by kind"
                  data={eventReport.byKind.map((k, i) => ({
                    label: k.kind,
                    value: k.count,
                    color: CHART_COLORS[i % CHART_COLORS.length],
                  }))}
                  horizontal
                />
              )}

              {eventReport.inPeriod === 0 && (
                <Callout tone="ok">
                  No events in the {PERIOD_OPTIONS.find((p) => p.value === preset.period)?.label?.toLowerCase()}.
                </Callout>
              )}

              {/* Severity breakdown donut */}
              {eventReport.inPeriod > 0 && (
                <Donut
                  title="Events by severity"
                  data={[
                    { label: "Critical", value: eventReport.bySeverity.critical, color: "#dc2626" },
                    { label: "Warning", value: eventReport.bySeverity.warning, color: "#b45309" },
                    { label: "Info", value: eventReport.bySeverity.info, color: "#0e7490" },
                    { label: "OK", value: eventReport.bySeverity.ok, color: "#047857" },
                  ].filter((d) => d.value > 0)}
                  centerLabel="total"
                  centerValue={String(eventReport.inPeriod)}
                />
              )}

              <div className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
                Total in feed: {eventReport.total} · Unread: {eventReport.unread}
              </div>
            </div>
          ) : null}
        </section>
      )}

      {/* ---- Energy section ---- */}
      {preset.includeEnergy && (
        <section aria-labelledby="report-energy-heading">
          <SectionTitle
            right={
              energyReport?.topDevices.length ? (
                <Button
                  icon={Download}
                  variant="ghost"
                  onClick={() => {
                    const headers = ["device_id", "name", "type", "watts_live"];
                    const rows = (energyReport?.topDevices ?? []).map((d) => [
                      d.id, d.name, d.type, d.watts,
                    ]);
                    downloadCsv("report-energy.csv", toCsv(headers, rows));
                  }}
                >
                  CSV
                </Button>
              ) : undefined
            }
          >
            <span id="report-energy-heading">Energy</span>
          </SectionTitle>

          {energy.loading ? (
            <LoadingState label="Loading energy" />
          ) : energy.error ? (
            <ErrorState message={energy.error} onRetry={energy.refresh} />
          ) : !energyReport ? null : (
            <div className="space-y-4">
              <Callout tone="info">
                Live power draw and today&apos;s kWh come from the <code>/energy/summary</code> endpoint.
                Historical energy totals for the chosen period are not available from this endpoint —
                the API returns only the current day&apos;s accumulation.
              </Callout>

              <KpiGrid cols={2}>
                <Kpi
                  label="Live draw"
                  value={energyReport.liveWatts != null ? formatWatts(energyReport.liveWatts) : "—"}
                  hint="Current aggregate across all powered devices"
                />
                <Kpi
                  label="Today's consumption"
                  value={energyReport.todayKwh != null ? formatEnergy(energyReport.todayKwh) : "—"}
                  hint="Accumulated kWh since midnight (server-side)"
                />
              </KpiGrid>

              {energyReport.topDevices.length > 0 && (
                <BarChart
                  title="Live power draw by device (W)"
                  data={energyReport.topDevices.map((d, i) => ({
                    label: d.name || d.id,
                    value: d.watts,
                    color: CHART_COLORS[i % CHART_COLORS.length],
                  }))}
                  unit=" W"
                  horizontal
                />
              )}

              {energyReport.topDevices.length === 0 && (
                <EmptyState icon={FileText} title="No energy data" body="No devices are reporting live power draw." />
              )}
            </div>
          )}
        </section>
      )}

      {/* ---- Automations section ---- */}
      {preset.includeAutomations && (
        <section aria-labelledby="report-automations-heading">
          <SectionTitle
            right={
              automations.automations.length > 0 ? (
                <Button
                  icon={Download}
                  variant="ghost"
                  onClick={() =>
                    downloadCsv(
                      "report-automations.csv",
                      toCsv(AUTOMATIONS_CSV_HEADERS, automationsToCsvRows(automations.automations))
                    )
                  }
                >
                  CSV
                </Button>
              ) : undefined
            }
          >
            <span id="report-automations-heading">Automation inventory</span>
          </SectionTitle>

          {automations.loading ? (
            <LoadingState label="Loading automations" />
          ) : automations.error ? (
            <ErrorState message={automations.error} onRetry={automations.refresh} />
          ) : automations.automations.length === 0 ? (
            <EmptyState icon={FileText} title="No automations configured" />
          ) : (
            <div className="space-y-4">
              {(() => {
                const report = automationReport;
                if (!report) return null;
                return (
                  <>
                    <KpiGrid cols={4}>
                      <Kpi label="Total rules" value={report.total} />
                      <Kpi label="Enabled" value={report.enabled} tone="ok" />
                      <Kpi label="Disabled" value={report.disabled} tone={report.disabled > 0 ? "warning" : "ok"} />
                      <Kpi label="Trigger types" value={report.byTriggerType.length} />
                    </KpiGrid>

                    {report.byTriggerType.length > 0 && (
                      <BarChart
                        title="Automations by trigger type"
                        data={report.byTriggerType.map((t, i) => ({
                          label: t.type,
                          value: t.count,
                          color: CHART_COLORS[i % CHART_COLORS.length],
                        }))}
                        horizontal
                      />
                    )}

                    <div className="space-y-1.5">
                      {automations.automations.map((a) => (
                        <div
                          key={a.id}
                          className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-2.5"
                          style={{
                            background: "var(--cv-card)",
                            border: "1px solid var(--cv-border)",
                            opacity: a.enabled ? 1 : 0.65,
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
                              {a.name}
                            </div>
                            <div className="mt-0.5 text-[11px]" style={{ color: "var(--cv-muted)" }}>
                              Trigger: {a.trigger?.type ?? "unknown"}
                              {a.trigger?.deviceId ? ` · ${a.trigger.deviceId}` : ""}
                              {" → "}
                              Action: {a.action?.type ?? "unknown"}
                            </div>
                          </div>
                          <Badge tone={a.enabled ? "ok" : "neutral"}>
                            {a.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </section>
      )}

      {/* ---- Scenes section ---- */}
      {preset.includeScenes && (
        <section aria-labelledby="report-scenes-heading">
          <SectionTitle>
            <span id="report-scenes-heading">Scene inventory</span>
          </SectionTitle>

          {scenes.loading ? (
            <LoadingState label="Loading scenes" />
          ) : scenes.error ? (
            <ErrorState message={scenes.error} onRetry={scenes.refresh} />
          ) : scenes.scenes.length === 0 ? (
            <EmptyState icon={FileText} title="No scenes configured" />
          ) : (
            <div className="space-y-3">
              <KpiGrid cols={2}>
                <Kpi label="Total scenes" value={scenes.scenes.length} />
                <Kpi
                  label="Favourite scenes"
                  value={scenes.scenes.filter((s) => s.favorite).length}
                  unit={`/ ${scenes.scenes.length}`}
                />
              </KpiGrid>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {scenes.scenes.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{ background: "var(--cv-card)", border: "1px solid var(--cv-border)" }}
                  >
                    <span className="text-xl">{s.icon || "🎬"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
                        {s.name}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
                        {s.actions?.length ?? 0} action{(s.actions?.length ?? 0) !== 1 ? "s" : ""}
                      </div>
                    </div>
                    {s.favorite && (
                      <Badge tone="accent">★</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Data source footnote */}
      <div
        className="rounded-2xl px-4 py-3 text-[11px]"
        style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)", border: "1px solid var(--cv-border)" }}
      >
        <b style={{ color: "var(--cv-text)" }}>Data sources & limits</b> — Fleet, automations and
        scenes reflect the current API snapshot. Events are filtered client-side from up to 500 fetched
        rows; events beyond that limit are not counted. Energy data is the live summary from the server
        (no historical breakdown by period). There is no server-side report generator; all numbers are
        arithmetic over real API data fetched in this browser session.
      </div>
    </div>
  );
}
