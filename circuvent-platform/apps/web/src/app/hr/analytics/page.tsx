"use client";
import React, { useState } from "react";
import { useApi } from "@/hooks/use-auth";
import Link from "next/link";

export default function HRAnalyticsPage() {
  const { data: workforce, loading: wfLoading } = useApi<any>("/hr/admin/workforce");
  const { data: compensation } = useApi<any>("/hr/admin/compensation");
  const { data: compliance } = useApi<any>("/hr/admin/compliance-overview");
  const [tab, setTab] = useState<"workforce" | "compensation" | "compliance">("workforce");

  if (wfLoading) return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center"><div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">📊 HR Analytics & Admin</h1>
          <p className="text-slate-400 text-sm mt-1">Workforce metrics, compensation analysis, and compliance tracking</p>
        </div>
        <div className="flex gap-2">
          <Link href="/hr/admin/attendance"><button className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs hover:bg-slate-200 dark:hover:bg-slate-600">Attendance Report</button></Link>
          <Link href="/hr/admin/payroll"><button className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs hover:bg-slate-200 dark:hover:bg-slate-600">Payroll Report</button></Link>
          <Link href="/hr/admin/leaves"><button className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs hover:bg-slate-200 dark:hover:bg-slate-600">Leave Report</button></Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[{ id: "workforce" as const, label: "Workforce" }, { id: "compensation" as const, label: "Compensation" }, { id: "compliance" as const, label: "Compliance" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm ${tab === t.id ? "bg-brand-600 text-slate-900 dark:text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-400"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "workforce" && workforce && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            {[
              { label: "Headcount", value: workforce.totalHeadcount, icon: "👥", color: "brand" },
              { label: "Attrition Rate", value: `${workforce.attritionRate}%`, icon: "📉", color: workforce.attritionRate > 15 ? "red" : "emerald" },
              { label: "Avg Tenure", value: `${workforce.avgTenureMonths}mo`, icon: "⏰", color: "cyan" },
              { label: "Left This Year", value: workforce.leftThisYear, icon: "🚪", color: "amber" },
              { label: "Departments", value: workforce.byDepartment?.length || 0, icon: "🏢", color: "purple" },
              { label: "Pending Approvals", value: (workforce.pendingLeaves || 0) + (workforce.pendingExpenses || 0), icon: "⏳", color: "orange" },
            ].map(k => (
              <div key={k.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-lg">{k.icon}</span>
                  <span className={`text-xl font-bold text-${k.color}-400`}>{k.value}</span>
                </div>
                <p className="text-xs text-slate-500">{k.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Department Distribution */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">🏢 Department Distribution</h2>
              <div className="space-y-2">
                {workforce.byDepartment?.map((d: any) => {
                  const pct = workforce.totalHeadcount > 0 ? Math.round((d.count / workforce.totalHeadcount) * 100) : 0;
                  return (
                    <div key={d.department} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-24 text-right truncate">{d.department}</span>
                      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-4 relative">
                        <div className="h-4 rounded-full bg-brand-500 transition-all flex items-center px-2" style={{ width: `${Math.max(10, pct)}%` }}>
                          <span className="text-xs text-slate-900 dark:text-white font-semibold">{d.count}</span>
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 w-10 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Headcount Trend */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">📈 Headcount Trend (6 months)</h2>
              <div className="flex items-end gap-2 h-40">
                {workforce.headcountTrend?.map((h: any, i: number) => {
                  const max = Math.max(...(workforce.headcountTrend?.map((t: any) => t.count) || [1]));
                  const height = max > 0 ? (h.count / max) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-brand-400 font-semibold">{h.count}</span>
                      <div className="w-full bg-brand-500/30 rounded-t" style={{ height: `${height}%` }}>
                        <div className="w-full h-full bg-brand-500 rounded-t" />
                      </div>
                      <span className="text-xs text-slate-500 truncate w-full text-center">{h.month?.split(" ")[0]}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Employment Type */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">📋 Employment Type</h2>
              <div className="grid grid-cols-2 gap-3">
                {workforce.byEmploymentType?.map((t: any) => (
                  <div key={t.type} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-brand-400">{t.count}</p>
                    <p className="text-xs text-slate-500">{t.type.replace("_", " ")}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">🆕 Recent Joiners</h2>
              <div className="space-y-2">
                {workforce.recentJoiners?.map((j: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-slate-100 dark:bg-slate-800/50 rounded-lg p-2">
                    <div>
                      <p className="text-sm text-slate-900 dark:text-white">{j.name}</p>
                      <p className="text-xs text-slate-500">{j.department} &middot; {j.designation}</p>
                    </div>
                    <span className="text-xs text-slate-500">{new Date(j.joined).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "compensation" && compensation && (
        <div className="space-y-6">
          {/* Compensation KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Monthly Payroll", value: `₹${(compensation.overview.totalMonthlyPayroll / 100000).toFixed(1)}L`, color: "brand" },
              { label: "Annual Payroll", value: `₹${(compensation.overview.totalAnnualPayroll / 10000000).toFixed(2)}Cr`, color: "blue" },
              { label: "Avg Salary", value: `₹${Math.round(compensation.overview.avgMonthlySalary / 1000)}K`, color: "cyan" },
              { label: "Median Salary", value: `₹${Math.round(compensation.overview.medianMonthlySalary / 1000)}K`, color: "emerald" },
            ].map(k => (
              <div key={k.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
                <p className={`text-xl font-bold text-${k.color}-400`}>{k.value}</p>
                <p className="text-xs text-slate-500">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Salary Bands */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">💰 Salary Distribution</h2>
            <div className="space-y-2">
              {compensation.salaryBands?.map((b: any) => (
                <div key={b.band} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-20 text-right">{b.band}</span>
                  <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-6 relative">
                    <div className="h-6 rounded-full bg-emerald-500 flex items-center px-2" style={{ width: `${b.percentage}%`, minWidth: "20px" }}>
                      <span className="text-xs text-slate-900 dark:text-white font-semibold">{b.count}</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 w-10 text-right">{b.percentage}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Department Compensation */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">🏢 Department-wise Compensation</h2>
            </div>
            <table className="w-full">
              <thead><tr className="border-b border-slate-200 text-left dark:border-slate-800">
                <th className="px-4 py-2 text-xs text-slate-500">Department</th>
                <th className="px-4 py-2 text-xs text-slate-500 text-right">Employees</th>
                <th className="px-4 py-2 text-xs text-slate-500 text-right">Avg Salary</th>
                <th className="px-4 py-2 text-xs text-slate-500 text-right">Min</th>
                <th className="px-4 py-2 text-xs text-slate-500 text-right">Max</th>
                <th className="px-4 py-2 text-xs text-slate-500 text-right">Total</th>
              </tr></thead>
              <tbody>
                {compensation.byDepartment?.map((d: any) => (
                  <tr key={d.department} className="border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-4 py-2 text-sm text-slate-900 dark:text-white">{d.department}</td>
                    <td className="px-4 py-2 text-sm text-right text-slate-600 dark:text-slate-300">{d.count}</td>
                    <td className="px-4 py-2 text-sm text-right font-mono text-emerald-400">₹{Math.round(d.avg / 1000)}K</td>
                    <td className="px-4 py-2 text-sm text-right font-mono text-slate-400">₹{Math.round(d.min / 1000)}K</td>
                    <td className="px-4 py-2 text-sm text-right font-mono text-slate-400">₹{Math.round(d.max / 1000)}K</td>
                    <td className="px-4 py-2 text-sm text-right font-mono text-blue-400">₹{(d.total / 100000).toFixed(1)}L</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "compliance" && compliance && (
        <div className="space-y-6">
          {/* Overall Compliance */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center">
            <div className="relative inline-block">
              <div className={`text-6xl font-bold ${compliance.overallCompliancePercent >= 90 ? "text-emerald-400" : compliance.overallCompliancePercent >= 70 ? "text-amber-400" : "text-red-400"}`}>
                {compliance.overallCompliancePercent}%
              </div>
              <p className="text-slate-400 text-sm mt-2">Overall Compliance Score</p>
              <p className="text-xs text-slate-500 mt-1">{compliance.totalEmployees} employees evaluated</p>
            </div>
          </div>

          {/* Compliance Items */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {compliance.items?.map((item: any) => (
              <div key={item.item} className={`bg-white shadow-sm dark:bg-slate-900 border rounded-xl p-5 ${item.percentage >= 90 ? "border-emerald-800/50" : item.percentage >= 70 ? "border-amber-800/50" : "border-red-800/50"}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-slate-900 dark:text-white font-medium">{item.item}</h3>
                  <span className={`text-lg font-bold ${item.percentage >= 90 ? "text-emerald-400" : item.percentage >= 70 ? "text-amber-400" : "text-red-400"}`}>{item.percentage}%</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-full h-3 mb-2">
                  <div className={`h-3 rounded-full ${item.percentage >= 90 ? "bg-emerald-500" : item.percentage >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${item.percentage}%` }} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-400">✓ {item.compliant} compliant</span>
                  {item.nonCompliant > 0 && <span className="text-red-400">✗ {item.nonCompliant} missing</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
