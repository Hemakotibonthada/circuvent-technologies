"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, StatCard, Badge, Button, DataTable, Modal, Input, Select, Textarea, Tabs, EmptyState } from "@/components/ui";
import { leadStatusColors, invoiceStatusColors } from "@/lib/status-colors";
import { formatCurrency, formatDate, timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface Lead {
  id: string; title: string; description: string | null; status: string; source: string;
  estimatedValue: number | null; currency: string; probability: number | null;
  expectedCloseDate: string | null; tags: string[]; createdAt: string;
  client: { id: string; companyName: string } | null;
  createdBy: { firstName: string; lastName: string };
  assignedTo: { firstName: string; lastName: string } | null;
  _count: { activities: number };
}

interface Invoice {
  id: string; invoiceNumber: string; title: string; status: string;
  totalAmount: number; paidAmount: number; currency: string; dueDate: string;
  issueDate: string;
  client: { id: string; companyName: string };
}

interface PipelineSummary {
  stages: { status: string; count: number; totalValue: number }[];
  totalLeads: number; totalPipelineValue: number;
}

export default function ClientsPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("leads");
  const { data: leads, loading: leadsLoading, refetch: refetchLeads } = useApi<Lead[]>("/clients/leads");
  const { data: invoices, loading: invoicesLoading, refetch: refetchInvoices } = useApi<Invoice[]>("/clients/invoices");
  const { data: pipeline } = useApi<PipelineSummary>("/clients/leads/pipeline/summary");
  const { data: revenue } = useApi<any>("/clients/invoices/dashboard/revenue");

  // Lead creation
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [leadForm, setLeadForm] = useState({ title: "", description: "", source: "OTHER", estimatedValue: "", currency: "INR", probability: "" });

  // Invoice creation
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    clientId: "", title: "", dueDate: "", currency: "INR", taxRate: "18", discount: "0",
    lineItems: [{ description: "", quantity: "1", unitPrice: "" }],
  });

  const [submitting, setSubmitting] = useState(false);

  const handleCreateLead = async () => {
    setSubmitting(true);
    await api.post("/clients/leads", {
      ...leadForm,
      estimatedValue: leadForm.estimatedValue ? Number(leadForm.estimatedValue) : undefined,
      probability: leadForm.probability ? Number(leadForm.probability) : undefined,
    }, token || undefined);
    setShowLeadModal(false);
    setLeadForm({ title: "", description: "", source: "OTHER", estimatedValue: "", currency: "INR", probability: "" });
    setSubmitting(false);
    refetchLeads();
  };

  const handleUpdateLeadStatus = async (leadId: string, status: string) => {
    await api.patch(`/clients/leads/${leadId}/status`, { status }, token || undefined);
    refetchLeads();
  };

  const handleCreateInvoice = async () => {
    setSubmitting(true);
    await api.post("/clients/invoices", {
      ...invoiceForm,
      taxRate: Number(invoiceForm.taxRate),
      discount: Number(invoiceForm.discount),
      lineItems: invoiceForm.lineItems.map(li => ({
        description: li.description,
        quantity: Number(li.quantity),
        unitPrice: Number(li.unitPrice),
      })),
    }, token || undefined);
    setShowInvoiceModal(false);
    setInvoiceForm({ clientId: "", title: "", dueDate: "", currency: "INR", taxRate: "18", discount: "0", lineItems: [{ description: "", quantity: "1", unitPrice: "" }] });
    setSubmitting(false);
    refetchInvoices();
  };

  const addLineItem = () => {
    setInvoiceForm({ ...invoiceForm, lineItems: [...invoiceForm.lineItems, { description: "", quantity: "1", unitPrice: "" }] });
  };

  const removeLineItem = (index: number) => {
    setInvoiceForm({ ...invoiceForm, lineItems: invoiceForm.lineItems.filter((_, i) => i !== index) });
  };

  const updateLineItem = (index: number, field: string, value: string) => {
    const items = [...invoiceForm.lineItems];
    (items[index] as any)[field] = value;
    setInvoiceForm({ ...invoiceForm, lineItems: items });
  };

  const tabs = [
    { id: "leads", label: "Lead Pipeline", count: leads?.length },
    { id: "invoices", label: "Invoices", count: invoices?.length },
    { id: "revenue", label: "Revenue" },
  ];

  const leadColumns = [
    { key: "title", header: "Title", render: (l: Lead) => <span className="font-medium text-slate-900 dark:text-white">{l.title}</span> },
    { key: "client", header: "Client", render: (l: Lead) => l.client?.companyName || "—" },
    { key: "source", header: "Source", render: (l: Lead) => <Badge color="cyan">{l.source}</Badge> },
    { key: "status", header: "Status", render: (l: Lead) => (
      <select
        value={l.status}
        onChange={(e) => handleUpdateLeadStatus(l.id, e.target.value)}
        className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-600 dark:text-slate-300"
      >
        {["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"].map(s => (
          <option key={s} value={s}>{s.replace("_", " ")}</option>
        ))}
      </select>
    )},
    { key: "value", header: "Value", render: (l: Lead) => l.estimatedValue ? formatCurrency(Number(l.estimatedValue), l.currency) : "—" },
    { key: "probability", header: "Win %", render: (l: Lead) => l.probability ? `${l.probability}%` : "—" },
    { key: "assignedTo", header: "Assigned To", render: (l: Lead) => l.assignedTo ? `${l.assignedTo.firstName} ${l.assignedTo.lastName}` : "Unassigned" },
    { key: "createdAt", header: "Created", render: (l: Lead) => timeAgo(l.createdAt) },
  ];

  const invoiceColumns = [
    { key: "invoiceNumber", header: "Invoice #", render: (i: Invoice) => <span className="font-mono text-xs text-brand-400">{i.invoiceNumber}</span> },
    { key: "title", header: "Title", render: (i: Invoice) => <span className="text-slate-900 dark:text-white">{i.title}</span> },
    { key: "client", header: "Client", render: (i: Invoice) => i.client.companyName },
    { key: "totalAmount", header: "Total", render: (i: Invoice) => <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(Number(i.totalAmount), i.currency)}</span> },
    { key: "paidAmount", header: "Paid", render: (i: Invoice) => formatCurrency(Number(i.paidAmount), i.currency) },
    { key: "status", header: "Status", render: (i: Invoice) => <Badge color={invoiceStatusColors[i.status]}>{i.status}</Badge> },
    { key: "dueDate", header: "Due", render: (i: Invoice) => formatDate(i.dueDate) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client & Consulting Portal"
        subtitle="Lead pipeline, multi-currency invoicing, revenue tracking"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowLeadModal(true)}>+ New Lead</Button>
            <Button onClick={() => setShowInvoiceModal(true)}>+ New Invoice</Button>
          </div>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard title="Total Leads" value={pipeline?.totalLeads ?? "—"} color="blue" />
        <StatCard title="Pipeline Value" value={pipeline?.totalPipelineValue ? formatCurrency(pipeline.totalPipelineValue) : "—"} color="purple" />
        <StatCard title="Revenue (Year)" value={revenue?.totalRevenue ? formatCurrency(revenue.totalRevenue) : "—"} color="green" />
        <StatCard title="Outstanding" value={revenue?.outstanding ? formatCurrency(revenue.outstanding) : "₹0"} color="amber" />
        <StatCard title="Overdue Invoices" value={revenue?.overdueInvoices ?? 0} color="red" />
      </div>

      {/* Pipeline Visual */}
      {pipeline && pipeline.stages.length > 0 && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-400">LEAD PIPELINE</h3>
          <div className="flex gap-2">
            {pipeline.stages.map((stage) => (
              <div key={stage.status} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 p-3 dark:bg-slate-800/50 text-center">
                <Badge color={leadStatusColors[stage.status]}>{stage.status.replace("_", " ")}</Badge>
                <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stage.count}</p>
                <p className="text-xs text-slate-500">{formatCurrency(stage.totalValue)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Leads Tab */}
      {activeTab === "leads" && (
        <Card padding={false}>
          <DataTable columns={leadColumns} data={leads || []} keyExtractor={(l) => l.id} loading={leadsLoading} emptyMessage="No leads yet." />
        </Card>
      )}

      {/* Invoices Tab */}
      {activeTab === "invoices" && (
        <Card padding={false}>
          <DataTable columns={invoiceColumns} data={invoices || []} keyExtractor={(i) => i.id} loading={invoicesLoading} emptyMessage="No invoices created." />
        </Card>
      )}

      {/* Revenue Tab */}
      {activeTab === "revenue" && revenue && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Revenue Summary" subtitle={`FY ${revenue.year}`} />
            <div className="space-y-4">
              {[
                ["Total Revenue", formatCurrency(revenue.totalRevenue), "text-green-400"],
                ["Collected", formatCurrency(revenue.totalCollected), "text-blue-400"],
                ["Outstanding", formatCurrency(revenue.outstanding), "text-amber-400"],
                ["Overdue Invoices", revenue.overdueInvoices, "text-red-400"],
              ].map(([label, value, color]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-sm text-slate-400">{label}</span>
                  <span className={`text-sm font-semibold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Invoices by Status" />
            <div className="space-y-3">
              {revenue.byStatus?.map((s: any) => (
                <div key={s.status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge color={invoiceStatusColors[s.status]}>{s.status}</Badge>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{s._count.id}</span>
                    <span className="ml-2 text-xs text-slate-500">({formatCurrency(Number(s._sum.totalAmount || 0))})</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Create Lead Modal */}
      <Modal open={showLeadModal} onClose={() => setShowLeadModal(false)} title="Create New Lead">
        <div className="space-y-4">
          <Input label="Lead Title" placeholder="New project inquiry..." value={leadForm.title} onChange={(e) => setLeadForm({ ...leadForm, title: e.target.value })} />
          <Textarea label="Description" value={leadForm.description} onChange={(e) => setLeadForm({ ...leadForm, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Source" options={[
              { value: "WEBSITE", label: "Website" }, { value: "REFERRAL", label: "Referral" },
              { value: "LINKEDIN", label: "LinkedIn" }, { value: "CONFERENCE", label: "Conference" },
              { value: "COLD_OUTREACH", label: "Cold Outreach" }, { value: "OTHER", label: "Other" },
            ]} value={leadForm.source} onChange={(e) => setLeadForm({ ...leadForm, source: e.target.value })} />
            <Input label="Estimated Value" type="number" placeholder="100000" value={leadForm.estimatedValue} onChange={(e) => setLeadForm({ ...leadForm, estimatedValue: e.target.value })} />
          </div>
          <Input label="Win Probability (%)" type="number" placeholder="50" value={leadForm.probability} onChange={(e) => setLeadForm({ ...leadForm, probability: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowLeadModal(false)}>Cancel</Button>
            <Button onClick={handleCreateLead} loading={submitting} disabled={!leadForm.title}>Create Lead</Button>
          </div>
        </div>
      </Modal>

      {/* Create Invoice Modal */}
      <Modal open={showInvoiceModal} onClose={() => setShowInvoiceModal(false)} title="Create Invoice" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Title" placeholder="Consulting Services - March 2026" value={invoiceForm.title} onChange={(e) => setInvoiceForm({ ...invoiceForm, title: e.target.value })} />
            <Input label="Due Date" type="date" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Select label="Currency" options={[
              { value: "INR", label: "INR (₹)" }, { value: "USD", label: "USD ($)" },
              { value: "EUR", label: "EUR (€)" }, { value: "GBP", label: "GBP (£)" },
            ]} value={invoiceForm.currency} onChange={(e) => setInvoiceForm({ ...invoiceForm, currency: e.target.value })} />
            <Input label="GST Rate (%)" type="number" value={invoiceForm.taxRate} onChange={(e) => setInvoiceForm({ ...invoiceForm, taxRate: e.target.value })} />
            <Input label="Discount" type="number" value={invoiceForm.discount} onChange={(e) => setInvoiceForm({ ...invoiceForm, discount: e.target.value })} />
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Line Items</label>
              <Button size="sm" variant="ghost" onClick={addLineItem}>+ Add Item</Button>
            </div>
            <div className="space-y-2">
              {invoiceForm.lineItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-6">
                    <Input placeholder="Description" value={item.description} onChange={(e) => updateLineItem(i, "description", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <Input placeholder="Qty" type="number" value={item.quantity} onChange={(e) => updateLineItem(i, "quantity", e.target.value)} />
                  </div>
                  <div className="col-span-3">
                    <Input placeholder="Unit Price" type="number" value={item.unitPrice} onChange={(e) => updateLineItem(i, "unitPrice", e.target.value)} />
                  </div>
                  <div className="col-span-1">
                    {invoiceForm.lineItems.length > 1 && (
                      <button onClick={() => removeLineItem(i)} className="text-red-400 hover:text-red-300 p-2">×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowInvoiceModal(false)}>Cancel</Button>
            <Button onClick={handleCreateInvoice} loading={submitting} disabled={!invoiceForm.title || !invoiceForm.dueDate}>Create Invoice</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
