"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Cpu, Home, LayoutGrid, Zap, LogOut, Bell, BellOff, Loader2, Radio, Sofa, Clapperboard, BatteryCharging, Settings, ShieldCheck, BarChart3, CloudSun, Map, LayoutDashboard, Layers, ShieldAlert, Wallet, Luggage, MapPin, Sparkles, Code2, FileText, Archive, Mic, Stethoscope, Building, Video, BellRing, Lock, Gauge, Wrench, CalendarDays, Rocket, Sun, Battery, History, ChevronDown } from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import { useConsole } from "./ConsoleProvider";
import Login from "./Login";

// Every nav item belongs to a category so the sidebar reads as collapsible
// sections instead of one long wall of 35 links.
const NAV = [
  { href: "/smarthome", label: "Home", icon: Home, exact: true, category: "home" },
  { href: "/smarthome", label: "Devices", icon: LayoutGrid, exact: true, category: "home" },
  { href: "/smarthome/command-center", label: "Command Center", icon: LayoutDashboard, exact: false, category: "home" },
  { href: "/smarthome/widgets", label: "Widgets", icon: BarChart3, exact: false, category: "home" },

  { href: "/smarthome/scenes", label: "Scenes", icon: Clapperboard, exact: false, category: "automation" },
  { href: "/smarthome/automations", label: "Automations", icon: Zap, exact: false, category: "automation" },
  { href: "/smarthome/recipes", label: "Recipes", icon: Sparkles, exact: false, category: "automation" },
  { href: "/smarthome/scene-scheduler", label: "Scene scheduler", icon: CalendarDays, exact: false, category: "automation" },
  { href: "/smarthome/quick-actions", label: "Quick actions", icon: Rocket, exact: false, category: "automation" },
  { href: "/smarthome/notification-rules", label: "Notification rules", icon: BellRing, exact: false, category: "automation" },

  { href: "/smarthome/rooms", label: "Rooms", icon: Sofa, exact: false, category: "spaces" },
  { href: "/smarthome/floorplan", label: "Floorplan", icon: Map, exact: false, category: "spaces" },
  { href: "/smarthome/properties", label: "Properties", icon: Building, exact: false, category: "spaces" },
  { href: "/smarthome/groups", label: "Device groups", icon: Layers, exact: false, category: "spaces" },

  { href: "/smarthome/energy", label: "Energy", icon: BatteryCharging, exact: false, category: "energy" },
  { href: "/smarthome/energy-budget", label: "Energy budget", icon: Wallet, exact: false, category: "energy" },
  { href: "/smarthome/solar", label: "Solar offset", icon: Sun, exact: false, category: "energy" },
  { href: "/smarthome/benchmark", label: "Benchmark", icon: Gauge, exact: false, category: "energy" },

  { href: "/smarthome/security", label: "Security", icon: ShieldAlert, exact: false, category: "security" },
  { href: "/smarthome/away-mode", label: "Away mode", icon: Luggage, exact: false, category: "security" },
  { href: "/smarthome/presence", label: "Geofencing", icon: MapPin, exact: false, category: "security" },
  { href: "/smarthome/kiosk", label: "Kiosk PIN lock", icon: Lock, exact: false, category: "security" },
  { href: "/smarthome/cameras", label: "Cameras", icon: Video, exact: false, category: "security" },

  { href: "/smarthome/weather", label: "Weather", icon: CloudSun, exact: false, category: "insights" },
  { href: "/smarthome/diagnostics", label: "Diagnostics", icon: Stethoscope, exact: false, category: "insights" },
  { href: "/smarthome/timeline", label: "Timeline", icon: History, exact: false, category: "insights" },
  { href: "/smarthome/maintenance", label: "Maintenance", icon: Wrench, exact: false, category: "insights" },
  { href: "/smarthome/lifecycle", label: "Device lifecycle", icon: Battery, exact: false, category: "insights" },
  { href: "/smarthome/firmware", label: "Firmware", icon: Cpu, exact: false, category: "insights" },

  { href: "/smarthome/assistants", label: "Voice & assistants", icon: Mic, exact: false, category: "advanced" },
  { href: "/smarthome/developer", label: "Developer", icon: Code2, exact: false, category: "advanced" },
  { href: "/smarthome/reports", label: "Reports & export", icon: FileText, exact: false, category: "advanced" },
  { href: "/smarthome/backup", label: "Backup & restore", icon: Archive, exact: false, category: "advanced" },

  { href: "/smarthome/notifications", label: "Notifications", icon: Bell, exact: false, badge: true, category: "account" },
  { href: "/smarthome/settings", label: "Settings", icon: Settings, exact: false, category: "account" },
];

const NAV_CATEGORIES: { id: string; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "automation", label: "Automation" },
  { id: "spaces", label: "Spaces" },
  { id: "energy", label: "Energy" },
  { id: "security", label: "Security & Safety" },
  { id: "insights", label: "Insights" },
  { id: "advanced", label: "Advanced" },
  { id: "account", label: "Account" },
];

let adminCache: { uid: number; admin: boolean } | null = null;

export default function ConsoleChrome({ children }: { children: React.ReactNode }) {
  const { ready, user, liveStatus, logout, notifyPermission, enableNotifications } = useConsole();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const isActive = useCallback(
    (href: string, exact: boolean) => (exact ? pathname === href : pathname === href || pathname?.startsWith(href + "/")),
    [pathname]
  );

  const loadUnread = useCallback(async () => {
    const r = await controlPlane.unreadCount();
    if (r.ok) setUnread(r.data.count ?? 0);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadUnread();
    const t = setInterval(loadUnread, 20000);
    return () => clearInterval(t);
  }, [user, loadUnread, pathname]);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    if (adminCache?.uid === user.id) {
      setIsAdmin(adminCache.admin);
      return;
    }
    let alive = true;
    controlPlane.adminMe().then((r) => {
      const admin = !!(r.ok && r.data?.admin);
      adminCache = { uid: user.id, admin };
      if (alive) setIsAdmin(admin);
    });
    return () => {
      alive = false;
    };
  }, [user]);

  // Auto-expand whichever nav category contains the current route (never
  // auto-collapses a category the user already opened).
  useEffect(() => {
    const current = NAV.find((n) => isActive(n.href, n.exact));
    if (current) {
      setExpandedCategories((prev) => (prev[current.category] ? prev : { ...prev, [current.category]: true }));
    }
  }, [pathname, isActive]);

  // The enterprise IoT admin dashboard owns the full screen with its own shell,
  // so bypass the consumer console chrome (and its login/hydration gates) for
  // /smarthome/admin. The admin shell manages its own auth/demo state, and its
  // stores are SSR-safe, so it can render immediately without a loader flash.
  const isAdminArea = pathname?.startsWith("/smarthome/admin") ?? false;
  if (isAdminArea) return <>{children}</>;

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0b1020" }}>
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!user) return <Login />;

  const navItems = isAdmin ? [...NAV, { href: "/smarthome/admin", label: "Admin", icon: ShieldCheck, exact: false, category: "account" }] : NAV;
  const toggleCategory = (id: string) => setExpandedCategories((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="min-h-screen text-slate-100 md:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex md:sticky md:top-0 md:h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-black/25 backdrop-blur-xl px-4 py-5">
        <div className="flex items-center gap-3 px-2 mb-8">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center"
            style={{ background: "var(--cv-gradient)" }}
          >
            <Cpu className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="font-extrabold leading-none">Circuvent</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-400">Console</div>
          </div>
        </div>

        <nav className="space-y-1 flex-1 overflow-y-auto pr-1">
          {NAV_CATEGORIES.map((cat) => {
            const items = navItems.filter((n) => n.category === cat.id);
            if (items.length === 0) return null;
            const isOpen = !!expandedCategories[cat.id];
            const hasActive = items.some((n) => isActive(n.href, n.exact));
            return (
              <div key={cat.id} className="mb-1">
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition"
                  style={{ color: hasActive ? "var(--cv-accent-hi)" : "#64748b" }}
                >
                  {cat.label}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="space-y-1">
                    {items.map((n) => {
                      const active = isActive(n.href, n.exact);
                      const Icon = n.icon;
                      return (
                        <Link
                          key={`${n.href}-${n.label}`}
                          href={n.href}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                            active ? "text-white bg-white/10" : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
                          }`}
                        >
                          <Icon className="h-5 w-5" style={{ color: active ? "var(--cv-accent-hi)" : undefined }} />
                          <span className="flex-1">{n.label}</span>
                          {n.badge && unread > 0 && (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: "var(--cv-accent)" }}>
                              {unread}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
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
      <div className="flex-1 min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 px-4 md:px-8 py-3 backdrop-blur-xl" style={{ background: "color-mix(in srgb, var(--cv-bg) 82%, transparent)" }}>
          <div className="flex items-center gap-2 md:hidden">
            <div
              className="h-7 w-7 rounded-lg flex items-center justify-center"
              style={{ background: "var(--cv-gradient)" }}
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
        <nav className="md:hidden flex gap-2 border-b border-white/10 px-4 py-2 bg-black/20 overflow-x-auto">
          {navItems.map((n) => {
            const active = isActive(n.href, n.exact);
            const Icon = n.icon;
            return (
              <Link
                key={`${n.href}-${n.label}`}
                href={n.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  active ? "text-white bg-white/10" : "text-slate-400"
                }`}
              >
                <Icon className="h-4 w-4" />
                {n.label}
                {n.badge && unread > 0 && <span className="text-[10px] text-cyan-300">{unread}</span>}
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
