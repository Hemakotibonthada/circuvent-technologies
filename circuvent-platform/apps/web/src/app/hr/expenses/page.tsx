"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, StatCard, Badge, Button, DataTable, Modal, Input, Select, Textarea, Tabs } from "@/components/ui";
import { formatCurrency, formatDate, timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

const expenseStatusColors: Record<string, any> = {
  DRAFT: "slate", SUBMITTED: "blue", APPROVED: "green",
  REJECTED: "red", REIMBURSED: "emerald",
  PENDING_L1: "amber", PENDING_L2: "orange", PENDING_L3: "red",
};

const categoryColors: Record<string, any> = {
  TRAVEL: "blue", EQUIPMENT: "purple", SOFTWARE_LICENSE: "cyan",
  COMPONENTS: "amber", CONFERENCE: "green", TRAINING: "pink",
  CLOUD_SERVICES: "blue", PROTOTYPE: "orange", OTHER: "slate",
};

export default function ExpenseWorkflowPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("claims");
  const { data: expenses, loading, refetch } = useApi<any[]>("/hr/expenses");
  const { data: pendingApprovals } = useApi<any[]>("/hr/payroll/v2/approval/pending");
  const { data: rndSummary } = useApi<any>("/hr/expenses/rnd/summary");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    employeeId: "", title: "", description: "", isRnDExpense: false, rnDCategory: "",
    items: [{ description: "", amount: "", category: "OTHER", receiptUrl: "", isRnDRelated: false }],
  });

  const handleCreate = async () => {
    setSubmitting(true);
    await api.post("/hr/expenses", {
      ...form,
      items: form.items.map((item) => ({ ...item, amount: Number(item.amount) })),
    }, token || undefined);
    setShowCreateModal(false);
    setForm({
      employeeId: "", title: "", description: "", isRnDExpense: false, rnDCategory: "",
      items: [{ description: "", amount: "", category: "OTHER", receiptUrl: "", isRnDRelated: false }],
    });
    setSubmitting(false);
    refetch();
  };

  const handleApprove = async (claimId: string) => {
    await api.patch(`/hr/expenses/${claimId}/approve`, {}, token || undefined);
    refetch();
  };

  const handleReject = async (claimId: string) => {
    await api.patch(`/hr/expenses/${claimId}/reject`, {}, token || undefined);
    refetch();
  };

  const addItem = () => {
    setForm({
      ...form,
      items: [...form.items, { description: "", amount: "", category: "OTHER", receiptUrl: "", isRnDRelated: false }],
    });
  };

  const updateItem = (index: number, field: string, value: any) => {
    const items = [...form.items];
    (items[index] as any)[field] = value;
    setForm({ ...form, items });
  };

  const removeItem = (index: number) => {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  };

  const totalAmount = form.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  // Determine approval level
  const getApprovalLevel = (amount: number): string => {
    if (amount <= 25000) return "L1 only";
    if (amount <= 100000) return "L1 + L2";
    return "L1 + L2 + L3";
  };

  const tabs = [
    { id: "claims", label: "All Claims", count: expenses?.length }, { key: "pending", label: "My Approvals", count: pendingApprovals?.length }, { key: "rnd", label: "R&D Summary" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense Management"
        subtitle="Submit claims, track approvals, and R&D tax tagging"
        breadcrumbs={[{ label: "HR & Payroll", href: "/hr" }, { label: "Expenses" }]}
        actions={<Button onClick={() => setShowCreateModal(true)}>+ New Expense Claim</Button>}
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Total Claims" value={expenses?.length ?? 0} color="blue" />
        <StatCard title="Pending Approval" value={pendingApprovals?.length ?? 0} color="amber" />
        <StatCard title="R&D Expenses" value={rndSummary?.recordCount ?? 0} color="emerald" />
        <StatCard title="R&D Total" value={rndSummary?.grandTotal ? formatCurrency(rndSummary.grandTotal) : "₹0"} color="green" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Claims List */}
      {activeTab === "claims" && (
        <Card padding={false}>
          <DataTable
            columns={[{ key: "claimCode", header: "Code", render: (c: any) => <span className="font-mono text-xs text-brand-600 dark:text-brand-400">{c.claimCode}</span> }, { key: "title", header: "Title", render: (c: any) => <span className="text-slate-900 dark:text-white">{c.title}</span> }, { key: "employee", header: "Employee", render: (c: any) => c.employee?.user ? `${c.employee.user.firstName} ${c.employee.user.lastName}` : "—" }, { key: "totalAmount", header: "Amount", render: (c: any) => <span className="font-semibold">{formatCurrency(Number(c.totalAmount))}</span> }, { key: "items", header: "Items", render: (c: any) => c._count?.items ?? c.items?.length ?? 0 }, { key: "isRnD", header: "R&D", render: (c: any) => c.isRnDExpense ? <Badge color="emerald">R&D</Badge> : "—" }, { key: "status", header: "Status", render: (c: any) => <Badge color={expenseStatusColors[c.status]}>{c.status}</Badge> }, { key: "createdAt", header: "Created", render: (c: any) => timeAgo(c.createdAt) }, { key: "actions", header: "", render: (c: any) => c.status === "SUBMITTED" ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => handleApprove(c.id)}>Approve</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleReject(c.id)}>Reject</Button>
                </Card>
              ) : null },
            ]}
            data={expenses || []}
            keyExtractor={(c: any) => c.id}
            loading={loading}
            emptyMessage="No expense claims found."
          />
        </div>
      )}

      {/* Pending Approvals */}
      {activeTab === "pending" && (
        <Card>
          <CardHeader title="Pending Approvals" subtitle="Claims awaiting your approval" />
          {(!pendingApprovals || pendingApprovals.length === 0) ? (
            <p className="text-center py-8 text-slate-500">No pending approvals.</p>
          ) : (
            <div className="space-y-3">
              {pendingApprovals.map((step: any) => (
                <div key={step.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
                  <div>
                    <p className="text-sm text-slate-900 dark:text-white">Level {step.level} approval</p>
                    <p className="text-xs text-slate-400">
                      {step.workflow.entityType}: {step.workflow.entityId}
                    </p>
                  </Card>
                  <Badge color="amber">Pending</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* R&D Summary */}
      {activeTab === "rnd" && rndSummary && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="R&D Expense Summary" subtitle={`FY ${rndSummary.financialYear}`} />
            <div className="space-y-3">
              <div className="flex justify-between border-b border-slate-200/50 dark:border-slate-800/50 pb-2">
                <span className="text-sm text-slate-400">Total R&D Records</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{rndSummary.recordCount}</span>
              </Card>
              <div className="flex justify-between border-b border-slate-200/50 dark:border-slate-800/50 pb-2">
                <span className="text-sm text-slate-400">Grand Total</span>
                <span className="text-sm font-semibold text-green-600 dark:text-green-400">{formatCurrency(rndSummary.grandTotal)}</span>
              </div>
            </div>
          </div>
          <Card>
            <CardHeader title="By Category" />
            <div className="space-y-2">
              {Object.entries(rndSummary.totalByCategory || {}).map(([category, amount]) => (
                <div key={category} className="flex items-center justify-between">
                  <Badge color="emerald">{category.replace(/_/g, " ")}</Badge>
                  <span className="text-sm text-slate-900 dark:text-white">{formatCurrency(amount as number)}</span>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create Expense Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="New Expense Claim" size="xl">
        <div className="space-y-4">
          <Input label="Employee ID" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
          <Input label="Claim Title" placeholder="Component purchase for IoT project" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

          <div className="flex items-center gap-3">
            <input type="checkbox" id="isRnD" checked={form.isRnDExpense} onChange={(e) => setForm({ ...form, isRnDExpense: e.target.checked })} className="rounded border-slate-600 bg-slate-100 dark:bg-slate-800" />
            <label htmlFor="isRnD" className="text-sm text-slate-600 dark:text-slate-300">Mark as R&D Expense (for tax tagging)</label>
          </div>

          {form.isRnDExpense && (
            <Select label="R&D Category" options={[
              { value: "SOFTWARE_DEVELOPMENT", label: "Software Development" },
              { value: "HARDWARE_PROTOTYPING", label: "Hardware Prototyping" },
              { value: "IOT_FIRMWARE", label: "IoT Firmware" },
              { value: "AI_ML_RESEARCH", label: "AI/ML Research" },
              { value: "COMPONENT_PROCUREMENT", label: "Component Procurement" },
              { value: "TESTING_VALIDATION", label: "Testing & Validation" },
            ]} value={form.rnDCategory} onChange={(e) => setForm({ ...form, rnDCategory: e.target.value })} />
          )}

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Expense Items</label>
              <Button size="sm" variant="ghost" onClick={addItem}>+ Add Item</Button>
            </div>
            <div className="space-y-3">
              {form.items.map((item, i) => (
                <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-5">
                      <Input placeholder="Description" value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} />
                    </div>
                    <div className="col-span-3">
                      <Input placeholder="Amount" type="number" value={item.amount} onChange={(e) => updateItem(i, "amount", e.target.value)} />
                    </div>
                    <div className="col-span-3">
                      <Select options={[
                        { value: "TRAVEL", label: "Travel" }, { value: "EQUIPMENT", label: "Equipment" },
                        { value: "COMPONENTS", label: "Components" }, { value: "SOFTWARE_LICENSE", label: "Software" },
                        { value: "CLOUD_SERVICES", label: "Cloud" }, { value: "CONFERENCE", label: "Conference" },
                        { value: "OTHER", label: "Other" },
                      ]} value={item.category} onChange={(e) => updateItem(i, "category", e.target.value)} />
                    </div>
                    <div className="col-span-1 flex items-center">
                      {form.items.length > 1 && (
                        <button onClick={() => removeItem(i)} className="text-red-600 dark:text-red-400 hover:text-red-300">×</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total & Approval Level */}
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Amount</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(totalAmount)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-400">Approval Required</p>
              <Badge color="amber">{getApprovalLevel(totalAmount)}</Badge>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={submitting} disabled={!form.employeeId || !form.title || form.items.every(i => !i.description)}>
              Submit Claim
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
