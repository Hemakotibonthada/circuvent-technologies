"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, Badge, Button, StatCard, DataTable, Tabs } from "@/components/ui";
import { expenseStatusColors } from "@/lib/status-colors";
import { formatCurrency, formatDate } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface EmployeeDetail {
  id: string; employeeCode: string; designation: string; department: string;
  employmentType: string; baseSalary: number; currency: string; dateOfJoining: string;
  panNumber: string | null; uanNumber: string | null; payFrequency: string;
  user: { id: string; firstName: string; lastName: string; email: string; phone: string | null };
  salarySlips: any[];
  expenseClaims: any[];
  taxDeclarations: any[];
  leaveRecords: any[];
}

export default function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const { token } = useAuth();
  const { data: emp, loading, refetch } = useApi<EmployeeDetail>(`/hr/employees/${params.id}`);
  const [activeTab, setActiveTab] = useState("overview");

  const handleApproveExpense = async (claimId: string) => {
    await api.patch(`/hr/expenses/${claimId}/approve`, {}, token || undefined);
    refetch();
  };

  const handleMarkPaid = async (slipId: string) => {
    await api.patch(`/hr/payroll/slips/${slipId}/pay`, {}, token || undefined);
    refetch();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div>;
  if (!emp) return <div className="py-20 text-center text-slate-400">Employee not found</div>;

  const monthlySalary = Number(emp.baseSalary) / 12;
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "salary", label: "Salary Slips", count: emp.salarySlips.length },
    { id: "expenses", label: "Expenses", count: emp.expenseClaims.length },
    { id: "leave", label: "Leave", count: emp.leaveRecords.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${emp.user.firstName} ${emp.user.lastName}`}
        subtitle={`${emp.employeeCode} · ${emp.designation} · ${emp.department}`}
        breadcrumbs={[{ label: "HR & Payroll", href: "/hr" }, { label: `${emp.user.firstName} ${emp.user.lastName}` }]}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Annual CTC" value={formatCurrency(Number(emp.baseSalary), emp.currency)} color="blue" />
        <StatCard title="Monthly Gross" value={formatCurrency(monthlySalary)} color="green" />
        <StatCard title="Salary Slips" value={emp.salarySlips.length} color="purple" />
        <StatCard title="Expense Claims" value={emp.expenseClaims.length} color="amber" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Overview */}
      {activeTab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Personal Information" />
            <dl className="space-y-3">
              {[
                ["Employee Code", emp.employeeCode],
                ["Email", emp.user.email],
                ["Phone", emp.user.phone || "—"],
                ["Department", emp.department],
                ["Designation", emp.designation],
                ["Employment Type", emp.employmentType.replace("_", " ")],
                ["Date of Joining", formatDate(emp.dateOfJoining)],
                ["Pay Frequency", emp.payFrequency],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-slate-200/50 dark:border-slate-800/50 pb-2">
                  <dt className="text-sm text-slate-400">{label}</dt>
                  <dd className="text-sm font-medium text-slate-900 dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Compliance & Tax" />
            <dl className="space-y-3">
              {[
                ["PAN Number", emp.panNumber || "Not provided"],
                ["UAN (PF)", emp.uanNumber || "Not provided"],
                ["Annual CTC", formatCurrency(Number(emp.baseSalary), emp.currency)],
                ["Tax Regime", emp.taxDeclarations[0]?.regime || "NEW"],
                ["Financial Year", emp.taxDeclarations[0]?.financialYear || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-slate-200/50 dark:border-slate-800/50 pb-2">
                  <dt className="text-sm text-slate-400">{label}</dt>
                  <dd className="text-sm font-medium text-slate-900 dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      )}

      {/* Salary Slips */}
      {activeTab === "salary" && (
        <Card padding={false}>
          <DataTable
            columns={[
              { key: "period", header: "Period", render: (s: any) => `${new Date(2000, s.month - 1).toLocaleString("en", { month: "short" })} ${s.year}` },
              { key: "grossSalary", header: "Gross", render: (s: any) => formatCurrency(Number(s.grossSalary)) },
              { key: "totalDeductions", header: "Deductions", render: (s: any) => <span className="text-red-400">{formatCurrency(Number(s.totalDeductions))}</span> },
              { key: "netSalary", header: "Net Pay", render: (s: any) => <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(Number(s.netSalary))}</span> },
              { key: "tds", header: "TDS", render: (s: any) => formatCurrency(Number(s.tds)) },
              { key: "pfDeduction", header: "PF", render: (s: any) => formatCurrency(Number(s.pfDeduction)) },
              { key: "isPaid", header: "Status", render: (s: any) => s.isPaid ? <Badge color="green">Paid</Badge> : (
                <Button size="sm" variant="outline" onClick={() => handleMarkPaid(s.id)}>Mark Paid</Button>
              )},
            ]}
            data={emp.salarySlips}
            keyExtractor={(s: any) => s.id}
            emptyMessage="No salary slips generated yet."
          />
        </Card>
      )}

      {/* Expenses */}
      {activeTab === "expenses" && (
        <Card padding={false}>
          <DataTable
            columns={[
              { key: "claimCode", header: "Code", render: (c: any) => <span className="font-mono text-xs text-brand-400">{c.claimCode}</span> },
              { key: "title", header: "Title" },
              { key: "totalAmount", header: "Amount", render: (c: any) => formatCurrency(Number(c.totalAmount)) },
              { key: "isRnDExpense", header: "R&D", render: (c: any) => c.isRnDExpense ? <Badge color="emerald">R&D</Badge> : "—" },
              { key: "status", header: "Status", render: (c: any) => <Badge color={expenseStatusColors[c.status]}>{c.status}</Badge> },
              { key: "actions", header: "", render: (c: any) => c.status === "SUBMITTED" ? (
                <Button size="sm" variant="outline" onClick={() => handleApproveExpense(c.id)}>Approve</Button>
              ) : null },
            ]}
            data={emp.expenseClaims}
            keyExtractor={(c: any) => c.id}
            emptyMessage="No expense claims."
          />
        </Card>
      )}

      {/* Leave */}
      {activeTab === "leave" && (
        <Card padding={false}>
          <DataTable
            columns={[
              { key: "leaveType", header: "Type", render: (l: any) => <Badge color="blue">{l.leaveType}</Badge> },
              { key: "startDate", header: "From", render: (l: any) => formatDate(l.startDate) },
              { key: "endDate", header: "To", render: (l: any) => formatDate(l.endDate) },
              { key: "totalDays", header: "Days", render: (l: any) => `${l.totalDays}d` },
              { key: "reason", header: "Reason", render: (l: any) => l.reason || "—" },
              { key: "status", header: "Status", render: (l: any) => <Badge color={l.status === "APPROVED" ? "green" : l.status === "REJECTED" ? "red" : "amber"}>{l.status}</Badge> },
            ]}
            data={emp.leaveRecords}
            keyExtractor={(l: any) => l.id}
            emptyMessage="No leave records."
          />
        </Card>
      )}
    </div>
  );
}
