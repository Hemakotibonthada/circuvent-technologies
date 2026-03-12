"use client";

// ──────────────────────────────────────────────────────────────
// App Shell — Role-Based Access Controlled sidebar.
// Only shows navigation items the user's role has access to.
// ──────────────────────────────────────────────────────────────

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";

type PermModule = string;

/** Role-to-accessible-modules mapping */
const ROLE_MODULES: Record<string, Set<string>> = {
  SUPER_ADMIN: new Set(["dashboard","portal","projects","iot","hr_admin","hr_employees","hr_payroll","hr_leave","hr_expenses","hr_compliance","hr_onboarding","hr_analytics","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","hr_performance","clients","finance","ai","recruitment","audit","settings","asset_management","grievance","shift_management","salary_advance","resignation","travel","timesheets","recognition","calendar","workflows","surveys","documents","visitors","benefits","feature_flags","letters","purchase_requests","funds","icm","workstation","messaging"]),
  ADMIN: new Set(["dashboard","portal","projects","iot","hr_admin","hr_employees","hr_payroll","hr_leave","hr_expenses","hr_compliance","hr_onboarding","hr_analytics","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","hr_performance","clients","finance","ai","recruitment","audit","settings","asset_management","grievance","shift_management","salary_advance","resignation","travel","timesheets","recognition","calendar","workflows","surveys","documents","visitors","benefits","feature_flags","letters","purchase_requests","funds","icm","workstation","messaging"]),
  CEO: new Set(["dashboard","portal","projects","iot","hr_admin","hr_employees","hr_payroll","hr_analytics","hr_attendance","hr_directory","clients","finance","ai","recruitment","audit","recognition","calendar","workflows","surveys","funds","icm","workstation","messaging"]),
  HR_MANAGER: new Set(["dashboard","portal","hr_admin","hr_employees","hr_payroll","hr_leave","hr_expenses","hr_compliance","hr_onboarding","hr_analytics","hr_attendance","hr_performance","hr_goals","hr_directory","hr_helpdesk","hr_training","recruitment","salary_advance","resignation","grievance","shift_management","asset_management","travel","timesheets","recognition","calendar","workflows","surveys","documents","visitors","benefits","letters","purchase_requests","funds","icm","messaging"]),
  MANAGER: new Set(["dashboard","portal","projects","hr_leave","hr_expenses","hr_attendance","hr_performance","hr_goals","hr_directory","hr_helpdesk","hr_training","salary_advance","resignation","timesheets","recognition","calendar","purchase_requests","icm","workstation","messaging"]),
  PRODUCT_MANAGER: new Set(["dashboard","portal","projects","iot","hr_leave","hr_expenses","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","clients","recruitment","timesheets","recognition","calendar","workstation","messaging"]),
  ENGINEER: new Set(["dashboard","portal","projects","iot","hr_leave","hr_expenses","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","ai","salary_advance","resignation","asset_management","grievance","timesheets","recognition","calendar","icm","workstation","messaging"]),
  DEVELOPER: new Set(["dashboard","portal","projects","hr_leave","hr_expenses","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","salary_advance","resignation","grievance","timesheets","recognition","calendar","icm","workstation","messaging"]),
  TESTER: new Set(["dashboard","portal","projects","hr_leave","hr_expenses","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","salary_advance","resignation","grievance","timesheets","recognition","calendar","icm","workstation","messaging"]),
  INTERN: new Set(["dashboard","portal","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","grievance","recognition","calendar","messaging"]),
  MARKETING: new Set(["dashboard","portal","hr_leave","hr_expenses","hr_attendance","hr_goals","hr_directory","hr_helpdesk","hr_training","clients","salary_advance","resignation","grievance","recognition","calendar","messaging"]),
  CLIENT: new Set(["dashboard","clients"]),
  CANDIDATE: new Set(["dashboard","jobs_browse"]),
};

/** All sidebar sections with module requirements */
const ALL_SECTIONS: Array<{ label: string; railIcon: string; items: Array<{ href: string; label: string; icon: string; module: string }> }> = [
  { label: "Overview", railIcon: "🏠", items: [
    { href: "/dashboard", label: "Command Center", icon: "🏠", module: "dashboard" },
  ]},
  { label: "My Work", railIcon: "📊", items: [
    { href: "/portal", label: "My Dashboard", icon: "📊", module: "portal" },
    { href: "/portal/attendance", label: "Attendance", icon: "⏰", module: "hr_attendance" },
    { href: "/portal/goals", label: "Goals", icon: "🎯", module: "hr_goals" },
    { href: "/portal/leaves", label: "Leaves", icon: "🏖️", module: "hr_leave" },
    { href: "/portal/expenses", label: "Expenses", icon: "🧾", module: "hr_expenses" },
    { href: "/portal/payslips", label: "Payslips", icon: "💰", module: "hr_payroll" },
  ]},
  { label: "Self Service", railIcon: "👤", items: [
    { href: "/portal/profile", label: "My Profile", icon: "👤", module: "portal" },
    { href: "/portal/letters", label: "My Letters", icon: "✉️", module: "portal" },
    { href: "/portal/purchase-requests", label: "Purchases", icon: "🛒", module: "purchase_requests" },
    { href: "/portal/salary-advance", label: "Salary Advance", icon: "💸", module: "salary_advance" },
    { href: "/portal/helpdesk", label: "Helpdesk", icon: "🎫", module: "hr_helpdesk" },
    { href: "/portal/training", label: "Training", icon: "📚", module: "hr_training" },
    { href: "/portal/directory", label: "Directory", icon: "👥", module: "hr_directory" },
    { href: "/portal/resignation", label: "Resignation", icon: "📝", module: "resignation" },
  ]},
  { label: "Collaborate", railIcon: "💬", items: [
    { href: "/messages", label: "Messages", icon: "💬", module: "messaging" },
    { href: "/recognition", label: "Recognition", icon: "🏆", module: "recognition" },
    { href: "/calendar", label: "Calendar", icon: "📅", module: "calendar" },
    { href: "/icm", label: "Incidents", icon: "🎫", module: "icm" },
  ]},
  { label: "WorkStation", railIcon: "📋", items: [
    { href: "/workstation", label: "Kanban Board", icon: "📋", module: "workstation" },
    { href: "/workstation/boards", label: "All Boards", icon: "📊", module: "workstation" },
    { href: "/workstation/tasks", label: "Tasks", icon: "✅", module: "workstation" },
    { href: "/workstation/sprints", label: "Sprints", icon: "🏃", module: "workstation" },
  ]},
  { label: "Knowledge", railIcon: "📖", items: [
    { href: "/wiki", label: "Wiki", icon: "📖", module: "portal" },
    { href: "/api-docs", label: "API Docs", icon: "📚", module: "settings" },
  ]},
  { label: "DevFlow", railIcon: "🚀", items: [
    { href: "/devflow", label: "Dashboard", icon: "🚀", module: "projects" },
    { href: "/devflow/pipelines", label: "Pipelines", icon: "🔄", module: "projects" },
  ]},
  { label: "Engineering", railIcon: "⚙️", items: [
    { href: "/projects", label: "Projects", icon: "📊", module: "projects" },
    { href: "/projects/analytics", label: "Analytics", icon: "📈", module: "projects" },
  ]},
  { label: "IoT Platform", railIcon: "📡", items: [
    { href: "/iot", label: "Devices", icon: "📡", module: "iot" },
    { href: "/iot/command-center", label: "Command Center", icon: "🏛️", module: "iot" },
    { href: "/iot/health", label: "Health", icon: "💓", module: "iot" },
    { href: "/iot/fleet", label: "Fleet", icon: "🚀", module: "iot" },
  ]},
  { label: "People", railIcon: "👥", items: [
    { href: "/hr", label: "Employees", icon: "👥", module: "hr_employees" },
    { href: "/hr/user-management", label: "User Mgmt", icon: "🔑", module: "hr_onboarding" },
    { href: "/hr/payroll", label: "Payroll", icon: "💰", module: "hr_payroll" },
    { href: "/hr/leave", label: "Leave Mgmt", icon: "🏖️", module: "hr_admin" },
    { href: "/hr/performance", label: "Performance", icon: "📈", module: "hr_performance" },
    { href: "/hr/onboarding", label: "Onboarding", icon: "🎯", module: "hr_onboarding" },
    { href: "/hr/interns", label: "Interns", icon: "🎓", module: "hr_onboarding" },
    { href: "/hr/analytics", label: "Analytics", icon: "📊", module: "hr_analytics" },
  ]},
  { label: "Operations", railIcon: "⏱️", items: [
    { href: "/hr/timesheets", label: "Timesheets", icon: "⏱️", module: "timesheets" },
    { href: "/hr/shifts", label: "Shifts", icon: "🔄", module: "shift_management" },
    { href: "/hr/expenses", label: "Expenses", icon: "🧾", module: "hr_admin" },
    { href: "/hr/assets", label: "Assets", icon: "🖥️", module: "asset_management" },
    { href: "/hr/travel", label: "Travel", icon: "✈️", module: "travel" },
    { href: "/hr/visitors", label: "Visitors", icon: "🏢", module: "visitors" },
    { href: "/hr/grievances", label: "Grievances", icon: "⚠️", module: "grievance" },
  ]},
  { label: "Documents", railIcon: "📄", items: [
    { href: "/hr/letters", label: "Letters", icon: "✉️", module: "letters" },
    { href: "/hr/documents", label: "Templates", icon: "📄", module: "documents" },
    { href: "/hr/purchase-requests", label: "Purchases", icon: "🛒", module: "purchase_requests" },
    { href: "/hr/funds", label: "Funds", icon: "🏦", module: "funds" },
  ]},
  { label: "Compliance", railIcon: "🔒", items: [
    { href: "/hr/compliance", label: "HR Compliance", icon: "📋", module: "hr_compliance" },
    { href: "/hr/surveys", label: "Surveys", icon: "📊", module: "surveys" },
    { href: "/hr/benefits", label: "Benefits", icon: "🏥", module: "benefits" },
    { href: "/hr/workflows", label: "Workflows", icon: "⚡", module: "workflows" },
  ]},
  { label: "CRM", railIcon: "💼", items: [
    { href: "/clients", label: "Clients", icon: "💼", module: "clients" },
    { href: "/clients/analytics", label: "Analytics", icon: "📉", module: "clients" },
  ]},
  { label: "Finance", railIcon: "💰", items: [
    { href: "/finance", label: "Dashboard", icon: "💰", module: "finance" },
    { href: "/finance/accounts", label: "Accounts", icon: "📊", module: "finance" },
    { href: "/finance/journals", label: "Journals", icon: "📒", module: "finance" },
    { href: "/finance/reports", label: "Reports", icon: "📋", module: "finance" },
    { href: "/finance/gst", label: "GST", icon: "🏛️", module: "finance" },
    { href: "/finance/budget", label: "Budget", icon: "💎", module: "finance" },
  ]},
  { label: "AI / ML", railIcon: "🤖", items: [
    { href: "/ai", label: "Orchestrator", icon: "🤖", module: "ai" },
    { href: "/ai/models", label: "Models", icon: "🧠", module: "ai" },
    { href: "/ai/scheduler", label: "Scheduler", icon: "⚡", module: "ai" },
  ]},
  { label: "Careers", railIcon: "🎯", items: [
    { href: "/careers", label: "Open Positions", icon: "💼", module: "jobs_browse" },
    { href: "/careers/my-applications", label: "My Applications", icon: "📄", module: "jobs_browse" },
  ]},
  { label: "Recruitment", railIcon: "🎙️", items: [
    { href: "/recruitment", label: "Dashboard", icon: "🎯", module: "recruitment" },
    { href: "/recruitment/jobs", label: "Job Postings", icon: "📋", module: "recruitment" },
    { href: "/recruitment/candidates", label: "Candidates", icon: "👤", module: "recruitment" },
    { href: "/recruitment/pools", label: "Talent Pools", icon: "🏊", module: "recruitment" },
    { href: "/recruitment/interviews", label: "Interviews", icon: "🎙️", module: "recruitment" },
  ]},
  { label: "System", railIcon: "🔧", items: [
    { href: "/audit", label: "Audit Log", icon: "🔍", module: "audit" },
    { href: "/audit/compliance", label: "Compliance", icon: "🔒", module: "audit" },
    { href: "/settings", label: "Settings", icon: "⚙️", module: "settings" },
    { href: "/settings/feature-flags", label: "Feature Flags", icon: "🚩", module: "feature_flags" },
  ]},
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isDragging, setIsDragging] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  const MIN_WIDTH = 180;
  const MAX_WIDTH = 400;
  const COLLAPSED_WIDTH = 56;

  // Drag-to-resize handler
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

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

  const toggleSection = useCallback((label: string) => {
    if (!expanded) {
      setExpanded(true);
      setActiveSection(label);
    } else {
      setActiveSection(prev => (prev === label ? null : label));
    }
  }, [expanded]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-white dark:bg-slate-950"><div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div>;
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-slate-950">
        <div className="text-center animate-fade-in">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Sign In Required</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Please sign in to continue.</p>
          <a href="/login" className="mt-4 inline-block rounded-lg bg-brand-600 px-6 py-2 text-sm text-white hover:bg-brand-700 shadow-sm transition-all">Sign In</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      {/* Mobile overlay */}
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden backdrop-blur-sm" onClick={() => { setMobileOpen(false); setActiveSection(null); }} />}

      {/* Sidebar — collapsible + draggable resize */}
      <aside
        ref={sidebarRef}
        style={expanded ? { width: sidebarWidth } : { width: COLLAPSED_WIDTH }}
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0b0f19] ${isDragging ? "" : "transition-[width] duration-300 ease-in-out"} ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:relative lg:translate-x-0`}
      >
        {/* Logo + expand toggle */}
        <div className="flex h-14 items-center justify-between border-b border-slate-200 dark:border-slate-800 px-3">
          <a href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white shadow-md transition-transform hover:scale-105">CT</div>
            {expanded && <span className="text-base font-bold text-slate-900 dark:text-white tracking-tight truncate">Circuvent</span>}
          </a>
          <button
            onClick={() => { setExpanded(!expanded); if (expanded) setActiveSection(null); }}
            className="hidden lg:flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
            title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={expanded ? "M11 19l-7-7 7-7" : "M13 5l7 7-7 7"} /></svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-1.5 scrollbar-thin">
          {navSections.map((s) => (
            <div key={s.label} className="mb-0.5">
              {/* Section button */}
              <button
                onClick={() => toggleSection(s.label)}
                className={`group relative flex w-full items-center gap-2.5 rounded-xl px-2 py-[7px] transition-all duration-200 ${
                  activeSection === s.label
                    ? "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/5 dark:hover:text-slate-300"
                }`}
                title={!expanded ? s.label : undefined}
              >
                <span className="text-[17px] flex-shrink-0 w-7 text-center">{s.railIcon}</span>
                {expanded && (
                  <>
                    <span className="flex-1 text-left text-[13px] font-medium truncate">{s.label}</span>
                    <svg className={`h-3 w-3 flex-shrink-0 text-slate-400 transition-transform duration-200 ${activeSection === s.label ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </>
                )}
                {/* Tooltip when collapsed */}
                {!expanded && (
                  <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-slate-700 z-[60]">
                    {s.label}
                  </span>
                )}
              </button>

              {/* Expanded sub-items */}
              {expanded && activeSection === s.label && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-slate-200 dark:border-slate-800 pl-2">
                  {s.items.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-2 py-[6px] text-[12px] text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white transition-all duration-150"
                    >
                      <span className="text-[13px] flex-shrink-0 w-4 text-center">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-slate-200 dark:border-slate-800 p-2">
          {expanded ? (
            <div className="flex items-center justify-between px-1">
              <a href="/portal/profile" className="flex items-center gap-2 min-w-0">
                {user.avatarUrl ? <img src={user.avatarUrl} alt={`${user.firstName} ${user.lastName}`} className="h-8 w-8 flex-shrink-0 rounded-full object-cover shadow-sm" /> : <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[11px] font-bold text-white shadow-sm">{user.firstName?.[0]}{user.lastName?.[0]}</div>}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">{user.firstName} {user.lastName}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">{user.role?.replace(/_/g, " ")}</p>
                </div>
              </a>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <ThemeToggleCompact />
                <button onClick={logout} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors" title="Sign out">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <ThemeToggleCompact />
              <a href="/portal/profile" title={`${user.firstName} ${user.lastName}`}>
                {user.avatarUrl ? <img src={user.avatarUrl} alt={`${user.firstName} ${user.lastName}`} className="h-8 w-8 rounded-full object-cover shadow-sm transition-transform hover:scale-105" /> : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[11px] font-bold text-white shadow-sm transition-transform hover:scale-105">{user.firstName?.[0]}{user.lastName?.[0]}</div>}
              </a>
              <button onClick={logout} className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors" title="Sign out">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          )}
        </div>

        {/* Drag handle for resize */}
        {expanded && (
          <div
            onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
            className={`absolute inset-y-0 -right-1 z-[60] hidden w-2 cursor-col-resize lg:block group ${isDragging ? "bg-brand-500/20" : "hover:bg-brand-500/10"}`}
          >
            <div className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors ${isDragging ? "bg-brand-500" : "bg-transparent group-hover:bg-brand-400/50"}`} />
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-12 items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80 transition-colors">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white lg:hidden"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
            <span className="text-xs text-slate-400 dark:text-slate-600 hidden lg:block">Circuvent Platform v2.0</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-600 sm:block">{user.role?.replace(/_/g, " ")}</span>
            <a href="/portal/profile" className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors">{user.firstName}</a>
            <button onClick={logout} className="text-xs text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">Sign Out</button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6 transition-colors duration-300 page-enter">{children}</main>
      </div>
    </div>
  );
}

function ThemeToggleCompact() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 hover:bg-slate-100 dark:hover:bg-white/5"
      title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
    >
      {resolvedTheme === "dark" ? (
        <svg className="h-3.5 w-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )}
    </button>
  );
}
