"use client";

// ══════════════════════════════════════════════════════════════
// HR Manager Dashboard — Workforce metrics, pending approvals
// ══════════════════════════════════════════════════════════════

import React from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

export default function HRManagerDashboard() {
  const { user } = useAuth();
  const { data: empDash } = useApi<any>("/hr/employees/dashboard");
  const { data: userStats } = useApi<any>("/auth/users/stats");
  const { data: travelDash } = useApi<any>("/hr/travel/dashboard");
  const { data: grievanceDash } = useApi<any>("/hr/grievances/dashboard/stats");
  const { data: shiftDash } = useApi<any>("/hr/shifts/dashboard");
  const { data: surveyDash } = useApi<any>("/hr/surveys/dashboard/stats");
  const { data: recognitionDash } = useApi<any>("/hr/recognition/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        title={`HR Command Center`}
        subtitle={`Welcome back, ${user?.firstName || "HR Manager"}`}
      />

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard title="Employees" value={empDash?.totalEmployees || 0} icon="👥" color="blue" />
        <StatCard title="Candidates" value={userStats?.pendingCandidates || 0} icon="🕐" color="amber" subtitle="Pending onboarding" />
        <StatCard title="Pending Expenses" value={empDash?.pendingExpenses || 0} icon="🧾" color="red" />
        <StatCard title="Active Shifts" value={shiftDash?.activeShiftDefinitions || 0} icon="⏰" color="cyan" />
        <StatCard title="Open Grievances" value={grievanceDash?.totalGrievances || 0} icon="⚠️" color="orange" />
        <StatCard title="Survey Responses" value={surveyDash?.totalResponses || 0} icon="📋" color="purple" />
      </div>

      {/* Pending Actions */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Pending Actions</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {[
            { label: "Travel Requests", count: travelDash?.byStatus?.find((s: any) => s.status === "SUBMITTED")?.count || 0, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20", href: "/hr/travel" },
            { label: "Candidate Onboarding", count: userStats?.pendingCandidates || 0, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20", href: "/hr/user-management" },
            { label: "Overdue Grievances", count: grievanceDash?.overdue || 0, color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-500/10 border-red-200 dark:border-red-500/20", href: "/hr/grievances" },
            { label: "Today Absent", count: shiftDash?.todayAbsent || 0, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-500/10 border-orange-500/20", href: "/hr/shifts" },
          ].map((item) => (
            <a key={item.label} href={item.href} className={`rounded-lg border p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${item.bg}`}>
              <p className={`text-sm font-medium ${item.color}`}>{item.label}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{item.count}</p>
            </a>
          ))}
        </div>
      </Card>

      {/* Department + Payroll Summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Department Headcount</h3>
          <div className="space-y-2">
            {empDash?.byDepartment?.map((d: any) => (
              <div key={d.department} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                <span className="text-sm text-slate-600 dark:text-slate-300">{d.department}</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{d._count?.id || 0}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">This Month Payroll</h3>
          <div className="flex flex-col items-center justify-center py-6">
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(empDash?.thisMonthPayroll?._sum?.netSalary || 0)}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {empDash?.thisMonthPayroll?._count?.id || 0} payslips processed
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            {empDash?.byType?.map((t: any) => (
              <div key={t.employmentType} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-center">
                <p className="text-lg font-bold text-slate-900 dark:text-white">{t._count?.id || 0}</p>
                <p className="text-xs text-slate-400">{(t.employmentType || "").replace(/_/g, " ")}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recognition + Travel Budget */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Recognition This Month</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{recognitionDash?.thisMonthRecognitions || 0}</p>
              <p className="text-xs text-slate-400">Recognitions</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{recognitionDash?.totalPointsDistributed || 0}</p>
              <p className="text-xs text-slate-400">Total Points</p>
            </div>
          </div>
          {recognitionDash?.topCategories?.slice(0, 3).map((c: any) => (
            <div key={c.category} className="mt-2 flex items-center justify-between rounded bg-slate-100 dark:bg-slate-800/50 px-3 py-1.5">
              <span className="text-xs text-slate-600 dark:text-slate-300">{c.category}</span>
              <span className="text-xs font-medium text-slate-900 dark:text-white">{c.count}</span>
            </div>
          ))}
        </Card>
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Travel Budget</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-center">
              <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(travelDash?.totalEstimatedBudget || 0)}</p>
              <p className="text-xs text-slate-400">Estimated</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-center">
              <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(travelDash?.totalActualCost || 0)}</p>
              <p className="text-xs text-slate-400">Actual</p>
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
            <p className="text-xs text-slate-400">Budget Utilization</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
                <div className="h-2 rounded-full bg-brand-500" style={{ width: `${travelDash?.budgetUtilization || 0}%` }} />
              </div>
              <span className="text-xs font-medium text-slate-900 dark:text-white">{travelDash?.budgetUtilization || 0}%</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Links */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
          {[
            { label: "User Mgmt", href: "/hr/user-management", icon: "🔑" },
            { label: "Employees", href: "/hr", icon: "👥" },
            { label: "Leave Mgmt", href: "/hr/leave", icon: "🏖️" },
            { label: "Payroll", href: "/hr/payroll", icon: "💰" },
            { label: "Recruitment", href: "/recruitment", icon: "🎯" },
            { label: "Analytics", href: "/hr/analytics", icon: "📊" },
            { label: "Documents", href: "/hr/documents", icon: "📄" },
            { label: "Surveys", href: "/hr/surveys", icon: "📋" },
            { label: "Workflows", href: "/hr/workflows", icon: "⚡" },
            { label: "Benefits", href: "/hr/benefits", icon: "🏥" },
            { label: "Visitors", href: "/hr/visitors", icon: "🏢" },
            { label: "Feature Flags", href: "/settings", icon: "🚩" },
          ].map((link) => (
            <a key={link.label} href={link.href} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm text-slate-600 dark:text-slate-300 transition-colors hover:border-brand-300 dark:hover:border-brand-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white">
              <span>{link.icon}</span> {link.label}
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
