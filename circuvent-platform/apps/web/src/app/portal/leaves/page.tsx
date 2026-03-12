"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function PortalLeavePage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [showApply, setShowApply] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ leaveType: "CASUAL", startDate: "", endDate: "", reason: "" });

  useEffect(() => { if (token) loadEmployee(); }, [token]);
  useEffect(() => { if (employee) loadLeaves(); }, [employee]);

  const loadEmployee = async () => {
    const res = await api.get<any[]>("/hr/employees", token!);
    if (res.success && res.data) setEmployee(res.data.find((e: any) => e.user?.email === user?.email) || res.data[0]);
  };

  const loadLeaves = async () => {
    if (!employee) return;
    setLoading(true);
    const res = await api.get<any[]>(`/hr/leave?employeeId=${employee.id}`, token!);
    if (res.success) setLeaves(res.data || []);
    setLoading(false);
  };

  const handleApply = async () => {
    if (!employee || !form.startDate || !form.endDate || !form.reason) return;
    setSubmitting(true);
    await api.post("/hr/leave", { employeeId: employee.id, ...form }, token!);
    setShowApply(false);
    setForm({ leaveType: "CASUAL", startDate: "", endDate: "", reason: "" });
    setSubmitting(false);
    loadLeaves();
  };

  const statusColors: Record<string, string> = {
    PENDING: "bg-amber-900/50 text-amber-400", APPROVED: "bg-emerald-900/50 text-emerald-400",
    REJECTED: "bg-red-900/50 text-red-400", CANCELLED: "bg-slate-100 dark:bg-slate-700 text-slate-400",
  };
  const typeColors: Record<string, string> = {
    CASUAL: "text-blue-400", SICK: "text-red-400", EARNED: "text-emerald-400",
    MATERNITY: "text-pink-400", PATERNITY: "text-cyan-400", UNPAID: "text-slate-400",
    COMPENSATORY: "text-purple-400",
  };

  const stats = {
    total: leaves.length,
    pending: leaves.filter(l => l.status === "PENDING").length,
    approved: leaves.filter(l => l.status === "APPROVED").length,
    rejected: leaves.filter(l => l.status === "REJECTED").length,
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-400 hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">🏖️ My Leaves</h1>
        </div>
        <button onClick={() => setShowApply(true)} className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm">+ Apply Leave</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total", value: stats.total, color: "slate" },
          { label: "Pending", value: stats.pending, color: "amber" },
          { label: "Approved", value: stats.approved, color: "emerald" },
          { label: "Rejected", value: stats.rejected, color: "red" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
            <p className={`text-xl font-bold text-${s.color}-400`}>{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Leave Records */}
      <div className="space-y-3">
        {loading ? <div className="text-center text-slate-500 py-12">Loading...</div> :
          leaves.length === 0 ? <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No leave records</div> :
          leaves.map(leave => (
            <div key={leave.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-medium ${typeColors[leave.leaveType] || "text-slate-400"}`}>{leave.leaveType}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${statusColors[leave.status]}`}>{leave.status}</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {new Date(leave.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — {new Date(leave.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{leave.reason}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{leave.totalDays || "—"}</p>
                  <p className="text-xs text-slate-500">days</p>
                </div>
              </div>
            </div>
          ))
        }
      </div>

      {/* Apply Leave Modal */}
      {showApply && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Apply for Leave</h2>
            <div className="space-y-3">
              <select value={form.leaveType} onChange={e => setForm({ ...form, leaveType: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                <option value="CASUAL">Casual Leave</option><option value="SICK">Sick Leave</option>
                <option value="EARNED">Earned Leave</option><option value="UNPAID">Unpaid Leave</option>
                <option value="COMPENSATORY">Compensatory Off</option>
              </select>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">From</label>
                  <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">To</label>
                  <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm" />
                </div>
              </div>
              <textarea placeholder="Reason *" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" rows={3} />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowApply(false)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
              <button onClick={handleApply} disabled={submitting || !form.startDate || !form.endDate || !form.reason}
                className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">{submitting ? "Submitting..." : "Submit"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
