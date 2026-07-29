"use client";

import { Bell, CalendarClock, Film, ToggleRight, Zap } from "lucide-react";
import { SectionShell } from "../_kit/section";
import type { TabDef } from "../_kit/primitives";
import RulesPanel from "./RulesPanel";
import ScenesPanel from "./ScenesPanel";
import SchedulesPanel from "./SchedulesPanel";
import SwitchSchedulesPanel from "./SwitchSchedulesPanel";
import AlertRoutingPanel from "./AlertRoutingPanel";

const TABS: TabDef[] = [
  { id: "rules", label: "Rules", icon: Zap },
  { id: "scenes", label: "Scenes", icon: Film },
  { id: "switches", label: "Switch timers", icon: ToggleRight },
  { id: "schedules", label: "Schedules", icon: CalendarClock },
  { id: "alerts", label: "Alert routing", icon: Bell },
];

export default function AutomationPage() {
  return (
    <SectionShell
      eyebrow="Smart Home"
      title="Automation"
      subtitle="Rules, scenes, per-switch timers, schedules, and notification routing"
      tabs={TABS}
      panels={{
        rules: () => <RulesPanel />,
        scenes: () => <ScenesPanel />,
        switches: () => <SwitchSchedulesPanel />,
        schedules: () => <SchedulesPanel />,
        alerts: () => <AlertRoutingPanel />,
      }}
    />
  );
}
