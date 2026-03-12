"use client";

// ══════════════════════════════════════════════════════════════
// Manager Dashboard — Team view, approvals, performance
// ══════════════════════════════════════════════════════════════

import React from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui";

export default function ManagerDashboard() {
  const { user } = useAuth();
  const { data: projects } = useApi<any[]>("/projects");
  const { data: timesheetReport } = useApi<any>("/hr/timesheets/reports/summary");
  const { data: leaveStats } = useApi<any>("/hr/leave");
  const { data: goals } = useApi<any[]>("/hr/goals");
  const { data: shiftDash } = useApi<any>("/hr/shifts/dashboard");

  const activeProjects = projects?.filter(p => p.status === "ACTIVE")?.length || 0;
  const pendingTimesheets = timesheetReport?.totalSubmitted || 0;
  const teamSize = projects?.reduce((s, p) => s + (p.members?.length || 0), 0) || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Team Command Center`}
        subtitle={`Welcome, ${user?.firstName || "Manager"} — manage your team's performance`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Active Projects" value={activeProjects} icon="📊" color="blue" />
        <StatCard title="Pending Timesheets" value={pendingTimesheets} icon="⏰" color="amber" />
        <StatCard title="Team Goals" value={goals?.length || 0} icon="🎯" color="green" />
        <StatCard title="Today Shifts" value={shiftDash?.todayScheduled || 0} icon="📅" color="purple" />
      </div>

      {/* Approval Queue */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Approval Queue</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <a href="/portal/leaves" className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 transition-colors hover:bg-amber-500/10">
            <p className="text-sm font-medium text-amber-400">Leave Requests</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {leaveStats?.filter?.((l: any) => l.status === "PENDING")?.length || 0}
            </p>
            <p className="text-xs text-slate-500">Pending your approval</p>
          </a>
          <a href="/portal/expenses" className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 transition-colors hover:bg-blue-500/10">
            <p className="text-sm font-medium text-blue-400">Expense Claims</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">0</p>
            <p className="text-xs text-slate-500">Need review</p>
          </a>
          <a href="/hr/timesheets" className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4 transition-colors hover:bg-purple-500/10">
            <p className="text-sm font-medium text-purple-400">Timesheets</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{pendingTimesheets}</p>
            <p className="text-xs text-slate-500">Submitted for review</p>
          </a>
        </div>
      </Card>

      {/* Projects + Team Performance */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Your Projects</h3>
          <div className="space-y-3">
            {projects?.slice(0, 6).map((p: any) => (
              <a key={p.id} href={`/projects/${p.id}`} className="block rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50 transition-colors hover:bg-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</span>
                  <Badge color={p.status === "ACTIVE" ? "green" : p.status === "COMPLETED" ? "blue" : "amber"}>
                    {p.status}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${p.progress || 0}%` }} />
                  </div>
                  <span className="text-xs text-slate-400">{p.progress || 0}%</span>
                </div>
              </a>
            ))}
            {(!projects || projects.length === 0) && (
              <p className="py-4 text-center text-sm text-slate-500">No projects assigned</p>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Team Goals Overview</h3>
          <div className="space-y-2">
            {goals?.slice(0, 8).map((g: any) => (
              <div key={g.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-slate-900 dark:text-white">{g.title}</p>
                  <p className="text-xs text-slate-500">{g.employee?.user?.firstName || "—"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-1.5 rounded-full bg-green-500"
                      style={{ width: `${g.progress || 0}%` }}
                    />
                  </div>
                  <Badge color={g.status === "COMPLETED" ? "green" : g.status === "IN_PROGRESS" ? "blue" : "slate"}>
                    {g.status}
                  </Badge>
                </div>
              </div>
            ))}
            {(!goals || goals.length === 0) && (
              <p className="py-4 text-center text-sm text-slate-500">No goals set</p>
            )}
          </div>
        </Card>
      </div>

      {/* Timesheet Analytics */}
      {timesheetReport && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Timesheet Analytics</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7004 text-center">
              <p className="text-xl font-bold text-slate-900 dark:text-white">{timesheetReport.averageWeeklyHours || 0}</p>
              <p className="text-xs text-slate-400">Avg Weekly Hours</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7004 text-center">
              <p className="text-xl font-bold text-slate-900 dark:text-white">{timesheetReport.billableRate || 0}%</p>
              <p className="text-xs text-slate-400">Billable Rate</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7004 text-center">
              <p className="text-xl font-bold text-slate-900 dark:text-white">{timesheetReport.totalSubmitted || 0}</p>
              <p className="text-xs text-slate-400">Submitted</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7004 text-center">
              <p className="text-xl font-bold text-slate-900 dark:text-white">{timesheetReport.totalApproved || 0}</p>
              <p className="text-xs text-slate-400">Approved</p>
            </div>
          </div>
          {timesheetReport.byCategory && (
            <div className="mt-4 space-y-1">
              {timesheetReport.byCategory.map((c: any) => (
                <div key={c.category} className="flex items-center justify-between rounded bg-slate-100 dark:bg-slate-800/50 px-3 py-1.5">
                  <span className="text-xs text-slate-600 dark:text-slate-300">{c.category}</span>
                  <span className="text-xs font-medium text-slate-900 dark:text-white">{c.hours}h</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            { label: "Projects", href: "/projects", icon: "📊" },
            { label: "Team Directory", href: "/portal/directory", icon: "👥" },
            { label: "Approvals", href: "/portal/leaves", icon: "✅" },
            { label: "Goals", href: "/portal/goals", icon: "🎯" },
            { label: "Timesheets", href: "/hr/timesheets", icon: "⏱️" },
            { label: "Training", href: "/portal/training", icon: "📚" },
            { label: "Recognition", href: "/hr/recognition", icon: "🏆" },
            { label: "Calendar", href: "/hr/calendar", icon: "📅" },
          ].map((l) => (
            <a key={l.label} href={l.href} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7003 text-sm text-slate-600 dark:text-slate-300 hover:border-brand-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white">
              <span>{l.icon}</span> {l.label}
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
