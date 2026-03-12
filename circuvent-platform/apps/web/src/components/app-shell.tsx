"use client";

// ──────────────────────────────────────────────────────────────
// App Shell — Role-Based Access Controlled sidebar.
// Only shows navigation items the user's role has access to.
// ──────────────────────────────────────────────────────────────

import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";

type PermModule = string;

/** Role-to-accessible-modules mapping */
const ROLE_MODULES: Record<string, Set<string>> = {
  SUPER_ADMIN: new Set(["dashboard","portal","projects","iot","hr_admin","hr_employees","hr_payroll","hr_leave","hr_expenses","hr_compliance","hr_onboarding","hr_analytics","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","hr_performance","clients","finance","ai","recruitment","audit","settings","asset_management","grievance","shift_management","salary_advance","resignation","travel","timesheets","recognition","calendar","workflows","surveys","documents","visitors","benefits","feature_flags","letters","purchase_requests","funds"]),
  ADMIN: new Set(["dashboard","portal","projects","iot","hr_admin","hr_employees","hr_payroll","hr_leave","hr_expenses","hr_compliance","hr_onboarding","hr_analytics","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","hr_performance","clients","finance","ai","recruitment","audit","settings","asset_management","grievance","shift_management","salary_advance","resignation","travel","timesheets","recognition","calendar","workflows","surveys","documents","visitors","benefits","feature_flags","letters","purchase_requests","funds"]),
  CEO: new Set(["dashboard","portal","projects","iot","hr_admin","hr_employees","hr_payroll","hr_analytics","hr_attendance","hr_directory","clients","finance","ai","recruitment","audit","recognition","calendar","workflows","surveys","funds"]),
  HR_MANAGER: new Set(["dashboard","portal","hr_admin","hr_employees","hr_payroll","hr_leave","hr_expenses","hr_compliance","hr_onboarding","hr_analytics","hr_attendance","hr_performance","hr_goals","hr_directory","hr_helpdesk","hr_training","recruitment","salary_advance","resignation","grievance","shift_management","asset_management","travel","timesheets","recognition","calendar","workflows","surveys","documents","visitors","benefits","letters","purchase_requests","funds"]),
  MANAGER: new Set(["dashboard","portal","projects","hr_leave","hr_expenses","hr_attendance","hr_performance","hr_goals","hr_directory","hr_helpdesk","hr_training","salary_advance","resignation","timesheets","recognition","calendar","purchase_requests"]),
  PRODUCT_MANAGER: new Set(["dashboard","portal","projects","iot","hr_leave","hr_expenses","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","clients","recruitment","timesheets","recognition","calendar"]),
  ENGINEER: new Set(["dashboard","portal","projects","iot","hr_leave","hr_expenses","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","ai","salary_advance","resignation","asset_management","grievance","timesheets","recognition","calendar"]),
  DEVELOPER: new Set(["dashboard","portal","projects","hr_leave","hr_expenses","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","salary_advance","resignation","grievance","timesheets","recognition","calendar"]),
  TESTER: new Set(["dashboard","portal","projects","hr_leave","hr_expenses","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","salary_advance","resignation","grievance","timesheets","recognition","calendar"]),
  INTERN: new Set(["dashboard","portal","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","grievance","recognition","calendar"]),
  MARKETING: new Set(["dashboard","portal","hr_leave","hr_expenses","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","clients","salary_advance","resignation","grievance","recognition","calendar"]),
  CLIENT: new Set(["dashboard","clients"]),
  CANDIDATE: new Set(["dashboard","jobs_browse"]),
};

/** All sidebar sections with module requirements */
const ALL_SECTIONS: Array<{ label: string; items: Array<{ href: string; label: string; icon: string; module: string }> }> = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Command Center", icon: "🏠", module: "dashboard" }] },
  { label: "My Portal", items: [
    { href: "/portal", label: "Dashboard", icon: "🪪", module: "portal" },
    { href: "/portal/attendance", label: "Attendance", icon: "⏰", module: "hr_attendance" },
    { href: "/portal/leaves", label: "My Leaves", icon: "🏖️", module: "hr_leave" },
    { href: "/portal/payslips", label: "Payslips", icon: "💰", module: "hr_payroll" },
    { href: "/portal/goals", label: "Goals", icon: "🎯", module: "hr_goals" },
    { href: "/portal/expenses", label: "Expenses", icon: "🧾", module: "hr_expenses" },
    { href: "/portal/helpdesk", label: "Helpdesk", icon: "🎫", module: "hr_helpdesk" },
    { href: "/portal/training", label: "Training", icon: "📚", module: "hr_training" },
    { href: "/portal/directory", label: "Directory", icon: "👥", module: "hr_directory" },
    { href: "/portal/profile", label: "My Profile", icon: "👤", module: "portal" },
    { href: "/portal/purchase-requests", label: "Purchases", icon: "🛒", module: "purchase_requests" },
    { href: "/portal/letters", label: "My Letters", icon: "✉️", module: "portal" },
    { href: "/portal/salary-advance", label: "Salary Advance", icon: "💸", module: "salary_advance" },
    { href: "/portal/resignation", label: "Resignation", icon: "📝", module: "resignation" },
  ]},
  { label: "Engineering", items: [
    { href: "/projects", label: "Projects", icon: "📊", module: "projects" },
    { href: "/projects/analytics", label: "Analytics", icon: "📈", module: "projects" },
  ]},
  { label: "IoT", items: [
    { href: "/iot", label: "Devices", icon: "📡", module: "iot" },
    { href: "/iot/command-center", label: "Command Center", icon: "🏛️", module: "iot" },
    { href: "/iot/health", label: "Health", icon: "💓", module: "iot" },
    { href: "/iot/fleet", label: "Fleet", icon: "🚀", module: "iot" },
  ]},
  { label: "HR Admin", items: [
    { href: "/hr", label: "Employees", icon: "👥", module: "hr_employees" },
    { href: "/hr/user-management", label: "User Mgmt", icon: "🔑", module: "hr_onboarding" },
    { href: "/hr/analytics", label: "Analytics", icon: "📊", module: "hr_analytics" },
    { href: "/hr/payroll", label: "Payroll", icon: "💰", module: "hr_payroll" },
    { href: "/hr/leave", label: "Leave Mgmt", icon: "🏖️", module: "hr_admin" },
    { href: "/hr/expenses", label: "Expenses", icon: "🧾", module: "hr_admin" },
    { href: "/hr/compliance", label: "Compliance", icon: "📋", module: "hr_compliance" },
    { href: "/hr/onboarding", label: "Onboarding", icon: "🎯", module: "hr_onboarding" },
    { href: "/hr/timesheets", label: "Timesheets", icon: "⏱️", module: "timesheets" },
    { href: "/hr/shifts", label: "Shifts", icon: "🔄", module: "shift_management" },
    { href: "/hr/grievances", label: "Grievances", icon: "⚠️", module: "grievance" },
    { href: "/hr/assets", label: "Assets", icon: "🖥️", module: "asset_management" },
    { href: "/hr/travel", label: "Travel", icon: "✈️", module: "travel" },
    { href: "/hr/documents", label: "Documents", icon: "📄", module: "documents" },
    { href: "/hr/surveys", label: "Surveys", icon: "📋", module: "surveys" },
    { href: "/hr/visitors", label: "Visitors", icon: "🏢", module: "visitors" },
    { href: "/hr/benefits", label: "Benefits", icon: "🏥", module: "benefits" },
    { href: "/hr/workflows", label: "Workflows", icon: "⚡", module: "workflows" },
    { href: "/hr/letters", label: "Letters", icon: "✉️", module: "letters" },
    { href: "/hr/purchase-requests", label: "Purchases", icon: "🛒", module: "purchase_requests" },
    { href: "/hr/funds", label: "Funds", icon: "🏦", module: "funds" },
    { href: "/hr/performance", label: "Performance", icon: "📈", module: "hr_performance" },
    { href: "/hr/interns", label: "Interns", icon: "🎓", module: "hr_onboarding" },
  ]},
  { label: "Engage", items: [
    { href: "/recognition", label: "Recognition", icon: "🏆", module: "recognition" },
    { href: "/calendar", label: "Calendar", icon: "📅", module: "calendar" },
  ]},
  { label: "Clients", items: [
    { href: "/clients", label: "Portal", icon: "💼", module: "clients" },
    { href: "/clients/analytics", label: "Analytics", icon: "📉", module: "clients" },
  ]},
  { label: "Finance", items: [
    { href: "/finance", label: "Dashboard", icon: "💰", module: "finance" },
    { href: "/finance/accounts", label: "Accounts", icon: "📊", module: "finance" },
    { href: "/finance/journals", label: "Journals", icon: "📒", module: "finance" },
    { href: "/finance/reports", label: "Reports", icon: "📋", module: "finance" },
    { href: "/finance/gst", label: "GST", icon: "🏛️", module: "finance" },
    { href: "/finance/budget", label: "Budget", icon: "💎", module: "finance" },
  ]},
  { label: "AI", items: [
    { href: "/ai", label: "Orchestrator", icon: "🤖", module: "ai" },
    { href: "/ai/models", label: "Models", icon: "🧠", module: "ai" },
    { href: "/ai/scheduler", label: "Scheduler", icon: "⚡", module: "ai" },
  ]},
  { label: "Careers", items: [
    { href: "/careers", label: "Open Positions", icon: "💼", module: "jobs_browse" },
    { href: "/careers/my-applications", label: "My Applications", icon: "📄", module: "jobs_browse" },
  ]},
  { label: "Recruitment", items: [
    { href: "/recruitment", label: "Dashboard", icon: "🎯", module: "recruitment" },
    { href: "/recruitment/jobs", label: "Jobs", icon: "📋", module: "recruitment" },
    { href: "/recruitment/candidates", label: "Candidates", icon: "👤", module: "recruitment" },
    { href: "/recruitment/pools", label: "Talent Pools", icon: "🏊", module: "recruitment" },
    { href: "/recruitment/interviews", label: "Interviews", icon: "🎙️", module: "recruitment" },
  ]},
  { label: "System", items: [
    { href: "/audit", label: "Audit", icon: "🔍", module: "audit" },
    { href: "/audit/compliance", label: "Compliance", icon: "🔒", module: "audit" },
    { href: "/settings", label: "Settings", icon: "⚙️", module: "settings" },
    { href: "/settings/feature-flags", label: "Feature Flags", icon: "🚩", module: "feature_flags" },
  ]},
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Filter navigation based on user's role
  const navSections = useMemo(() => {
    if (!user?.role) return [];
    const allowedModules = ROLE_MODULES[user.role] || new Set<string>();
    return ALL_SECTIONS
      .map(section => ({
        ...section,
        items: section.items.filter(item => allowedModules.has(item.module)),
      }))
      .filter(section => section.items.length > 0);
  }, [user?.role]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-white dark:bg-white dark:bg-slate-950"><div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div>;
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-white dark:bg-slate-950">
        <div className="text-center animate-fade-in">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Sign In Required</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Please sign in to continue.</p>
          <a href="/login" className="mt-4 inline-block rounded-lg bg-brand-600 px-6 py-2 text-sm text-slate-900 dark:text-white hover:bg-brand-700 shadow-sm transition-all">Sign In</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/30 dark:bg-black/50 lg:hidden backdrop-blur-sm" onClick={() => setMobileOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-50 dark:bg-slate-950 transition-all duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:relative lg:translate-x-0 ${collapsed ? "w-16" : "w-60"}`}>
        <div className="flex h-14 items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4">
          <a href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-slate-900 dark:text-white shadow-sm">CT</div>
            {!collapsed && <span className="text-base font-semibold text-slate-900 dark:text-white">Circuvent</span>}
          </a>
          <button onClick={() => setCollapsed(!collapsed)} className="hidden text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-white lg:block transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={collapsed ? "M13 5l7 7-7 7" : "M11 19l-7-7 7-7"} /></svg>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {navSections.map((s) => (
            <div key={s.label} className="mb-3">
              {!collapsed && <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-600">{s.label}</p>}
              {s.items.map((item) => (
                <a key={item.href} href={item.href} className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white transition-all duration-200" title={collapsed ? item.label : undefined}>
                  <span className="text-sm flex-shrink-0">{item.icon}</span>
                  {!collapsed && <span className="text-xs">{item.label}</span>}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-slate-200 dark:border-slate-800 p-2">
          {!collapsed ? (
            <div className="flex items-center justify-between px-2">
              <a href="/portal/profile" className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-slate-900 dark:text-white shadow-sm">{user.firstName?.[0]}{user.lastName?.[0]}</div>
                <div><p className="text-xs font-medium text-slate-900 dark:text-white">{user.firstName}</p><p className="text-[10px] text-slate-400 dark:text-slate-500">{user.role}</p></div>
              </a>
              <button onClick={logout} className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors" title="Sign out">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          ) : (
            <a href="/portal/profile" className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-slate-900 dark:text-white">{user.firstName?.[0]}</a>
          )}
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-12 items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80 transition-colors">
          <button onClick={() => setMobileOpen(true)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white lg:hidden"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
          <span className="text-xs text-slate-400 dark:text-slate-600 hidden lg:block">Circuvent Platform v2.0 · Role: {user.role}</span>
          <div className="flex items-center gap-3">
            <ThemeToggleInline />
            <a href="/portal/profile" className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors">Profile</a>
            <button onClick={logout} className="text-xs text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">Sign Out</button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-50 dark:bg-slate-950 p-6 transition-colors duration-300 page-enter">{children}</main>
      </div>
    </div>
  );
}

function ThemeToggleInline() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className="relative flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
      >
        <svg className={`absolute h-3.5 w-3.5 text-amber-500 transition-all duration-500 ${resolvedTheme === "dark" ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        <svg className={`absolute h-3.5 w-3.5 text-blue-400 transition-all duration-500 ${resolvedTheme === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      </button>
      <button onClick={() => setTheme("system")} className={`h-5 rounded px-1 text-[9px] font-medium transition-all ${theme === "system" ? "bg-brand-500/20 text-brand-500" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-600 dark:text-slate-300"}`} title="Auto (sync with system)">
        Auto
      </button>
    </div>
  );
}
