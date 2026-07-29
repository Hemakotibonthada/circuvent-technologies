import React from "react";
import type { EnterpriseScreen } from "../registry";
import FleetOverview from "./FleetOverview";
import FleetInventory from "./FleetInventory";
import FirmwareRollout from "./FirmwareRollout";
import FleetBroadcast from "./FleetBroadcast";
import ProvisionDevice from "./ProvisionDevice";

export const FLEET_SCREENS: EnterpriseScreen[] = [
  { key: "fleet-overview", title: "Fleet overview", subtitle: "Control-plane health and firmware distribution", icon: "fleet", group: "Fleet operations", admin: true, render: (p) => <FleetOverview onBack={p.onBack} /> },
  { key: "fleet-inventory", title: "Fleet inventory", subtitle: "Search, filter and bulk-control devices", icon: "table", group: "Fleet operations", admin: true, render: (p) => <FleetInventory onBack={p.onBack} /> },
  { key: "fleet-firmware-rollout", title: "Firmware rollout", subtitle: "Staged OTA dispatch by cohort", icon: "otaUpdate", group: "Fleet operations", admin: true, render: (p) => <FirmwareRollout onBack={p.onBack} /> },
  { key: "fleet-broadcast", title: "Fleet broadcast", subtitle: "Fan-out safe commands to a cohort", icon: "broadcast", group: "Fleet operations", admin: true, render: (p) => <FleetBroadcast onBack={p.onBack} /> },
  { key: "fleet-provision-device", title: "Provision device", subtitle: "Mint identities or onboarding tokens", icon: "provision", group: "Fleet operations", admin: true, render: (p) => <ProvisionDevice onBack={p.onBack} /> },
];

export default FLEET_SCREENS;
