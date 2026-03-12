"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface PurchaseItem {
  id?: string;
  name: string;
  description: string;
  category: string;
  quantity: number;
  unitPrice: number;
  link: string;
}

interface PurchaseRequest {
  id: string;
  requestNumber: string;
  title: string;
  description: string;
  justification: string;
  totalAmount: number;
  status: string;
  urgency: string;
  department: string;
  vendorName?: string;
  items: PurchaseItem[];
  approvals: Array<{
    id: string;
    approverId: string;
    approverRole: string;
    action: string;
    comments: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
  billUrl?: string;
  actualAmount?: number;
  rejectionReason?: string;
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  DRAFT: { color: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300", label: "Draft" },
  SUBMITTED: { color: "bg-blue-900/50 text-blue-400", label: "Pending" },
  MANAGER_APPROVED: { color: "bg-amber-900/50 text-amber-400", label: "Manager Approved" },
  FINANCE_APPROVED: { color: "bg-indigo-900/50 text-indigo-400", label: "Finance Approved" },
  CEO_APPROVED: { color: "bg-purple-900/50 text-purple-400", label: "CEO Approved" },
  PROCUREMENT_PROCESSING: { color: "bg-cyan-900/50 text-cyan-400", label: "Processing" },
  ORDERED: { color: "bg-teal-900/50 text-teal-400", label: "Ordered" },
  DELIVERED: { color: "bg-green-900/50 text-green-400", label: "Delivered" },
  BILL_SUBMITTED: { color: "bg-orange-900/50 text-orange-400", label: "Bill Submitted" },
  REIMBURSED: { color: "bg-emerald-900/50 text-emerald-400", label: "Reimbursed" },
  REJECTED: { color: "bg-red-900/50 text-red-400", label: "Rejected" },
  CANCELLED: { color: "bg-slate-50 dark:bg-slate-800 text-slate-500", label: "Cancelled" },
  PAYMENT_PROCESSING: { color: "bg-yellow-900/50 text-yellow-400", label: "Payment Processing" },
  PAYMENT_COMPLETED: { color: "bg-emerald-900/50 text-emerald-400", label: "Payment Completed" },
};

const CATEGORIES = [
  "HARDWARE", "SOFTWARE", "OFFICE_SUPPLIES", "LAB_EQUIPMENT",
  "RAW_MATERIAL", "SERVICES", "TRAVEL", "OTHER",
];

const URGENCY_OPTIONS = ["LOW", "NORMAL", "HIGH", "URGENT"];

const URGENCY_COLORS: Record<string, string> = {
  LOW: "text-slate-400",
  NORMAL: "text-blue-400",
  HIGH: "text-amber-400",
  URGENT: "text-red-400",
};

// ══════════════════════════════════════════════════════════════
// Page Component
// ══════════════════════════════════════════════════════════════

export default function PurchaseRequestsPage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PurchaseRequest | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Create form state
  const [form, setForm] = useState({
    title: "",
    description: "",
    justification: "",
    urgency: "NORMAL",
    category: "OTHER",
    vendorName: "",
    items: [{ name: "", description: "", quantity: 1, unitPrice: 0, category: "OTHER", link: "" }] as PurchaseItem[],
  });

  // Receipt form state
  const [receiptForm, setReceiptForm] = useState({ receiptUrl: "", actualAmount: "" });

  useEffect(() => { if (token) loadEmployee(); }, [token]);
  useEffect(() => { if (employee) loadRequests(); }, [employee]);

  const loadEmployee = async () => {
    const res = await api.get<any[]>("/hr/employees", token!);
    if (res.success && res.data) {
      setEmployee(res.data.find((e: any) => e.user?.email === user?.email) || res.data[0]);
    }
  };

  const loadRequests = async () => {
    if (!employee) return;
    setLoading(true);
    const res = await api.get<PurchaseRequest[]>(`/hr/purchase-requests?employeeId=${employee.id}`, token!);
    if (res.success && res.data) setRequests(res.data);
    setLoading(false);
  };

  const filteredRequests = useMemo(() => {
    switch (activeTab) {
      case "pending":
        return requests.filter((r) => ["SUBMITTED", "MANAGER_APPROVED", "FINANCE_APPROVED"].includes(r.status));
      case "approved":
        return requests.filter((r) => ["PROCUREMENT_PROCESSING", "ORDERED", "DELIVERED", "REIMBURSED", "BILL_SUBMITTED", "PAYMENT_COMPLETED"].includes(r.status));
      case "rejected":
        return requests.filter((r) => ["REJECTED", "CANCELLED"].includes(r.status));
      default:
        return requests;
    }
  }, [requests, activeTab]);

  const totalItems = form.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const stats = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((r) => ["SUBMITTED", "MANAGER_APPROVED", "FINANCE_APPROVED"].includes(r.status)).length,
    approved: requests.filter((r) => ["REIMBURSED", "DELIVERED", "PROCUREMENT_PROCESSING"].includes(r.status)).length,
    totalAmount: requests.reduce((s, r) => s + r.totalAmount, 0),
  }), [requests]);

  const handleAddItem = () => {
    setForm({ ...form, items: [...form.items, { name: "", description: "", quantity: 1, unitPrice: 0, category: "OTHER", link: "" }] });
  };

  const handleRemoveItem = (index: number) => {
    if (form.items.length <= 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  };

  const updateItem = (index: number, field: keyof PurchaseItem, value: any) => {
    const items = [...form.items];
    (items[index] as any)[field] = value;
    setForm({ ...form, items });
  };

  const handleCreate = async () => {
    if (!employee || !form.title || !form.justification) return;
    const validItems = form.items.filter((i) => i.name && i.unitPrice > 0);
    if (validItems.length === 0) return;

    setSubmitting(true);
    const res = await api.post("/hr/purchase-requests", {
      employeeId: employee.id,
      title: form.title,
      description: form.description,
      justification: form.justification,
      urgency: form.urgency,
      items: validItems.map((i) => ({
        name: i.name,
        description: i.description,
        category: i.category || form.category,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        specifications: i.link || undefined,
      })),
    }, token!);

    if (res.success) {
      setShowCreate(false);
      setForm({
        title: "", description: "", justification: "", urgency: "NORMAL", category: "OTHER", vendorName: "",
        items: [{ name: "", description: "", quantity: 1, unitPrice: 0, category: "OTHER", link: "" }],
      });
      loadRequests();
    }
    setSubmitting(false);
  };

  const handleCancel = async (requestId: string) => {
    await api.post(`/hr/purchase-requests/${requestId}/cancel`, { reason: "Cancelled by employee" }, token!);
    loadRequests();
  };

  const handleSubmitReceipt = async () => {
    if (!selectedRequest || !receiptForm.receiptUrl) return;
    setSubmitting(true);
    await api.post(`/hr/purchase-requests/${selectedRequest.id}/receipt`, {
      receiptUrl: receiptForm.receiptUrl,
      actualAmount: Number(receiptForm.actualAmount) || selectedRequest.totalAmount,
    }, token!);
    setShowReceipt(false);
    setReceiptForm({ receiptUrl: "", actualAmount: "" });
    setSubmitting(false);
    loadRequests();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-400 hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">🛒 Purchase Requests</h1>
          <p className="text-sm text-slate-500">Request materials, equipment, and services</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm font-medium">
          + New Request
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Requests", value: stats.total, color: "text-slate-900 dark:text-white" },
          { label: "Pending", value: stats.pending, color: "text-amber-400" },
          { label: "Approved", value: stats.approved, color: "text-emerald-400" },
          { label: "Total Amount", value: `₹${stats.totalAmount.toLocaleString("en-IN")}`, color: "text-blue-400" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white shadow-sm rounded dark:bg-slate-900-lg p-1 w-fit">
        {(["all", "pending", "approved", "rejected"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition ${
              activeTab === tab ? "bg-brand-600 text-slate-900 dark:text-white" : "text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center text-slate-500 py-12">Loading...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">
            No purchase requests found
          </div>
        ) : (
          filteredRequests.map((req) => (
            <div
              key={req.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 cursor-pointer hover:border-slate-700 transition"
              onClick={() => { setSelectedRequest(req); setShowDetail(true); }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-500 font-mono">{req.requestNumber}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${STATUS_CONFIG[req.status]?.color || "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>
                      {STATUS_CONFIG[req.status]?.label || req.status}
                    </span>
                    <span className={`text-xs ${URGENCY_COLORS[req.urgency] || "text-slate-400"}`}>
                      {req.urgency}
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white">{req.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{formatDate(req.createdAt)} · {req.items?.length || 0} items</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">₹{req.totalAmount.toLocaleString("en-IN")}</p>
                  {req.actualAmount && req.actualAmount !== req.totalAmount && (
                    <p className="text-xs text-slate-500">Actual: ₹{req.actualAmount.toLocaleString("en-IN")}</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Purchase Request Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-2xl my-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">New Purchase Request</h2>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
              <input
                placeholder="Title *"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm"
              />
              <textarea
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm"
                rows={2}
              />
              <textarea
                placeholder="Justification / Business need *"
                value={form.justification}
                onChange={(e) => setForm({ ...form, justification: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm"
                rows={2}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Urgency</label>
                  <select
                    value={form.urgency}
                    onChange={(e) => setForm({ ...form, urgency: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm"
                  >
                    {URGENCY_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
              </div>

              {/* Items builder */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-400 font-medium">Items</p>
                  <button onClick={handleAddItem} className="text-xs text-brand-400 hover:text-brand-300">+ Add Item</button>
                </div>
                <div className="space-y-2">
                  {form.items.map((item, i) => (
                    <div key={i} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                      <div className="grid grid-cols-6 gap-2">
                        <input
                          placeholder="Item name *"
                          value={item.name}
                          onChange={(e) => updateItem(i, "name", e.target.value)}
                          className="col-span-3 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-slate-900 dark:text-white text-xs"
                        />
                        <input
                          placeholder="Qty"
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItem(i, "quantity", Number(e.target.value))}
                          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-slate-900 dark:text-white text-xs"
                        />
                        <input
                          placeholder="Unit price"
                          type="number"
                          min={0}
                          value={item.unitPrice || ""}
                          onChange={(e) => updateItem(i, "unitPrice", Number(e.target.value))}
                          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-slate-900 dark:text-white text-xs"
                        />
                        <div className="flex items-center">
                          <span className="text-xs text-slate-400 mr-1">₹{(item.quantity * item.unitPrice).toLocaleString("en-IN")}</span>
                          {form.items.length > 1 && (
                            <button onClick={() => handleRemoveItem(i)} className="text-red-500 hover:text-red-400 text-xs ml-auto">✕</button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <input
                          placeholder="Link / URL (optional)"
                          value={item.link}
                          onChange={(e) => updateItem(i, "link", e.target.value)}
                          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-slate-900 dark:text-white text-xs"
                        />
                        <select
                          value={item.category}
                          onChange={(e) => updateItem(i, "category", e.target.value)}
                          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-slate-900 dark:text-white text-xs"
                        >
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-right mt-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">Total: ₹{totalItems.toLocaleString("en-IN")}</span>
                  {totalItems < 5000 && totalItems > 0 && (
                    <span className="text-xs text-emerald-400 ml-2">✓ Auto-approve eligible</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5 border-t border-slate-200 dark:border-slate-800 pt-4">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={submitting || !form.title || !form.justification || form.items.every((i) => !i.name || i.unitPrice <= 0)}
                className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Detail Modal */}
      {showDetail && selectedRequest && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-2xl my-8">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-xs text-slate-500 font-mono">{selectedRequest.requestNumber}</span>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{selectedRequest.title}</h2>
              </div>
              <span className={`px-3 py-1 text-xs rounded-full ${STATUS_CONFIG[selectedRequest.status]?.color || "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>
                {STATUS_CONFIG[selectedRequest.status]?.label || selectedRequest.status}
              </span>
            </div>

            {selectedRequest.description && (
              <p className="text-sm text-slate-400 mb-3">{selectedRequest.description}</p>
            )}
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4"><strong>Justification:</strong> {selectedRequest.justification}</p>

            {/* Items table */}
            <div className="mb-4">
              <h3 className="text-xs text-slate-500 font-medium mb-2">Items</h3>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-700/50"><th className="text-left px-3 py-2 text-slate-400">Item</th><th className="text-center px-3 py-2 text-slate-400">Qty</th><th className="text-right px-3 py-2 text-slate-400">Unit Price</th><th className="text-right px-3 py-2 text-slate-400">Total</th></tr>
                  </thead>
                  <tbody>
                    {(selectedRequest.items || []).map((item, i) => (
                      <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                        <td className="px-3 py-2 text-slate-900 dark:text-white">{item.name}</td>
                        <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-300">{item.quantity}</td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">₹{Number(item.unitPrice).toLocaleString("en-IN")}</td>
                        <td className="px-3 py-2 text-right text-slate-900 dark:text-white font-medium">₹{(item.quantity * Number(item.unitPrice)).toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-600">
                      <td colSpan={3} className="px-3 py-2 text-right text-slate-400 font-medium">Total</td>
                      <td className="px-3 py-2 text-right text-slate-900 dark:text-white font-bold">₹{selectedRequest.totalAmount.toLocaleString("en-IN")}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Approval Timeline */}
            {selectedRequest.approvals && selectedRequest.approvals.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs text-slate-500 font-medium mb-2">Approval Timeline</h3>
                <div className="space-y-2">
                  {selectedRequest.approvals.map((approval) => (
                    <div key={approval.id} className="flex items-start gap-3 bg-slate-100 dark:bg-slate-800/50 rounded-lg p-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 ${approval.action === "APPROVED" ? "bg-emerald-400" : "bg-red-400"}`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-900 dark:text-white">{approval.approverRole}</span>
                          <span className={`text-xs ${approval.action === "APPROVED" ? "text-emerald-400" : "text-red-400"}`}>
                            {approval.action}
                          </span>
                          <span className="text-xs text-slate-500">{formatDate(approval.createdAt)}</span>
                        </div>
                        {approval.comments && <p className="text-xs text-slate-400 mt-0.5">{approval.comments}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rejection reason */}
            {selectedRequest.rejectionReason && (
              <div className="bg-red-900/20 border border-red-900/30 rounded-lg p-3 mb-4">
                <p className="text-xs text-red-400"><strong>Rejection Reason:</strong> {selectedRequest.rejectionReason}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-800 pt-4">
              <div className="flex gap-2">
                {["DRAFT", "SUBMITTED"].includes(selectedRequest.status) && (
                  <button
                    onClick={() => { handleCancel(selectedRequest.id); setShowDetail(false); }}
                    className="px-3 py-1.5 text-xs text-red-400 border border-red-900/50 rounded-lg hover:bg-red-900/20"
                  >
                    Cancel Request
                  </button>
                )}
                {["DELIVERED", "PROCUREMENT_PROCESSING", "ORDERED"].includes(selectedRequest.status) && !selectedRequest.billUrl && (
                  <button
                    onClick={() => { setShowReceipt(true); setShowDetail(false); }}
                    className="px-3 py-1.5 text-xs text-brand-400 border border-brand-900/50 rounded-lg hover:bg-brand-900/20"
                  >
                    Submit Receipt
                  </button>
                )}
              </div>
              <button onClick={() => setShowDetail(false)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Submission Modal */}
      {showReceipt && selectedRequest && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Submit Receipt</h2>
            <p className="text-xs text-slate-500 mb-3">
              For: {selectedRequest.title} ({selectedRequest.requestNumber})
            </p>
            <div className="space-y-3">
              <input
                placeholder="Receipt URL / Upload link *"
                value={receiptForm.receiptUrl}
                onChange={(e) => setReceiptForm({ ...receiptForm, receiptUrl: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm"
              />
              <input
                placeholder={`Actual amount (default: ₹${selectedRequest.totalAmount.toLocaleString("en-IN")})`}
                type="number"
                value={receiptForm.actualAmount}
                onChange={(e) => setReceiptForm({ ...receiptForm, actualAmount: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowReceipt(false)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
              <button
                onClick={handleSubmitReceipt}
                disabled={submitting || !receiptForm.receiptUrl}
                className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
