"use client";

import { Cpu, Heart, List, PackageOpen, PlusCircle } from "lucide-react";
import { SectionShell } from "../_kit/section";
import type { TabDef } from "../_kit/primitives";
import { FleetPanel } from "./FleetPanel";
import { ControlPanel } from "./ControlPanel";
import { HealthPanel } from "./HealthPanel";
import { FirmwarePanel } from "./FirmwarePanel";
import { OnboardingPanel } from "./OnboardingPanel";

const TABS: TabDef[] = [
  { id: "fleet", label: "Fleet", icon: List },
  { id: "control", label: "Control", icon: Cpu },
  { id: "health", label: "Health", icon: Heart },
  { id: "firmware", label: "Firmware", icon: PackageOpen },
  { id: "onboarding", label: "Onboarding", icon: PlusCircle },
];

export default function DevicesPage() {
  return (
    <SectionShell
      eyebrow="Devices"
      title="Device Management"
      subtitle="Fleet inventory, live control, health monitoring, firmware and provisioning"
      tabs={TABS}
      panels={{
        fleet: () => <FleetPanel />,
        control: () => <ControlPanel />,
        health: () => <HealthPanel />,
        firmware: () => <FirmwarePanel />,
        onboarding: () => <OnboardingPanel />,
      }}
    />
  );
}
