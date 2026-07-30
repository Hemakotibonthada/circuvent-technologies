"use client";

// Renders the deterministic home analysis.
//
// Deliberately not a chat. This is the same data the assistant reasons over,
// shown directly: no model in the path, so it works with no AI provider
// configured and cannot phrase a finding into something it is not.

import { AlertTriangle, AlertCircle, Info, Activity, RefreshCw, Zap } from "lucide-react";
import type { Finding, Severity } from "@/lib/ai/analysis";
import { useHomeAnalysis } from "@/lib/ai/useHomeAnalysis";

const TONE: Record<Severity, { color: string; bg: string; Icon: typeof AlertTriangle }> = {
  critical: { color: "#f87171", bg: "rgba(248,113,113,0.12)", Icon: AlertCircle },
  warning: { color: "#fbbf24", bg: "rgba(251,191,36,0.12)", Icon: AlertTriangle },
  info: { color: "#60a5fa", bg: "rgba(96,165,250,0.12)", Icon: Info },
};

export default function InsightsPanel() {
  const { analysis, loading, error, reload } = useHomeAnalysis();

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "var(--cv-input-bg)", border: "1px solid var(--cv-border)" }}
    >
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4" style={{ color: "var(--cv-accent-hi)" }} />
        <span
          className="flex-1 text-[11px] font-bold uppercase tracking-wider"
          style={{ color: "var(--cv-accent-hi)" }}
        >
          Home insights
        </span>
        <button
          onClick={reload}
          disabled={loading}
          aria-label="Refresh insights"
          className="flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-40"
          style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)", color: "var(--cv-muted)" }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="rounded-xl px-3 py-2.5 text-sm" style={{ background: "rgba(220,38,38,0.1)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {!error && analysis && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Devices" value={String(analysis.counts.total)} />
            <Stat label="Online" value={String(analysis.counts.online)} tone={analysis.counts.online > 0 ? "#4ade80" : undefined} />
            <Stat label="Offline" value={String(analysis.counts.offline)} tone={analysis.counts.offline > 0 ? "#f87171" : undefined} />
          </div>

          {analysis.energy.meteredDevices > 0 && (
            <div
              className="rounded-xl px-3 py-2.5"
              style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)" }}
            >
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5" style={{ color: "#fbbf24" }} />
                <span className="text-sm font-bold" style={{ color: "var(--cv-text)" }}>
                  {analysis.energy.totalWatts} W now
                </span>
                <span className="text-xs" style={{ color: "var(--cv-muted)" }}>
                  ≈{analysis.energy.estimatedKWhPerDay} kWh/day if steady
                </span>
              </div>
              {analysis.energy.topConsumers.length > 0 && (
                <div className="mt-2 space-y-1">
                  {analysis.energy.topConsumers.slice(0, 3).map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate" style={{ color: "var(--cv-muted)" }}>{c.name}</span>
                      <span style={{ color: "var(--cv-text)" }}>{c.watts} W</span>
                      <span className="w-10 text-right" style={{ color: "var(--cv-muted)" }}>{c.sharePct}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {analysis.findings.length === 0 ? (
            <div className="rounded-xl px-3 py-2.5 text-sm" style={{ background: "rgba(74,222,128,0.1)", color: "#4ade80" }}>
              Nothing looks wrong.
            </div>
          ) : (
            <div className="space-y-2">
              {analysis.findings.map((f) => <FindingRow key={f.id} finding={f} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div
      className="rounded-xl px-3 py-2 text-center"
      style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)" }}
    >
      <div className="text-lg font-extrabold" style={{ color: tone ?? "var(--cv-text)" }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--cv-muted)" }}>{label}</div>
    </div>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const { color, bg, Icon } = TONE[finding.severity];
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: bg, border: `1px solid ${color}33` }}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color }} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: "var(--cv-text)" }}>{finding.title}</div>
          <div className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--cv-muted)" }}>{finding.detail}</div>
          {finding.suggestion && (
            <div className="mt-1 text-xs font-medium" style={{ color }}>{finding.suggestion}</div>
          )}
        </div>
      </div>
    </div>
  );
}
