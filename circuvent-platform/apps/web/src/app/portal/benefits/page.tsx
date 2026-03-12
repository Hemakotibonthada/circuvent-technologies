"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

interface BenefitPlan {
  id: string;
  name: string;
  category: string;
  description: string;
  provider: string;
  coverageType: string;
  employeeContribution: number;
  employerContribution: number;
  coverageAmount: number;
  features: string[];
  isActive: boolean;
}

interface Enrollment {
  id: string;
  planId: string;
  planName: string;
  planCategory: string;
  startDate: string;
  endDate?: string;
  status: string;
  employeeContribution: number;
  dependents: Dependent[];
}

interface Dependent {
  id: string;
  name: string;
  relationship: string;
  dateOfBirth: string;
  isActive: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  HEALTH: "🏥", LIFE: "🛡️", DENTAL: "🦷", VISION: "👁️",
  RETIREMENT: "🏦", WELLNESS: "🧘", EDUCATION: "📚", OTHER: "📋",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-900/50 text-emerald-400",
  PENDING: "bg-amber-900/50 text-amber-400",
  CANCELLED: "bg-red-900/50 text-red-400",
  EXPIRED: "bg-slate-100 dark:bg-slate-700 text-slate-400",
};

const RELATIONSHIPS = ["Spouse", "Child", "Parent", "Sibling", "Other"];

export default function PortalBenefitsPage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [plans, setPlans] = useState<BenefitPlan[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [tab, setTab] = useState<"enrolled" | "available">("enrolled");
  const [selectedPlan, setSelectedPlan] = useState<BenefitPlan | null>(null);
  const [showAddDependent, setShowAddDependent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dependentForm, setDependentForm] = useState({ name: "", relationship: "Spouse", dateOfBirth: "" });

  useEffect(() => { if (token) loadEmployee(); }, [token]);
  useEffect(() => { if (employee) { loadPlans(); loadEnrollments(); } }, [employee]);

  const loadEmployee = async () => {
    const res = await api.get<any[]>("/hr/employees", token!);
    if (res.success && res.data) setEmployee(res.data.find((e: any) => e.user?.email === user?.email) || res.data[0]);
  };

  const loadPlans = async () => {
    setLoading(true);
    const res = await api.get<BenefitPlan[]>("/hr/benefit-plans", token!);
    if (res.success) setPlans(res.data || []);
    setLoading(false);
  };

  const loadEnrollments = async () => {
    if (!employee) return;
    const res = await api.get<Enrollment[]>(`/hr/benefit-enrollments?employeeId=${employee.id}`, token!);
    if (res.success) setEnrollments(res.data || []);
  };

  const handleEnroll = async (planId: string) => {
    if (!employee) return;
    setSubmitting(true);
    await api.post("/hr/benefit-enrollments", {
      employeeId: employee.id,
      planId,
      startDate: new Date().toISOString(),
    }, token!);
    setSubmitting(false);
    setSelectedPlan(null);
    loadEnrollments();
  };

  const handleCancel = async (enrollmentId: string) => {
    if (!confirm("Are you sure you want to cancel this enrollment?")) return;
    setSubmitting(true);
    await api.patch(`/hr/benefit-enrollments/${enrollmentId}`, { status: "CANCELLED" }, token!);
    setSubmitting(false);
    loadEnrollments();
  };

  const handleAddDependent = async () => {
    if (!showAddDependent || !dependentForm.name || !dependentForm.dateOfBirth) return;
    setSubmitting(true);
    await api.post(`/hr/benefit-enrollments/${showAddDependent}/dependents`, dependentForm, token!);
    setShowAddDependent(null);
    setDependentForm({ name: "", relationship: "Spouse", dateOfBirth: "" });
    setSubmitting(false);
    loadEnrollments();
  };

  const enrolledPlanIds = new Set(enrollments.filter(e => e.status === "ACTIVE").map(e => e.planId));
  const availablePlans = plans.filter(p => p.isActive && !enrolledPlanIds.has(p.id));
  const monthlyContribution = enrollments
    .filter(e => e.status === "ACTIVE")
    .reduce((s, e) => s + (e.employeeContribution || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-400 hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">🛡️ My Benefits</h1>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-slate-900 dark:text-white">{enrollments.filter(e => e.status === "ACTIVE").length}</p>
          <p className="text-xs text-slate-500">Active Plans</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-blue-400">{availablePlans.length}</p>
          <p className="text-xs text-slate-500">Available Plans</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-emerald-400">₹{monthlyContribution.toLocaleString("en-IN")}</p>
          <p className="text-xs text-slate-500">Monthly Contribution</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-lg p-1">
        <button onClick={() => setTab("enrolled")} className={`flex-1 py-2 text-sm rounded-md transition-colors ${tab === "enrolled" ? "bg-brand-600 text-white" : "text-slate-400 hover:text-white"}`}>
          My Enrollments ({enrollments.filter(e => e.status === "ACTIVE").length})
        </button>
        <button onClick={() => setTab("available")} className={`flex-1 py-2 text-sm rounded-md transition-colors ${tab === "available" ? "bg-brand-600 text-white" : "text-slate-400 hover:text-white"}`}>
          Available Plans ({availablePlans.length})
        </button>
      </div>

      {/* Enrolled Tab */}
      {tab === "enrolled" && (
        <div className="space-y-3">
          {loading ? (
            <div className="text-center text-slate-500 py-12">Loading enrollments...</div>
          ) : enrollments.length === 0 ? (
            <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">
              No active enrollments. Browse available plans to get started.
            </div>
          ) : (
            enrollments.map(enrollment => (
              <div key={enrollment.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{CATEGORY_ICONS[enrollment.planCategory] || "📋"}</span>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-medium text-white">{enrollment.planName}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded ${STATUS_COLORS[enrollment.status]}`}>{enrollment.status}</span>
                      </div>
                      <p className="text-xs text-slate-500">{enrollment.planCategory}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Since {new Date(enrollment.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                      {enrollment.employeeContribution > 0 && (
                        <p className="text-xs text-slate-400 mt-1">Your contribution: ₹{enrollment.employeeContribution.toLocaleString("en-IN")}/mo</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {enrollment.status === "ACTIVE" && (
                      <>
                        <button onClick={() => setShowAddDependent(enrollment.id)} className="text-xs text-brand-400 hover:text-brand-300">+ Dependent</button>
                        <button onClick={() => handleCancel(enrollment.id)} disabled={submitting} className="text-xs text-red-400 hover:text-red-300">Cancel</button>
                      </>
                    )}
                  </div>
                </div>

                {/* Dependents */}
                {enrollment.dependents?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500 mb-2">Dependents</p>
                    <div className="space-y-1">
                      {enrollment.dependents.map(dep => (
                        <div key={dep.id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">👤</span>
                            <span className="text-slate-900 dark:text-white">{dep.name}</span>
                            <span className="text-slate-500">({dep.relationship})</span>
                          </div>
                          <span className={dep.isActive ? "text-emerald-400" : "text-slate-500"}>
                            {dep.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Available Plans Tab */}
      {tab === "available" && (
        <div className="space-y-3">
          {availablePlans.length === 0 ? (
            <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">
              You are enrolled in all available plans!
            </div>
          ) : (
            availablePlans.map(plan => (
              <div key={plan.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{CATEGORY_ICONS[plan.category] || "📋"}</span>
                    <div>
                      <h3 className="text-sm font-medium text-white">{plan.name}</h3>
                      <p className="text-xs text-slate-500 mt-1">{plan.provider} · {plan.coverageType}</p>
                      <p className="text-xs text-slate-400 mt-1">{plan.description}</p>
                      <div className="flex gap-4 mt-2 text-xs">
                        <span className="text-slate-400">Coverage: <span className="text-slate-900 dark:text-white">₹{plan.coverageAmount.toLocaleString("en-IN")}</span></span>
                        <span className="text-slate-400">Employee: <span className="text-slate-900 dark:text-white">₹{plan.employeeContribution.toLocaleString("en-IN")}/mo</span></span>
                        <span className="text-slate-400">Employer: <span className="text-emerald-400">₹{plan.employerContribution.toLocaleString("en-IN")}/mo</span></span>
                      </div>
                      {plan.features?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {plan.features.slice(0, 4).map((f, i) => (
                            <span key={i} className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-400 rounded">✓ {f}</span>
                          ))}
                          {plan.features.length > 4 && (
                            <span className="px-2 py-0.5 text-xs text-slate-500">+{plan.features.length - 4} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setSelectedPlan(plan)} className="px-3 py-1.5 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-xs whitespace-nowrap">
                    Enroll
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Confirm Enrollment Modal */}
      {selectedPlan && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Confirm Enrollment</h2>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{CATEGORY_ICONS[selectedPlan.category] || "📋"}</span>
                <div>
                  <h3 className="text-white font-medium">{selectedPlan.name}</h3>
                  <p className="text-xs text-slate-400">{selectedPlan.provider}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-slate-500 text-xs">Coverage</span><p className="text-slate-900 dark:text-white">₹{selectedPlan.coverageAmount.toLocaleString("en-IN")}</p></div>
                <div><span className="text-slate-500 text-xs">Your Cost</span><p className="text-slate-900 dark:text-white">₹{selectedPlan.employeeContribution.toLocaleString("en-IN")}/mo</p></div>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-4">By enrolling, you agree to a monthly deduction of ₹{selectedPlan.employeeContribution.toLocaleString("en-IN")} from your salary.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSelectedPlan(null)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
              <button onClick={() => handleEnroll(selectedPlan.id)} disabled={submitting}
                className="px-4 py-2 bg-emerald-600 text-slate-900 dark:text-white rounded-lg hover:bg-emerald-700 text-sm disabled:opacity-50">
                {submitting ? "Enrolling..." : "Confirm Enrollment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Dependent Modal */}
      {showAddDependent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Add Dependent</h2>
            <div className="space-y-3">
              <input placeholder="Full name *" value={dependentForm.name} onChange={e => setDependentForm({ ...dependentForm, name: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              <select value={dependentForm.relationship} onChange={e => setDependentForm({ ...dependentForm, relationship: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm">
                {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Date of Birth *</label>
                <input type="date" value={dependentForm.dateOfBirth} onChange={e => setDependentForm({ ...dependentForm, dateOfBirth: e.target.value })}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAddDependent(null)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
              <button onClick={handleAddDependent} disabled={submitting || !dependentForm.name || !dependentForm.dateOfBirth}
                className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">
                {submitting ? "Adding..." : "Add Dependent"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
