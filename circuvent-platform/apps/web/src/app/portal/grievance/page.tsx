"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

interface Grievance {
  id: string;
  grievanceCode: string;
  category: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  isAnonymous: boolean;
  filedDate: string;
  resolvedDate?: string;
  assignedTo?: string;
  resolution?: string;
  updates: GrievanceUpdate[];
}

interface GrievanceUpdate {
  date: string;
  action: string;
  actor: string;
  notes?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
  MEDIUM: "bg-amber-900/50 text-amber-600 dark:text-amber-400",
  HIGH: "bg-orange-900/50 text-orange-600 dark:text-orange-400",
  CRITICAL: "bg-red-900/50 text-red-600 dark:text-red-400",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-900/50 text-blue-600 dark:text-blue-400",
  INVESTIGATING: "bg-amber-900/50 text-amber-600 dark:text-amber-400",
  ESCALATED: "bg-orange-900/50 text-orange-600 dark:text-orange-400",
  RESOLVED: "bg-emerald-900/50 text-emerald-600 dark:text-emerald-400",
  CLOSED: "bg-slate-100 dark:bg-slate-700 text-slate-400",
  WITHDRAWN: "bg-slate-100 dark:bg-slate-700 text-slate-400",
};

const CATEGORIES = [
  "Workplace Harassment", "Discrimination", "Unfair Treatment", "Salary Dispute",
  "Work Conditions", "Policy Violation", "Management Issues", "Safety Concern",
  "Benefits Issue", "Other",
];

export default function PortalGrievancePage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    category: "Other",
    subject: "",
    description: "",
    priority: "MEDIUM",
    isAnonymous: false,
  });

  useEffect(() => { if (token) loadEmployee(); }, [token]);
  useEffect(() => { if (employee) loadGrievances(); }, [employee]);

  const loadEmployee = async () => {
    const res = await api.get<any[]>("/hr/employees", token!);
    if (res.success && res.data) setEmployee(res.data.find((e: any) => e.user?.email === user?.email) || res.data[0]);
  };

  const loadGrievances = async () => {
    if (!employee) return;
    setLoading(true);
    const res = await api.get<Grievance[]>(`/hr/grievances?employeeId=${employee.id}`, token!);
    if (res.success) setGrievances(res.data || []);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!employee || !form.subject || !form.description) return;
    setSubmitting(true);
    await api.post("/hr/grievances", {
      employeeId: employee.id,
      category: form.category,
      subject: form.subject,
      description: form.description,
      priority: form.priority,
      isAnonymous: form.isAnonymous,
    }, token!);
    setShowCreate(false);
    resetForm();
    setSubmitting(false);
    loadGrievances();
  };

  const handleWithdraw = async (grievanceId: string) => {
    if (!confirm("Are you sure you want to withdraw this grievance?")) return;
    setSubmitting(true);
    await api.patch(`/hr/grievances/${grievanceId}`, { status: "WITHDRAWN" }, token!);
    setSubmitting(false);
    setSelectedGrievance(null);
    loadGrievances();
  };

  const resetForm = () => {
    setForm({ category: "Other", subject: "", description: "", priority: "MEDIUM", isAnonymous: false });
  };

  const openCount = grievances.filter(g => ["OPEN", "INVESTIGATING", "ESCALATED"].includes(g.status)).length;
  const resolvedCount = grievances.filter(g => g.status === "RESOLVED" || g.status === "CLOSED").length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">📋 My Grievances</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm">+ File Grievance</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-slate-900 dark:text-white">{grievances.length}</p>
          <p className="text-xs text-slate-500">Total Filed</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{openCount}</p>
          <p className="text-xs text-slate-500">Open / In Progress</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{resolvedCount}</p>
          <p className="text-xs text-slate-500">Resolved</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3 mb-4 text-xs text-slate-400">
        💡 All grievances are handled with strict confidentiality. You can file anonymously if preferred. Typical resolution time: 5–7 business days.
      </div>

      {/* Grievance List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center text-slate-500 py-12">Loading grievances...</div>
        ) : grievances.length === 0 ? (
          <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">
            No grievances filed. We hope everything is going well!
          </div>
        ) : (
          grievances.map(grv => (
            <div key={grv.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 cursor-pointer hover:border-slate-700 transition-colors" onClick={() => setSelectedGrievance(grv)}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs text-slate-500 font-mono">{grv.grievanceCode}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${STATUS_COLORS[grv.status]}`}>{grv.status}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${PRIORITY_COLORS[grv.priority]}`}>{grv.priority}</span>
                    {grv.isAnonymous && <span className="px-2 py-0.5 text-xs bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded">Anonymous</span>}
                  </div>
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white">{grv.subject}</h3>
                  <p className="text-xs text-slate-500 mt-1">{grv.category}</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Filed on {new Date(grv.filedDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                {grv.status === "RESOLVED" && grv.resolvedDate && (
                  <div className="text-right">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">Resolved</p>
                    <p className="text-xs text-slate-500">{new Date(grv.resolvedDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* View Grievance Detail */}
      {selectedGrievance && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-slate-500 font-mono">{selectedGrievance.grievanceCode}</span>
                  <span className={`px-2 py-0.5 text-xs rounded ${STATUS_COLORS[selectedGrievance.status]}`}>{selectedGrievance.status}</span>
                  <span className={`px-2 py-0.5 text-xs rounded ${PRIORITY_COLORS[selectedGrievance.priority]}`}>{selectedGrievance.priority}</span>
                </div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{selectedGrievance.subject}</h2>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-slate-500 text-xs">Category</p><p className="text-slate-900 dark:text-white">{selectedGrievance.category}</p></div>
                <div><p className="text-slate-500 text-xs">Filed Date</p><p className="text-slate-900 dark:text-white">{new Date(selectedGrievance.filedDate).toLocaleDateString("en-IN")}</p></div>
                {selectedGrievance.assignedTo && (
                  <div><p className="text-slate-500 text-xs">Assigned To</p><p className="text-slate-900 dark:text-white">{selectedGrievance.assignedTo}</p></div>
                )}
                {selectedGrievance.isAnonymous && (
                  <div><p className="text-slate-500 text-xs">Filing Type</p><p className="text-purple-600 dark:text-purple-400">Anonymous</p></div>
                )}
              </div>

              <div>
                <p className="text-slate-500 text-xs mb-1">Description</p>
                <p className="text-slate-900 dark:text-white text-sm bg-slate-100 dark:bg-slate-800 rounded-lg p-3">{selectedGrievance.description}</p>
              </div>

              {selectedGrievance.resolution && (
                <div>
                  <p className="text-slate-500 text-xs mb-1">Resolution</p>
                  <p className="text-emerald-600 dark:text-emerald-400 text-sm bg-slate-100 dark:bg-slate-800 rounded-lg p-3">{selectedGrievance.resolution}</p>
                </div>
              )}

              {/* Updates Timeline */}
              {selectedGrievance.updates?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-2 mt-2 uppercase tracking-wider">Updates</p>
                  <div className="border-l-2 border-slate-200 dark:border-slate-700 ml-2 space-y-3">
                    {selectedGrievance.updates.map((update, i) => (
                      <div key={i} className="ml-4 relative">
                        <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-brand-500 border-2 border-slate-900" />
                        <p className="text-xs text-slate-500">{new Date(update.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                        <p className="text-sm text-slate-900 dark:text-white">{update.action}</p>
                        <p className="text-xs text-slate-400">by {update.actor}</p>
                        {update.notes && <p className="text-xs text-slate-500 italic mt-0.5">{update.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between mt-5">
              <div>
                {["OPEN", "INVESTIGATING"].includes(selectedGrievance.status) && (
                  <button onClick={() => handleWithdraw(selectedGrievance.id)} disabled={submitting}
                    className="px-4 py-2 text-red-600 dark:text-red-400 hover:text-red-300 text-sm disabled:opacity-50">
                    Withdraw Grievance
                  </button>
                )}
              </div>
              <button onClick={() => setSelectedGrievance(null)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* File New Grievance Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">File New Grievance</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Category *</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <input placeholder="Subject *" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />

              <div>
                <label className="text-xs text-slate-500 mb-1 block">Detailed Description *</label>
                <textarea placeholder="Please describe the issue in detail..." value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" rows={5} />
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1 block">Priority</label>
                <div className="flex gap-2">
                  {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map(p => (
                    <button key={p} onClick={() => setForm({ ...form, priority: p })}
                      className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                        form.priority === p
                          ? `${PRIORITY_COLORS[p]} border-transparent`
                          : "border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Anonymous Toggle */}
              <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <div>
                  <p className="text-sm text-slate-900 dark:text-white">File Anonymously</p>
                  <p className="text-xs text-slate-500 mt-0.5">Your identity will not be disclosed to the assigned committee.</p>
                </div>
                <button
                  onClick={() => setForm({ ...form, isAnonymous: !form.isAnonymous })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${form.isAnonymous ? "bg-brand-600" : "bg-slate-100 dark:bg-slate-700"}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${form.isAnonymous ? "left-6" : "left-0.5"}`} />
                </button>
              </div>

              {form.isAnonymous && (
                <div className="bg-purple-900/20 border border-purple-800/50 rounded-lg p-3 text-xs text-purple-300">
                  🔒 Anonymous filing ensures your name and employee ID will not be visible to the grievance committee.
                  Only the HR Head will have access if escalation is required.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
              <button onClick={handleCreate} disabled={submitting || !form.subject || !form.description}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">
                {submitting ? "Filing..." : form.isAnonymous ? "File Anonymously" : "File Grievance"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
