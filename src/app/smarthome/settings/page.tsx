"use client";

import { Bell, Code2, Database, Palette, User, Users } from "lucide-react";
import { SectionShell } from "../_kit/section";
import type { TabDef } from "../_kit/primitives";
import AccountPanel from "./AccountPanel";
import HouseholdPanel from "./HouseholdPanel";
import AppearancePanel from "./AppearancePanel";
import NotificationsPanel from "./NotificationsPanel";
import DataPanel from "./DataPanel";
import DeveloperPanel from "./DeveloperPanel";

const TABS: TabDef[] = [
  { id: "account", label: "Account", icon: User },
  { id: "household", label: "Household", icon: Users },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "data", label: "Data & Export", icon: Database },
  { id: "developer", label: "Developer", icon: Code2 },
];

export default function SettingsPage() {
  return (
    <SectionShell
      eyebrow="Settings"
      title="Console Settings"
      subtitle="Account, household sharing, appearance, notifications, data portability and developer tools."
      tabs={TABS}
      panels={{
        account: () => <AccountPanel />,
        household: () => <HouseholdPanel />,
        appearance: () => <AppearancePanel />,
        notifications: () => <NotificationsPanel />,
        data: () => <DataPanel />,
        developer: () => <DeveloperPanel />,
      }}
    />
  );
}
