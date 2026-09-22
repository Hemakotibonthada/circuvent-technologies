"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  LayoutGrid,
  ClipboardCheck,
  Server,
  Activity,
  Siren,
  Package,
  Globe,
  Users,
  MessageSquare,
  Briefcase,
  Handshake,
  Mail,
  Receipt,
  GitPullRequest,
  LogOut,
  ExternalLink,
  ChevronDown,
  Sun,
  Moon,
  Laptop,
  Check,
  User,
  ShieldCheck,
  Search,
  Bell,
  Cloud,
} from "lucide-react";

export interface SuiteTab {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string; size?: number }>;
  href?: string;
  onClick?: () => void;
  badge?: string | number;
}

export interface CircuventSuiteNavProps {
  currentApp: {
    name: string;
    subtitle?: string;
    icon?: React.ComponentType<{ className?: string; size?: number }>;
    homeHref?: string;
    badge?: string;
  };
  tabs?: SuiteTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  user?: {
    name?: string | null;
    email?: string | null;
    avatar?: string | null;
    role?: string | null;
  } | null;
  onLogout?: () => void;
  appearance?: string;
  onAppearanceChange?: (scheme: string) => void;
  actions?: React.ReactNode;
}

interface AppLauncherItem {
  id: string;
  name: string;
  shortName: string;
  category: "collaboration" | "operations" | "engineering";
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  color: string;
  external?: boolean;
}

const SUITE_APPS: AppLauncherItem[] = [
  // Collaboration
  {
    id: "workspace",
    name: "CV-365 Workspace",
    shortName: "Workspace",
    category: "collaboration",
    description: "Management, Tasks, Docs & Calendar",
    href: "https://workspace.circuvent.com",
    icon: Briefcase,
    color: "#3b82f6",
    external: true,
  },
  {
    id: "teams",
    name: "Circuvent Teams",
    shortName: "Teams",
    category: "collaboration",
    description: "Enterprise Chat, Calls & Channels",
    href: "https://teams.circuvent.com",
    icon: MessageSquare,
    color: "#8b5cf6",
    external: true,
  },
  {
    id: "crm",
    name: "Circuvent CRM",
    shortName: "CRM",
    category: "collaboration",
    description: "Deals, Leads & Relationships",
    href: "https://crm.circuvent.com",
    icon: Handshake,
    color: "#ec4899",
    external: true,
  },
  {
    id: "mail",
    name: "Circuvent Mail",
    shortName: "Webmail",
    category: "collaboration",
    description: "Professional Webmail & Inbox",
    href: "https://mail.circuvent.com",
    icon: Mail,
    color: "#f59e0b",
    external: true,
  },

  // Operations
  {
    id: "attendance",
    name: "Circuvent Attendance",
    shortName: "Attendance",
    category: "operations",
    description: "Live Roll Call & RFID Readers",
    href: "/smarthome/attendance?tab=live",
    icon: ClipboardCheck,
    color: "#06b6d4",
  },
  {
    id: "hrms",
    name: "Circuvent HRMS",
    shortName: "HRMS",
    category: "operations",
    description: "People Roster, Leaves & Roles",
    href: "https://hrms.circuvent.com",
    icon: Users,
    color: "#10b981",
    external: true,
  },
  {
    id: "myspace",
    name: "MySpace Enterprise",
    shortName: "MySpace",
    category: "operations",
    description: "Client & Organization Portal",
    href: "https://myspace.circuvent.com",
    icon: Globe,
    color: "#6366f1",
    external: true,
  },
  {
    id: "paystub",
    name: "Circuvent Paystub",
    shortName: "Payroll",
    category: "operations",
    description: "Salary Slips & Payroll Sync",
    href: "https://paystub.circuvent.com",
    icon: Receipt,
    color: "#14b8a6",
    external: true,
  },

  // Engineering & Infrastructure
  {
    id: "icm",
    name: "Incident Command (ICM)",
    shortName: "ICM",
    category: "engineering",
    description: "Severity Queue & Mitigation",
    href: "/admin/icm",
    icon: Siren,
    color: "#ef4444",
  },
  {
    id: "insights",
    name: "Application Insights",
    shortName: "Insights",
    category: "engineering",
    description: "Telemetry, Health & Metrics",
    href: "/admin/insights",
    icon: Activity,
    color: "#a855f7",
  },
  {
    id: "servers",
    name: "Servers & Nodes",
    shortName: "Servers",
    category: "engineering",
    description: "Infrastructure & Monitoring",
    href: "/admin/servers",
    icon: Server,
    color: "#f97316",
  },
  {
    id: "assets",
    name: "Assets & Inventory",
    shortName: "Assets",
    category: "engineering",
    description: "IT Inventory & Hardware",
    href: "/admin/assets",
    icon: Package,
    color: "#eab308",
  },
  {
    id: "platform",
    name: "Platform Cloud",
    shortName: "Platform",
    category: "engineering",
    description: "Self-hosted PaaS & AI Deploy",
    href: "https://platform.circuvent.com",
    icon: Cloud,
    color: "#6366f1",
    external: true,
  },
  {
    id: "devops",
    name: "Circuvent DevOps",
    shortName: "DevOps",
    category: "engineering",
    description: "CI/CD & Delivery Pipelines",
    href: "https://devops.circuvent.com",
    icon: GitPullRequest,
    color: "#64748b",
    external: true,
  },
];

const CATEGORY_NAMES = {
  collaboration: "Collaboration & Productivity",
  operations: "Workforce & Operations",
  engineering: "Infrastructure & Engineering",
};

export function CircuventSuiteNav({
  currentApp,
  tabs = [],
  activeTab,
  onTabChange,
  user,
  onLogout,
  appearance = "system",
  onAppearanceChange,
  actions,
}: CircuventSuiteNavProps) {
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);

  const launcherRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (launcherRef.current && !launcherRef.current.contains(e.target as Node)) {
        setLauncherOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const AppIcon = currentApp.icon || ClipboardCheck;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] text-slate-900">
      {/* ─── Top Bar ─── */}
      <div className="flex h-14 items-center justify-between px-3 sm:px-4 lg:px-6">
        {/* Left: Brand + App Badge + Tabs */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          {/* Official Circuvent Mark + Brand Wordmark */}
          <Link
            href={currentApp.homeHref || "#"}
            className="flex shrink-0 items-center gap-2 rounded-lg py-1 pr-2 transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            <img
              src="/logo-mark-96.png"
              alt="Circuvent"
              width={26}
              height={26}
              className="h-6.5 w-6.5 object-contain"
            />
            <div className="leading-tight">
              <span className="block text-sm font-bold tracking-tight text-slate-900">
                {currentApp.name}
              </span>
              <span className="block text-[10px] text-slate-400 font-normal">
                {currentApp.subtitle || "Circuvent"}
              </span>
            </div>
          </Link>

          {/* Divider */}
          <div className="hidden h-5 w-px bg-slate-200 sm:block" />

          {/* Horizontal Top Options Navigation */}
          {tabs.length > 0 && (
            <nav
              aria-label="Workspace sections"
              className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none min-w-0 flex-1"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;

                const content = (
                  <>
                    {Icon && (
                      <Icon
                        className={`h-3.5 w-3.5 shrink-0 ${
                          active ? "text-sky-600" : "text-slate-500"
                        }`}
                      />
                    )}
                    <span>{tab.label}</span>
                    {tab.badge !== undefined && (
                      <span
                        className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                          active
                            ? "bg-sky-200/60 text-sky-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </>
                );

                const className = `flex shrink-0 items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all ${
                  active
                    ? "bg-sky-50 text-sky-600 font-semibold border border-sky-200/70 shadow-none"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-medium border border-transparent"
                }`;

                const handleClick = (e: React.MouseEvent) => {
                  if (tab.onClick) {
                    e.preventDefault();
                    tab.onClick();
                  } else if (onTabChange) {
                    e.preventDefault();
                    onTabChange(tab.id);
                  }
                };

                const href = tab.href || `?tab=${tab.id}`;

                return (
                  <Link
                    key={tab.id}
                    href={href}
                    onClick={handleClick}
                    className={className}
                    aria-current={active ? "page" : undefined}
                  >
                    {content}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {/* Right: Custom Actions + Search + Bell + Launcher + Theme + Avatar */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {actions}

          {/* Search Button */}
          <button
            type="button"
            title="Search (Ctrl+K)"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Notification Bell with Badge "4" */}
          <button
            type="button"
            title="Notifications"
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute 0.5 top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-white">
              4
            </span>
          </button>

          {/* ─── 9-Dot Suite App Launcher ─── */}
          <div className="relative" ref={launcherRef}>
            <button
              type="button"
              onClick={() => setLauncherOpen((o) => !o)}
              title="Circuvent Suite App Launcher"
              aria-expanded={launcherOpen}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                launcherOpen
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>

            {launcherOpen && (
              <div className="absolute right-0 top-10 z-50 w-[340px] sm:w-[380px] rounded-2xl border border-slate-200 bg-white/98 p-4 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-50 text-sky-600">
                      <LayoutGrid className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Circuvent Suite
                    </span>
                  </div>
                  <a
                    href="https://workspace.circuvent.com"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] font-semibold text-sky-600 hover:underline"
                  >
                    Open CV-365 <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="mt-3 max-h-[420px] space-y-4 overflow-y-auto pr-1">
                  {(["collaboration", "operations", "engineering"] as const).map((cat) => {
                    const items = SUITE_APPS.filter((a) => a.category === cat);
                    return (
                      <div key={cat}>
                        <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {CATEGORY_NAMES[cat]}
                        </h4>
                        <div className="grid grid-cols-2 gap-1.5">
                          {items.map((app) => {
                            const Icon = app.icon;
                            const isCurrent = currentApp.name.toLowerCase().includes(app.shortName.toLowerCase());

                            return (
                              <a
                                key={app.id}
                                href={app.href}
                                target={app.external ? "_blank" : undefined}
                                rel={app.external ? "noreferrer" : undefined}
                                onClick={() => setLauncherOpen(false)}
                                className={`flex items-start gap-2.5 rounded-xl border p-2 text-left transition ${
                                  isCurrent
                                    ? "border-sky-300 bg-sky-50 text-sky-900"
                                    : "border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:bg-slate-100/70 text-slate-700"
                                }`}
                              >
                                <div
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                                  style={{ backgroundColor: app.color }}
                                >
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold text-slate-900">
                                    {app.shortName}
                                  </p>
                                  <p className="truncate text-[10px] text-slate-500">
                                    {app.description}
                                  </p>
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ─── Appearance Toggle ─── */}
          {onAppearanceChange && (
            <div className="relative hidden sm:block" ref={themeRef}>
              <button
                type="button"
                onClick={() => setThemeOpen((o) => !o)}
                title="Theme appearance"
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
              >
                {appearance === "dark" ? (
                  <Moon className="h-4 w-4" />
                ) : appearance === "light" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Laptop className="h-4 w-4" />
                )}
              </button>

              {themeOpen && (
                <div className="absolute right-0 top-10 z-50 w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
                  {[
                    { id: "system", label: "Desktop", icon: Laptop },
                    { id: "dark", label: "Dark", icon: Moon },
                    { id: "light", label: "Light", icon: Sun },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        onAppearanceChange(id);
                        setThemeOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                        appearance === id
                          ? "bg-sky-50 text-sky-700 font-semibold"
                          : "text-slate-700 hover:bg-slate-100/70"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </span>
                      {appearance === id && <Check className="h-3 w-3 text-sky-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── User Profile & Sign Out ─── */}
          {user && (
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center rounded-full p-0.5 hover:ring-2 hover:ring-slate-200 transition"
                title={user.name || user.email || "User account"}
              >
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name || "User"}
                    className="h-7 w-7 rounded-full object-cover ring-1 ring-slate-200"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white shadow-sm ring-1 ring-slate-200">
                    {(user.name || user.email || "H").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-10 z-50 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
                  <div className="border-b border-slate-100 px-3 py-2.5">
                    <p className="truncate text-xs font-bold text-slate-900">
                      {user.name || "Circuvent Staff"}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">{user.email}</p>
                    {user.role && (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 capitalize">
                        <ShieldCheck className="h-3 w-3" /> {user.role}
                      </span>
                    )}
                  </div>

                  <div className="py-1">
                    <a
                      href="https://myaccount.circuvent.com/account"
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                    >
                      <User className="h-3.5 w-3.5 text-slate-500" />
                      Manage my account
                    </a>
                  </div>

                  {onLogout && (
                    <div className="border-t border-slate-100 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          onLogout();
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
