import type { Metadata } from "next";
import AdminShell from "./AdminShell";
import SsoGate from "./SsoGate";

export const metadata: Metadata = {
  title: "IoT Control Plane | Circuvent Admin",
  description: "Enterprise IoT fleet management, telemetry, OTA and platform administration.",
  robots: "noindex, nofollow",
};

/**
 * The gate wraps the shell rather than sitting inside it.
 *
 * Inside, every panel would mount and start fetching before anybody had signed
 * in -- a burst of requests that can only 401, and a fully drawn console
 * behind the sign-in card. Outside, nothing renders until access is settled.
 */
export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SsoGate>
      <AdminShell>{children}</AdminShell>
    </SsoGate>
  );
}
