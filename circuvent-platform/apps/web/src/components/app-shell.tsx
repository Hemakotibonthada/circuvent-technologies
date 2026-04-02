"use client";

// ──────────────────────────────────────────────────────────────
// App Shell — Top-bar navigation with Launchpad-style feature cards.
// No sidebar — clean full-width layout with role-based access.
// ──────────────────────────────────────────────────────────────

import React, { useState, useMemo } from "react";
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

/** Section color themes for the cards */
const SECTION_COLORS: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  "Overview":     { bg: "from-indigo-500/5 to-indigo-600/10", border: "border-indigo-500/20 hover:border-indigo-500/40", text: "text-indigo-600 dark:text-indigo-400", iconBg: "bg-indigo-500/10" },
  "My Work":      { bg: "from-blue-500/5 to-blue-600/10", border: "border-blue-500/20 hover:border-blue-500/40", text: "text-blue-600 dark:text-blue-400", iconBg: "bg-blue-500/10" },
  "Self Service": { bg: "from-violet-500/5 to-violet-600/10", border: "border-violet-500/20 hover:border-violet-500/40", text: "text-violet-600 dark:text-violet-400", iconBg: "bg-violet-500/10" },
  "Collaborate":  { bg: "from-pink-500/5 to-pink-600/10", border: "border-pink-500/20 hover:border-pink-500/40", text: "text-pink-600 dark:text-pink-400", iconBg: "bg-pink-500/10" },
  "WorkStation":  { bg: "from-cyan-500/5 to-cyan-600/10", border: "border-cyan-500/20 hover:border-cyan-500/40", text: "text-cyan-600 dark:text-cyan-400", iconBg: "bg-cyan-500/10" },
  "Knowledge":    { bg: "from-amber-500/5 to-amber-600/10", border: "border-amber-500/20 hover:border-amber-500/40", text: "text-amber-600 dark:text-amber-400", iconBg: "bg-amber-500/10" },
  "DevFlow":      { bg: "from-emerald-500/5 to-emerald-600/10", border: "border-emerald-500/20 hover:border-emerald-500/40", text: "text-emerald-600 dark:text-emerald-400", iconBg: "bg-emerald-500/10" },
  "Engineering":  { bg: "from-slate-500/5 to-slate-600/10", border: "border-slate-500/20 hover:border-slate-500/40", text: "text-slate-600 dark:text-slate-400", iconBg: "bg-slate-500/10" },
  "IoT Platform": { bg: "from-teal-500/5 to-teal-600/10", border: "border-teal-500/20 hover:border-teal-500/40", text: "text-teal-600 dark:text-teal-400", iconBg: "bg-teal-500/10" },
  "People":       { bg: "from-sky-500/5 to-sky-600/10", border: "border-sky-500/20 hover:border-sky-500/40", text: "text-sky-600 dark:text-sky-400", iconBg: "bg-sky-500/10" },
  "Operations":   { bg: "from-orange-500/5 to-orange-600/10", border: "border-orange-500/20 hover:border-orange-500/40", text: "text-orange-600 dark:text-orange-400", iconBg: "bg-orange-500/10" },
  "Documents":    { bg: "from-lime-500/5 to-lime-600/10", border: "border-lime-500/20 hover:border-lime-500/40", text: "text-lime-600 dark:text-lime-400", iconBg: "bg-lime-500/10" },
  "Compliance":   { bg: "from-yellow-500/5 to-yellow-600/10", border: "border-yellow-500/20 hover:border-yellow-500/40", text: "text-yellow-600 dark:text-yellow-400", iconBg: "bg-yellow-500/10" },
  "CRM":          { bg: "from-fuchsia-500/5 to-fuchsia-600/10", border: "border-fuchsia-500/20 hover:border-fuchsia-500/40", text: "text-fuchsia-600 dark:text-fuchsia-400", iconBg: "bg-fuchsia-500/10" },
  "Finance":      { bg: "from-green-500/5 to-green-600/10", border: "border-green-500/20 hover:border-green-500/40", text: "text-green-600 dark:text-green-400", iconBg: "bg-green-500/10" },
  "AI / ML":      { bg: "from-purple-500/5 to-purple-600/10", border: "border-purple-500/20 hover:border-purple-500/40", text: "text-purple-600 dark:text-purple-400", iconBg: "bg-purple-500/10" },
  "Careers":      { bg: "from-rose-500/5 to-rose-600/10", border: "border-rose-500/20 hover:border-rose-500/40", text: "text-rose-600 dark:text-rose-400", iconBg: "bg-rose-500/10" },
  "Recruitment":  { bg: "from-red-500/5 to-red-600/10", border: "border-red-500/20 hover:border-red-500/40", text: "text-red-600 dark:text-red-400", iconBg: "bg-red-500/10" },
  "System":       { bg: "from-zinc-500/5 to-zinc-600/10", border: "border-zinc-500/20 hover:border-zinc-500/40", text: "text-zinc-600 dark:text-zinc-400", iconBg: "bg-zinc-500/10" },
};

const DEFAULT_COLOR = { bg: "from-slate-500/5 to-slate-600/10", border: "border-slate-500/20 hover:border-slate-500/40", text: "text-slate-600 dark:text-slate-400", iconBg: "bg-slate-500/10" };

/** All navigation sections with module requirements */
export const ALL_SECTIONS: Array<{ label: string; railIcon: string; description: string; items: Array<{ href: string; label: string; icon: string; module: string }> }> = [
  { label: "Overview", railIcon: "🏠", description: "Command center and platform overview", items: [
    { href: "/dashboard", label: "Command Center", icon: "🏠", module: "dashboard" },
  ]},
  { label: "My Work", railIcon: "📊", description: "Your daily tasks, attendance, and payslips", items: [
    { href: "/portal", label: "My Dashboard", icon: "📊", module: "portal" },
    { href: "/portal/attendance", label: "Attendance", icon: "⏰", module: "hr_attendance" },
    { href: "/portal/goals", label: "Goals", icon: "🎯", module: "hr_goals" },
    { href: "/portal/leaves", label: "Leaves", icon: "🏖️", module: "hr_leave" },
    { href: "/portal/expenses", label: "Expenses", icon: "🧾", module: "hr_expenses" },
    { href: "/portal/payslips", label: "Payslips", icon: "💰", module: "hr_payroll" },
  ]},
  { label: "Self Service", railIcon: "👤", description: "Profile, helpdesk, training, and more", items: [
    { href: "/portal/profile", label: "My Profile", icon: "👤", module: "portal" },
    { href: "/portal/letters", label: "My Letters", icon: "✉️", module: "portal" },
    { href: "/portal/purchase-requests", label: "Purchases", icon: "🛒", module: "purchase_requests" },
    { href: "/portal/salary-advance", label: "Salary Advance", icon: "💸", module: "salary_advance" },
    { href: "/portal/helpdesk", label: "Helpdesk", icon: "🎫", module: "hr_helpdesk" },
    { href: "/portal/training", label: "Training", icon: "📚", module: "hr_training" },
    { href: "/portal/directory", label: "Directory", icon: "👥", module: "hr_directory" },
    { href: "/portal/resignation", label: "Resignation", icon: "📝", module: "resignation" },
  ]},
  { label: "Collaborate", railIcon: "💬", description: "Messages, recognition, and calendar", items: [
    { href: "/messages", label: "Messages", icon: "💬", module: "messaging" },
    { href: "/recognition", label: "Recognition", icon: "🏆", module: "recognition" },
    { href: "/calendar", label: "Calendar", icon: "📅", module: "calendar" },
    { href: "/icm", label: "Incidents", icon: "🎫", module: "icm" },
  ]},
  { label: "WorkStation", railIcon: "📋", description: "Kanban boards, tasks, and sprint planning", items: [
    { href: "/workstation", label: "Kanban Board", icon: "📋", module: "workstation" },
    { href: "/workstation/boards", label: "All Boards", icon: "📊", module: "workstation" },
    { href: "/workstation/tasks", label: "Tasks", icon: "✅", module: "workstation" },
    { href: "/workstation/sprints", label: "Sprints", icon: "🏃", module: "workstation" },
  ]},
  { label: "Knowledge", railIcon: "📖", description: "Wiki and API documentation", items: [
    { href: "/wiki", label: "Wiki", icon: "📖", module: "portal" },
    { href: "/api-docs", label: "API Docs", icon: "📚", module: "settings" },
  ]},
  { label: "DevFlow", railIcon: "🚀", description: "CI/CD pipelines and deployment flow", items: [
    { href: "/devflow", label: "Dashboard", icon: "🚀", module: "projects" },
    { href: "/devflow/pipelines", label: "Pipelines", icon: "🔄", module: "projects" },
  ]},
  { label: "Engineering", railIcon: "⚙️", description: "Project management and analytics", items: [
    { href: "/projects", label: "Projects", icon: "📊", module: "projects" },
    { href: "/projects/analytics", label: "Analytics", icon: "📈", module: "projects" },
  ]},
  { label: "IoT Platform", railIcon: "📡", description: "Device management and fleet monitoring", items: [
    { href: "/iot", label: "Devices", icon: "📡", module: "iot" },
    { href: "/iot/command-center", label: "Command Center", icon: "🏛️", module: "iot" },
    { href: "/iot/health", label: "Health", icon: "💓", module: "iot" },
    { href: "/iot/fleet", label: "Fleet", icon: "🚀", module: "iot" },
  ]},
  { label: "People", railIcon: "👥", description: "Employee management and HR admin", items: [
    { href: "/hr", label: "Employees", icon: "👥", module: "hr_employees" },
    { href: "/hr/user-management", label: "User Mgmt", icon: "🔑", module: "hr_onboarding" },
    { href: "/hr/payroll", label: "Payroll", icon: "💰", module: "hr_payroll" },
    { href: "/hr/leave", label: "Leave Mgmt", icon: "🏖️", module: "hr_admin" },
    { href: "/hr/performance", label: "Performance", icon: "📈", module: "hr_performance" },
    { href: "/hr/onboarding", label: "Onboarding", icon: "🎯", module: "hr_onboarding" },
    { href: "/hr/interns", label: "Interns", icon: "🎓", module: "hr_onboarding" },
    { href: "/hr/analytics", label: "Analytics", icon: "📊", module: "hr_analytics" },
  ]},
  { label: "Operations", railIcon: "⏱️", description: "Timesheets, shifts, travel, and assets", items: [
    { href: "/hr/timesheets", label: "Timesheets", icon: "⏱️", module: "timesheets" },
    { href: "/hr/shifts", label: "Shifts", icon: "🔄", module: "shift_management" },
    { href: "/hr/expenses", label: "Expenses", icon: "🧾", module: "hr_admin" },
    { href: "/hr/assets", label: "Assets", icon: "🖥️", module: "asset_management" },
    { href: "/hr/travel", label: "Travel", icon: "✈️", module: "travel" },
    { href: "/hr/visitors", label: "Visitors", icon: "🏢", module: "visitors" },
    { href: "/hr/grievances", label: "Grievances", icon: "⚠️", module: "grievance" },
  ]},
  { label: "Documents", railIcon: "📄", description: "Letters, templates, and fund management", items: [
    { href: "/hr/letters", label: "Letters", icon: "✉️", module: "letters" },
    { href: "/hr/documents", label: "Templates", icon: "📄", module: "documents" },
    { href: "/hr/purchase-requests", label: "Purchases", icon: "🛒", module: "purchase_requests" },
    { href: "/hr/funds", label: "Funds", icon: "🏦", module: "funds" },
  ]},
  { label: "Compliance", railIcon: "🔒", description: "Compliance, surveys, benefits, workflows", items: [
    { href: "/hr/compliance", label: "HR Compliance", icon: "📋", module: "hr_compliance" },
    { href: "/hr/surveys", label: "Surveys", icon: "📊", module: "surveys" },
    { href: "/hr/benefits", label: "Benefits", icon: "🏥", module: "benefits" },
    { href: "/hr/workflows", label: "Workflows", icon: "⚡", module: "workflows" },
  ]},
  { label: "CRM", railIcon: "💼", description: "Client management and sales analytics", items: [
    { href: "/clients", label: "Clients", icon: "💼", module: "clients" },
    { href: "/clients/analytics", label: "Analytics", icon: "📉", module: "clients" },
  ]},
  { label: "Finance", railIcon: "💰", description: "Accounting, journals, GST, and budgets", items: [
    { href: "/finance", label: "Dashboard", icon: "💰", module: "finance" },
    { href: "/finance/accounts", label: "Accounts", icon: "📊", module: "finance" },
    { href: "/finance/journals", label: "Journals", icon: "📒", module: "finance" },
    { href: "/finance/reports", label: "Reports", icon: "📋", module: "finance" },
    { href: "/finance/gst", label: "GST", icon: "🏛️", module: "finance" },
    { href: "/finance/budget", label: "Budget", icon: "💎", module: "finance" },
  ]},
  { label: "AI / ML", railIcon: "🤖", description: "AI orchestration, models, and scheduling", items: [
    { href: "/ai", label: "Orchestrator", icon: "🤖", module: "ai" },
    { href: "/ai/models", label: "Models", icon: "🧠", module: "ai" },
    { href: "/ai/scheduler", label: "Scheduler", icon: "⚡", module: "ai" },
  ]},
  { label: "Careers", railIcon: "🎯", description: "Browse open positions and applications", items: [
    { href: "/careers", label: "Open Positions", icon: "💼", module: "jobs_browse" },
    { href: "/careers/my-applications", label: "My Applications", icon: "📄", module: "jobs_browse" },
  ]},
  { label: "Recruitment", railIcon: "🎙️", description: "Job postings, candidates, and interviews", items: [
    { href: "/recruitment", label: "Dashboard", icon: "🎯", module: "recruitment" },
    { href: "/recruitment/jobs", label: "Job Postings", icon: "📋", module: "recruitment" },
    { href: "/recruitment/candidates", label: "Candidates", icon: "👤", module: "recruitment" },
    { href: "/recruitment/pools", label: "Talent Pools", icon: "🏊", module: "recruitment" },
    { href: "/recruitment/interviews", label: "Interviews", icon: "🎙️", module: "recruitment" },
  ]},
  { label: "System", railIcon: "🔧", description: "Audit logs, settings, and feature flags", items: [
    { href: "/audit", label: "Audit Log", icon: "🔍", module: "audit" },
    { href: "/audit/compliance", label: "Compliance", icon: "🔒", module: "audit" },
    { href: "/settings", label: "Settings", icon: "⚙️", module: "settings" },
    { href: "/settings/feature-flags", label: "Feature Flags", icon: "🚩", module: "feature_flags" },
  ]},
];

/** Get filtered sections for a given role */
export function getNavSections(role: string | undefined) {
  if (!role) return [];
  const allowedModules = ROLE_MODULES[role] || new Set<string>();
  return ALL_SECTIONS
    .map(section => ({
      ...section,
      items: section.items.filter(item => allowedModules.has(item.module)),
    }))
    .filter(section => section.items.length > 0);
}

export { SECTION_COLORS, DEFAULT_COLOR };

// ══════════════════════════════════════════════════════════════
// App Shell — Clean top-bar layout (no sidebar)
// ══════════════════════════════════════════════════════════════

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
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

  const quickLinks = [
    { href: "/dashboard", label: "Dashboard", icon: "🏠" },
    { href: "/portal", label: "Portal", icon: "📊" },
    { href: "/launchpad", label: "All Apps", icon: "🚀" },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      {/* Top Navigation Bar */}
      <header className="relative z-50 flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur-xl dark:border-slate-800 dark:bg-[#0b0f19]/90 sm:px-6">
        {/* Left: Logo + Quick Links */}
        <div className="flex items-center gap-4">
          <a href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-[10px] font-bold text-white shadow-md">CT</div>
            <span className="hidden text-sm font-bold text-slate-900 dark:text-white tracking-tight sm:block">Circuvent</span>
          </a>
          <div className="hidden items-center gap-1 md:flex">
            {quickLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white transition-all"
              >
                <span className="text-sm">{link.icon}</span>
                <span>{link.label}</span>
              </a>
            ))}
          </div>
        </div>

        {/* Right: User controls */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a
            href="/portal/profile"
            className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[10px] font-bold text-white">
              {user.firstName?.[0]}{user.lastName?.[0]}
            </div>
            <div className="hidden sm:block">
              <p className="text-[12px] font-medium text-slate-900 dark:text-white leading-tight">{user.firstName}</p>
              <p className="text-[9px] text-slate-400 uppercase tracking-wider">{user.role?.replace(/_/g, " ")}</p>
            </div>
          </a>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
            title="Sign out"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          </button>
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white md:hidden transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} /></svg>
          </button>
        </div>
      </header>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="absolute top-14 inset-x-0 z-40 border-b border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-[#0b0f19] md:hidden">
          <div className="flex flex-col gap-1">
            {quickLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white transition-colors"
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Main content — full width */}
      <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors duration-300 page-enter">
        {children}
      </main>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="flex h-8 w-8 items-center justify-center rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5"
      title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
    >
      {resolvedTheme === "dark" ? (
        <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ) : (
        <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )}
    </button>
  );
}
