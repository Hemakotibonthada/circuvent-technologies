"use client";

import { Activity, BarChart2, Bell, Database, FileText, Sparkles } from "lucide-react";
import { SectionShell } from "../_kit/section";
import type { TabDef } from "../_kit/primitives";
import { ActivityPanel } from "./ActivityPanel";
import { LatencyPanel } from "./LatencyPanel";
import { TelemetryPanel } from "./TelemetryPanel";
import { ReportsPanel } from "./ReportsPanel";
import { AnalysisPanel } from "./AnalysisPanel";
import { AlertsPanel } from "./AlertsPanel";

const TABS: TabDef[] = [
  // Alerts first: it is the only tab that answers "is anything wrong right
  // now" without the reader having to interpret anything.
  { id: "alerts", label: "Alerts", icon: Bell },
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
      subtitle="Alerts that persist between checks, automated analysis, events, command latency, raw telemetry, and fleet reporting."
      tabs={TABS}
      panels={{
        alerts: () => <AlertsPanel />,
        analysis: () => <AnalysisPanel />,
        activity: () => <ActivityPanel />,
        latency: () => <LatencyPanel />,
        telemetry: () => <TelemetryPanel />,
        reports: () => <ReportsPanel />,
      }}
    />
  );
}
