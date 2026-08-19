"use client";

import { useMemo } from "react";
import { Camera, Car, KeyRound, Shield, ShieldAlert } from "lucide-react";
import { SectionShell } from "../_kit/section";
import { ToastHost } from "../_kit/overlays";
import { useAnprPresence } from "../_data/hooks";
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
  /*
   * Vehicles lives here only until the account has a number-plate camera.
   *
   * Before that it is the way in — the Cameras view inside it is where an
   * ordinary camera is enrolled as an ANPR lane, so removing it outright would
   * leave no route to switching the feature on. After that, the dedicated ANPR
   * Camera section owns it, and keeping a second copy here would give one
   * screen two addresses: people bookmark whichever they found first, and the
   * two disagree about which tab they are on.
   *
   * `ConsoleChrome` filters the same tab out of the command palette using the
   * same hook, so the two cannot drift.
   */
  const { hasAnpr } = useAnprPresence();
  const tabs = useMemo(() => TABS.filter((t) => t.id !== "vehicles" || !hasAnpr), [hasAnpr]);

  return (
    <ToastHost>
      <SectionShell
        eyebrow="Smarthome"
        title="Security"
        subtitle={
          hasAnpr
            ? "Event stream · access control · cameras · modes"
            : "Event stream · access control · cameras · vehicles · modes"
        }
        tabs={[...tabs]}
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
