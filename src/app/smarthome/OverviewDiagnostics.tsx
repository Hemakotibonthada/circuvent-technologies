"use client";

/**
 * Overview diagnostics — the computed state of the home, on the landing page.
 *
 * This is deliberately separate from "Needs attention" above it, because the
 * two answer different questions:
 *
 *   Needs attention  — things that *happened*, read from the event log.
 *   Diagnostics      — things that are *true right now*, computed from readings.
 *
 * An event fires once and scrolls away. A standby drain, a schedule conflict or
 * a device that stopped reporting produces no event at all, so before this
 * existed those findings were only visible to someone who thought to open
 * Insights → Analysis. Most people never do, which made the most useful part of
 * the analysis effectively invisible.
 *
 * No model is involved: every line here is arithmetic from `analysis.ts`.
 */

import Link from "next/link";
import { useMemo } from "react";
import { Stethoscope, ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import { useHomeAnalysis } from "@/lib/ai/useHomeAnalysis";
import {
  Surface, SectionTitle, SeverityBadge, Skeleton, Button, SEVERITY_RANK,
} from "./_kit/primitives";

/** Only the few most severe belong on an overview; the rest live in the section. */
const MAX_SHOWN = 4;

export default function OverviewDiagnostics() {
  const { analysis, loading, error, needsAuth, reload } = useHomeAnalysis();

  const findings = useMemo(() => {
    if (!analysis) return [];
    return [...analysis.findings].sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    );
  }, [analysis]);

  // Not signed in is the console's problem to report, not this panel's — it
  // would just be a second copy of the same message on the same screen.
  if (needsAuth) return null;

  if (loading && !analysis) {
    return (
      <Surface>
        <SectionTitle>Diagnostics</SectionTitle>
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </Surface>
    );
  }

  if (error) {
    return (
      <Surface>
        <SectionTitle
          right={<Button onClick={reload} icon={RefreshCw}>Retry</Button>}
        >
          Diagnostics
        </SectionTitle>
        <p className="text-[13px]" style={{ color: "var(--cv-muted)" }}>{error}</p>
      </Surface>
    );
  }

  if (!analysis) return null;

  const shown = findings.slice(0, MAX_SHOWN);
  const hidden = findings.length - shown.length;

  return (
    <Surface>
      <SectionTitle
        right={
          <Link
            href="/smarthome/insights?tab=analysis"
            className="inline-flex items-center gap-1 text-[13px] font-semibold"
            style={{ color: "var(--cv-accent-hi)" }}
          >
            Full analysis <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      >
        <span className="inline-flex items-center gap-2">
          <Stethoscope className="h-4 w-4" style={{ color: "var(--cv-accent-hi)" }} />
          Diagnostics
        </span>
      </SectionTitle>

      {findings.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-3"
          style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)" }}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--cv-ok, #4ade80)" }} />
          <div className="min-w-0">
            <div className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
              Nothing looks wrong
            </div>
            <div className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
              Every check passed against the telemetry currently available.
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((f) => (
            <div
              key={f.id}
              className="rounded-xl px-3.5 py-3"
              style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
                  {f.title}
                </span>
                <SeverityBadge severity={f.severity} />
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px]" style={{ color: "var(--cv-muted)" }}>
                {f.detail}
              </p>
              {f.suggestion && (
                <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--cv-accent-hi)" }}>
                  {f.suggestion}
                </p>
              )}
            </div>
          ))}

          {hidden > 0 && (
            <Link
              href="/smarthome/insights?tab=analysis"
              className="block rounded-xl px-3.5 py-2.5 text-center text-[12px] font-semibold"
              style={{
                background: "var(--cv-input-bg)",
                border: "1px solid var(--cv-border)",
                color: "var(--cv-muted)",
              }}
            >
              {hidden} more {hidden === 1 ? "finding" : "findings"}
            </Link>
          )}
        </div>
      )}
    </Surface>
  );
}
