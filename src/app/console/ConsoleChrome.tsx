"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cpu, LayoutGrid, Zap, LogOut, Bell, BellOff, Loader2, Radio } from "lucide-react";
import { useConsole } from "./ConsoleProvider";
import Login from "./Login";

const NAV = [
  { href: "/console", label: "Devices", icon: LayoutGrid, exact: true },
  { href: "/console/automations", label: "Automations", icon: Zap, exact: false },
];

export default function ConsoleChrome({ children }: { children: React.ReactNode }) {
  const { ready, user, liveStatus, logout, notifyPermission, enableNotifications } = useConsole();
  const pathname = usePathname();

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0b1020" }}>
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!user) return <Login />;

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname?.startsWith(href + "/");

  return (
    <div className="min-h-screen text-slate-100" style={{ background: "#0b1020" }}>
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-white/10 bg-black/30 px-4 py-5">
        <div className="flex items-center gap-3 px-2 mb-8">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
          >
            <Cpu className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="font-extrabold leading-none">Circuvent</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-400">Console</div>
          </div>
        </div>

        <nav className="space-y-1 flex-1">
          {NAV.map((n) => {
            const active = isActive(n.href, n.exact);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active ? "text-white bg-white/10" : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
                }`}
              >
                <Icon className="h-5 w-5" style={{ color: active ? "#22d3ee" : undefined }} />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 pt-4 mt-4">
          <div className="px-3 text-xs text-slate-500 truncate">{user.email}</div>
          <button
            onClick={logout}
            className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:text-red-300 hover:bg-red-500/10 transition"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="md:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-[#0b1020]/80 px-4 md:px-8 py-3 backdrop-blur">
          <div className="flex items-center gap-2 md:hidden">
            <div
              className="h-7 w-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
            >
              <Cpu className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold">Circuvent</span>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <LiveBadge status={liveStatus} />
            {notifyPermission !== "granted" && notifyPermission !== "unsupported" && (
              <button
                onClick={enableNotifications}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                title="Enable desktop alerts"
              >
                <Bell className="h-3.5 w-3.5" /> Alerts
              </button>
            )}
            {notifyPermission === "granted" && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-400">
                <Bell className="h-3.5 w-3.5" /> Alerts on
              </span>
            )}
            {notifyPermission === "unsupported" && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
                <BellOff className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="md:hidden flex gap-2 border-b border-white/10 px-4 py-2 bg-black/20">
          {NAV.map((n) => {
            const active = isActive(n.href, n.exact);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  active ? "text-white bg-white/10" : "text-slate-400"
                }`}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
          <button onClick={logout} className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-400">
            <LogOut className="h-4 w-4" />
          </button>
        </nav>

        <main className="px-4 md:px-8 py-6 max-w-6xl mx-auto">{children}</main>
      </div>
    </div>
  );
}

function LiveBadge({ status }: { status: "connecting" | "live" | "offline" }) {
  const map = {
    live: { color: "#22c55e", label: "Live", pulse: true },
    connecting: { color: "#f59e0b", label: "Connecting", pulse: true },
    offline: { color: "#64748b", label: "Reconnecting", pulse: false },
  } as const;
  const s = map[status];
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-300">
      <Radio className="h-3.5 w-3.5" style={{ color: s.color }} />
      <span className="relative flex h-2 w-2">
        {s.pulse && (
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
            style={{ background: s.color }}
          />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: s.color }} />
      </span>
      {s.label}
    </span>
  );
}
