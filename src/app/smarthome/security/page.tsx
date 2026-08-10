"use client";

import { Camera, Car, KeyRound, Shield, ShieldAlert } from "lucide-react";
import { SectionShell } from "../_kit/section";
import { ToastHost } from "../_kit/overlays";
import { AlertsPanel } from "./AlertsPanel";
import { AccessPanel } from "./AccessPanel";
import { CamerasPanel } from "./CamerasPanel";
import { ModesPanel } from "./ModesPanel";
import { VehiclesPanel } from "./VehiclesPanel";

const TABS = [
  { id: "alerts", label: "Alerts", icon: ShieldAlert },
  { id: "access", label: "Access", icon: KeyRound },
  { id: "cameras", label: "Cameras", icon: Camera },
  { id: "vehicles", label: "Vehicles", icon: Car },
  { id: "modes", label: "Modes", icon: Shield },
] as const;

export default function SecurityPage() {
  return (
    <ToastHost>
      <SectionShell
        eyebrow="Smarthome"
        title="Security"
        subtitle="Event stream · access control · cameras · vehicles · modes"
        tabs={[...TABS]}
        panels={{
          alerts: () => <AlertsPanel />,
          access: () => <AccessPanel />,
          cameras: () => <CamerasPanel />,
          vehicles: () => <VehiclesPanel />,
          modes: () => <ModesPanel />,
        }}
      />
    </ToastHost>
  );
}
