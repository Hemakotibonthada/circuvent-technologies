"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, StatCard, Badge, Button, DataTable, Modal, Input, Select, Tabs } from "@/components/ui";
import { expenseStatusColors } from "@/lib/status-colors";
import { formatCurrency, formatDate, timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface Employee {
  id: string; employeeCode: string; designation: string; department: string;
  employmentType: string; baseSalary: number; currency: string; dateOfJoining: string;
  user: { id: string; firstName: string; lastName: string; email: string; status: string };
}

interface HRDashboard {
  totalEmployees: number;
  byDepartment: { department: string; _count: { id: number } }[];
  byType: { employmentType: string; _count: { id: number } }[];
  pendingExpenses: number;
  thisMonthPayroll: { _sum: { netSalary: number | null }; _count: { id: number } };
}

export default function HRPage() {
  const { token } = useAuth();
  const { data: employees, loading, refetch } = useApi<Employee[]>("/hr/employees");
  const { data: dashboard } = useApi<HRDashboard>("/hr/employees/dashboard");
  const [activeTab, setActiveTab] = useState("employees");

  // Salary Preview
  const [previewSalary, setPreviewSalary] = useState("");
  const [salaryBreakdown, setSalaryBreakdown] = useState<any>(null);

  // Bulk payroll
  const [bulkMonth, setBulkMonth] = useState(String(new Date().getMonth() + 1));
  const [bulkYear, setBulkYear] = useState(String(new Date().getFullYear()));
  const [bulkResult, setBulkResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const handlePreview = async () => {
    if (!previewSalary) return;
    const res = await api.get<any>(`/hr/payroll/calculate-preview?annualSalary=${previewSalary}`, token || undefined);
    if (res.success) setSalaryBreakdown(res.data);
  };

  const handleBulkGenerate = async () => {
    setSubmitting(true);
    const res = await api.post<any>("/hr/payroll/generate-bulk", { month: Number(bulkMonth), year: Number(bulkYear) }, token || undefined);
    if (res.success) setBulkResult(res.data);
    setSubmitting(false);
  };

  const tabs = [
    { id: "employees", label: "Employees", count: employees?.length }, { key: "payroll", label: "Payroll" }, { key: "calculator", label: "Salary Calculator" },
  ];

  const empTypeColors: Record<string, any> = { FULL_TIME: "green", PART_TIME: "amber", CONTRACT: "cyan", INTERN: "purple" };

  const empColumns = [
    { id: "employeeCode", header: "Code", render: (e: Employee) => <span className="font-mono text-xs text-brand-600 dark:text-brand-400">{e.employeeCode}</span> }, { key: "name", header: "Name", render: (e: Employee) => (
      <a href={`/hr/${e.id}`} className="font-medium text-slate-900 dark:text-white hover:text-brand-600 dark:text-brand-400">{e.user.firstName} {e.user.lastName}</a>
    )}, { key: "email", header: "Email", render: (e: Employee) => <span className="text-xs text-slate-400">{e.user.email}</span> }, { key: "designation", header: "Designation" }, { key: "department", header: "Department" }, { key: "employmentType", header: "Type", render: (e: Employee) => <Badge color={empTypeColors[e.employmentType]}>{e.employmentType.replace("_", " ")}</Badge> }, { key: "baseSalary", header: "CTC", render: (e: Employee) => formatCurrency(Number(e.baseSalary), e.currency) }, { key: "dateOfJoining", header: "Joined", render: (e: Employee) => formatDate(e.dateOfJoining) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="HR & Payroll" subtitle="Employee management, salary calculations, India tax compliance" />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard title="Total Employees" value={dashboard?.totalEmployees ?? "—"} color="blue" />
        <StatCard title="Departments" value={dashboard?.byDepartment?.length ?? "—"} color="purple" />
        <StatCard title="Full-Time" value={dashboard?.byType.find(t => t.employmentType === "FULL_TIME")?._count.id ?? 0} color="green" />
        <StatCard title="Pending Expenses" value={dashboard?.pendingExpenses ?? 0} color="amber" />
        <StatCard
          title="Unpaid Payroll"
          value={dashboard?.thisMonthPayroll?._sum?.netSalary ? formatCurrency(Number(dashboard.thisMonthPayroll._sum.netSalary)) : "₹0"}
          subtitle={`${dashboard?.thisMonthPayroll?._count?.id ?? 0} slips`}
          color="red"
        />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── EMPLOYEES TAB ── */}
      {activeTab === "employees" && (
        <Card padding={false}>
          <DataTable columns={empColumns} data={employees || []} keyExtractor={(e) => e.id} loading={loading} emptyMessage="No employees found." />
        </Card>
      )}

      {/* ── PAYROLL TAB ── */}
      {activeTab === "payroll" && (
        <div className="space-y-6">
          <Card>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Bulk Salary Generation</h3>
            <div className="flex items-end gap-4">
              <Select label="Month" options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2000, i).toLocaleString("en", { month: "long" }) }))} value={bulkMonth} onChange={(e) => setBulkMonth(e.target.value)} />
              <Select label="Year" options={["2025", "2026", "2027"].map(y => ({ value: y, label: y }))} value={bulkYear} onChange={(e) => setBulkYear(e.target.value)} />
              <Button onClick={handleBulkGenerate} loading={submitting}>Generate All Slips</Button>
            </Card>
            {bulkResult && (
              <div className="mt-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div><p className="text-2xl font-bold text-green-600 dark:text-green-400">{bulkResult.generated}</p><p className="text-xs text-slate-400">Generated</p></div>
                  <div><p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{bulkResult.skipped}</p><p className="text-xs text-slate-400">Skipped</p></div>
                  <div><p className="text-2xl font-bold text-red-600 dark:text-red-400">{bulkResult.errors}</p><p className="text-xs text-slate-400">Errors</p></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CALCULATOR TAB ── */}
      {activeTab === "calculator" && (
        <Card>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">India Salary Calculator (New Tax Regime)</h3>
          <div className="flex items-end gap-4 mb-6">
            <Input label="Annual CTC (₹)" type="number" placeholder="1200000" value={previewSalary} onChange={(e) => setPreviewSalary(e.target.value)} />
            <Button onClick={handlePreview}>Calculate</Button>
          </Card>

          {salaryBreakdown && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="text-sm font-medium text-green-600 dark:text-green-400 mb-3">Earnings</h4>
                <div className="space-y-2">
                  {[
                    ["Base Pay", salaryBreakdown.basePay],
                    ["HRA", salaryBreakdown.hra],
                    ["Dearness Allowance", salaryBreakdown.da],
                    ["Special Allowance", salaryBreakdown.specialAllowance],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex justify-between text-sm">
                      <span className="text-slate-400">{label}</span>
                      <span className="text-slate-900 dark:text-white">{formatCurrency(val as number)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2 text-sm font-semibold">
                    <span className="text-green-600 dark:text-green-400">Gross Salary</span>
                    <span className="text-green-600 dark:text-green-400">{formatCurrency(salaryBreakdown.grossSalary)}</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-red-600 dark:text-red-400 mb-3">Deductions</h4>
                <div className="space-y-2">
                  {[
                    ["PF (Employee)", salaryBreakdown.pfDeduction],
                    ["ESI", salaryBreakdown.esiDeduction],
                    ["Professional Tax", salaryBreakdown.professionalTax],
                    ["TDS (Income Tax)", salaryBreakdown.tds],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex justify-between text-sm">
                      <span className="text-slate-400">{label}</span>
                      <span className="text-slate-900 dark:text-white">{formatCurrency(val as number)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2 text-sm font-semibold">
                    <span className="text-red-600 dark:text-red-400">Total Deductions</span>
                    <span className="text-red-600 dark:text-red-400">{formatCurrency(salaryBreakdown.totalDeductions)}</span>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-2 rounded-lg bg-brand-600/10 border border-brand-200 dark:border-brand-500/20 p-4 text-center">
                <p className="text-sm text-slate-400">Net Monthly Take-Home</p>
                <p className="text-4xl font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(salaryBreakdown.netSalary)}</p>
                <p className="text-xs text-slate-500 mt-1">({formatCurrency(salaryBreakdown.netSalary * 12)} per year)</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
