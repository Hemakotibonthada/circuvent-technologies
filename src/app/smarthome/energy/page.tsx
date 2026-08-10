"use client";

import { Clock, Cpu, DollarSign, Lightbulb, Zap } from "lucide-react";
import { SectionShell } from "../_kit/section";
import type { TabDef } from "../_kit/primitives";
import LivePanel from "./LivePanel";
import HistoryPanel from "./HistoryPanel";
import DevicesPanel from "./DevicesPanel";
import CostPanel from "./CostPanel";
import AdvisorPanelContainer from "./AdvisorPanelContainer";

const TABS: TabDef[] = [
  // Advice first. Every other tab answers "how much"; this one answers "so
  // what", which is the question somebody opened the page with.
  { id: "advice", label: "Save", icon: Lightbulb },
  { id: "live", label: "Live", icon: Zap },
  { id: "history", label: "History", icon: Clock },
  { id: "devices", label: "Devices", icon: Cpu },
  { id: "cost", label: "Cost", icon: DollarSign },
];

export default function EnergyPage() {
  return (
    <SectionShell
      eyebrow="Energy"
      title="Energy Monitor"
      subtitle="What your electricity costs, what to change, live load, history, and per-device detail."
      tabs={TABS}
      panels={{
        advice: () => <AdvisorPanelContainer />,
        live: () => <LivePanel />,
        history: () => <HistoryPanel />,
        devices: () => <DevicesPanel />,
        cost: () => <CostPanel />,
      }}
    />
  );
}
