"use client";

import { useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { useFleet, useIsAdmin, useAdminHealth, useControlPlaneProbe } from "../_data/hooks";
import { describeBrokerCert } from "../admin/_lib/broker-cert";
import {
  healthScore,
  getThresholds,
  saveThresholds,
  type HealthLevel,
} from "@/lib/smarthome-diagnostics";
import {
  Badge,
  Button,
  Callout,
  ErrorState,
  Field,
  Kpi,
  KpiGrid,
  LoadingState,
  Meter,
  NumberInput,
  RelativeTime,
  SEVERITY,
  SectionTitle,
  SeverityBadge,
  StatusDot,
} from "../_kit/primitives";
import { deviceMeta } from "../DeviceControls";
import type { Severity } from "../_kit/primitives";

/** Maps the diagnostics HealthLevel to a kit Severity for tone props. */
function toSeverity(level: HealthLevel): Severity {
  return level === "good" ? "ok" : level;
}

/** Human-readable offline duration derived from last_seen. */
function offlineDuration(last_seen: string | null | undefined): string {
  if (!last_seen) return "Never seen";
  const secs = Math.round((Date.now() - new Date(last_seen).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

export function HealthPanel() {
  const fleet = useFleet();
  const probe = useControlPlaneProbe(30_000, 40);
  const { isAdmin, checked } = useIsAdmin();
  const adminHealth = useAdminHealth(isAdmin);

  // Thresholds are locally stored — must be labelled as such in the UI.
  const [thresholds, setThresholds] = useState(getThresholds);
  const [editingThresholds, setEditingThresholds] = useState(false);

  if (fleet.loading) return <LoadingState label="Loading health data" />;
  if (fleet.error) return <ErrorState message={fleet.error} onRetry={fleet.refresh} />;

  const scored = fleet.devices
    .map((d) => ({ device: d, health: healthScore(d, thresholds) }))
    .sort((a, b) => {
      const rank: Record<HealthLevel, number> = { critical: 0, warning: 1, good: 2 };
      return rank[a.health.level] - rank[b.health.level] || a.device.name.localeCompare(b.device.name);
    });

  const critical = scored.filter((s) => s.health.level === "critical").length;
  const warnings = scored.filter((s) => s.health.level === "warning").length;
  const stale = fleet.devices.filter((d) => {
    if (!d.online || !d.last_seen) return false;
    return (Date.now() - new Date(d.last_seen).getTime()) / 60_000 > thresholds.staleMinutes;
  }).length;

  const lastMs = probe.stats.last?.ms ?? null;
  const cert = describeBrokerCert(adminHealth.health?.brokerCert);
  const certTone = cert.level === "expired" ? "critical" : cert.level === "expiring" ? "warning" : cert.level === "unknown" ? "info" : "ok";
  const rttColor = (ms: number | null) =>
    ms == null
      ? "var(--cv-muted)"
      : ms < 400
        ? SEVERITY.ok.fg
        : ms < 1200
          ? SEVERITY.warning.fg
          : SEVERITY.critical.fg;

  return (
    <div className="space-y-6">
      {/* Fleet-wide KPIs */}
      <KpiGrid cols={4}>
        <Kpi label="Online" value={fleet.online} tone="ok" />
        <Kpi
          label="Offline"
          value={fleet.offline}
          tone={fleet.offline > 0 ? "warning" : "ok"}
        />
        <Kpi
          label="Critical"
          value={critical}
          tone={critical > 0 ? "critical" : "ok"}
        />
        <Kpi
          label="Stale"
          value={stale}
          hint={`>${thresholds.staleMinutes}m no update`}
          tone={stale > 0 ? "warning" : "ok"}
        />
      </KpiGrid>

      {/* Control-plane reachability probe */}
      <div className="cv-card rounded-2xl p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-[17px] font-semibold" style={{ color: "var(--cv-text)" }}
          >
            Control plane RTT
          </h3>
          <Button
            icon={RefreshCw}
            onClick={() => probe.probe()}
            busy={probe.busy}
            variant="secondary"
          >
            Probe now
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              { label: "Last", ms: lastMs },
              { label: "p50", ms: probe.stats.p50 },
              { label: "p95", ms: probe.stats.p95 },
              { label: "Avg", ms: probe.stats.avg },
            ] as { label: string; ms: number | null }[]
          ).map(({ label, ms }) => (
            <div key={label}>
              <div
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: "var(--cv-muted)" }}
              >
                {label}
              </div>
              <div
                className="mt-1 text-xl font-extrabold tabular-nums"
                style={{ color: rttColor(ms) }}
              >
                {ms == null ? "—" : `${ms}ms`}
              </div>
            </div>
          ))}
        </div>
        {probe.stats.failures > 0 && (
          <div className="mt-3">
            <SeverityBadge severity="critical">
              {probe.stats.failures} probe failure{probe.stats.failures !== 1 ? "s" : ""}
            </SeverityBadge>
          </div>
        )}
        <div
          className="mt-3 text-[11px]"
          style={{ color: "var(--cv-muted)" }}
        >
          {probe.stats.count} sample{probe.stats.count !== 1 ? "s" : ""} recorded this session
        </div>
      </div>

      {/* Admin infrastructure health (only shown when the API confirms admin access) */}
      {isAdmin && checked && adminHealth.health && (
        <div className="cv-card rounded-2xl p-4 sm:p-5">
          <h3 className="mb-3 text-[17px] font-semibold" style={{ color: "var(--cv-text)" }}
          >
            Infrastructure (admin)
          </h3>
          {/* Renewal has a lead time, so the useful moment to say this is weeks
              before the date. Same wording as the fleet console and the phone —
              the judgement has one owner in admin/_lib/broker-cert.ts. */}
          {cert.urgent && (
            <div className="mb-3">
              <Callout tone={cert.level === "expired" ? "critical" : "warning"} title="Broker certificate">
                {cert.advice}
              </Callout>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                { label: "MQTT", ok: adminHealth.health.mqtt },
                { label: "Database", ok: adminHealth.health.db },
              ] as { label: string; ok: boolean }[]
            ).map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-2">
                <StatusDot online={ok} pulse={false} />
                <span className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
                  {label}
                </span>
                <Badge tone={ok ? "ok" : "critical"}>{ok ? "OK" : "Down"}</Badge>
              </div>
            ))}
            <div className="flex items-center gap-2">
              {/* The broker is up whatever the certificate says, so the dot
                  tracks the broker and only the badge carries the expiry. */}
              <StatusDot online={cert.level !== "expired"} pulse={false} />
              <span className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
                Certificate
              </span>
              <Badge tone={certTone}>{cert.detail}</Badge>
            </div>
            <div className="col-span-2 text-sm" style={{ color: "var(--cv-muted)" }}>
              Uptime:{" "}
              <span className="font-semibold" style={{ color: "var(--cv-text)" }}>
                {Math.floor(adminHealth.health.uptimeSec / 3600)}h{" "}
                {Math.floor((adminHealth.health.uptimeSec % 3600) / 60)}m
              </span>{" "}
              · Node: <code className="font-mono text-xs">{adminHealth.health.node}</code>
            </div>
          </div>
        </div>
      )}

      {/* Health thresholds — stored locally, must be labelled */}
      <Callout tone="info" title="Locally stored settings">
        Health thresholds below are saved in this browser only and are not synced to the
        control plane.
      </Callout>

      <div className="cv-card rounded-2xl p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-[17px] font-semibold" style={{ color: "var(--cv-text)" }}
          >
            Health thresholds
          </h3>
          {editingThresholds ? (
            <Button
              variant="primary"
              onClick={() => {
                saveThresholds(thresholds);
                setEditingThresholds(false);
              }}
            >
              Save
            </Button>
          ) : (
            <Button onClick={() => setEditingThresholds(true)}>Edit</Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Weak signal threshold (dBm)"
            hint="Devices at or below this RSSI are flagged as weak signal"
          >
            <NumberInput
              value={thresholds.weakSignalDbm}
              onChange={(v) => setThresholds({ ...thresholds, weakSignalDbm: v })}
              disabled={!editingThresholds}
              step={5}
            />
          </Field>
          <Field
            label="Stale telemetry threshold (minutes)"
            hint="Online devices with no update beyond this window are flagged as stale"
          >
            <NumberInput
              value={thresholds.staleMinutes}
              onChange={(v) => setThresholds({ ...thresholds, staleMinutes: v })}
              disabled={!editingThresholds}
              min={1}
            />
          </Field>
        </div>
      </div>

      {/* Per-device health list */}
      <SectionTitle>Fleet health</SectionTitle>

      {scored.length === 0 ? (
        <div
          className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center"
          style={{ borderColor: "var(--cv-border)" }}
        >
          <WifiOff className="mb-3 h-7 w-7" style={{ color: "var(--cv-muted)" }} />
          <span style={{ color: "var(--cv-muted)" }}>No devices to evaluate</span>
        </div>
      ) : (
        <div className="space-y-2">
          {scored.map(({ device, health }) => {
            const meta = deviceMeta(device.type);
            const Icon = meta.icon;
            const severity = toSeverity(health.level);
            return (
              <div key={device.id} className="cv-card rounded-xl p-3.5">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background: `color-mix(in srgb, ${meta.accent} 18%, transparent)`,
                    }}
                  >
                    <Icon className="h-4 w-4" style={{ color: meta.accent }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="font-semibold"
                        style={{ color: "var(--cv-text)" }}
                      >
                        {device.name}
                      </span>
                      <SeverityBadge severity={severity}>
                        {health.level}
                      </SeverityBadge>
                    </div>
                    {health.reasons.length > 0 && (
                      <div
                        className="mt-0.5 text-xs"
                        style={{ color: "var(--cv-muted)" }}
                      >
                        {health.reasons.join(" · ")}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className="text-[10px] font-bold tabular-nums"
                      style={{ color: SEVERITY[severity].fg }}
                    >
                      {health.score}/100
                    </span>
                    <div className="w-20">
                      <Meter value={health.score} tone={severity} showValue={false} />
                    </div>
                  </div>
                </div>
                {!device.online && (
                  <div
                    className="mt-2 flex items-center gap-1.5 text-[11px]"
                    style={{ color: "var(--cv-muted)" }}
                  >
                    <WifiOff className="h-3 w-3 shrink-0" />
                    Offline since:{" "}
                    <span className="font-semibold">
                      {offlineDuration(device.last_seen)}
                    </span>
                    {device.last_seen && (
                      <span>
                        {" "}
                        (<RelativeTime iso={device.last_seen} />)
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
