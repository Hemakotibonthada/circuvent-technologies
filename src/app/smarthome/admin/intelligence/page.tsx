"use client";

/**
 * Fleet Intelligence — correlation across every device on the platform.
 *
 * The Overview and Fleet pages already count devices by type, room, firmware
 * and owner. Counting is not the hard part; deciding what a count *means* is.
 * This page runs `analyseFleet()` over the same live `/admin/devices` payload
 * and reports correlations an operator can act on:
 *
 *   - every device at one site down together  -> that site's connectivity
 *   - one firmware failing far above baseline -> a bad release, roll it back
 *   - devices "online" but silent             -> broker last-will not firing
 *
 * There is no language model here. Every figure is arithmetic over the live
 * payload, and each finding carries the evidence it fired on so an operator can
 * check the reasoning rather than trust a generated sentence.
 */

import { useMemo } from "react";
import {
  Sparkles, RefreshCw, TriangleAlert, ShieldCheck, Radar, WifiOff,
  Clock, CircleHelp, Info,
} from "lucide-react";
import { analyseFleet } from "@/lib/ai/fleet";
import type { Finding, Severity } from "@/lib/ai/analysis";
import { useAdminDevices } from "../_lib/api";
import {
  Panel, PageHeader, StatCard, Badge, Btn, SectionTitle, ResourceGate,
  EmptyState, StaggerGrid, StaggerItem, type Tone,
} from "../_ui";
import { relativeTime } from "../_lib/format";

const SEV_TONE: Record<Severity, Tone> = { critical: "red", warning: "amber", info: "blue" };
const SEV_ICON: Record<Severity, typeof Info> = {
  critical: TriangleAlert,
  warning: TriangleAlert,
  info: Info,
};
const SEV_TEXT: Record<Severity, string> = {
  critical: "text-rose-400",
  warning: "text-amber-400",
  info: "text-sky-400",
};

export default function FleetIntelligencePage() {
  const devicesRes = useAdminDevices();
  const devices = useMemo(() => devicesRes.data ?? [], [devicesRes.data]);

  // Pure function over the live payload — recomputed whenever the poll returns.
  const analysis = useMemo(() => analyseFleet(devices), [devices]);

  const critical = analysis.findings.filter((f) => f.severity === "critical").length;
  const onlinePct = analysis.counts.total
    ? Math.round((analysis.counts.online / analysis.counts.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Sparkles className="h-5 w-5" />}
        title="Fleet Intelligence"
        subtitle="Automated correlation across the fleet. Computed from live control-plane data — no model, no estimates."
        actions={
          <div className="flex items-center gap-3">
            {devicesRes.updatedAt > 0 && (
              <span className="text-xs text-slate-500">
                Updated {relativeTime(new Date(devicesRes.updatedAt).toISOString())}
              </span>
            )}
            <Btn onClick={devicesRes.reload} variant="ghost">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Btn>
          </div>
        }
      />

      <ResourceGate
        loading={devicesRes.loading}
        error={devicesRes.error}
        unauthorized={devicesRes.unauthorized}
        onRetry={devicesRes.reload}
        isEmpty={devices.length === 0}
        empty={
          <EmptyState
            icon={<Radar className="h-6 w-6" />}
            title="No devices registered"
            hint="Fleet correlation needs at least one device reporting to the control plane."
          />
        }
        skeletonRows={4}
      >
        <div className="space-y-6">
          <StaggerGrid className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StaggerItem>
              <StatCard
                label="Devices"
                value={analysis.counts.total}
                sub={`${analysis.counts.owners} owners`}
                icon={<Radar className="h-4 w-4" />}
                tone="brand"
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Online"
                value={`${onlinePct}%`}
                sub={`${analysis.counts.offline} offline`}
                icon={<WifiOff className="h-4 w-4" />}
                tone={onlinePct >= 90 ? "green" : onlinePct >= 70 ? "amber" : "red"}
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Online but silent"
                value={analysis.counts.stale}
                sub="Reported online, not heard from"
                icon={<Clock className="h-4 w-4" />}
                tone={analysis.counts.stale === 0 ? "green" : "amber"}
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Never reported"
                value={analysis.counts.neverSeen}
                sub={`${analysis.counts.firmwareVersions} firmware versions`}
                icon={<CircleHelp className="h-4 w-4" />}
                tone={analysis.counts.neverSeen === 0 ? "green" : "slate"}
              />
            </StaggerItem>
          </StaggerGrid>

          <Panel>
            <SectionTitle
              right={
                <div className="flex items-center gap-2">
                  {critical > 0 && <Badge tone="red">{critical} critical</Badge>}
                  <Badge tone="slate">
                    {analysis.findings.length} {analysis.findings.length === 1 ? "finding" : "findings"}
                  </Badge>
                </div>
              }
            >
              Correlated findings
            </SectionTitle>

            {analysis.findings.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="h-6 w-6" />}
                title="No fleet-level patterns detected"
                hint="Every correlation check passed against the devices currently registered."
              />
            ) : (
              <div className="space-y-3">
                {analysis.findings.map((f) => <FindingCard key={f.id} finding={f} />)}
              </div>
            )}
          </Panel>
        </div>
      </ResourceGate>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const tone = SEV_TONE[finding.severity];
  const Icon = SEV_ICON[finding.severity];
  const evidence = Object.entries(finding.evidence);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${SEV_TEXT[finding.severity]}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">{finding.title}</span>
            <Badge tone={tone}>{finding.severity}</Badge>
            {finding.deviceIds.length > 0 && (
              <Badge tone="slate">
                {finding.deviceIds.length} {finding.deviceIds.length === 1 ? "device" : "devices"}
              </Badge>
            )}
          </div>

          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{finding.detail}</p>

          {finding.suggestion && (
            <p className="mt-1.5 text-[13px] font-medium text-cyan-300">{finding.suggestion}</p>
          )}

          {evidence.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {evidence.map(([k, v]) => (
                <span
                  key={k}
                  className="rounded-md border border-white/10 bg-black/30 px-2 py-0.5 font-mono text-[11px] text-slate-400"
                >
                  {k}=<span className="text-slate-200">{String(v)}</span>
                </span>
              ))}
            </div>
          )}

          {finding.deviceIds.length > 0 && (
            <details className="mt-2.5">
              <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">
                Show affected device IDs
              </summary>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {finding.deviceIds.map((id) => (
                  <span key={id} className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                    {id}
                  </span>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
