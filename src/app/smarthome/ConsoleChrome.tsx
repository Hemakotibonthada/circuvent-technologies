"use client";

/**
 * Circuvent Console — application shell.
 *
 * The previous shell exposed 36 top-level routes across 8 collapsible
 * categories, and its first two entries ("Home" and "Devices") both pointed at
 * `/smarthome` with `exact: true`, so both highlighted permanently. This
 * replaces that with 8 operator destinations (plus an admin-only ninth); the
 * depth those 36 pages carried now lives in tabs inside each section, reachable
 * in one keystroke through the command palette.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BatteryCharging,
  Bell,
  BellOff,
  ChevronRight,
  Command,
  Cpu,
  LayoutDashboard,
  Loader2,
  LogOut,
  Moon,
  MoreHorizontal,
  Plane,
  Radio,
  Settings,
  ShieldAlert,
  Video,
  ShieldCheck,
  Sofa,
  Sun,
  X,
  Zap,
} from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import { masterPower } from "@/lib/smarthome-command-map";
import { useConsole } from "./ConsoleProvider";
import { useConsoleTheme } from "./theme";
import ProfileAvatar from "./ProfileAvatar";
import Login from "./Login";
import VisitingBanner from "./VisitingBanner";
import { CommandPalette, ToastHost, useCommandPaletteHotkey, useEscape, useFocusTrap, useScrollLock, type Command as PaletteCommand } from "./_kit/overlays";
import { StatusDot } from "./_kit/primitives";
import { useFleet, useScenes } from "./_data/hooks";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof Cpu;
  exact?: boolean;
  /** Sub-views inside the section, surfaced in the command palette. */
  tabs?: { id: string; label: string }[];
  adminOnly?: boolean;
  /** Shown in the mobile bottom bar rather than the "More" sheet. */
  primary?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/smarthome", label: "Overview", icon: LayoutDashboard, exact: true, primary: true },
  {
    href: "/smarthome/devices",
    label: "Devices",
    icon: Cpu,
    primary: true,
    tabs: [
      { id: "fleet", label: "Fleet" },
      { id: "control", label: "Control" },
      { id: "health", label: "Health" },
      { id: "firmware", label: "Firmware" },
      { id: "onboarding", label: "Onboarding" },
    ],
  },
  {
    href: "/smarthome/spaces",
    label: "Spaces",
    icon: Sofa,
    tabs: [
      { id: "rooms", label: "Rooms" },
      { id: "groups", label: "Groups" },
      { id: "floorplan", label: "Floorplan" },
      { id: "sites", label: "Sites" },
    ],
  },
  {
    href: "/smarthome/automation",
    label: "Automation",
    icon: Zap,
    primary: true,
    tabs: [
      { id: "rules", label: "Rules" },
      { id: "scenes", label: "Scenes" },
      { id: "schedules", label: "Schedules" },
      { id: "alerts", label: "Alert routing" },
    ],
  },
  {
    href: "/smarthome/energy",
    label: "Energy",
    icon: BatteryCharging,
    primary: true,
    tabs: [
      { id: "live", label: "Live" },
      { id: "history", label: "History" },
      { id: "devices", label: "By device" },
      { id: "cost", label: "Cost" },
    ],
  },
  {
    href: "/smarthome/camera",
    label: "Cameras",
    icon: Video,
    primary: true,
    tabs: [
      { id: "wall", label: "Wall" },
      { id: "clips", label: "Clips" },
    ],
  },
  {
    href: "/smarthome/security",
    label: "Security",
    icon: ShieldAlert,
    tabs: [
      { id: "alerts", label: "Alerts" },
      { id: "access", label: "Access" },
      { id: "cameras", label: "Cameras" },
      { id: "vehicles", label: "Vehicles" },
      { id: "modes", label: "Modes" },
    ],
  },
  {
    href: "/smarthome/drone",
    label: "Drone",
    icon: Plane,
    tabs: [
      { id: "live", label: "Live" },
      { id: "flights", label: "Log book" },
      { id: "missions", label: "Missions" },
      { id: "fleet", label: "Fleet" },
      { id: "safety", label: "Safety" },
    ],
  },
  {
    href: "/smarthome/insights",
    label: "Insights",
    icon: BarChart3,
    tabs: [
      { id: "activity", label: "Activity" },
      { id: "latency", label: "Latency" },
      { id: "telemetry", label: "Telemetry" },
      { id: "reports", label: "Reports" },
    ],
  },
  {
    href: "/smarthome/settings",
    label: "Settings",
    icon: Settings,
    tabs: [
      { id: "account", label: "Account" },
      { id: "household", label: "Household" },
      { id: "appearance", label: "Appearance" },
      { id: "notifications", label: "Notifications" },
      { id: "data", label: "Data" },
      { id: "developer", label: "Developer" },
    ],
  },
  { href: "/smarthome/admin", label: "Admin", icon: ShieldCheck, adminOnly: true },
];

/**
 * Cached admin bit. Guarded on the cache object itself: if a stored session
 * ever lacks `id`, `adminCache?.uid === user.id` compares undefined to
 * undefined, passes, and then dereferences null — which previously took the
 * whole console down.
 */
let adminCache: { uid: number; admin: boolean } | null = null;

export default function ConsoleChrome({ children }: { children: React.ReactNode }) {
  const { ready, user } = useConsole();
  const pathname = usePathname();

  // The enterprise admin dashboard owns the full screen with its own shell and
  // its own auth/demo state, so it bypasses the consumer chrome entirely.
  if (pathname?.startsWith("/smarthome/admin")) return <>{children}</>;

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#0b1020" }}>
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
      </div>
    );
  }
  if (!user) return <Login />;

  return (
    <ToastHost>
      <ConsoleShell>{children}</ConsoleShell>
    </ToastHost>
  );
}

function ConsoleShell({ children }: { children: React.ReactNode }) {
  const { user, liveStatus, logout, notifyPermission, enableNotifications } = useConsole();
  const { scheme, setScheme } = useConsoleTheme();
  const pathname = usePathname();
  const router = useRouter();

  const [unread, setUnread] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  // This sheet is marked aria-modal but was none of the things that implies:
  // Escape did nothing, Tab walked into the page behind it, and the body kept
  // scrolling under the scrim. Reuse the same hooks Modal and Drawer use.
  useEscape(moreOpen, closeMore);
  useScrollLock(moreOpen);
  const moreTrapRef = useFocusTrap(moreOpen);

  // One shared fleet subscription for the whole console: the palette can toggle
  // any device from any screen, and every section reuses the same poll.
  const fleet = useFleet();
  const { scenes, activate } = useScenes();

  const isActive = useCallback(
    (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || (pathname?.startsWith(item.href + "/") ?? false)),
    [pathname]
  );

  const loadUnread = useCallback(async () => {
    const r = await controlPlane.unreadCount();
    if (r.ok) setUnread(r.data.count ?? 0);
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadUnread();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void loadUnread();
    }, 30_000);
    return () => clearInterval(t);
  }, [user, loadUnread, pathname]);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    if (adminCache && adminCache.uid === user.id) {
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

  useCommandPaletteHotkey(useCallback(() => setPaletteOpen(true), []));

  // Close the mobile sheet on navigation.
  useEffect(() => setMoreOpen(false), [pathname]);

  const nav = useMemo(() => NAV.filter((n) => !n.adminOnly || isAdmin), [isAdmin]);
  const current = useMemo(() => nav.find((n) => isActive(n)) ?? nav[0], [nav, isActive]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const out: PaletteCommand[] = [];
    for (const n of nav) {
      out.push({
        id: `nav:${n.href}`,
        group: "Go to",
        label: n.label,
        icon: n.icon,
        hint: n.href.replace("/smarthome", "") || "/",
        run: () => router.push(n.href),
      });
      for (const t of n.tabs ?? []) {
        out.push({
          id: `nav:${n.href}#${t.id}`,
          group: "Go to",
          label: `${n.label} › ${t.label}`,
          icon: n.icon,
          keywords: `${n.label} ${t.label}`,
          run: () => router.push(`${n.href}?tab=${t.id}`),
        });
      }
    }
    for (const d of fleet.devices) {
      const mp = masterPower(d);
      if (mp) {
        out.push({
          id: `dev:toggle:${d.id}`,
          group: "Devices",
          label: `${mp.on ? "Turn off" : "Turn on"} ${d.name}`,
          hint: d.room || d.type,
          icon: Cpu,
          keywords: `${d.name} ${d.type} ${d.room ?? ""} power toggle`,
          run: () => void fleet.cmd.send(d, mp.cmd(!mp.on)),
        });
      }
      out.push({
        id: `dev:open:${d.id}`,
        group: "Devices",
        label: `Open ${d.name}`,
        hint: d.online ? "online" : "offline",
        icon: Cpu,
        keywords: `${d.name} ${d.id} ${d.type}`,
        run: () => router.push(`/smarthome/device/${encodeURIComponent(d.id)}`),
      });
    }
    for (const s of scenes) {
      out.push({
        id: `scene:${s.id}`,
        group: "Scenes",
        label: `Activate ${s.name}`,
        icon: Zap,
        keywords: `scene ${s.name}`,
        run: () => void activate(s.id),
      });
    }
    out.push(
      {
        id: "act:scheme",
        group: "Actions",
        label: scheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        icon: scheme === "dark" ? Sun : Moon,
        run: () => setScheme(scheme === "dark" ? "light" : "dark"),
      },
      { id: "act:refresh", group: "Actions", label: "Refresh fleet", icon: Radio, run: () => void fleet.refresh() },
      { id: "act:logout", group: "Actions", label: "Sign out", icon: LogOut, run: logout }
    );
    return out;
  }, [nav, fleet, scenes, activate, router, scheme, setScheme, logout]);

  const primary = nav.filter((n) => n.primary);
  const secondary = nav.filter((n) => !n.primary);

  return (
    <div className="min-h-screen md:flex" style={{ color: "var(--cv-text)" }}>
      {/* ------------------------------------------------ desktop sidebar -- */}
      <aside
        className="cv-material hidden w-64 shrink-0 flex-col px-3 py-5 md:sticky md:top-0 md:flex md:h-screen"
        style={{ borderRight: "1px solid var(--cv-border)" }}
      >
        <Link href="/smarthome" className="mb-6 flex items-center gap-3 px-2">
          <span
            className="flex h-10 w-10 items-center justify-center"
            style={{ background: "var(--cv-gradient)", borderRadius: "var(--cv-r-control)" }}
          >
            <Cpu className="h-5 w-5 text-white" />
          </span>
          <span>
            <span className="block text-[17px] font-bold leading-tight tracking-[-0.02em]">Circuvent</span>
            <span className="block text-[13px] font-medium leading-tight" style={{ color: "var(--cv-muted)" }}>
              Home
            </span>
          </span>
        </Link>

        <button
          onClick={() => setPaletteOpen(true)}
          className="mb-5 flex min-h-10 w-full items-center gap-2.5 px-3 text-[14px] transition hover:brightness-110"
          style={{
            background: "var(--cv-input-bg)",
            border: "1px solid var(--cv-border)",
            color: "var(--cv-muted)",
            borderRadius: "var(--cv-r-control)",
          }}
        >
          <Command className="h-4 w-4" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: "var(--cv-card-hi)" }}>
            ⌘K
          </kbd>
        </button>

        <nav className="flex-1 space-y-0.5 overflow-y-auto pr-1">
          {nav.map((n) => {
            const active = isActive(n);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className="flex min-h-10 items-center gap-3 px-3 text-[15px] font-medium transition"
                style={{
                  background: active ? "color-mix(in srgb, var(--cv-accent) 15%, transparent)" : "transparent",
                  color: active ? "var(--cv-accent-hi)" : "var(--cv-muted)",
                  borderRadius: "var(--cv-r-control)",
                }}
              >
                <Icon className="h-[19px] w-[19px]" />
                <span className="flex-1">{n.label}</span>
                {n.href === "/smarthome/security" && unread > 0 && (
                  <span className="cv-num rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: "var(--cv-accent)" }}>
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--cv-separator)" }}>
          <div className="mb-2 flex items-center justify-between px-3 text-[12px]" style={{ color: "var(--cv-muted)" }}>
            <span className="inline-flex items-center gap-1.5">
              <StatusDot online={fleet.online > 0} pulse={false} />
              {fleet.online}/{fleet.devices.length} online
            </span>
            <LiveBadge status={liveStatus} compact />
          </div>
          <Link
            href="/smarthome/settings"
            className="flex items-center gap-2.5 px-3 py-2 transition hover:brightness-110"
            style={{ borderRadius: "var(--cv-r-control)" }}
          >
            <ProfileAvatar name={user!.name} email={user!.email} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{user!.name || user!.email}</span>
              <span className="block truncate text-[13px]" style={{ color: "var(--cv-muted)" }}>
                {isAdmin ? "Administrator" : "Owner"}
              </span>
            </span>
          </Link>
          <button
            onClick={logout}
            className="mt-1 flex min-h-10 w-full items-center gap-2 px-3 text-[14px] transition hover:brightness-125"
            style={{ color: "var(--cv-muted)", borderRadius: "var(--cv-r-control)" }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* -------------------------------------------------- main column --- */}
      <div className="min-w-0 flex-1">
        <header
          className="cv-material sticky top-0 z-30 flex min-h-[54px] items-center gap-3 px-4 md:px-8"
          style={{ borderBottom: "1px solid var(--cv-border)" }}
        >
          <Link href="/smarthome" className="flex items-center gap-2 md:hidden" aria-label="Circuvent console home">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: "var(--cv-gradient)" }}>
              <Cpu className="h-4 w-4 text-white" />
            </span>
          </Link>

          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[14px] md:flex">
            <span style={{ color: "var(--cv-muted)" }}>Home</span>
            <ChevronRight className="h-3.5 w-3.5" style={{ color: "var(--cv-muted)" }} />
            <span className="font-semibold">{current?.label}</span>
          </nav>

          <span className="truncate text-[16px] font-semibold md:hidden">{current?.label}</span>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              className="flex h-9 w-9 items-center justify-center rounded-full transition hover:brightness-125 md:hidden"
              style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)" }}
            >
              <Command className="h-4 w-4" />
            </button>

            <button
              onClick={() => setScheme(scheme === "dark" ? "light" : "dark")}
              aria-label={scheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              className="flex h-9 w-9 items-center justify-center rounded-full transition hover:brightness-125"
              style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)" }}
            >
              {scheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <Link
              href="/smarthome/security?tab=alerts"
              aria-label={`Alerts${unread ? ` (${unread} unread)` : ""}`}
              className="relative flex h-9 w-9 items-center justify-center rounded-full transition hover:brightness-125"
              style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)" }}
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                  style={{ background: "#ff453a" }}
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>

            {notifyPermission !== "granted" && notifyPermission !== "unsupported" && (
              <button
                onClick={enableNotifications}
                title="Enable desktop alerts"
                className="hidden h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium sm:flex"
                style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)" }}
              >
                <BellOff className="h-3.5 w-3.5" /> Enable alerts
              </button>
            )}

            <span className="hidden md:block">
              <LiveBadge status={liveStatus} />
            </span>
          </div>
        </header>

        <VisitingBanner />
        <main className="mx-auto max-w-7xl px-4 pb-28 pt-7 md:px-8 md:pb-12">{children}</main>
      </div>

      {/* --------------------------------------------- mobile bottom bar -- */}
      <nav
        className="cv-material fixed inset-x-0 bottom-0 z-30 flex md:hidden"
        style={{
          borderTop: "1px solid var(--cv-border)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {primary.map((n) => {
          const active = isActive(n);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium"
              style={{ color: active ? "var(--cv-accent-hi)" : "var(--cv-muted)" }}
            >
              <Icon className="h-[22px] w-[22px]" />
              {n.label}
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium"
          style={{ color: secondary.some(isActive) ? "var(--cv-accent-hi)" : "var(--cv-muted)" }}
        >
          <MoreHorizontal className="h-[22px] w-[22px]" />
          More
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="More sections">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
          <div
            ref={moreTrapRef}
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 rounded-t-[28px] px-4 pb-8 pt-3"
            style={{ background: "var(--cv-card)", borderTop: "1px solid var(--cv-border)" }}
          >
            <div className="mx-auto mb-4 h-1 w-9 rounded-full" style={{ background: "var(--cv-border)" }} />
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[19px] font-bold">More</span>
              <button onClick={() => setMoreOpen(false)} aria-label="Close">
                <X className="h-5 w-5" style={{ color: "var(--cv-muted)" }} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {secondary.map((n) => {
                const Icon = n.icon;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="cv-tile flex flex-col items-center gap-2 px-2 py-4 text-center text-[12px] font-medium"
                  >
                    <Icon className="h-[22px] w-[22px]" style={{ color: "var(--cv-accent-hi)" }} />
                    {n.label}
                  </Link>
                );
              })}
              <button
                onClick={logout}
                className="cv-card flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center text-[11px] font-semibold"
                style={{ color: "#f87171" }}
              >
                <LogOut className="h-5 w-5" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
}

function LiveBadge({ status, compact }: { status: "connecting" | "live" | "offline"; compact?: boolean }) {
  const map = {
    live: { color: "#22c55e", label: "Live", pulse: true },
    connecting: { color: "#f59e0b", label: "Connecting", pulse: true },
    offline: { color: "#94a3b8", label: "Reconnecting", pulse: false },
  } as const;
  const s = map[status];
  return (
    <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--cv-muted)" }} title={`Realtime channel: ${s.label}`}>
      {!compact && <Radio className="h-3.5 w-3.5" style={{ color: s.color }} />}
      <span className="relative flex h-2 w-2">
        {s.pulse && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none" style={{ background: s.color }} />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: s.color }} />
      </span>
      {s.label}
    </span>
  );
}
