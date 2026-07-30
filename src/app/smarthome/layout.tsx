import type { Metadata } from "next";
import { ConsoleProvider } from "./ConsoleProvider";
import ConsoleChrome from "./ConsoleChrome";
import { ConsoleThemeProvider } from "./theme";
import { CONTROL_PLANE_URL } from "@/lib/control-plane";

export const metadata: Metadata = {
  title: "Device Console | Circuvent",
  description: "Monitor and control your Circuvent devices in real time.",
  robots: "noindex, nofollow",
};

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Warm the TCP + TLS session to the control plane before the first
          command so a tap never pays DNS/handshake cost. */}
      <link rel="preconnect" href={CONTROL_PLANE_URL} crossOrigin="anonymous" />
      <link rel="dns-prefetch" href={CONTROL_PLANE_URL} />
      <ConsoleProvider>
        <ConsoleThemeProvider>
          <ConsoleChrome>{children}</ConsoleChrome>
        </ConsoleThemeProvider>
      </ConsoleProvider>
    </>
  );
}
