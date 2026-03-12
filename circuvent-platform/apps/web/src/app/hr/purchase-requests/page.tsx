"use client";

import React, { useState, useCallback } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, StatCard, Badge, Button, DataTable, Modal, Input, Select, Tabs, Textarea } from "@/components/ui";
import { api } from "@/lib/api-client";
import { formatDate, timeAgo, formatCurrency } from "@/lib/utils";

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

// ══════════════════════════════════════════════════════════════
// Status Badge Color Map
// ══════════════════════════════════════════════════════════════

const statusColors: Record<string, BadgeColor> = {
  DRAFT: "slate",
  SUBMITTED: "blue",
  MANAGER_APPROVED: "cyan",
  FINANCE_APPROVED: "purple",
  ORDERED: "amber",
  DELIVERED: "green",
  BILL_SUBMITTED: "emerald",
  REIMBURSED: "green",
  REJECTED: "red",
  CANCELLED: "orange",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  MANAGER_APPROVED: "Manager Approved",
  FINANCE_APPROVED: "Finance Approved",
  ORDERED: "Ordered",
  DELIVERED: "Delivered",
  BILL_SUBMITTED: "Bill Submitted",
  REIMBURSED: "Reimbursed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

const typeLabels: Record<string, string> = {
  ADVANCE: "Advance Purchase",
  REIMBURSEMENT: "Reimbursement",
  COMPANY_DIRECT: "Company Direct",
};

const typeColors: Record<string, BadgeColor> = {
  ADVANCE: "blue",
  REIMBURSEMENT: "purple",
  COMPANY_DIRECT: "cyan",
};

const categoryOptions = [
  { value: "HARDWARE", label: "Hardware" },
  { value: "SOFTWARE", label: "Software" },
  { value: "OFFICE_SUPPLIES", label: "Office Supplies" },
  { value: "LAB_EQUIPMENT", label: "Lab Equipment" },
  { value: "RAW_MATERIAL", label: "Raw Material" },
  { value: "SERVICES", label: "Services" },
  { value: "OTHER", label: "Other" },
];

const urgencyOptions = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const urgencyColors: Record<string, BadgeColor> = {
  LOW: "slate",
  NORMAL: "blue",
  HIGH: "amber",
  URGENT: "red",
};

// ══════════════════════════════════════════════════════════════
// Interfaces
// ══════════════════════════════════════════════════════════════

interface PurchaseItem {
  id?: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface PurchaseRequest {
  id: string;
  requestNumber: string;
  title: string;
  type: string;
  status: string;
  justification: string;
  urgency: string;
  department: string;
  totalAmount: number;
  vendorName?: string;
  vendorContact?: string;
  expectedDeliveryDate?: string;
  billUrl?: string;
  items: PurchaseItem[];
  employee?: { user?: { firstName: string; lastName: string }; department?: string };
  approvals?: ApprovalEntry[];
  transactions?: TransactionEntry[];
  createdAt: string;
  updatedAt: string;
}

interface ApprovalEntry {
  id: string;
  level: string;
  status: string;
  approverName?: string;
  comments?: string;
  modifiedAmount?: number;
  createdAt: string;
  updatedAt: string;
}

interface TransactionEntry {
  id: string;
  type: string;
  amount: number;
  description: string;
  createdAt: string;
}

interface DashboardStats {
  totalRequests: number;
  pendingApprovals: number;
  totalSpendThisMonth: number;
  reimbursementPending: number;
}

interface FormItem {
  name: string;
  category: string;
  quantity: string;
  unitPrice: string;
}

// ══════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════

export default function PurchaseRequestsPage() {
  const { user, token, isAdmin, isHR } = useAuth();
  const [activeTab, setActiveTab] = useState("my-requests");

  // ── Data fetching ──────────────────────────────────────────
  const { data: dashboard, loading: dashLoading } = useApi<DashboardStats>("/hr/purchase-requests/dashboard");
  const { data: myRequests, loading: myLoading, refetch: refetchMy } = useApi<PurchaseRequest[]>("/hr/purchase-requests/my");
  const { data: allRequests, loading: allLoading, refetch: refetchAll } = useApi<PurchaseRequest[]>(
    isAdmin || isHR ? "/hr/purchase-requests" : null
  );
  const { data: pendingApprovals, loading: pendingLoading, refetch: refetchPending } = useApi<PurchaseRequest[]>(
    "/hr/purchase-requests/pending-approvals"
  );

  // ── State ──────────────────────────────────────────────────
  const [selectedRequest, setSelectedRequest] = useState<PurchaseRequest | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [approveTarget, setApproveTarget] = useState<PurchaseRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PurchaseRequest | null>(null);
  const [approveComments, setApproveComments] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [modifiedAmount, setModifiedAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Filter state for All Requests ──────────────────────────
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");

  // ── Create form state ──────────────────────────────────────
  const emptyItem: FormItem = { name: "", category: "OTHER", quantity: "1", unitPrice: "" };
  const [form, setForm] = useState({
    type: "ADVANCE",
    title: "",
    justification: "",
    urgency: "NORMAL",
    department: "",
    vendorName: "",
    vendorContact: "",
    expectedDeliveryDate: "",
    billUrl: "",
    items: [{ ...emptyItem }],
  });

  // ── Helpers ────────────────────────────────────────────────
  const refetchAll3 = useCallback(() => {
    refetchMy();
    refetchAll();
    refetchPending();
  }, [refetchMy, refetchAll, refetchPending]);

  const calcItemTotal = (item: FormItem) => (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);

  const runningTotal = form.items.reduce((sum, item) => sum + calcItemTotal(item), 0);

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { ...emptyItem }] });
  };

  const updateItem = (index: number, field: keyof FormItem, value: string) => {
    const items = [...form.items];
    items[index] = { ...items[index], [field]: value };
    setForm({ ...form, items });
  };

  const removeItem = (index: number) => {
    if (form.items.length <= 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  };

  const resetForm = () => {
    setForm({
      type: "ADVANCE",
      title: "",
      justification: "",
      urgency: "NORMAL",
      department: "",
      vendorName: "",
      vendorContact: "",
      expectedDeliveryDate: "",
      billUrl: "",
      items: [{ ...emptyItem }],
    });
  };

  // ── View details ───────────────────────────────────────────
  const openDetail = (req: PurchaseRequest) => {
    setSelectedRequest(req);
    setShowDetailModal(true);
  };

  // ── Approval actions ───────────────────────────────────────
  const openApproveModal = (req: PurchaseRequest) => {
    setApproveTarget(req);
    setApproveComments("");
    setModifiedAmount("");
    setShowApproveModal(true);
  };

  const openRejectModal = (req: PurchaseRequest) => {
    setRejectTarget(req);
    setRejectReason("");
    setShowRejectModal(true);
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    setSubmitting(true);
    try {
      const body: any = { comments: approveComments || undefined };
      if (modifiedAmount) body.modifiedAmount = Number(modifiedAmount);
      await api.post(`/hr/purchase-requests/${approveTarget.id}/approve`, body, token || undefined);
      setShowApproveModal(false);
      refetchAll3();
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/hr/purchase-requests/${rejectTarget.id}/reject`, { reason: rejectReason }, token || undefined);
      setShowRejectModal(false);
      refetchAll3();
    } finally {
      setSubmitting(false);
    }
  };

  // ── Status-based actions on detail modal ───────────────────
  const handleStatusAction = async (requestId: string, action: string, payload?: any) => {
    setSubmitting(true);
    try {
      await api.post(`/hr/purchase-requests/${requestId}/${action}`, payload || {}, token || undefined);
      setShowDetailModal(false);
      refetchAll3();
    } finally {
      setSubmitting(false);
    }
  };

  // ── Create / Submit ────────────────────────────────────────
  const handleSaveDraft = async () => {
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        items: form.items.map((item) => ({
          name: item.name,
          category: item.category,
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice) || 0,
          total: calcItemTotal(item),
        })),
        totalAmount: runningTotal,
      };
      await api.post("/hr/purchase-requests", payload, token || undefined);
      resetForm();
      setActiveTab("my-requests");
      refetchAll3();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitForApproval = async () => {
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        items: form.items.map((item) => ({
          name: item.name,
          category: item.category,
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice) || 0,
          total: calcItemTotal(item),
        })),
        totalAmount: runningTotal,
      };
      const res = await api.post<{ id: string }>("/hr/purchase-requests", payload, token || undefined);
      if (res.success && res.data?.id) {
        await api.post(`/hr/purchase-requests/${res.data.id}/submit`, {}, token || undefined);
      }
      resetForm();
      setActiveTab("my-requests");
      refetchAll3();
    } finally {
      setSubmitting(false);
    }
  };

  // ── Filtered all-requests ──────────────────────────────────
  const filteredAllRequests = (allRequests || []).filter((r) => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterDepartment && r.department !== filterDepartment) return false;
    return true;
  });

  const uniqueDepartments = [...new Set((allRequests || []).map((r) => r.department).filter(Boolean))];

  // ── Columns ────────────────────────────────────────────────
  const requestColumns = [
    {
      id: "requestNumber",
      header: "Request #",
      render: (r: PurchaseRequest) => (
        <button onClick={() => openDetail(r)} className="font-mono text-xs text-brand-600 dark:text-brand-600 dark:text-brand-400 hover:underline">
          {r.requestNumber}
        </button>
      ),
    }, { key: "title",
      header: "Title",
      render: (r: PurchaseRequest) => (
        <button onClick={() => openDetail(r)} className="text-slate-900 dark:text-white hover:text-brand-300 text-left">
          {r.title}
        </button>
      ),
    }, { key: "type",
      header: "Type",
      render: (r: PurchaseRequest) => <Badge color={typeColors[r.type] || "slate"}>{typeLabels[r.type] || r.type}</Badge>,
    }, { key: "totalAmount",
      header: "Amount",
      render: (r: PurchaseRequest) => <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(r.totalAmount)}</span>,
    }, { key: "urgency",
      header: "Urgency",
      render: (r: PurchaseRequest) => <Badge color={urgencyColors[r.urgency] || "slate"}>{r.urgency}</Badge>,
    }, { key: "status",
      header: "Status",
      render: (r: PurchaseRequest) => <Badge color={statusColors[r.status] || "slate"}>{statusLabels[r.status] || r.status}</Badge>,
    }, { key: "createdAt",
      header: "Created",
      render: (r: PurchaseRequest) => <span className="text-xs text-slate-400">{timeAgo(r.createdAt)}</span>,
    },
  ];

  // ── Tabs config ────────────────────────────────────────────
  const tabs = [
    { id: "my-requests", label: "My Requests", count: myRequests?.length },
    ...(isAdmin || isHR ? [{ id: "all-requests", label: "All Requests", count: allRequests?.length }] : []),
    { id: "pending-approvals", label: "Pending Approvals", count: pendingApprovals?.length }, { id: "create", label: "Create Request" },
  ];

  // ══════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Material / Purchase Requests"
        subtitle="Submit purchase requests, track approvals, and manage reimbursements"
        breadcrumbs={[{ label: "HR & Payroll", href: "/hr" }, { label: "Purchase Requests" }]}
      />

      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Total Requests"
          value={dashboard?.totalRequests ?? myRequests?.length ?? 0}
          color="blue"
        />
        <StatCard
          title="Pending Approvals"
          value={dashboard?.pendingApprovals ?? pendingApprovals?.length ?? 0}
          color="amber"
        />
        <StatCard
          title="Spend This Month"
          value={dashboard?.totalSpendThisMonth ? formatCurrency(dashboard.totalSpendThisMonth) : "₹0"}
          color="green"
        />
        <StatCard
          title="Reimbursement Pending"
          value={dashboard?.reimbursementPending ? formatCurrency(dashboard.reimbursementPending) : "₹0"}
          color="purple"
        />
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ─── My Requests Tab ─────────────────────────────────── */}
      {activeTab === "my-requests" && (
        <Card padding={false}>
          <DataTable
            columns={requestColumns}
            data={myRequests || []}
            keyExtractor={(r: PurchaseRequest) => r.id}
            loading={myLoading}
            emptyMessage="You haven't created any purchase requests yet."
          />
        </Card>
      )}

      {/* ─── All Requests Tab (Admin/HR) ─────────────────────── */}
      {activeTab === "all-requests" && (isAdmin || isHR) && (
        <div className="space-y-4">
          {/* Filters */}
          <Card>
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-48">
                <Select
                  label="Filter by Status"
                  options={[
                    { value: "", label: "All Statuses" },
                    ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
                  ]}
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                />
              </Card>
              <div className="w-48">
                <Select
                  label="Filter by Department"
                  options={[
                    { value: "", label: "All Departments" },
                    ...uniqueDepartments.map((d) => ({ value: d, label: d })),
                  ]}
                  value={filterDepartment}
                  onChange={(e) => setFilterDepartment(e.target.value)}
                />
              </div>
              {(filterStatus || filterDepartment) && (
                <Button variant="ghost" size="sm" onClick={() => { setFilterStatus(""); setFilterDepartment(""); }}>
                  Clear Filters
                </Button>
              )}
            </div>
          </div>

          <Card padding={false}>
            <DataTable
              columns={[
                ...requestColumns,
                {
                  id: "employee",
                  header: "Employee",
                  render: (r: PurchaseRequest) =>
                    r.employee?.user ? `${r.employee.user.firstName} ${r.employee.user.lastName}` : "—",
                }, { key: "department",
                  header: "Department",
                  render: (r: PurchaseRequest) => r.department || r.employee?.department || "—",
                },
              ]}
              data={filteredAllRequests}
              keyExtractor={(r: PurchaseRequest) => r.id}
              loading={allLoading}
              emptyMessage="No purchase requests match the selected filters."
            />
          </Card>
        </div>
      )}

      {/* ─── Pending Approvals Tab ───────────────────────────── */}
      {activeTab === "pending-approvals" && (
        <div className="space-y-4">
          {pendingLoading ? (
            <Card>
              <p className="text-center py-8 text-slate-400">Loading pending approvals…</p>
            </Card>
          ) : !pendingApprovals || pendingApprovals.length === 0 ? (
            <Card>
              <p className="text-center py-8 text-slate-500">No requests awaiting your approval.</p>
            </Card>
          ) : (
            pendingApprovals.map((req) => (
              <Card key={req.id}>
                <div className="space-y-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-mono text-sm text-brand-600 dark:text-brand-400">{req.requestNumber}</span>
                        <Badge color={typeColors[req.type] || "slate"}>{typeLabels[req.type] || req.type}</Badge>
                        <Badge color={urgencyColors[req.urgency] || "slate"}>{req.urgency}</Badge>
                      </Card>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{req.title}</h3>
                      <p className="text-sm text-slate-400 mt-1">
                        Requested by{" "}
                        <span className="text-slate-900 dark:text-white">
                          {req.employee?.user ? `${req.employee.user.firstName} ${req.employee.user.lastName}` : "Unknown"}
                        </span>
                        {" · "}{req.department || req.employee?.department || ""}
                        {" · "}{timeAgo(req.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(req.totalAmount)}</p>
                      <Badge color={statusColors[req.status] || "slate"}>{statusLabels[req.status] || req.status}</Badge>
                    </div>
                  </div>

                  {/* Justification */}
                  {req.justification && (
                    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                      <p className="text-xs text-slate-400 mb-1">Justification</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{req.justification}</p>
                    </div>
                  )}

                  {/* Items list */}
                  {req.items && req.items.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-400 mb-2">Items ({req.items.length})</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800">
                              <th className="text-left py-2 text-slate-400 font-medium">Item</th>
                              <th className="text-left py-2 text-slate-400 font-medium">Category</th>
                              <th className="text-right py-2 text-slate-400 font-medium">Qty</th>
                              <th className="text-right py-2 text-slate-400 font-medium">Unit Price</th>
                              <th className="text-right py-2 text-slate-400 font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {req.items.map((item, i) => (
                              <tr key={item.id || i} className="border-b border-slate-200/50 dark:border-slate-800/50">
                                <td className="py-2 text-slate-900 dark:text-white">{item.name}</td>
                                <td className="py-2">
                                  <Badge color="slate">{item.category.replace(/_/g, " ")}</Badge>
                                </td>
                                <td className="py-2 text-right text-slate-600 dark:text-slate-300">{item.quantity}</td>
                                <td className="py-2 text-right text-slate-600 dark:text-slate-300">{formatCurrency(item.unitPrice)}</td>
                                <td className="py-2 text-right font-semibold text-slate-900 dark:text-white">{formatCurrency(item.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={4} className="py-2 text-right text-slate-400 font-medium">Total</td>
                              <td className="py-2 text-right font-bold text-green-600 dark:text-green-400">{formatCurrency(req.totalAmount)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Vendor info */}
                  {(req.vendorName || req.vendorContact) && (
                    <div className="flex gap-6 text-sm">
                      {req.vendorName && (
                        <div>
                          <span className="text-slate-400">Vendor: </span>
                          <span className="text-slate-900 dark:text-white">{req.vendorName}</span>
                        </div>
                      )}
                      {req.vendorContact && (
                        <div>
                          <span className="text-slate-400">Contact: </span>
                          <span className="text-slate-900 dark:text-white">{req.vendorContact}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <Button variant="ghost" size="sm" onClick={() => openDetail(req)}>
                      View Details
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openRejectModal(req)}>
                      Reject
                    </Button>
                    <Button size="sm" onClick={() => openApproveModal(req)}>
                      Approve
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── Create Request Tab ──────────────────────────────── */}
      {activeTab === "create" && (
        <Card>
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">New Purchase Request</h2>

            {/* Purchase Type Selector */}
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Purchase Type</label>
              <div className="grid grid-cols-3 gap-3">
                {(["ADVANCE", "REIMBURSEMENT", "COMPANY_DIRECT"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, type: t })}
                    className={`rounded-lg border p-4 text-left transition-all ${
                      form.type === t
                        ? "border-brand-500 bg-brand-100 dark:bg-brand-500/10 ring-1 ring-brand-500"
                        : "border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 hover:border-slate-600"
                    }`}
                  >
                    <p className="font-medium text-slate-900 dark:text-white">{typeLabels[t]}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {t === "ADVANCE" && "Request advance payment for upcoming purchase"}
                      {t === "REIMBURSEMENT" && "Claim reimbursement for out-of-pocket expense"}
                      {t === "COMPANY_DIRECT" && "Direct purchase through company procurement"}
                    </p>
                  </button>
                ))}
              </Card>
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Title"
                placeholder="e.g. IoT Sensor Modules for Lab 3"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <Select
                label="Urgency"
                options={urgencyOptions}
                value={form.urgency}
                onChange={(e) => setForm({ ...form, urgency: e.target.value })}
              />
            </div>

            <Textarea
              label="Justification"
              placeholder="Explain why this purchase is needed…"
              value={form.justification}
              onChange={(e) => setForm({ ...form, justification: e.target.value })}
            />

            <Input
              label="Department"
              placeholder="Auto-filled from profile or enter manually"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />

            {/* ── Item Builder ──────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Items</label>
                <Button size="sm" variant="ghost" onClick={addItem}>+ Add Item</Button>
              </div>

              <div className="space-y-3">
                {form.items.map((item, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Item {i + 1}</span>
                      {form.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          className="text-red-600 dark:text-red-400 hover:text-red-300 text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-4">
                        <Input
                          placeholder="Item name"
                          value={item.name}
                          onChange={(e) => updateItem(i, "name", e.target.value)}
                        />
                      </div>
                      <div className="col-span-3">
                        <Select
                          options={categoryOptions}
                          value={item.category}
                          onChange={(e) => updateItem(i, "category", e.target.value)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          placeholder="Qty"
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(i, "quantity", e.target.value)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          placeholder="Unit Price"
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(i, "unitPrice", e.target.value)}
                        />
                      </div>
                      <div className="col-span-1 flex items-center justify-end">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(calcItemTotal(item))}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Running Total */}
            <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Running Total</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(runningTotal)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-400">Items</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">{form.items.length}</p>
              </div>
            </div>

            {/* Vendor & Delivery */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input
                label="Vendor Name (optional)"
                placeholder="e.g. Mouser Electronics"
                value={form.vendorName}
                onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
              />
              <Input
                label="Vendor Contact (optional)"
                placeholder="Email or phone"
                value={form.vendorContact}
                onChange={(e) => setForm({ ...form, vendorContact: e.target.value })}
              />
              <Input
                label="Expected Delivery Date"
                type="date"
                value={form.expectedDeliveryDate}
                onChange={(e) => setForm({ ...form, expectedDeliveryDate: e.target.value })}
              />
            </div>

            {/* Bill URL (for reimbursement) */}
            {form.type === "REIMBURSEMENT" && (
              <div className="space-y-2">
                <Input
                  label="Bill / Receipt URL"
                  placeholder="https://drive.google.com/… or upload link"
                  value={form.billUrl}
                  onChange={(e) => setForm({ ...form, billUrl: e.target.value })}
                />
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Upload your bill/receipt and paste the link here. This is required for reimbursement processing.
                </p>
              </div>
            )}

            {/* Reimbursement auto-debit messaging */}
            {form.type === "REIMBURSEMENT" && (
              <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/20 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-emerald-600 dark:text-emerald-400 text-lg">💳</span>
                  <div>
                    <p className="text-sm font-medium text-emerald-300">Auto-debit Reimbursement</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      Auto-debit will process to employee bank account once the reimbursement is approved and the bill is verified.
                      Ensure your bank details are up to date in your HR profile.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <Button variant="ghost" onClick={resetForm}>
                Reset
              </Button>
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                loading={submitting}
                disabled={!form.title || form.items.every((i) => !i.name)}
              >
                Save as Draft
              </Button>
              <Button
                onClick={handleSubmitForApproval}
                loading={submitting}
                disabled={!form.title || !form.justification || form.items.every((i) => !i.name || !i.unitPrice)}
              >
                Submit for Approval
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Request Detail Modal                                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Modal
        open={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={`Request ${selectedRequest?.requestNumber || ""}`}
        size="xl"
      >
        {selectedRequest && (
          <div className="space-y-6">
            {/* Request Info */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <p className="text-xs text-slate-400">Type</p>
                <Badge color={typeColors[selectedRequest.type] || "slate"}>
                  {typeLabels[selectedRequest.type] || selectedRequest.type}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-slate-400">Status</p>
                <Badge color={statusColors[selectedRequest.status] || "slate"}>
                  {statusLabels[selectedRequest.status] || selectedRequest.status}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-slate-400">Urgency</p>
                <Badge color={urgencyColors[selectedRequest.urgency] || "slate"}>{selectedRequest.urgency}</Badge>
              </div>
              <div>
                <p className="text-xs text-slate-400">Total Amount</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(selectedRequest.totalAmount)}</p>
              </div>
            </div>

            {/* Title & Justification */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{selectedRequest.title}</h3>
              {selectedRequest.justification && (
                <p className="text-sm text-slate-400 mt-1">{selectedRequest.justification}</p>
              )}
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-400">Department: </span>
                <span className="text-slate-900 dark:text-white">{selectedRequest.department || "—"}</span>
              </div>
              <div>
                <span className="text-slate-400">Created: </span>
                <span className="text-slate-900 dark:text-white">{formatDate(selectedRequest.createdAt)}</span>
              </div>
              {selectedRequest.vendorName && (
                <div>
                  <span className="text-slate-400">Vendor: </span>
                  <span className="text-slate-900 dark:text-white">{selectedRequest.vendorName}</span>
                </div>
              )}
              {selectedRequest.expectedDeliveryDate && (
                <div>
                  <span className="text-slate-400">Expected Delivery: </span>
                  <span className="text-slate-900 dark:text-white">{formatDate(selectedRequest.expectedDeliveryDate)}</span>
                </div>
              )}
              {selectedRequest.employee?.user && (
                <div>
                  <span className="text-slate-400">Employee: </span>
                  <span className="text-slate-900 dark:text-white">
                    {selectedRequest.employee.user.firstName} {selectedRequest.employee.user.lastName}
                  </span>
                </div>
              )}
              {selectedRequest.billUrl && (
                <div>
                  <span className="text-slate-400">Bill: </span>
                  <a href={selectedRequest.billUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-600 dark:text-brand-400 hover:underline">
                    View Receipt
                  </a>
                </div>
              )}
            </div>

            {/* Items Table */}
            {selectedRequest.items && selectedRequest.items.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Items</p>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50">
                        <th className="text-left py-2 px-3 text-slate-400 font-medium">Item</th>
                        <th className="text-left py-2 px-3 text-slate-400 font-medium">Category</th>
                        <th className="text-right py-2 px-3 text-slate-400 font-medium">Qty</th>
                        <th className="text-right py-2 px-3 text-slate-400 font-medium">Unit Price</th>
                        <th className="text-right py-2 px-3 text-slate-400 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRequest.items.map((item, i) => (
                        <tr key={item.id || i} className="border-t border-slate-200 dark:border-slate-800/50">
                          <td className="py-2 px-3 text-slate-900 dark:text-white">{item.name}</td>
                          <td className="py-2 px-3">
                            <Badge color="slate">{item.category.replace(/_/g, " ")}</Badge>
                          </td>
                          <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-300">{item.quantity}</td>
                          <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-300">{formatCurrency(item.unitPrice)}</td>
                          <td className="py-2 px-3 text-right font-semibold text-slate-900 dark:text-white">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 dark:border-slate-700">
                        <td colSpan={4} className="py-2 px-3 text-right font-medium text-slate-400">Grand Total</td>
                        <td className="py-2 px-3 text-right font-bold text-green-600 dark:text-green-400">
                          {formatCurrency(selectedRequest.totalAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Approval Timeline */}
            {selectedRequest.approvals && selectedRequest.approvals.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Approval Timeline</p>
                <div className="space-y-2">
                  {selectedRequest.approvals.map((approval) => (
                    <div
                      key={approval.id}
                      className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50"
                    >
                      <div
                        className={`mt-1 h-2 w-2 rounded-full ${
                          approval.status === "APPROVED"
                            ? "bg-green-400"
                            : approval.status === "REJECTED"
                            ? "bg-red-400"
                            : "bg-amber-400"
                        }`}
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-slate-900 dark:text-white">
                            {approval.level} — {approval.approverName || "Approver"}
                          </p>
                          <span className="text-xs text-slate-400">{timeAgo(approval.updatedAt)}</span>
                        </div>
                        <Badge
                          color={
                            approval.status === "APPROVED"
                              ? "green"
                              : approval.status === "REJECTED"
                              ? "red"
                              : "amber"
                          }
                        >
                          {approval.status}
                        </Badge>
                        {approval.comments && (
                          <p className="text-xs text-slate-400 mt-1">{approval.comments}</p>
                        )}
                        {approval.modifiedAmount != null && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            Modified amount: {formatCurrency(approval.modifiedAmount)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transaction History */}
            {selectedRequest.transactions && selectedRequest.transactions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Transaction History</p>
                <div className="space-y-2">
                  {selectedRequest.transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between rounded-lg bg-white p- dark:bg-slate-800/303">
                      <div>
                        <p className="text-sm text-slate-900 dark:text-white">{tx.description}</p>
                        <p className="text-xs text-slate-400">{tx.type} · {timeAgo(tx.createdAt)}</p>
                      </div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(tx.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reimbursement auto-debit info */}
            {selectedRequest.type === "REIMBURSEMENT" && (
              <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/20 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-emerald-600 dark:text-emerald-400 text-lg">💳</span>
                  <div>
                    <p className="text-sm font-medium text-emerald-300">Auto-debit Reimbursement</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      Auto-debit will process to employee bank account once the reimbursement is approved and the bill is verified.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Status-based Action Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              {selectedRequest.status === "SUBMITTED" && (
                <>
                  <Button variant="outline" onClick={() => { setShowDetailModal(false); openRejectModal(selectedRequest); }}>
                    Reject
                  </Button>
                  <Button onClick={() => { setShowDetailModal(false); openApproveModal(selectedRequest); }}>
                    Manager Approve
                  </Button>
                </>
              )}

              {selectedRequest.status === "MANAGER_APPROVED" && (
                <>
                  <Button variant="outline" onClick={() => { setShowDetailModal(false); openRejectModal(selectedRequest); }}>
                    Reject
                  </Button>
                  <Button onClick={() => { setShowDetailModal(false); openApproveModal(selectedRequest); }}>
                    Finance Approve
                  </Button>
                </>
              )}

              {selectedRequest.status === "FINANCE_APPROVED" && (
                <Button
                  onClick={() => handleStatusAction(selectedRequest.id, "mark-ordered")}
                  loading={submitting}
                >
                  Mark as Ordered
                </Button>
              )}

              {selectedRequest.status === "ORDERED" && (
                <Button
                  onClick={() => handleStatusAction(selectedRequest.id, "mark-delivered")}
                  loading={submitting}
                >
                  Mark as Delivered
                </Button>
              )}

              {selectedRequest.status === "DELIVERED" && (
                <Button
                  onClick={() => handleStatusAction(selectedRequest.id, "submit-bill")}
                  loading={submitting}
                >
                  Submit Bill
                </Button>
              )}

              {selectedRequest.status === "BILL_SUBMITTED" && (
                <Button
                  onClick={() => handleStatusAction(selectedRequest.id, "process-reimbursement")}
                  loading={submitting}
                >
                  Process Reimbursement
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Approve Modal                                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Modal
        open={showApproveModal}
        onClose={() => setShowApproveModal(false)}
        title={`Approve Request ${approveTarget?.requestNumber || ""}`}
      >
        {approveTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
              <p className="text-sm text-slate-900 dark:text-white font-medium">{approveTarget.title}</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(approveTarget.totalAmount)}</p>
              <p className="text-xs text-slate-400 mt-1">
                {approveTarget.employee?.user
                  ? `${approveTarget.employee.user.firstName} ${approveTarget.employee.user.lastName}`
                  : "Unknown employee"}{" "}
                · {approveTarget.department}
              </p>
            </div>

            <Textarea
              label="Comments (optional)"
              placeholder="Add approval notes…"
              value={approveComments}
              onChange={(e) => setApproveComments(e.target.value)}
            />

            {/* Finance can modify amount */}
            {approveTarget.status === "MANAGER_APPROVED" && (
              <Input
                label="Modify Amount (optional — for finance adjustment)"
                type="number"
                placeholder={String(approveTarget.totalAmount)}
                value={modifiedAmount}
                onChange={(e) => setModifiedAmount(e.target.value)}
              />
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setShowApproveModal(false)}>Cancel</Button>
              <Button onClick={handleApprove} loading={submitting}>
                Confirm Approval
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Reject Modal                                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Modal
        open={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title={`Reject Request ${rejectTarget?.requestNumber || ""}`}
      >
        {rejectTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
              <p className="text-sm text-slate-900 dark:text-white font-medium">{rejectTarget.title}</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(rejectTarget.totalAmount)}</p>
            </div>

            <Textarea
              label="Rejection Reason (required)"
              placeholder="Provide a reason for rejecting this request…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />

            {!rejectReason.trim() && (
              <p className="text-xs text-red-600 dark:text-red-400">A rejection reason is required.</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setShowRejectModal(false)}>Cancel</Button>
              <Button
                variant="outline"
                onClick={handleReject}
                loading={submitting}
                disabled={!rejectReason.trim()}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
