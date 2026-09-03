import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Application Insights | Circuvent",
  description:
    "Circuvent Application Insights — latency, failures, usage and live telemetry.",
  robots: "noindex, nofollow",
};

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
