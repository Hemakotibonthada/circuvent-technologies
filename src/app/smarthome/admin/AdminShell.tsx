"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  LayoutDashboard, ShieldCheck, PackagePlus, Radar, Activity, LayoutGrid, Workflow,
  BellRing, DownloadCloud, ShieldAlert, Server, Search, Command as CmdIcon, ChevronLeft,
  Bell, LifeBuoy, ChevronsUpDown, Cpu, LogOut, Menu, CircleDot, ArrowRight, Timer,
  Sparkles, QrCode,
} from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import { useConsole } from "../ConsoleProvider";
import { useAdminDevices, useAdminStats, deviceHealth } from "./_lib/api";
import { useFocusTrap } from "../_kit/overlays";

interface NavItem { href: string; label: string; icon: typeof Cpu; group: string; desc: string; }

const NAV: NavItem[] = [
  { href: "/smarthome/admin", label: "Overview", icon: LayoutDashboard, group: "Overview", desc: "Fleet-wide status, KPIs and live activity" },
  { href: "/smarthome/admin/access", label: "Access & Users", icon: ShieldCheck, group: "Governance", desc: "Operator roles, accounts, API keys and audit trail" },
  { href: "/smarthome/admin/provisioning", label: "Provisioning", icon: PackagePlus, group: "Operations", desc: "Onboard devices: manual, bulk, QR, JIT, templates" },
  { href: "/smarthome/admin/registry", label: "Device Registry", icon: QrCode, group: "Operations", desc: "Look up by serial, full device record, labels, credentials, ownership" },
  { href: "/smarthome/admin/fleet", label: "Fleet", icon: Radar, group: "Operations", desc: "Device fleet, health, map, groups, digital twin" },
  { href: "/smarthome/admin/telemetry", label: "Telemetry", icon: Activity, group: "Operations", desc: "Streams, schema, retention, ingestion, metrics" },
  { href: "/smarthome/admin/latency", label: "Latency & Perf", icon: Timer, group: "Operations", desc: "Command round trips, per-hop attribution, SLO burn" },
  { href: "/smarthome/admin/ota", label: "OTA & Config", icon: DownloadCloud, group: "Operations", desc: "Firmware repo, campaigns, rollback, config editor" },
  { href: "/smarthome/admin/dashboards", label: "Dashboards", icon: LayoutGrid, group: "Intelligence", desc: "Drag-drop builder, widgets, floor plans, kiosk" },
  { href: "/smarthome/admin/intelligence", label: "Fleet Intelligence", icon: Sparkles, group: "Intelligence", desc: "Correlated findings: bad releases, site outages, silent devices" },
  { href: "/smarthome/admin/rules", label: "Rules Engine", icon: Workflow, group: "Intelligence", desc: "Visual rules, CEP, schedules, edge deployment" },
  { href: "/smarthome/admin/alerts", label: "Alerts & Incidents", icon: BellRing, group: "Intelligence", desc: "Multi-channel alerts, escalation, incident console" },
  { href: "/smarthome/admin/security", label: "Security", icon: ShieldAlert, group: "Governance", desc: "PKI, certificates, CVE scanner, quarantine, compliance" },
  { href: "/smarthome/admin/platform", label: "Platform", icon: Server, group: "Governance", desc: "API gateway, integrations, billing, system health" },
];

const GROUPS = ["Overview", "Operations", "Intelligence", "Governance"];

export default function AdminShell({ children }: { children: ReactNode }) {
  const { user, logout } = useConsole();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mode, setMode] = useState<AdminMode>("checking");

  // Real fleet signals drive the sidebar/topbar badges — no seeded incidents.
  const devicesRes = useAdminDevices(60000);
  const statsRes = useAdminStats(60000);
  const attentionCount = useMemo(
    () => (devicesRes.data ?? []).filter((d) => deviceHealth(d) !== "healthy").length,
    [devicesRes.data]
  );

  // Verify the operator against the real control plane. There is no demo
  // fallback: if we cannot authenticate we say so rather than showing fiction.
  useEffect(() => {
    let alive = true;
    controlPlane.adminMe().then((r) => {
      if (!alive) return;
      if (r.ok && r.data?.admin) setMode("live");
      else if (r.status === 0) setMode("offline");
      else setMode("denied");
    }).catch(() => alive && setMode("offline"));
    return () => { alive = false; };
  }, []);

  const active = useMemo(() => {
    const sorted = [...NAV].sort((a, b) => b.href.length - a.href.length);
    return sorted.find((n) => pathname === n.href || pathname?.startsWith(n.href + "/")) ?? NAV[0];
  }, [pathname]);

  // ⌘K / Ctrl+K command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const sidebarW = collapsed ? 76 : 264;

  return (
    <div className="ad-root">
      {/* Sidebar */}
      <aside
        className={`ad-sidebar fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/10 transition-all duration-300 md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: sidebarW }}
      >
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "var(--cv-gradient)" }}>
            <Cpu className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate font-extrabold leading-none text-white">Circuvent</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-400">IoT Control Plane</div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {GROUPS.map((g) => {
            const items = NAV.filter((n) => n.group === g);
            return (
              <div key={g} className="mb-4">
                {!collapsed && <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{g}</div>}
                <div className="space-y-1">
                  {items.map((n) => {
                    const isActive = n.href === active.href;
                    const Icon = n.icon;
                    return (
                      <Link
                        key={n.href} href={n.href} title={collapsed ? n.label : undefined}
                        className={`group relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium transition ${
                          isActive ? "text-white" : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
                        }`}
                        style={isActive ? { background: "rgba(6,182,212,.10)", boxShadow: "inset 0 0 0 1px rgba(6,182,212,.25)" } : undefined}
                      >
                        {isActive && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full" style={{ background: "linear-gradient(180deg,#06b6d4,#8b5cf6)" }} />}
                        <Icon className="h-[18px] w-[18px] shrink-0" style={{ color: isActive ? "#22d3ee" : undefined }} />
                        {!collapsed && <span className="flex-1 truncate">{n.label}</span>}
                        {!collapsed && n.href.endsWith("/alerts") && attentionCount > 0 && (
                          <span className="rounded-full bg-red-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white">{attentionCount}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Live fleet summary + collapse */}
        <div className="border-t border-white/10 p-3">
          {!collapsed && (
              <Link
                href="/smarthome/admin/fleet"
              className="mb-2 flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
            >
                <span className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{ background: "var(--cv-gradient)" }}>
                  <Radar className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-white">
                    {statsRes.data ? `${statsRes.data.online}/${statsRes.data.devices} online` : "Fleet"}
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    {statsRes.loading ? "loading…" : statsRes.error ? "control plane unreachable" : `${statsRes.data?.users ?? 0} accounts`}
                  </span>
                </span>
                <ChevronsUpDown className="h-4 w-4 text-slate-500" />
              </Link>
            )}
          <button onClick={() => setCollapsed((c) => !c)} className="hidden w-full items-center justify-center gap-2 rounded-lg py-2 text-xs text-slate-500 hover:text-white md:flex cursor-pointer">
            <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main column — offset by the sidebar width on md+ */}
      <div className="transition-all duration-300 md:pl-[var(--adsb)]" style={{ "--adsb": `${sidebarW}px` } as React.CSSProperties}>
        <div>
          {/* Topbar */}
          <header className="ad-topbar sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 px-4 py-3 backdrop-blur-xl md:px-6">
            <button onClick={() => setMobileOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-300 md:hidden cursor-pointer">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>Admin</span><span>/</span><span className="text-slate-400">{active.group}</span>
              </div>
              <h1 className="truncate text-[15px] font-bold text-white">{active.label}</h1>
            </div>

            <button
              onClick={() => setPaletteOpen(true)}
              className="ml-auto hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-400 transition hover:bg-white/[0.06] sm:flex cursor-pointer"
            >
              <Search className="h-4 w-4" />
              <span>Search…</span>
              <kbd className="ml-4 flex items-center gap-0.5 rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] text-slate-500"><CmdIcon className="h-3 w-3" />K</kbd>
            </button>

            <div className="ml-auto flex items-center gap-2 sm:ml-0">
              <ModeBadge mode={mode} />
              <Link href="/smarthome/admin/alerts" className="relative grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-300 hover:bg-white/[0.06]">
                <Bell className="h-[18px] w-[18px]" />
                {attentionCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{attentionCount}</span>}
              </Link>
              <a href="mailto:support@circuvent.com" className="hidden h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-300 hover:bg-white/[0.06] sm:grid"><LifeBuoy className="h-[18px] w-[18px]" /></a>
              <UserMenu email={user?.email ?? "admin@circuvent.com"} name={user?.name ?? "Platform Admin"} onLogout={logout} />
            </div>
          </header>

          <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-6 lg:px-8">{children}</main>
        </div>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onNavigate={(href) => { router.push(href); setPaletteOpen(false); }} />}

      <ShellStyles />
    </div>
  );
}

type AdminMode = "checking" | "live" | "denied" | "offline";

/**
 * Honest connection indicator. "Demo data" no longer exists — when the control
 * plane is unreachable or rejects the operator we surface that instead of
 * silently swapping in generated data.
 */
function ModeBadge({ mode }: { mode: AdminMode }) {
  if (mode === "checking") return null;
  const style =
    mode === "live"
      ? { color: "#4ade80", borderColor: "rgba(34,197,94,.3)", background: "rgba(34,197,94,.1)" }
      : mode === "denied"
      ? { color: "#fbbf24", borderColor: "rgba(245,158,11,.3)", background: "rgba(245,158,11,.1)" }
      : { color: "#f87171", borderColor: "rgba(239,68,68,.3)", background: "rgba(239,68,68,.1)" };
  const label = mode === "live" ? "Live" : mode === "denied" ? "No access" : "Offline";
  const title =
    mode === "live"
      ? "Connected to the live control plane"
      : mode === "denied"
      ? "Signed in, but this account is not a platform operator"
      : "Cannot reach the control plane — panels will show errors instead of data";
  return (
    <span className="hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold sm:flex" style={style} title={title}>
      <CircleDot className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function UserMenu({ email, name, onLogout }: { email: string; name: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="grid h-9 w-9 place-items-center rounded-lg text-sm font-bold text-white cursor-pointer" style={{ background: "var(--cv-gradient)" }}>
        {initials}
      </button>
      {open && (
        <div className="ad-card absolute right-0 top-11 z-50 w-56 rounded-xl p-1.5">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-semibold text-white">{name}</div>
            <div className="truncate text-xs text-slate-500">{email}</div>
          </div>
          <div className="my-1 border-t border-white/10" />
          <Link href="/smarthome" className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.06]">Consumer console</Link>
          <Link href="/smarthome/admin/access" className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.06]">Profile & preferences</Link>
          <button onClick={onLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10 cursor-pointer">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function CommandPalette({ onClose, onNavigate }: { onClose: () => void; onNavigate: (href: string) => void }) {
  const [q, setQ] = useState("");
  // Rendered only while open, so the trap's lifetime is the dialog's lifetime.
  const trapRef = useFocusTrap(true);
  const results = NAV.filter((n) => (n.label + n.desc + n.group).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div ref={trapRef} tabIndex={-1} className="ad-card relative w-full max-w-xl overflow-hidden rounded-2xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--cv-accent)]">
          <Search className="h-5 w-5 text-slate-500" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to a module or action…" className="w-full bg-transparent text-white outline-none placeholder:text-slate-500" />
          <kbd className="rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] text-slate-500">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <div className="px-3 py-8 text-center text-sm text-slate-500">No matches for “{q}”.</div>}
          {results.map((n) => {
            const Icon = n.icon;
            return (
              <button key={n.href} onClick={() => onNavigate(n.href)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.06] cursor-pointer">
                <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "rgba(6,182,212,.12)", color: "#22d3ee" }}><Icon className="h-[18px] w-[18px]" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">{n.label}</span>
                  <span className="block truncate text-xs text-slate-500">{n.desc}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-slate-600" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ShellStyles() {
  return (
    <style jsx global>{`
      /* The admin chrome, in the console's own tokens.
       *
       * WHY THIS IS NOT A PALETTE
       *
       * Every value here used to be a literal: #070b14 for the page,
       * rgba(9,13,22,.92) for the sidebar, #e2e8f0 for text. That was fine
       * while the console was dark-only. It stopped being fine when the light
       * schemes arrived, and it failed in the worst available way.
       *
       * theme.tsx carries a light-scheme shim that remaps Tailwind's dark-first
       * neutrals — .text-white becomes var(--cv-text) — so that ~1,100
       * hardcoded utilities across /smarthome stay legible without editing
       * every file. It reaches class names. It cannot reach a literal inside a
       * styled-jsx block. So on a light scheme the admin's text was remapped to
       * near-black while these surfaces stayed near-black too: measured at 1.07:1,
       * which is text you cannot see at all rather than text that is merely hard
       * to read.
       *
       * Reading from --cv-* means the surfaces move with the scheme, which is
       * both the fix and the thing that keeps the shim honest: text and
       * background now come from the same source.
       */
      .ad-root {
        min-height: 100vh;
        color: var(--cv-text);
        /* Status ramp, authored for dark cards. The light overrides sit below;
           these are the values the admin has always used. */
        --ad-fg-cyan: #22d3ee;
        --ad-fg-green: #4ade80;
        --ad-fg-amber: #fbbf24;
        --ad-fg-red: #f87171;
        --ad-fg-blue: #60a5fa;
        --ad-fg-violet: #c084fc;
        --ad-fg-slate: #94a3b8;
        /* Only the accent wash is painted here. The page colour belongs to
           .cv-theme, and painting it twice would mean this file has to know
           what every scheme's background is — which is how it drifted. */
        background:
          radial-gradient(1000px 640px at 100% -6%, rgba(139, 92, 246, 0.10), transparent 60%),
          radial-gradient(820px 520px at -6% 8%, rgba(6, 182, 212, 0.10), transparent 55%);
        font-feature-settings: "cv01", "ss01";
      }
      /* The same hues at the 600/700 level, which is where they stop being
         pale-on-pale. Mirrors what theme.tsx already does for the text-*
         utility classes; these have to be repeated because the tones are
         applied as inline styles and a class shim cannot see them. */
      .cv-light .ad-root {
        --ad-fg-cyan: #0e7490;
        --ad-fg-green: #047857;
        --ad-fg-amber: #b45309;
        --ad-fg-red: #b91c1c;
        --ad-fg-blue: #1d4ed8;
        --ad-fg-violet: #6d28d9;
        --ad-fg-slate: #475569;
      }
      .ad-sidebar { background: var(--cv-card); backdrop-filter: blur(16px); }
      .ad-topbar { background: var(--cv-card); }
      .ad-card {
        background: var(--cv-card);
        border: 1px solid var(--cv-border);
        backdrop-filter: blur(14px) saturate(140%);
      }
      .ad-muted { color: var(--cv-muted); }
      .ad-btn-primary {
        background: var(--cv-gradient);
        color: #fff;
        box-shadow: 0 8px 24px -8px rgba(6, 182, 212, 0.55);
      }
      .ad-btn-primary:hover { filter: brightness(1.06); }
      .ad-input {
        width: 100%;
        border: 1px solid var(--cv-border);
        background: var(--cv-input-bg);
        border-radius: 0.6rem;
        padding: 0.55rem 0.75rem;
        color: var(--cv-text);
        font-size: 0.85rem;
        outline: none;
        transition: border-color 0.15s;
      }
      .ad-input:focus { border-color: var(--cv-accent); }
      .ad-input::placeholder { color: var(--cv-muted); }
      /* A native <option> renders in the OS popup, which does not inherit the
         page's colours — it needs both stated explicitly or it is white text
         on white on a light scheme. */
      .ad-input option { background: var(--cv-card-hi); color: var(--cv-text); }
      .ad-iconbox {
        display: grid; place-items: center; height: 2.25rem; width: 2.25rem;
        border-radius: 0.7rem;
        background: color-mix(in srgb, var(--cv-accent) 14%, transparent);
        color: var(--cv-accent-hi);
      }
      .ad-root ::-webkit-scrollbar { width: 10px; height: 10px; }
      /* Derived from the text colour so the thumb is visible on any scheme;
         a fixed white at 8% is invisible on a light surface. */
      .ad-root ::-webkit-scrollbar-thumb { background: color-mix(in srgb, currentColor 18%, transparent); border-radius: 6px; border: 2px solid transparent; background-clip: padding-box; }
      .ad-root ::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, currentColor 32%, transparent); background-clip: padding-box; }
      @media (prefers-reduced-motion: reduce) { .ad-root * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; } }
    `}</style>
  );
}
