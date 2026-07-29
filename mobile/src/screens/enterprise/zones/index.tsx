import React from "react";
import type { EnterpriseScreen } from "../registry";
import { ZoneOverview } from "./ZoneOverview";
import { WaterTank } from "./WaterTank";
import { AirQuality } from "./AirQuality";
import { ClimateControl } from "./ClimateControl";
import { OccupancyInsights } from "./OccupancyInsights";
import { ZoneSettings } from "./ZoneSettings";

export const ZONES_SCREENS: EnterpriseScreen[] = [
  { key: "zone-overview", title: "Zone overview", subtitle: "Room readings and thresholds", icon: "dashboard", group: "Zones & environment", render: (p) => <ZoneOverview onBack={p.onBack} /> },
  { key: "zone-water-tank", title: "Water tanks", subtitle: "Tank levels, pumps and auto-fill", icon: "watertank", group: "Zones & environment", render: (p) => <WaterTank onBack={p.onBack} /> },
  { key: "zone-air-quality", title: "Air quality", subtitle: "AQI and pollutant history", icon: "airQuality", group: "Zones & environment", render: (p) => <AirQuality onBack={p.onBack} /> },
  { key: "zone-climate", title: "Climate control", subtitle: "HVAC setpoints and comfort", icon: "hvac", group: "Zones & environment", render: (p) => <ClimateControl onBack={p.onBack} /> },
  { key: "zone-occupancy", title: "Occupancy insights", subtitle: "Motion activity and vacancy", icon: "motion", group: "Zones & environment", render: (p) => <OccupancyInsights onBack={p.onBack} /> },
  { key: "zone-settings", title: "Zone settings", subtitle: "Rooms, thresholds and geometry", icon: "settings", group: "Zones & environment", render: (p) => <ZoneSettings onBack={p.onBack} /> },
];
