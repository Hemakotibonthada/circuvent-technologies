"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, StatCard, Badge, Button, DataTable, Input, Select, Tabs } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface ComplianceStatus {
  period: string;
  status: {
    epf: { dueDate: string; amount: number; status: string };
    esi: { dueDate: string; amount: number; status: string };
    tds: { dueDate: string; amount: number; status: string };
    professionalTax: { dueDate: string; amount: number; status: string };
  };
  totals: { epfTotal: number; esiTotal: number; tdsTotal: number; ptTotal: number; grandTotal: number };
  employeesProcessed: number;
}

interface Deadlines {
  deadlines: { name: string; dueDate: string; type: string; status: string }[];
  overdueCount: number;
}

export default function CompliancePage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const { data: compliance } = useApi<ComplianceStatus>("/hr/statutory/status");
  const { data: deadlines } = useApi<Deadlines>("/hr/statutory/deadlines");

  // Form 16 lookup
  const [empId, setEmpId] = useState("");
  const [fy, setFY] = useState("2025-2026");
  const [form16Data, setForm16Data] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Statutory summary lookup
  const [summaryEmpId, setSummaryEmpId] = useState("");
  const [statutorySummary, setStatutorySummary] = useState<any>(null);

  const handleFetchForm16 = async () => {
    if (!empId) return;
    setLoading(true);
    const res = await api.get<any>(`/hr/statutory/employee/${empId}/form16?financialYear=${fy}`, token || undefined);
    if (res.success) setForm16Data(res.data);
    setLoading(false);
  };

  const handleFetchSummary = async () => {
    if (!summaryEmpId) return;
    setLoading(true);
    const res = await api.get<any>(`/hr/statutory/employee/${summaryEmpId}/summary`, token || undefined);
    if (res.success) setStatutorySummary(res.data);
    setLoading(false);
  };

  const tabs = [
    { id: "dashboard", label: "Compliance Dashboard" },
    { id: "deadlines", label: "Deadlines", count: deadlines?.overdueCount },
    { id: "form16", label: "Form 16" },
    { id: "summary", label: "Employee Statutory" },
  ];

  const statusColors: Record<string, any> = {
    PENDING: "amber", PAID: "green", OVERDUE: "red", DUE_SOON: "orange", UPCOMING: "slate",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statutory Compliance"
        subtitle="EPF, ESI, TDS, Professional Tax — India compliance tracker"
        breadcrumbs={[{ label: "HR & Payroll", href: "/hr" }, { label: "Compliance" }]}
      />

      {/* Compliance Summary */}
      {compliance && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard title="EPF Due" value={formatCurrency(compliance.totals.epfTotal)} color={compliance.status.epf.status === "OVERDUE" ? "red" : "blue"} subtitle={compliance.status.epf.dueDate} />
          <StatCard title="ESI Due" value={formatCurrency(compliance.totals.esiTotal)} color={compliance.status.esi.status === "OVERDUE" ? "red" : "green"} subtitle={compliance.status.esi.dueDate} />
          <StatCard title="TDS Due" value={formatCurrency(compliance.totals.tdsTotal)} color={compliance.status.tds.status === "OVERDUE" ? "red" : "purple"} subtitle={compliance.status.tds.dueDate} />
          <StatCard title="Prof. Tax" value={formatCurrency(compliance.totals.ptTotal)} color="amber" subtitle={compliance.status.professionalTax.dueDate} />
          <StatCard title="Total Due" value={formatCurrency(compliance.totals.grandTotal)} color="cyan" subtitle={`${compliance.employeesProcessed} employees`} />
        </div>
      )}

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Dashboard Tab */}
      {activeTab === "dashboard" && compliance && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Remittance Status" subtitle={compliance.period} />
            <div className="space-y-4">
              {Object.entries(compliance.status).map(([key, s]) => (
                <div key={key} className="flex items-center justify-between rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white uppercase">{key === "professionalTax" ? "Professional Tax" : key.toUpperCase()}</p>
                    <p className="text-xs text-slate-500">Due: {s.dueDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(s.amount)}</p>
                    <Badge color={statusColors[s.status]}>{s.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Statutory Breakdown" />
            <div className="space-y-3">
              {[
                ["EPF (Employee + Employer)", compliance.totals.epfTotal, "bg-blue-500"],
                ["ESI (Employee + Employer)", compliance.totals.esiTotal, "bg-green-500"],
                ["TDS (Income Tax)", compliance.totals.tdsTotal, "bg-purple-500"],
                ["Professional Tax", compliance.totals.ptTotal, "bg-amber-500"],
              ].map(([label, amount, color]) => {
                const pct = compliance.totals.grandTotal > 0 ? ((amount as number) / compliance.totals.grandTotal) * 100 : 0;
                return (
                  <div key={label as string}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">{label}</span>
                      <span className="text-slate-900 dark:text-white font-medium">{formatCurrency(amount as number)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Deadlines Tab */}
      {activeTab === "deadlines" && deadlines && (
        <Card padding={false}>
          <DataTable
            columns={[
              { key: "name", header: "Deadline", render: (d: any) => <span className="text-slate-900 dark:text-white font-medium">{d.name}</span> },
              { key: "type", header: "Type", render: (d: any) => <Badge color="blue">{d.type}</Badge> },
              { key: "dueDate", header: "Due Date", render: (d: any) => d.dueDate },
              { key: "status", header: "Status", render: (d: any) => (
                <Badge color={statusColors[d.status] || "slate"}>{d.status.replace("_", " ")}</Badge>
              )},
              { key: "daysUntil", header: "Days", render: (d: any) => {
                const days = Math.ceil((new Date(d.dueDate).getTime() - Date.now()) / 86400000);
                return <span className={days < 0 ? "text-red-400 font-bold" : days < 3 ? "text-amber-400" : "text-slate-400"}>
                  {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                </span>;
              }},
            ]}
            data={deadlines.deadlines}
            keyExtractor={(d: any) => d.name}
          />
        </Card>
      )}

      {/* Form 16 Tab */}
      {activeTab === "form16" && (
        <Card>
          <CardHeader title="Form 16 Data" subtitle="Generate Form 16 data for an employee" />
          <div className="flex items-end gap-4 mb-6">
            <Input label="Employee ID" value={empId} onChange={(e) => setEmpId(e.target.value)} placeholder="Employee ID..." />
            <Select label="Financial Year" options={[
              { value: "2025-2026", label: "FY 2025-2026" },
              { value: "2024-2025", label: "FY 2024-2025" },
            ]} value={fy} onChange={(e) => setFY(e.target.value)} />
            <Button onClick={handleFetchForm16} loading={loading} disabled={!empId}>Fetch</Button>
          </div>

          {form16Data && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-2">Employee</h4>
                  <p className="text-slate-900 dark:text-white">{form16Data.employee.name} ({form16Data.employee.code})</p>
                  <p className="text-xs text-slate-500">PAN: {form16Data.employee.pan || "N/A"}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-2">Tax Summary</h4>
                  <p className="text-slate-900 dark:text-white">Annual Salary: {formatCurrency(form16Data.annualSalary)}</p>
                  <p className="text-green-400">Total TDS: {formatCurrency(form16Data.totalTDS)}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-2">Quarterly TDS</h4>
                <div className="grid grid-cols-4 gap-3">
                  {form16Data.quarterlyTDS.map((q: any) => (
                    <Card key={q.quarter} className="text-center p-3">
                      <p className="text-xs text-slate-500">{q.quarter}</p>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(q.tds)}</p>
                    </Card>
                  ))}
                </div>
              </div>

              {form16Data.taxComputation && (
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-2">Tax Computation ({form16Data.taxComputation.regime} Regime)</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-400">Gross Salary</span><span className="text-slate-900 dark:text-white">{formatCurrency(form16Data.taxComputation.grossSalary)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Standard Deduction</span><span className="text-slate-900 dark:text-white">-{formatCurrency(form16Data.taxComputation.standardDeduction)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Taxable Income</span><span className="text-slate-900 dark:text-white font-semibold">{formatCurrency(form16Data.taxComputation.taxableIncome)}</span></div>
                    <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2"><span className="text-slate-400">Tax on Income</span><span className="text-red-400">{formatCurrency(form16Data.taxComputation.taxOnIncome)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Cess (4%)</span><span className="text-red-400">{formatCurrency(form16Data.taxComputation.cess)}</span></div>
                    {form16Data.taxComputation.rebateApplied && (
                      <div className="flex justify-between"><span className="text-slate-400">Section 87A Rebate</span><span className="text-green-400">-{formatCurrency(form16Data.taxComputation.rebateAmount)}</span></div>
                    )}
                    <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2 font-bold"><span className="text-slate-600 dark:text-slate-300">Net Tax Payable</span><span className="text-slate-900 dark:text-white">{formatCurrency(form16Data.taxComputation.netTax)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Effective Rate</span><span className="text-cyan-400">{form16Data.taxComputation.effectiveRate}%</span></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Employee Statutory Summary Tab */}
      {activeTab === "summary" && (
        <Card>
          <CardHeader title="Employee Statutory Summary" subtitle="Full EPF/ESI/TDS/PT/Gratuity breakdown" />
          <div className="flex items-end gap-4 mb-6">
            <Input label="Employee ID" value={summaryEmpId} onChange={(e) => setSummaryEmpId(e.target.value)} placeholder="Employee ID..." />
            <Button onClick={handleFetchSummary} loading={loading} disabled={!summaryEmpId}>Fetch</Button>
          </div>

          {statutorySummary && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-400 mb-3">Employee</h4>
                <p className="text-slate-900 dark:text-white">{statutorySummary.employee.name} ({statutorySummary.employee.code})</p>
                <p className="text-sm text-slate-400">Annual CTC: {formatCurrency(statutorySummary.employee.annualCTC)}</p>
                <p className="text-sm text-slate-400">Monthly Gross: {formatCurrency(statutorySummary.employee.monthlyGross)}</p>
              </div>

              <div className="rounded-lg bg-brand-600/10 border border-brand-500/20 p-4 text-center">
                <p className="text-xs text-slate-400">Recommended Regime</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{statutorySummary.regimeRecommendation} TAX REGIME</p>
                <p className="text-sm text-green-400">Save {formatCurrency(statutorySummary.annualSavings)}/year</p>
              </div>

              {/* EPF */}
              <Card className="bg-slate-50 dark:bg-slate-800/30">
                <h4 className="text-sm font-semibold text-blue-400 mb-2">EPF (Provident Fund)</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-slate-400">PF Wage</span><span>{formatCurrency(statutorySummary.epf.pfWage)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Employee (12%)</span><span>{formatCurrency(statutorySummary.epf.employeeContribution)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Employer EPF</span><span>{formatCurrency(statutorySummary.epf.employerEPFContribution)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Employer EPS</span><span>{formatCurrency(statutorySummary.epf.employerEPSContribution)}</span></div>
                </div>
              </Card>

              {/* ESI */}
              <Card className="bg-slate-50 dark:bg-slate-800/30">
                <h4 className="text-sm font-semibold text-green-400 mb-2">ESI</h4>
                <p className="text-sm text-slate-400">
                  {statutorySummary.esi.isEligible ? "Applicable" : "Not applicable (gross > ₹21,000)"}
                </p>
                {statutorySummary.esi.isEligible && (
                  <div className="space-y-1 text-sm mt-2">
                    <div className="flex justify-between"><span className="text-slate-400">Employee (0.75%)</span><span>{formatCurrency(statutorySummary.esi.employeeContribution)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Employer (3.25%)</span><span>{formatCurrency(statutorySummary.esi.employerContribution)}</span></div>
                  </div>
                )}
              </Card>

              {/* Gratuity */}
              <Card className="bg-slate-50 dark:bg-slate-800/30 lg:col-span-2">
                <h4 className="text-sm font-semibold text-amber-400 mb-2">Gratuity</h4>
                <p className="text-sm text-slate-400">
                  {statutorySummary.gratuity.isEligible
                    ? `Eligible — ${statutorySummary.gratuity.completedYears} years of service. Amount: ${formatCurrency(statutorySummary.gratuity.computedGratuity)}`
                    : `Not eligible — ${statutorySummary.gratuity.reason || "Minimum 5 years required"}`
                  }
                </p>
              </Card>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
