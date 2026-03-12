"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, StatCard, Badge, Button, DataTable, Select, Tabs } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface PayrollDashboard {
  period: { month: number; year: number; monthName: string };
  employees: number;
  payroll: {
    slipsGenerated: number; slipsPaid: number; slipsPending: number;
    totalGross: number; totalDeductions: number; totalNet: number;
  };
  byDepartment: { department: string; headcount: number; totalCTC: number }[];
  pendingExpenses: number;
  upcomingLeaves: number;
}

interface SalaryPreview {
  newRegime: any;
  oldRegime: any;
  comparison: {
    newRegimeMonthlyTDS: number;
    oldRegimeMonthlyTDS: number;
    recommendation: "NEW" | "OLD";
    annualSavings: number;
  };
  supportedStates: string[];
}

export default function PayrollDashboardPage() {
  const { token } = useAuth();
  const { data: dashboard, refetch } = useApi<PayrollDashboard>("/hr/payroll/v2/dashboard");
  const [activeTab, setActiveTab] = useState("overview");

  // Salary calculator state
  const [ctc, setCTC] = useState("1200000");
  const [state, setState] = useState("Karnataka");
  const [preview, setPreview] = useState<SalaryPreview | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Bulk operations
  const [bulkMonth, setBulkMonth] = useState(String(new Date().getMonth() + 1));
  const [bulkYear, setBulkYear] = useState(String(new Date().getFullYear()));
  const [bulkResult, setBulkResult] = useState<any>(null);
  const [processing, setProcessing] = useState(false);

  const handleCalculate = async () => {
    if (!ctc) return;
    setCalculating(true);
    const res = await api.get<SalaryPreview>(`/hr/payroll/v2/preview?annualCTC=${ctc}&state=${state}`, token || undefined);
    if (res.success && res.data) setPreview(res.data);
    setCalculating(false);
  };

  const handleBulkGenerate = async () => {
    setProcessing(true);
    const res = await api.post<any>("/hr/payroll/v2/generate-bulk", {
      month: Number(bulkMonth), year: Number(bulkYear), state,
    }, token || undefined);
    if (res.success) setBulkResult(res.data);
    setProcessing(false);
    refetch();
  };

  const handleBulkPay = async () => {
    setProcessing(true);
    await api.post("/hr/payroll/v2/pay-bulk", {
      month: Number(bulkMonth), year: Number(bulkYear),
    }, token || undefined);
    setProcessing(false);
    refetch();
  };

  const handleBulkPDF = async () => {
    setProcessing(true);
    await api.post("/hr/payroll/v2/pdf/bulk", {
      month: Number(bulkMonth), year: Number(bulkYear),
    }, token || undefined);
    setProcessing(false);
  };

  const tabs = [
    { id: "overview", label: "Payroll Overview" }, { key: "operations", label: "Bulk Operations" }, { key: "calculator", label: "Salary Calculator" }, { key: "departments", label: "Department View" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll Dashboard"
        subtitle={dashboard ? `${dashboard.period.monthName} ${dashboard.period.year}` : "Loading..."}
        breadcrumbs={[{ label: "HR & Payroll", href: "/hr" }, { label: "Payroll Dashboard" }]}
      />

      {/* Summary Stats */}
      {dashboard && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <StatCard title="Employees" value={dashboard.employees} color="blue" />
          <StatCard title="Slips Generated" value={dashboard.payroll.slipsGenerated} color="purple" />
          <StatCard title="Paid" value={dashboard.payroll.slipsPaid} color="green" />
          <StatCard title="Pending" value={dashboard.payroll.slipsPending} color={dashboard.payroll.slipsPending > 0 ? "amber" : "slate"} />
          <StatCard title="Total Net Pay" value={formatCurrency(dashboard.payroll.totalNet)} color="cyan" />
          <StatCard title="Total Deductions" value={formatCurrency(dashboard.payroll.totalDeductions)} color="red" />
        </div>
      )}

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Overview */}
      {activeTab === "overview" && dashboard && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Payroll Summary" subtitle={`${dashboard.period.monthName} ${dashboard.period.year}`} />
            <div className="space-y-3">
              {[
                ["Total Gross Salary", formatCurrency(dashboard.payroll.totalGross), "text-slate-900 dark:text-white"],
                ["Total Deductions", formatCurrency(dashboard.payroll.totalDeductions), "text-red-600 dark:text-red-400"],
                ["Total Net Pay", formatCurrency(dashboard.payroll.totalNet), "text-green-600 dark:text-green-400"],
                ["Pending Expenses", String(dashboard.pendingExpenses), "text-amber-600 dark:text-amber-400"],
                ["Upcoming Leaves (30d)", String(dashboard.upcomingLeaves), "text-cyan-600 dark:text-cyan-400"],
              ].map(([label, value, color]) => (
                <div key={label} className="flex justify-between border-b border-slate-200/50 dark:border-slate-800/50 pb-2">
                  <span className="text-sm text-slate-400">{label}</span>
                  <span className={`text-sm font-semibold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Cost by Department" />
            <div className="space-y-3">
              {dashboard.byDepartment.map((d) => (
                <div key={d.department} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-900 dark:text-white">{d.department}</p>
                    <p className="text-xs text-slate-500">{d.headcount} employees</p>
                  </div>
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{formatCurrency(d.totalCTC)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Bulk Operations */}
      {activeTab === "operations" && (
        <Card>
          <CardHeader title="Bulk Payroll Operations" subtitle="Generate slips, mark paid, and create PDFs in bulk" />
          <div className="space-y-6">
            <div className="flex items-end gap-4">
              <Select label="Month" options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2000, i).toLocaleString("en", { month: "long" }) }))} value={bulkMonth} onChange={(e) => setBulkMonth(e.target.value)} />
              <Select label="Year" options={["2025", "2026", "2027"].map((y) => ({ value: y, label: y }))} value={bulkYear} onChange={(e) => setBulkYear(e.target.value)} />
              <Select label="State" options={["Karnataka", "Maharashtra", "Tamil Nadu", "Telangana", "Gujarat", "Delhi"].map((s) => ({ value: s, label: s }))} value={state} onChange={(e) => setState(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <Button onClick={handleBulkGenerate} loading={processing}>Generate All Slips</Button>
              <Button variant="secondary" onClick={handleBulkPay} loading={processing}>Mark All Paid</Button>
              <Button variant="outline" onClick={handleBulkPDF} loading={processing}>Generate All PDFs</Button>
            </div>

            {bulkResult && (
              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div><p className="text-2xl font-bold text-green-600 dark:text-green-400">{bulkResult.generated}</p><p className="text-xs text-slate-400">Generated</p></div>
                  <div><p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{bulkResult.skipped}</p><p className="text-xs text-slate-400">Skipped</p></div>
                  <div><p className="text-2xl font-bold text-red-600 dark:text-red-400">{bulkResult.errors?.length || 0}</p><p className="text-xs text-slate-400">Errors</p></div>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Calculator */}
      {activeTab === "calculator" && (
        <Card>
          <CardHeader title="India Salary Calculator" subtitle="Compare New vs Old tax regime with full statutory breakdown" />
          <div className="space-y-6">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Annual CTC (₹)</label>
                <input type="number" className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm text-slate-200" value={ctc} onChange={(e) => setCTC(e.target.value)} placeholder="1200000" />
              </div>
              <Select label="State" options={["Karnataka", "Maharashtra", "Tamil Nadu", "Telangana", "Gujarat", "Delhi", "West Bengal"].map((s) => ({ value: s, label: s }))} value={state} onChange={(e) => setState(e.target.value)} />
              <Button onClick={handleCalculate} loading={calculating}>Calculate</Button>
            </div>

            {preview && (
              <div className="space-y-6">
                {/* Recommendation banner */}
                <div className={`rounded-lg p-4 text-center ${preview.comparison.recommendation === "NEW" ? "bg-green-100 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20" : "bg-blue-100 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20"}`}>
                  <p className="text-sm text-slate-400">Recommended Regime</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{preview.comparison.recommendation} TAX REGIME</p>
                  <p className="text-sm text-green-600 dark:text-green-400">Save {formatCurrency(preview.comparison.annualSavings)}/year</p>
                </div>

                {/* Side-by-side comparison */}
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* New Regime */}
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                    <h4 className="text-sm font-semibold text-green-600 dark:text-green-400 mb-3">NEW REGIME</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-400">Monthly Net</span><span className="text-slate-900 dark:text-white font-semibold">{formatCurrency(preview.newRegime.netSalary)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Monthly TDS</span><span className="text-red-600 dark:text-red-400">{formatCurrency(preview.newRegime.deductions.tds)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">EPF (Employee)</span><span>{formatCurrency(preview.newRegime.deductions.epfEmployee)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">ESI</span><span>{formatCurrency(preview.newRegime.deductions.esiEmployee)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Prof. Tax</span><span>{formatCurrency(preview.newRegime.deductions.professionalTax)}</span></div>
                      <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span className="text-slate-400">Total Deductions</span><span className="text-red-600 dark:text-red-400 font-semibold">{formatCurrency(preview.newRegime.deductions.totalDeductions)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Effective Tax Rate</span><span>{preview.newRegime.tds.effectiveRate}%</span></div>
                    </div>
                  </div>

                  {/* Old Regime */}
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                    <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3">OLD REGIME</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-400">Monthly Net</span><span className="text-slate-900 dark:text-white font-semibold">{formatCurrency(preview.oldRegime.netSalary)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Monthly TDS</span><span className="text-red-600 dark:text-red-400">{formatCurrency(preview.oldRegime.deductions.tds)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">EPF (Employee)</span><span>{formatCurrency(preview.oldRegime.deductions.epfEmployee)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">ESI</span><span>{formatCurrency(preview.oldRegime.deductions.esiEmployee)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Prof. Tax</span><span>{formatCurrency(preview.oldRegime.deductions.professionalTax)}</span></div>
                      <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span className="text-slate-400">Total Deductions</span><span className="text-red-600 dark:text-red-400 font-semibold">{formatCurrency(preview.oldRegime.deductions.totalDeductions)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Effective Tax Rate</span><span>{preview.oldRegime.tds.effectiveRate}%</span></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Departments */}
      {activeTab === "departments" && dashboard && (
        <Card padding={false}>
          <DataTable
            columns={[{ key: "department", header: "Department", render: (d: any) => <span className="font-medium text-slate-900 dark:text-white">{d.department}</span> }, { key: "headcount", header: "Headcount", render: (d: any) => <Badge color="blue">{d.headcount}</Badge> }, { key: "totalCTC", header: "Total Annual CTC", render: (d: any) => formatCurrency(d.totalCTC) }, { key: "avgCTC", header: "Avg CTC", render: (d: any) => d.headcount > 0 ? formatCurrency(d.totalCTC / d.headcount) : "—" }, { key: "monthlyBurn", header: "Monthly Burn", render: (d: any) => formatCurrency(d.totalCTC / 12) },
            ]}
            data={dashboard.byDepartment}
            keyExtractor={(d: any) => d.department}
            emptyMessage="No department data."
          />
        </Card>
      )}
    </div>
  );
}
