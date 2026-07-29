import React from "react";
import type { EnterpriseScreen } from "../registry";
import RuleList from "./RuleList";
import RuleBuilder from "./RuleBuilder";
import SceneComposer from "./SceneComposer";
import RuleTemplates from "./RuleTemplates";
import RuleActivity from "./RuleActivity";
import SchedulePlanner from "./SchedulePlanner";

export const AUTOMATION_SCREENS: EnterpriseScreen[] = [
  { key: "auto-rules", title: "Automation rules", subtitle: "Search, edit and audit rules", icon: "rules", group: "Automation", render: (p) => <RuleList onBack={p.onBack} /> },
  { key: "auto-builder", title: "Rule builder", subtitle: "Visual one-trigger one-action builder", icon: "automate", group: "Automation", render: (p) => <RuleBuilder onBack={p.onBack} /> },
  { key: "auto-scenes", title: "Scene composer", subtitle: "Real multi-action scenes", icon: "scenes", group: "Automation", render: (p) => <SceneComposer onBack={p.onBack} /> },
  { key: "auto-templates", title: "Rule templates", subtitle: "Guided payloads from real devices", icon: "sparkles", group: "Automation", render: (p) => <RuleTemplates onBack={p.onBack} /> },
  { key: "auto-activity", title: "Rule activity", subtitle: "Observable events and app edit log", icon: "history", group: "Automation", render: (p) => <RuleActivity onBack={p.onBack} /> },
  { key: "auto-schedule", title: "Schedule planner", subtitle: "Timed rules and conflicts", icon: "schedules", group: "Automation", render: (p) => <SchedulePlanner onBack={p.onBack} /> },
];
