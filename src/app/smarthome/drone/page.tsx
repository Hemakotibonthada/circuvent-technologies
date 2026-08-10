"use client";

import { BatteryCharging, Plane, Route, ScrollText, ShieldCheck } from "lucide-react";
import { SectionShell } from "../_kit/section";
import { ToastHost } from "../_kit/overlays";
import { LivePanel } from "./LivePanel";
import { FlightsPanel } from "./FlightsPanel";
import { MissionsPanel } from "./MissionsPanel";
import { FleetPanel } from "./FleetPanel";
import { SafetyPanel } from "./SafetyPanel";

const TABS = [
  { id: "live", label: "Live", icon: Plane },
  { id: "flights", label: "Log book", icon: ScrollText },
  { id: "missions", label: "Missions", icon: Route },
  { id: "fleet", label: "Fleet", icon: BatteryCharging },
  { id: "safety", label: "Safety", icon: ShieldCheck },
] as const;

export default function DronePage() {
  return (
    <ToastHost>
      <SectionShell
        eyebrow="Smarthome"
        title="Drone"
        subtitle="Live flight · log book · missions · fleet · safety"
        tabs={[...TABS]}
        panels={{
          live: () => <LivePanel />,
          flights: () => <FlightsPanel />,
          missions: () => <MissionsPanel />,
          fleet: () => <FleetPanel />,
          safety: () => <SafetyPanel />,
        }}
      />
    </ToastHost>
  );
}
