import React from "react";
import type { EnterpriseScreen } from "../registry";
import { SecurityCenter } from "./SecurityCenter";
import { EventLog } from "./EventLog";
import { CameraWall } from "./CameraWall";
import { AccessEvents } from "./AccessEvents";
import { IncidentResponse } from "./IncidentResponse";
import { SecurityRules } from "./SecurityRules";

export const SECURITY_SCREENS: EnterpriseScreen[] = [
  { key: "security-center", title: "Security center", subtitle: "Arming and zones", icon: "shieldLock", group: "Security", render: (p) => <SecurityCenter onBack={p.onBack} /> },
  { key: "security-events", title: "Event log", subtitle: "Audit trail", icon: "history", group: "Security", render: (p) => <EventLog onBack={p.onBack} /> },
  { key: "security-cameras", title: "Camera wall", subtitle: "Streams and controls", icon: "camera", group: "Security", render: (p) => <CameraWall onBack={p.onBack} /> },
  { key: "security-access", title: "Access events", subtitle: "Entry activity", icon: "gate", group: "Security", render: (p) => <AccessEvents onBack={p.onBack} /> },
  { key: "security-incidents", title: "Incident response", subtitle: "Local tracking", icon: "incident", group: "Security", render: (p) => <IncidentResponse onBack={p.onBack} /> },
  { key: "security-rules", title: "Security rules", subtitle: "Automations", icon: "rules", group: "Security", render: (p) => <SecurityRules onBack={p.onBack} /> },
];
