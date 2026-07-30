"use client";

/**
 * Analysis Panel — the deterministic home analysis, rendered in console style.
 *
 * There is no language model anywhere in this path. Every number shown here is
 * computed by src/lib/ai/analysis.ts from live control-plane data, which is why
 * this panel keeps working when no AI provider is configured.
 *
 * Each finding carries its `evidence` — the actual figures the rule fired on.
 * That is deliberate: an operator should be able to check the arithmetic rather
 * than take a generated sentence on faith. The assistant chat reasons over
 * exactly this object, so if the chat and this panel ever disagree, the chat is
 * wrong.
 */

import { useMemo } from "react";
import { Activity, RefreshCw, Zap, ShieldCheck } from "lucide-react";
import type { Finding } from "@/lib/ai/analysis";
import { useHomeAnalysis } from "@/lib/ai/useHomeAnalysis";
import {
  Button, Kpi, KpiGrid, SectionTitle, Surface, EmptyState, ErrorState,
  LoadingState, SeverityBadge, Meter, RelativeTime, SEVERITY_RANK,
  formatNumber,
} from "../_kit/primitives";
import { Donut, CHART_COLORS } from "../_kit/charts";

export function AnalysisPanel() {
  const { analysis, loading, error, needsAuth, reload } = useHomeAnalysis();

  // Highest severity first so the thing most worth acting on is at the top.
  const findings = useMemo(() => {
    if (!analysis) return [];
    return [...analysis.findings].sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    );
  }, [analysis]);

  const donut = useMemo(() => {
    if (!analysis || analysis.energy.topConsumers.length === 0) return [];
    return analysis.energy.topConsumers.slice(0, 5).map((c, i) => ({
      label: c.name,
      value: c.watts,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [analysis]);

  if (loading && !analysis) return <LoadingState label="Analysing your home" />;

  if (error) {
    return needsAuth
      ? <EmptyState title="Sign in required" body={error} icon={ShieldCheck} />
      : <ErrorState message={error} onRetry={reload} />;
  }

  if (!analysis) return <EmptyState title="No analysis yet" body="Nothing has been computed for this account." />;

  const { counts, energy } = analysis;

  return (
    <div className="space-y-5">
      <SectionTitle
        right={
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: "var(--cv-muted)" }}>
              <RelativeTime iso={analysis.generatedAt} prefix="Computed " />
            </span>
            <Button onClick={reload} icon={RefreshCw} busy={loading}>Recompute</Button>
          </div>
        }
      >
        Home analysis
      </SectionTitle>

      <KpiGrid cols={4}>
        <Kpi label="Devices" value={counts.total} icon={Activity} />
        <Kpi label="Online" value={counts.online} tone={counts.online > 0 ? "ok" : "warning"} />
        <Kpi
          label="Offline"
          value={counts.offline}
          tone={counts.offline > 0 ? "warning" : "ok"}
        />
        <Kpi
          label="Open findings"
          value={findings.length}
          tone={findings.length === 0 ? "ok" : findings[0].severity}
        />
      </KpiGrid>

      {energy.meteredDevices > 0 ? (
        <Surface>
          <SectionTitle
            right={
              <span className="text-xs" style={{ color: "var(--cv-muted)" }}>
                {energy.meteredDevices} metered {energy.meteredDevices === 1 ? "device" : "devices"}
              </span>
            }
          >
            Energy
          </SectionTitle>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <KpiGrid cols={3}>
                <Kpi label="Right now" value={formatNumber(energy.totalWatts)} unit="W" icon={Zap} />
                <Kpi
                  label="Per day"
                  value={formatNumber(energy.estimatedKWhPerDay, 2)}
                  unit="kWh"
                  hint="If current draw held steady"
                />
                <Kpi
                  label="Per month"
                  value={formatNumber(energy.estimatedKWhPerMonth, 1)}
                  unit="kWh"
                  hint="30 days at current draw"
                />
              </KpiGrid>
              <div className="space-y-2">
                {energy.topConsumers.slice(0, 5).map((c) => (
                  <Meter
                    key={c.id}
                    label={`${c.name} — ${formatNumber(c.watts)} W`}
                    value={c.sharePct}
                    unit="%"
                  />
                ))}
              </div>
            </div>
            {donut.length > 0 && (
              <div className="flex items-center justify-center">
                <Donut
                  data={donut}
                  centerLabel="Total"
                  centerValue={`${formatNumber(energy.totalWatts)} W`}
                />
              </div>
            )}
          </div>
        </Surface>
      ) : (
        <Surface>
          <SectionTitle>Energy</SectionTitle>
          <EmptyState
            title="No power readings"
            body="No device on this account reports a numeric power value, so consumption cannot be calculated."
            icon={Zap}
          />
        </Surface>
      )}

      <Surface>
        <SectionTitle
          right={
            <span className="text-xs" style={{ color: "var(--cv-muted)" }}>
              {findings.length} {findings.length === 1 ? "finding" : "findings"}
            </span>
          }
        >
          Findings
        </SectionTitle>
        {findings.length === 0 ? (
          <EmptyState
            title="Nothing looks wrong"
            body="Every check passed against the telemetry currently available."
            icon={ShieldCheck}
          />
        ) : (
          <div className="space-y-3">
            {findings.map((f) => <FindingCard key={f.id} finding={f} />)}
          </div>
        )}
      </Surface>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const evidence = Object.entries(finding.evidence);
  return (
    <div
      className="rounded-xl p-3.5"
      style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <span className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
          {finding.title}
        </span>
        {finding.deviceIds.length > 0 && (
          <span className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
            {finding.deviceIds.length} {finding.deviceIds.length === 1 ? "device" : "devices"}
          </span>
        )}
      </div>

      <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--cv-muted)" }}>
        {finding.detail}
      </p>

      {finding.suggestion && (
        <p className="mt-1.5 text-[13px] font-medium" style={{ color: "var(--cv-accent-hi)" }}>
          {finding.suggestion}
        </p>
      )}

      {evidence.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {evidence.map(([k, v]) => (
            <span
              key={k}
              className="rounded-md px-2 py-0.5 text-[11px] tabular-nums"
              style={{
                background: "var(--cv-input-bg)",
                border: "1px solid var(--cv-border)",
                color: "var(--cv-muted)",
              }}
            >
              <span style={{ opacity: 0.75 }}>{k}</span>{" "}
              <span style={{ color: "var(--cv-text)" }}>{String(v)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
