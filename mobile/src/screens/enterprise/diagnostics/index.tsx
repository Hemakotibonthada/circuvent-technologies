import React from "react";
import type { EnterpriseScreen } from "../registry";
import SystemHealth from "./SystemHealth";
import LatencyLab from "./LatencyLab";
import TelemetryInspector from "./TelemetryInspector";
import MqttReference from "./MqttReference";
import ConnectivityMap from "./ConnectivityMap";
import DiagnosticLog from "./DiagnosticLog";

export const DIAG_SCREENS: EnterpriseScreen[] = [
  { key: "diag-system-health", title: "System health", subtitle: "Control-plane health and fleet liveness", icon: "uptime", group: "Diagnostics", render: (p) => <SystemHealth onBack={p.onBack} /> },
  { key: "diag-latency-lab", title: "Latency lab", subtitle: "Real HTTP round-trip measurement", icon: "latency", group: "Diagnostics", render: (p) => <LatencyLab onBack={p.onBack} /> },
  { key: "diag-telemetry-inspector", title: "Telemetry inspector", subtitle: "Raw frames and inter-arrival gaps", icon: "packet", group: "Diagnostics", render: (p) => <TelemetryInspector onBack={p.onBack} /> },
  { key: "diag-mqtt-reference", title: "MQTT reference", subtitle: "Topic contract and HTTP command sender", icon: "mqtt", group: "Diagnostics", render: (p) => <MqttReference onBack={p.onBack} /> },
  { key: "diag-connectivity-map", title: "Connectivity map", subtitle: "Rooms, types, and live device state", icon: "topology", group: "Diagnostics", render: (p) => <ConnectivityMap onBack={p.onBack} /> },
  { key: "diag-local-log", title: "Diagnostic log", subtitle: "Local support bundle and event log", icon: "logs", group: "Diagnostics", render: (p) => <DiagnosticLog onBack={p.onBack} /> },
];
