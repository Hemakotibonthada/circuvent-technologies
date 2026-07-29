import React from "react";
import type { EnterpriseScreen } from "../registry";
import EnergyDashboard from "./EnergyDashboard";
import DeviceEnergy from "./DeviceEnergy";
import TariffSettings from "./TariffSettings";
import BudgetGoals from "./BudgetGoals";
import CostBreakdown from "./CostBreakdown";

export const ENERGY_SCREENS: EnterpriseScreen[] = [
  {
    key: "energy-dashboard",
    title: "Energy dashboard",
    subtitle: "Live demand, top consumers and budget progress",
    icon: "energy",
    group: "Energy & cost",
    render: (p) => <EnergyDashboard onBack={p.onBack} />,
  },
  {
    key: "energy-device",
    title: "Device energy",
    subtitle: "Measured kWh and numeric telemetry by device",
    icon: "meter",
    group: "Energy & cost",
    render: (p) => <DeviceEnergy onBack={p.onBack} />,
  },
  {
    key: "energy-tariff",
    title: "Tariff settings",
    subtitle: "Operator-entered rates for local estimates",
    icon: "tariff",
    group: "Energy & cost",
    admin: true,
    render: (p) => <TariffSettings onBack={p.onBack} />,
  },
  {
    key: "energy-budget",
    title: "Budget goals",
    subtitle: "Local goals and alert thresholds",
    icon: "budget",
    group: "Energy & cost",
    render: (p) => <BudgetGoals onBack={p.onBack} />,
  },
  {
    key: "energy-cost-breakdown",
    title: "Cost breakdown",
    subtitle: "Current demand by device and room",
    icon: "cost",
    group: "Energy & cost",
    render: (p) => <CostBreakdown onBack={p.onBack} />,
  },
];
