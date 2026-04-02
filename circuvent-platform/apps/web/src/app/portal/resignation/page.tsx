"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface Resignation {
  id: string;
  employeeId: string;
  reason: string;
  lastWorkingDate: string;
  noticePeriod: number;
  status: string;
  processedBy?: string;
  processedAt?: string;
  exitInterviewDone: boolean;
  exitInterviewNotes?: string;
  createdAt: string;
  exitChecklist?: ExitChecklistItem[];
}

interface ExitChecklistItem {
  id: string;
  title: string;
  category: string;
  isCompleted: boolean;
}

interface SettlementData {
  employeeName: string;
  lastWorkingDay: string;
  tenureYears: number;
  components: {
    pendingSalary: number;
    leaveEncashment: number;
    gratuity: number;
    bonus: number;
    pendingReimbursements: number;
    deductions: number;
    advanceRecovery: number;
    noticePeriodRecovery: number;
  };
  totalPayable: number;
  totalDeductions: number;
  netSettlement: number;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  SUBMITTED: { color: "bg-amber-900/50 text-amber-600 dark:text-amber-400", label: "Under Review", icon: "⏳" },
  ACCEPTED: { color: "bg-blue-900/50 text-blue-600 dark:text-blue-400", label: "Accepted", icon: "✅" },
  REJECTED: { color: "bg-red-900/50 text-red-600 dark:text-red-400", label: "Rejected", icon: "❌" },
  WITHDRAWN: { color: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300", label: "Withdrawn", icon: "↩️" },
  COMPLETED: { color: "bg-emerald-900/50 text-emerald-600 dark:text-emerald-400", label: "Completed", icon: "🏁" },
};

// ══════════════════════════════════════════════════════════════
// Page Component
// ══════════════════════════════════════════════════════════════

export default function ResignationPage() {
  const { token, user } = useAuth();
  const [resignations, setResignations] = useState<Resignation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [settlement, setSettlement] = useState<SettlementData | null>(null);
  const [form, setForm] = useState({ reason: "", lastWorkingDate: "" });

  const activeResignation = useMemo(() => {
    return resignations.find((r) => ["SUBMITTED", "ACCEPTED"].includes(r.status));
  }, [resignations]);

  useEffect(() => { if (token) loadResignations(); }, [token]);

  const loadResignations = async () => {
    setLoading(true);
    const res = await api.get<Resignation[]>("/hr/resignations/my", token!);
    if (res.success && res.data) setResignations(res.data);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!form.reason) return;
    setSubmitting(true);
    const body: any = { reason: form.reason };
    if (form.lastWorkingDate) body.lastWorkingDate = form.lastWorkingDate;

    const res = await api.post("/hr/resignations", body, token!);
    if (res.success) {
      setShowSubmit(false);
      setForm({ reason: "", lastWorkingDate: "" });
      loadResignations();
    }
    setSubmitting(false);
  };

  const handleWithdraw = async (id: string) => {
    await api.post(`/hr/resignations/${id}/withdraw`, {}, token!);
    loadResignations();
  };

  const loadSettlement = async (id: string) => {
    const res = await api.get<SettlementData>(`/hr/resignations/${id}/settlement`, token!);
    if (res.success && res.data) {
      setSettlement(res.data);
      setShowSettlement(true);
    }
  };

  // Notice period calculator
  const calculatedLastDay = useMemo(() => {
    if (form.lastWorkingDate) return form.lastWorkingDate;
    // Default: 30 days from now
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  }, [form.lastWorkingDate]);

  const daysRemaining = useMemo(() => {
    if (!activeResignation?.lastWorkingDate) return 0;
    const lwd = new Date(activeResignation.lastWorkingDate);
    const now = new Date();
    return Math.max(0, Math.ceil((lwd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }, [activeResignation]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">📝 Resignation</h1>
          <p className="text-sm text-slate-500">Submit and track your resignation</p>
        </div>
        {!activeResignation && (
          <button
            onClick={() => setShowSubmit(true)}
            className="px-4 py-2 bg-red-600 text-slate-900 dark:text-white rounded-lg hover:bg-red-700 text-sm font-medium"
          >
            Submit Resignation
          </button>
        )}
      </div>

      {/* Active Resignation Card */}
      {activeResignation && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className={`px-3 py-1 text-xs rounded-full ${STATUS_CONFIG[activeResignation.status]?.color}`}>
                {STATUS_CONFIG[activeResignation.status]?.icon} {STATUS_CONFIG[activeResignation.status]?.label}
              </span>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mt-2">Active Resignation</h2>
              <p className="text-sm text-slate-400 mt-1">Submitted on {formatDate(activeResignation.createdAt)}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{daysRemaining}</p>
              <p className="text-xs text-slate-500">days remaining</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <p className="text-xs text-slate-500">Last Working Day</p>
              <p className="text-sm font-medium text-slate-900 dark:text-white">{formatDate(activeResignation.lastWorkingDate)}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <p className="text-xs text-slate-500">Notice Period</p>
              <p className="text-sm font-medium text-slate-900 dark:text-white">{activeResignation.noticePeriod} days</p>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs text-slate-500 mb-1">Reason</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{activeResignation.reason}</p>
          </div>

          {/* Exit Checklist */}
          {activeResignation.exitChecklist && activeResignation.exitChecklist.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs text-slate-500 font-medium mb-2">Exit Checklist</h3>
              <div className="space-y-1.5">
                {activeResignation.exitChecklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 bg-white dark:bg-slate-800/30 rounded-lg px-3 py-2">
                    <span className={`w-4 h-4 rounded text-center text-xs leading-4 ${item.isCompleted ? "bg-emerald-600 text-slate-900 dark:text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-500"}`}>
                      {item.isCompleted ? "✓" : ""}
                    </span>
                    <span className={`text-xs flex-1 ${item.isCompleted ? "text-slate-500 line-through" : "text-slate-600 dark:text-slate-300"}`}>
                      {item.title}
                    </span>
                    <span className="text-[10px] text-slate-600 uppercase">{item.category}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {activeResignation.exitChecklist.filter((i) => i.isCompleted).length} / {activeResignation.exitChecklist.length} completed
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 border-t border-slate-200 dark:border-slate-800 pt-4">
            {activeResignation.status === "SUBMITTED" && (
              <button
                onClick={() => handleWithdraw(activeResignation.id)}
                className="px-4 py-2 text-sm text-amber-600 dark:text-amber-400 border border-amber-900/50 rounded-lg hover:bg-amber-900/20"
              >
                ↩️ Withdraw Resignation
              </button>
            )}
            {activeResignation.status === "ACCEPTED" && (
              <>
                <button
                  onClick={() => handleWithdraw(activeResignation.id)}
                  className="px-4 py-2 text-sm text-amber-600 dark:text-amber-400 border border-amber-900/50 rounded-lg hover:bg-amber-900/20"
                >
                  ↩️ Withdraw
                </button>
                <button
                  onClick={() => loadSettlement(activeResignation.id)}
                  className="px-4 py-2 text-sm text-brand-600 dark:text-brand-400 border border-brand-900/50 rounded-lg hover:bg-brand-900/20"
                >
                  💰 View Settlement
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Previous Resignations */}
      <h2 className="text-sm font-medium text-slate-400 mb-3">History</h2>
      <div className="space-y-3">
        {loading ? (
          <div className="text-center text-slate-500 py-12">Loading...</div>
        ) : resignations.filter((r) => !["SUBMITTED", "ACCEPTED"].includes(r.status)).length === 0 && !activeResignation ? (
          <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">
            No resignation history
          </div>
        ) : (
          resignations
            .filter((r) => !["SUBMITTED", "ACCEPTED"].includes(r.status))
            .map((res) => (
              <div key={res.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs rounded ${STATUS_CONFIG[res.status]?.color || "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>
                        {STATUS_CONFIG[res.status]?.label || res.status}
                      </span>
                      <span className="text-xs text-slate-500">{formatDate(res.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{res.reason}</p>
                  </div>
                  <p className="text-xs text-slate-500">
                    LWD: {formatDate(res.lastWorkingDate)}
                  </p>
                </div>
              </div>
            ))
        )}
      </div>

      {/* Submit Resignation Modal */}
      {showSubmit && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Submit Resignation</h2>
            <p className="text-xs text-slate-500 mb-4">This will initiate the resignation process with your manager and HR.</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Reason *</label>
                <textarea
                  placeholder="Please share your reason for resignation..."
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm"
                  rows={4}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Preferred Last Working Day (optional)</label>
                <input
                  type="date"
                  value={form.lastWorkingDate}
                  onChange={(e) => setForm({ ...form, lastWorkingDate: e.target.value })}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  If not specified, it will be calculated based on your notice period (typically 30 days).
                  Calculated LWD: <span className="text-slate-900 dark:text-white">{formatDate(calculatedLastDay)}</span>
                </p>
              </div>

              <div className="bg-amber-900/20 border border-amber-900/30 rounded-lg p-3 text-xs text-amber-600 dark:text-amber-400">
                <p className="font-medium mb-1">⚠️ Important</p>
                <ul className="list-disc list-inside space-y-0.5 text-amber-300/80">
                  <li>Your resignation will be reviewed by HR/Management</li>
                  <li>You can withdraw before it is processed</li>
                  <li>Notice period buyout may apply if serving short notice</li>
                  <li>Final settlement will be calculated upon exit completion</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowSubmit(false)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !form.reason}
                className="px-4 py-2 bg-red-600 text-slate-900 dark:text-white rounded-lg hover:bg-red-700 text-sm disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Resignation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settlement Preview Modal */}
      {showSettlement && settlement && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-lg my-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Final Settlement Preview</h2>
            <p className="text-xs text-slate-500 mb-4">
              {settlement.employeeName} · Tenure: {settlement.tenureYears} years · LWD: {formatDate(settlement.lastWorkingDay)}
            </p>

            {/* Payable */}
            <div className="mb-4">
              <h3 className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-2">Payable Components</h3>
              <div className="space-y-1.5">
                {[
                  { label: "Pending Salary", value: settlement.components.pendingSalary },
                  { label: "Leave Encashment", value: settlement.components.leaveEncashment },
                  { label: "Gratuity", value: settlement.components.gratuity },
                  { label: "Pending Reimbursements", value: settlement.components.pendingReimbursements },
                ].filter((c) => c.value > 0).map((c) => (
                  <div key={c.label} className="flex justify-between items-center bg-emerald-900/10 rounded px-3 py-2">
                    <span className="text-xs text-slate-400">{c.label}</span>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">₹{c.value.toLocaleString("en-IN")}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center bg-emerald-900/20 rounded px-3 py-2 font-medium">
                  <span className="text-xs text-slate-600 dark:text-slate-300">Total Payable</span>
                  <span className="text-sm text-emerald-600 dark:text-emerald-400">₹{settlement.totalPayable.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            {settlement.totalDeductions > 0 && (
              <div className="mb-4">
                <h3 className="text-xs text-red-600 dark:text-red-400 font-medium mb-2">Deductions</h3>
                <div className="space-y-1.5">
                  {[
                    { label: "Advance Recovery", value: settlement.components.advanceRecovery },
                    { label: "Notice Period Recovery", value: settlement.components.noticePeriodRecovery },
                  ].filter((c) => c.value > 0).map((c) => (
                    <div key={c.label} className="flex justify-between items-center bg-red-900/10 rounded px-3 py-2">
                      <span className="text-xs text-slate-400">{c.label}</span>
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium">-₹{c.value.toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center bg-red-900/20 rounded px-3 py-2 font-medium">
                    <span className="text-xs text-slate-600 dark:text-slate-300">Total Deductions</span>
                    <span className="text-sm text-red-600 dark:text-red-400">-₹{settlement.totalDeductions.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Net */}
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">Net Settlement Amount</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">₹{settlement.netSettlement.toLocaleString("en-IN")}</p>
              <p className="text-[10px] text-slate-600 mt-1">*Estimated. Actual amount may vary based on final calculations.</p>
            </div>

            <div className="flex justify-end mt-5">
              <button onClick={() => setShowSettlement(false)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
