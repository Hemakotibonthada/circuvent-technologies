"use client";

import { Activity, BarChart2, Database, FileText, Sparkles } from "lucide-react";
import { SectionShell } from "../_kit/section";
import type { TabDef } from "../_kit/primitives";
import { ActivityPanel } from "./ActivityPanel";
import { LatencyPanel } from "./LatencyPanel";
import { TelemetryPanel } from "./TelemetryPanel";
import { ReportsPanel } from "./ReportsPanel";
import { AnalysisPanel } from "./AnalysisPanel";

const TABS: TabDef[] = [
  { id: "analysis", label: "Analysis", icon: Sparkles },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "latency", label: "Latency", icon: BarChart2 },
  { id: "telemetry", label: "Telemetry", icon: Database },
  { id: "reports", label: "Reports", icon: FileText },
];

export default function InsightsPage() {
  return (
    <SectionShell
      eyebrow="Console"
      title="Insights"
      subtitle="Automated analysis, events, command latency, raw telemetry, and fleet reporting."
      tabs={TABS}
      panels={{
        analysis: () => <AnalysisPanel />,
        activity: () => <ActivityPanel />,
        latency: () => <LatencyPanel />,
        telemetry: () => <TelemetryPanel />,
        reports: () => <ReportsPanel />,
      }}
    />
  );
}
