"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, StatCard, Badge, Button, DataTable, Tabs } from "@/components/ui";
import { formatCurrency, formatDate, timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface RevenueDashboard {
  year: number; totalRevenue: number; totalCollected: number;
  outstanding: number; overdueInvoices: number; invoiceCount: number;
  byStatus: { status: string; _count: { id: number }; _sum: { totalAmount: number } }[];
}

interface PipelineSummary {
  stages: { status: string; count: number; totalValue: number }[];
  totalLeads: number; totalPipelineValue: number;
}

const invoiceStatusColors: Record<string, any> = {
  DRAFT: "slate", SENT: "blue", VIEWED: "cyan", PAID: "green",
  OVERDUE: "red", CANCELLED: "slate", PARTIALLY_PAID: "amber",
};

const leadStatusColors: Record<string, any> = {
  NEW: "blue", CONTACTED: "cyan", QUALIFIED: "purple",
  PROPOSAL_SENT: "amber", NEGOTIATION: "orange", WON: "green", LOST: "red",
};

export default function ClientAnalyticsPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("revenue");
  const { data: revenue } = useApi<RevenueDashboard>("/clients/invoices/dashboard/revenue");
  const { data: pipeline } = useApi<PipelineSummary>("/clients/leads/pipeline/summary");
  const { data: invoices } = useApi<any[]>("/clients/invoices");
  const { data: clients } = useApi<any[]>("/clients/clients");

  const tabs = [
    { id: "revenue", label: "Revenue Analytics" },
    { id: "pipeline", label: "Lead Pipeline" },
    { id: "aging", label: "Invoice Aging" },
    { id: "clients", label: "Client Summary" },
  ];

  // Compute aging from invoices
  const overdue = (invoices || []).filter((i: any) => {
    return ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"].includes(i.status) && new Date(i.dueDate) < new Date();
  });
  const agingBuckets = {
    current: overdue.filter((i: any) => { const days = Math.floor((Date.now() - new Date(i.dueDate).getTime()) / 86400000); return days <= 0; }),
    thirtyDays: overdue.filter((i: any) => { const days = Math.floor((Date.now() - new Date(i.dueDate).getTime()) / 86400000); return days > 0 && days <= 30; }),
    sixtyDays: overdue.filter((i: any) => { const days = Math.floor((Date.now() - new Date(i.dueDate).getTime()) / 86400000); return days > 30 && days <= 60; }),
    ninetyDays: overdue.filter((i: any) => { const days = Math.floor((Date.now() - new Date(i.dueDate).getTime()) / 86400000); return days > 60 && days <= 90; }),
    overNinety: overdue.filter((i: any) => { const days = Math.floor((Date.now() - new Date(i.dueDate).getTime()) / 86400000); return days > 90; }),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client Analytics"
        subtitle="Revenue, pipeline, invoice aging, and client insights"
        breadcrumbs={[{ label: "Client Portal", href: "/clients" }, { label: "Analytics" }]}
      />

      {/* Top Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard title="Total Revenue" value={revenue?.totalRevenue ? formatCurrency(revenue.totalRevenue) : "—"} color="green" />
        <StatCard title="Collected" value={revenue?.totalCollected ? formatCurrency(revenue.totalCollected) : "—"} color="blue" />
        <StatCard title="Outstanding" value={revenue?.outstanding ? formatCurrency(revenue.outstanding) : "₹0"} color="amber" />
        <StatCard title="Pipeline Value" value={pipeline?.totalPipelineValue ? formatCurrency(pipeline.totalPipelineValue) : "—"} color="purple" />
        <StatCard title="Overdue" value={revenue?.overdueInvoices ?? 0} color="red" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Revenue Tab */}
      {activeTab === "revenue" && revenue && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Revenue Summary" subtitle={`Year ${revenue.year}`} />
            <div className="space-y-3">
              {[
                ["Total Revenue", formatCurrency(revenue.totalRevenue), "text-green-400"],
                ["Collected", formatCurrency(revenue.totalCollected), "text-blue-400"],
                ["Outstanding", formatCurrency(revenue.outstanding), "text-amber-400"],
                ["Invoices", String(revenue.invoiceCount), "text-slate-900 dark:text-white"],
                ["Overdue Invoices", String(revenue.overdueInvoices), "text-red-400"],
                ["Collection Rate", revenue.totalRevenue > 0 ? `${Math.round((revenue.totalCollected / revenue.totalRevenue) * 100)}%` : "—", "text-cyan-400"],
              ].map(([label, value, color]) => (
                <div key={label} className="flex justify-between border-b border-slate-200/50 dark:border-slate-800/50 pb-2">
                  <span className="text-sm text-slate-400">{label}</span>
                  <span className={`text-sm font-semibold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Invoices by Status" />
            <div className="space-y-3">
              {(revenue.byStatus || []).map((s: any) => (
                <div key={s.status} className="flex items-center justify-between">
                  <Badge color={invoiceStatusColors[s.status]}>{s.status}</Badge>
                  <div className="text-right">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{s._count.id}</span>
                    <span className="ml-2 text-xs text-slate-500">({formatCurrency(Number(s._sum?.totalAmount || 0))})</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Pipeline Tab */}
      {activeTab === "pipeline" && pipeline && (
        <div className="space-y-6">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {pipeline.stages.map((stage) => (
              <div key={stage.status} className="flex-1 min-w-[120px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white p- dark:bg-slate-800/304 text-center">
                <Badge color={leadStatusColors[stage.status]}>{stage.status.replace("_", " ")}</Badge>
                <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stage.count}</p>
                <p className="text-xs text-slate-500">{formatCurrency(stage.totalValue)}</p>
              </div>
            ))}
          </div>

          <Card>
            <CardHeader title="Pipeline Summary" />
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{pipeline.totalLeads}</p>
                <p className="text-xs text-slate-400">Total Leads</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-green-400">{formatCurrency(pipeline.totalPipelineValue)}</p>
                <p className="text-xs text-slate-400">Pipeline Value</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-purple-400">
                  {pipeline.totalLeads > 0 ? formatCurrency(pipeline.totalPipelineValue / pipeline.totalLeads) : "—"}
                </p>
                <p className="text-xs text-slate-400">Avg Deal Size</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Aging Tab */}
      {activeTab === "aging" && (
        <div className="space-y-6">
          <div className="grid grid-cols-5 gap-4">
            {([
              ["Current", agingBuckets.current, "green"],
              ["1-30 Days", agingBuckets.thirtyDays, "amber"],
              ["31-60 Days", agingBuckets.sixtyDays, "orange"],
              ["61-90 Days", agingBuckets.ninetyDays, "red"],
              ["90+ Days", agingBuckets.overNinety, "red"],
            ] as [string, any[], any][]).map(([label, items, color]) => (
              <Card key={label} className="text-center">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{items.length}</p>
                <p className="text-xs text-slate-400">
                  {formatCurrency(items.reduce((sum: number, i: any) => sum + Number(i.totalAmount) - Number(i.paidAmount), 0))}
                </p>
              </Card>
            ))}
          </div>

          {overdue.length > 0 && (
            <Card padding={false}>
              <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-red-400">Overdue Invoices</h3>
              </div>
              <DataTable
                columns={[
                  { key: "invoiceNumber", header: "Invoice", render: (i: any) => <span className="font-mono text-xs text-brand-400">{i.invoiceNumber}</span> },
                  { key: "client", header: "Client", render: (i: any) => i.client?.companyName || "—" },
                  { key: "totalAmount", header: "Amount", render: (i: any) => <span className="font-semibold">{formatCurrency(Number(i.totalAmount), i.currency)}</span> },
                  { key: "balance", header: "Balance", render: (i: any) => <span className="text-red-400">{formatCurrency(Number(i.totalAmount) - Number(i.paidAmount), i.currency)}</span> },
                  { key: "dueDate", header: "Due", render: (i: any) => formatDate(i.dueDate) },
                  { key: "daysOverdue", header: "Days", render: (i: any) => {
                    const days = Math.floor((Date.now() - new Date(i.dueDate).getTime()) / 86400000);
                    return <Badge color={days > 60 ? "red" : days > 30 ? "orange" : "amber"}>{days}d</Badge>;
                  }},
                  { key: "status", header: "Status", render: (i: any) => <Badge color={invoiceStatusColors[i.status]}>{i.status}</Badge> },
                ]}
                data={overdue}
                keyExtractor={(i: any) => i.id}
              />
            </Card>
          )}

          {overdue.length === 0 && (
            <Card className="border-green-500/20 bg-green-500/5 text-center py-12">
              <p className="text-lg font-semibold text-green-400">No Overdue Invoices</p>
              <p className="text-sm text-slate-400">All invoices are current. Great job!</p>
            </Card>
          )}
        </div>
      )}

      {/* Clients Tab */}
      {activeTab === "clients" && (
        <Card padding={false}>
          <DataTable
            columns={[
              { key: "companyName", header: "Company", render: (c: any) => <span className="font-medium text-slate-900 dark:text-white">{c.companyName}</span> },
              { key: "contact", header: "Contact", render: (c: any) => c.user ? `${c.user.firstName} ${c.user.lastName}` : "—" },
              { key: "country", header: "Country" },
              { key: "currency", header: "Currency", render: (c: any) => <Badge color="blue">{c.preferredCurrency}</Badge> },
              { key: "leads", header: "Leads", render: (c: any) => c._count?.leads ?? 0 },
              { key: "invoices", header: "Invoices", render: (c: any) => c._count?.invoices ?? 0 },
              { key: "projects", header: "Projects", render: (c: any) => c._count?.projects ?? 0 },
            ]}
            data={clients || []}
            keyExtractor={(c: any) => c.id}
            emptyMessage="No clients found."
          />
        </Card>
      )}
    </div>
  );
}
