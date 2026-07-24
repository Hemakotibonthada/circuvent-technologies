import type { Metadata } from "next";
import { ConsoleProvider } from "./ConsoleProvider";
import ConsoleChrome from "./ConsoleChrome";
import { ConsoleThemeProvider } from "./theme";

export const metadata: Metadata = {
  title: "Device Console | Circuvent",
  description: "Monitor and control your Circuvent devices in real time.",
  robots: "noindex, nofollow",
};

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConsoleProvider>
      <ConsoleThemeProvider>
        <ConsoleChrome>{children}</ConsoleChrome>
      </ConsoleThemeProvider>
    </ConsoleProvider>
  );
}
