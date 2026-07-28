import type { Metadata } from "next";
import AdminShell from "./AdminShell";

export const metadata: Metadata = {
  title: "IoT Control Plane | Circuvent Admin",
  description: "Enterprise IoT fleet management, telemetry, OTA and platform administration.",
  robots: "noindex, nofollow",
};

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
