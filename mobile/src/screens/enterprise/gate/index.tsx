/**
 * Gate access module — registry.
 *
 * Exposes the six screens that make up the gate access feature: an overview
 * dashboard, a searchable pass list, a create-pass form, a pass detail /
 * share view, a scan / redeem workstation, and an access log.
 *
 * The hub screen (`More.tsx`) imports these registrations, so extending the
 * module is a matter of adding a screen and one entry here — never touching
 * navigation code.
 */
import React from "react";
import type { EnterpriseScreen } from "../registry";
import AccessLog from "./AccessLog";
import CreatePassScreen from "./CreatePass";
import GateOverview from "./GateOverview";
import PassDetailStandalone from "./PassDetail";
import PassesList from "./PassesList";
import ScanRedeem from "./ScanRedeem";

const GROUP = "Gate access";

export const GATE_SCREENS: EnterpriseScreen[] = [
  {
    key: "gate-overview",
    title: "Gate overview",
    subtitle: "Barrier state, activity and today's passes",
    icon: "gate",
    group: GROUP,
    render: (p) => <GateOverview onBack={p.onBack} />,
  },
  {
    key: "gate-passes",
    title: "Guest passes",
    subtitle: "Search, filter and export active passes",
    icon: "pass",
    group: GROUP,
    render: (p) => <PassesList onBack={p.onBack} />,
  },
  {
    key: "gate-create",
    title: "New guest pass",
    subtitle: "Issue a time-boxed code to a visitor",
    icon: "add",
    group: GROUP,
    render: (p) => <CreatePassScreen onBack={p.onBack} />,
  },
  {
    key: "gate-detail",
    title: "Pass detail",
    subtitle: "Show, share or revoke the most recent pass",
    icon: "qrcode",
    group: GROUP,
    render: (p) => <PassDetailStandalone onBack={p.onBack} />,
  },
  {
    key: "gate-scan",
    title: "Scan pass",
    subtitle: "Read a guest QR or key in the code",
    icon: "qrScan",
    group: GROUP,
    render: (p) => <ScanRedeem onBack={p.onBack} />,
  },
  {
    key: "gate-log",
    title: "Access log",
    subtitle: "Timeline of gate events from the feed",
    icon: "history",
    group: GROUP,
    render: (p) => <AccessLog onBack={p.onBack} />,
  },
];
