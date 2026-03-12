"use client";

// ══════════════════════════════════════════════════════════════
// CEO / Executive Dashboard — KPIs, risk alerts, financial overview
// ══════════════════════════════════════════════════════════════

import React from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

interface OrgStats {
  totalEmployees: number;
  byDepartment: { department: string; _count: { id: number } }[];
  byType: { employmentType: string; _count: { id: number } }[];
  pendingExpenses: number;
  thisMonthPayroll: { _sum: { netSalary: number | null }; _count: { id: number } };
}

interface UserStats {
  totalUsers: number;
  totalEmployees: number;
  pendingCandidates: number;
  newRegistrations30d: number;
  byRole: { role: string; count: number }[];
  byStatus: { status: string; count: number }[];
}

interface ProjectData {
  id: string; name: string; status: string; type: string;
  startDate: string; budget: number; progress: number;
}

export default function CEODashboard() {
  const { user } = useAuth();
  const { data: orgStats } = useApi<OrgStats>("/hr/employees/dashboard");
  const { data: userStats } = useApi<UserStats>("/auth/users/stats");
  const { data: projects } = useApi<ProjectData[]>("/projects");
  const { data: financeData } = useApi<any>("/finance/accounts/trial-balance");

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const activeProjects = projects?.filter(p => p.status === "ACTIVE")?.length || 0;
  const totalBudget = projects?.reduce((s, p) => s + (p.budget || 0), 0) || 0;
  const avgProgress = projects?.length
    ? Math.round(projects.reduce((s, p) => s + (p.progress || 0), 0) / projects.length)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${user?.firstName || "Executive"}`}
        subtitle="Executive Command Center — Real-time business intelligence"
      />

      {/* Executive KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard title="Total Employees" value={orgStats?.totalEmployees || 0} icon="👥" color="blue" />
        <StatCard title="Pending Candidates" value={userStats?.pendingCandidates || 0} icon="🕐" color="amber" />
        <StatCard title="Active Projects" value={activeProjects} icon="📊" color="green" />
        <StatCard title="Total Users" value={userStats?.totalUsers || 0} icon="🌐" color="purple" />
        <StatCard title="Dept Budget" value={formatCurrency(totalBudget)} icon="💰" color="emerald" />
        <StatCard title="Avg Progress" value={`${avgProgress}%`} icon="📈" color="cyan" />
      </div>

      {/* Risk Alerts */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-white">Risk & Alert Center</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔴</span>
              <div>
                <p className="text-sm font-medium text-red-400">Pending Expenses</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{orgStats?.pendingExpenses || 0}</p>
                <p className="text-xs text-slate-500">Awaiting approval</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🟡</span>
              <div>
                <p className="text-sm font-medium text-amber-400">New Registrations</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{userStats?.newRegistrations30d || 0}</p>
                <p className="text-xs text-slate-500">Last 30 days</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🟢</span>
              <div>
                <p className="text-sm font-medium text-green-400">Payroll Processed</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{orgStats?.thisMonthPayroll?._count?.id || 0}</p>
                <p className="text-xs text-slate-500">This month</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Department Distribution + Role Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-white">Department Distribution</h3>
          <div className="space-y-3">
            {orgStats?.byDepartment?.map((dept) => {
              const count = dept._count?.id || 0;
              const total = orgStats.totalEmployees || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={dept.department} className="flex items-center gap-3">
                  <span className="w-28 truncate text-sm text-slate-600 dark:text-slate-300">{dept.department}</span>
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-2 rounded-full bg-brand-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-medium text-white">{count}</span>
                  <span className="text-xs text-slate-500">{pct}%</span>
                </div>
              );
            })}
            {(!orgStats?.byDepartment || orgStats.byDepartment.length === 0) && (
              <p className="text-sm text-slate-500">No department data</p>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-white">User Role Distribution</h3>
          <div className="space-y-2">
            {userStats?.byRole?.map(({ role, count }) => (
              <div key={role} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                <Badge color={
                  role === "ADMIN" || role === "SUPER_ADMIN" ? "red" :
                  role === "HR_MANAGER" ? "purple" :
                  role === "ENGINEER" || role === "DEVELOPER" ? "green" :
                  role === "CANDIDATE" ? "amber" : "slate"
                }>
                  {role.replace(/_/g, " ")}
                </Badge>
                <span className="text-sm font-medium text-white">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Project Performance */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-white">Project Performance Overview</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left dark:border-slate-800 text-xs text-slate-400">
                <th className="pb-3">Project</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Budget</th>
                <th className="pb-3">Progress</th>
              </tr>
            </thead>
            <tbody>
              {projects?.slice(0, 10).map(p => (
                <tr key={p.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                  <td className="py-3 font-medium text-white">{p.name}</td>
                  <td className="py-3">
                    <Badge color={p.type === "IOT" ? "cyan" : p.type === "AI_ML" ? "purple" : "blue"}>
                      {p.type}
                    </Badge>
                  </td>
                  <td className="py-3">
                    <Badge color={p.status === "ACTIVE" ? "green" : p.status === "COMPLETED" ? "blue" : "amber"}>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="py-3 text-slate-600 dark:text-slate-300">{formatCurrency(p.budget)}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-1.5 rounded-full bg-brand-500"
                          style={{ width: `${p.progress || 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">{p.progress || 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!projects || projects.length === 0) && (
            <p className="py-8 text-center text-sm text-slate-500">No projects found</p>
          )}
        </div>
      </Card>

      {/* Employment Types */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-white">Employment Type Breakdown</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {orgStats?.byType?.map((t) => (
            <div key={t.employmentType} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 p-4 dark:bg-slate-800/50 text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{t._count?.id || 0}</p>
              <p className="text-xs text-slate-400">{(t.employmentType || "").replace(/_/g, " ")}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Financial Overview */}
      {financeData && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-white">Financial Overview (Trial Balance)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7004">
              <p className="text-xs text-slate-400">Total Debits</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {formatCurrency(financeData?.totalDebits || financeData?.data?.totalDebits || 0)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7004">
              <p className="text-xs text-slate-400">Total Credits</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {formatCurrency(financeData?.totalCredits || financeData?.data?.totalCredits || 0)}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
