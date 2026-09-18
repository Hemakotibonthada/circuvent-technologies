"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useConsoleTheme } from "../theme";
import "./attendance-theme.css";
import { useConsole } from "../ConsoleProvider";
import { useTabParam } from "../_kit/section";
import { ATTENDANCE_TABS } from "./navigation";
import { CircuventSuiteNav } from "@/components/CircuventSuiteNav";
import { ClipboardCheck } from "lucide-react";

export const AttendanceTabContext = createContext<{
  active: string;
  setActive: (id: string) => void;
}>({
  active: "live",
  setActive: () => {},
});

export function useAttendanceTab() {
  return useContext(AttendanceTabContext);
}

/** Attendance workspace product shell with top options navigation matching workspace.circuvent.com */
export function AttendanceShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useConsole();
  const { setScheme } = useConsoleTheme();
  const [appearance, setAppearance] = useState("system");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () =>
      setScheme(
        appearance === "system"
          ? media.matches
            ? "dark"
            : "light"
          : appearance === "dark"
          ? "dark"
          : "light"
      );
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [appearance, setScheme]);

  const [active, setActive] = useTabParam([...ATTENDANCE_TABS]);

  const suiteTabs = ATTENDANCE_TABS.map(({ id, label, icon: Icon }) => ({
    id,
    label,
    icon: Icon,
    href: `/smarthome/attendance?tab=${id}`,
    onClick: () => setActive(id),
  }));

  const activeTabMeta = ATTENDANCE_TABS.find((t) => t.id === active);

  return (
    <AttendanceTabContext.Provider value={{ active, setActive }}>
      <div
        className="attendance-workspace min-h-screen flex flex-col"
        style={{ background: "var(--cv-bg)", color: "var(--cv-text)" }}
      >
      {/* ─── CV-365 Top Options Navigation Header ─── */}
      <CircuventSuiteNav
        currentApp={{
          name: "Attendance",
          subtitle: "Circuvent",
          icon: ClipboardCheck,
          homeHref: "/smarthome/attendance?tab=live",
          badge: "Workforce",
        }}
        tabs={suiteTabs}
        activeTab={active}
        onTabChange={setActive}
        user={
          user
            ? {
                name: user.name || user.email?.split("@")[0],
                email: user.email,
                role: user.organization?.name ? `${user.organization.name} Member` : "Enterprise Staff",
              }
            : null
        }
        onLogout={logout}
        appearance={appearance}
        onAppearanceChange={setAppearance}
      />

      {/* ─── Full-Width Main Workspace Canvas ─── */}
      <main className="w-full flex-1 p-4 sm:p-6 lg:px-8 lg:py-6">
        <div className="mb-6 flex flex-col gap-1 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
              Attendance Workspace
            </span>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-medium text-slate-300">
              {activeTabMeta?.label || "Live attendance"}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
            {activeTabMeta?.label}
          </h1>
          <p className="text-xs text-slate-400">
            Manage your sites, employee roster, RFID readers and working time in one place.
          </p>
        </div>

        {children}
      </main>
    </div>
    </AttendanceTabContext.Provider>
  );
}
