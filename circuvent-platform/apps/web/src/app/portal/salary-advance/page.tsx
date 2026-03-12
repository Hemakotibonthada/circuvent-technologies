"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface SalaryAdvance {
  id: string;
  employeeId: string;
  amount: number;
  reason: string;
  status: string;
  repaymentMonths: number;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  disbursedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface AdvanceLimits {
  grossSalary: number;
  netSalary: number;
  maxAdvance: number;
  pendingAdvances: number;
  available: number;
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  PENDING: { color: "bg-amber-900/50 text-amber-400", label: "Pending" },
  APPROVED: { color: "bg-emerald-900/50 text-emerald-400", label: "Approved" },
  REJECTED: { color: "bg-red-900/50 text-red-400", label: "Rejected" },
  DISBURSED: { color: "bg-blue-900/50 text-blue-400", label: "Disbursed" },
  DEDUCTED: { color: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300", label: "Deducted" },
  CANCELLED: { color: "bg-slate-50 dark:bg-slate-800 text-slate-500", label: "Cancelled" },
};

// ══════════════════════════════════════════════════════════════
// Page Component
// ══════════════════════════════════════════════════════════════

export default function SalaryAdvancePage() {
  const { token, user } = useAuth();
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [limits, setLimits] = useState<AdvanceLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ amount: "", reason: "", repaymentMonths: "3" });
  const [selectedAdvance, setSelectedAdvance] = useState<SalaryAdvance | null>(null);

  useEffect(() => { if (token) loadData(); }, [token]);

  const loadData = async () => {
    setLoading(true);
    const res = await api.get<{ advances: SalaryAdvance[]; limits: AdvanceLimits }>("/hr/salary-advances/my", token!);
    if (res.success && res.data) {
      setAdvances(res.data.advances || []);
      setLimits(res.data.limits || null);
    }
    setLoading(false);
  };

  const handleRequest = async () => {
    if (!form.amount || !form.reason) return;
    setSubmitting(true);
    const res = await api.post("/hr/salary-advances", {
      amount: Number(form.amount),
      reason: form.reason,
      repaymentMonths: Number(form.repaymentMonths),
    }, token!);

    if (res.success) {
      setShowRequest(false);
      setForm({ amount: "", reason: "", repaymentMonths: "3" });
      loadData();
    }
    setSubmitting(false);
  };

  const handleCancel = async (id: string) => {
    await api.post(`/hr/salary-advances/${id}/cancel`, {}, token!);
    loadData();
  };

  const monthlyDeduction = useMemo(() => {
    if (!form.amount || !form.repaymentMonths) return 0;
    return Math.round(Number(form.amount) / Number(form.repaymentMonths));
  }, [form.amount, form.repaymentMonths]);

  const stats = useMemo(() => ({
    totalRequested: advances.reduce((s, a) => s + Number(a.amount), 0),
    approved: advances.filter((a) => ["APPROVED", "DISBURSED"].includes(a.status)).reduce((s, a) => s + Number(a.amount), 0),
    pending: advances.filter((a) => a.status === "PENDING").length,
  }), [advances]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-400 hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">💰 Salary Advance</h1>
          <p className="text-sm text-slate-500">Request advance on your salary</p>
        </div>
        <button
          onClick={() => setShowRequest(true)}
          disabled={!limits || limits.available <= 0}
          className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm font-medium disabled:opacity-50"
        >
          + Request Advance
        </button>
      </div>

      {/* Stats + Limits */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {limits && (
          <>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-slate-900 dark:text-white">₹{limits.netSalary.toLocaleString("en-IN")}</p>
              <p className="text-xs text-slate-500">Net Salary</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-blue-400">₹{limits.maxAdvance.toLocaleString("en-IN")}</p>
              <p className="text-xs text-slate-500">Max Advance (50%)</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-amber-400">₹{limits.pendingAdvances.toLocaleString("en-IN")}</p>
              <p className="text-xs text-slate-500">Pending/Active</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-emerald-400">₹{limits.available.toLocaleString("en-IN")}</p>
              <p className="text-xs text-slate-500">Available</p>
            </div>
          </>
        )}
      </div>

      {/* Advance History */}
      <h2 className="text-sm font-medium text-slate-400 mb-3">Advance History</h2>
      <div className="space-y-3">
        {loading ? (
          <div className="text-center text-slate-500 py-12">Loading...</div>
        ) : advances.length === 0 ? (
          <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">
            No salary advance requests yet
          </div>
        ) : (
          advances.map((adv) => (
            <div key={adv.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-xs rounded ${STATUS_CONFIG[adv.status]?.color || "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>
                      {STATUS_CONFIG[adv.status]?.label || adv.status}
                    </span>
                    <span className="text-xs text-slate-500">{formatDate(adv.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-900 dark:text-white">{adv.reason}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Repayment: {adv.repaymentMonths} months · ₹{Math.round(Number(adv.amount) / adv.repaymentMonths).toLocaleString("en-IN")}/month
                  </p>
                  {adv.rejectionReason && (
                    <p className="text-xs text-red-400 mt-1">Reason: {adv.rejectionReason}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">₹{Number(adv.amount).toLocaleString("en-IN")}</p>
                  {adv.status === "PENDING" && (
                    <button
                      onClick={() => handleCancel(adv.id)}
                      className="text-xs text-red-400 hover:text-red-300 mt-1"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Repayment schedule for approved */}
              {["APPROVED", "DISBURSED"].includes(adv.status) && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500 mb-1">Repayment Schedule</p>
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: adv.repaymentMonths }, (_, i) => {
                      const d = new Date(adv.approvedAt || adv.createdAt);
                      d.setMonth(d.getMonth() + i + 1);
                      const monthlyAmt = Math.round(Number(adv.amount) / adv.repaymentMonths);
                      const isPast = d < new Date();
                      return (
                        <div key={i} className={`text-center p-1.5 rounded text-xs ${isPast ? "bg-emerald-900/20 text-emerald-400" : "bg-slate-50 dark:bg-slate-800 text-slate-400"}`}>
                          <p className="font-medium">{d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}</p>
                          <p>₹{monthlyAmt.toLocaleString("en-IN")}</p>
                          {isPast && <p className="text-[10px]">✓ Deducted</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Request Modal */}
      {showRequest && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Request Salary Advance</h2>

            {limits && (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 mb-4 text-xs text-slate-400">
                <p>Net Salary: <span className="text-slate-900 dark:text-white font-medium">₹{limits.netSalary.toLocaleString("en-IN")}</span></p>
                <p>Max Advance: <span className="text-blue-400 font-medium">₹{limits.maxAdvance.toLocaleString("en-IN")}</span></p>
                <p>Available: <span className="text-emerald-400 font-medium">₹{limits.available.toLocaleString("en-IN")}</span></p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Amount (₹) *</label>
                <input
                  type="number"
                  placeholder={`Max ₹${limits?.available.toLocaleString("en-IN") || "0"}`}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  max={limits?.available || 0}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm"
                />
                {Number(form.amount) > (limits?.available || 0) && (
                  <p className="text-xs text-red-400 mt-1">Exceeds available limit</p>
                )}
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Reason *</label>
                <textarea
                  placeholder="Why do you need the advance?"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Repayment Period</label>
                <select
                  value={form.repaymentMonths}
                  onChange={(e) => setForm({ ...form, repaymentMonths: e.target.value })}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm"
                >
                  {[1, 2, 3, 4, 5, 6].map((m) => (
                    <option key={m} value={m}>{m} month{m > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
              {form.amount && Number(form.amount) > 0 && (
                <div className="bg-blue-900/20 border border-blue-900/30 rounded-lg p-3 text-xs">
                  <p className="text-blue-400">Monthly deduction: <strong>₹{monthlyDeduction.toLocaleString("en-IN")}</strong></p>
                  <p className="text-slate-500 mt-0.5">Will be auto-deducted from your payroll for {form.repaymentMonths} months</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowRequest(false)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
              <button
                onClick={handleRequest}
                disabled={submitting || !form.amount || !form.reason || Number(form.amount) > (limits?.available || 0) || Number(form.amount) <= 0}
                className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50"
              >
                {submitting ? "Requesting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
