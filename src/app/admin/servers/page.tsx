"use client";

import AdminProductShell from "../AdminProductShell";
import MonitoringPanel from "../MonitoringPanel";

export default function ServersProductPage() {
  return (
    <AdminProductShell
      product="servers"
      title="Servers & Infrastructure"
      subtitle="Node health, system telemetry, scheduled jobs and live visitors"
    >
      <MonitoringPanel />
    </AdminProductShell>
  );
}
