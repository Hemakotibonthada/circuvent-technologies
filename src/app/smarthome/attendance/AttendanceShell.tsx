"use client";
import { ClipboardCheck, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useConsoleTheme } from "../theme";
import "./attendance-theme.css";
import { useConsole } from "../ConsoleProvider";
import { useTabParam } from "../_kit/section";
import { ATTENDANCE_TABS } from "./navigation";

/** Attendance is a product, not the device console's home screen. */
export function AttendanceShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useConsole();
  const { setScheme } = useConsoleTheme();
  const [appearance, setAppearance] = useState("system");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setScheme(appearance === "system" ? (media.matches ? "dark" : "light") : appearance === "dark" ? "dark" : "light");
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [appearance, setScheme]);
  const [active] = useTabParam([...ATTENDANCE_TABS]);
  return (
    <div className="attendance-workspace min-h-screen md:flex" style={{ background: "var(--cv-bg)", color: "var(--cv-text)" }}>
      <aside className="border-b border-slate-800 bg-slate-900/80 p-4 md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col md:border-b-0 md:border-r">
        <a href="?tab=live" className="mb-6 flex items-center gap-3 rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-cyan-300">
          <span className="rounded-xl bg-cyan-400/15 p-2.5 text-cyan-300"><ClipboardCheck size={24} /></span>
          <span><strong className="block text-base">Attendance</strong><span className="text-xs text-slate-400">Workforce workspace</span></span>
        </a>
        <nav aria-label="Attendance tools" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-y-auto">
          {ATTENDANCE_TABS.map(({ id, label, icon: Icon }) => <a key={id} href={`?tab=${id}`} aria-current={active === id ? "page" : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-cyan-300 ${active === id ? "bg-cyan-400/15 font-semibold text-cyan-200" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
            <Icon size={18} aria-hidden="true" />{label}
          </a>)}
        </nav>
        <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-800 pt-4 md:mt-auto md:block">
          <label className="block px-2 py-2 text-xs">Appearance<select aria-label="Attendance appearance" value={appearance} onChange={e => setAppearance(e.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="system">Use desktop theme</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
          <a href="https://myaccount.circuvent.com/account" className="block min-w-0 rounded-lg px-2 py-2 hover:bg-slate-800"><span className="block truncate text-sm font-medium">{user?.name || user?.email}</span><span className="block text-xs text-slate-400">Manage my account</span></a>
          <button onClick={logout} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-400 hover:text-white"><LogOut size={16} />Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mb-6 border-b border-slate-800 pb-5"><p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">Attendance workspace</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">{ATTENDANCE_TABS.find(t => t.id === active)?.label}</h1><p className="mt-1 text-sm text-slate-400">Manage your sites, people and working time in one place.</p></div>
        {children}
      </main>
    </div>
  );
}
