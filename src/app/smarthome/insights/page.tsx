"use client";

import { Activity, BarChart2, Database, FileText } from "lucide-react";
import { SectionShell } from "../_kit/section";
import type { TabDef } from "../_kit/primitives";
import { ActivityPanel } from "./ActivityPanel";
import { LatencyPanel } from "./LatencyPanel";
import { TelemetryPanel } from "./TelemetryPanel";
import { ReportsPanel } from "./ReportsPanel";

const TABS: TabDef[] = [
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
      subtitle="Events, command latency, raw telemetry, and fleet reporting."
      tabs={TABS}
      panels={{
        activity: () => <ActivityPanel />,
        latency: () => <LatencyPanel />,
        telemetry: () => <TelemetryPanel />,
        reports: () => <ReportsPanel />,
      }}
    />
  );
}
