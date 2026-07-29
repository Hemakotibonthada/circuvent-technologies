"use client";

import { Clock, Cpu, DollarSign, Zap } from "lucide-react";
import { SectionShell } from "../_kit/section";
import type { TabDef } from "../_kit/primitives";
import LivePanel from "./LivePanel";
import HistoryPanel from "./HistoryPanel";
import DevicesPanel from "./DevicesPanel";
import CostPanel from "./CostPanel";

const TABS: TabDef[] = [
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
      subtitle="Live load, historical consumption, per-device detail, and cost modelling."
      tabs={TABS}
      panels={{
        live: () => <LivePanel />,
        history: () => <HistoryPanel />,
        devices: () => <DevicesPanel />,
        cost: () => <CostPanel />,
      }}
    />
  );
}
