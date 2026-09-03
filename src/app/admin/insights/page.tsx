"use client";

import AdminProductShell from "../AdminProductShell";
import AppInsightsPanel from "../AppInsightsPanel";

export default function InsightsProductPage() {
  return (
    <AdminProductShell
      product="insights"
      title="Application Insights"
      subtitle="Request latency, failures, usage and live telemetry across Circuvent apps"
    >
      <AppInsightsPanel />
    </AdminProductShell>
  );
}
