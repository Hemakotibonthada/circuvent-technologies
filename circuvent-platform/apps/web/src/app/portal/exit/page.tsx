"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface ExitWorkflow {
  id: string;
  employeeId: string;
  employeeName: string;
  exitType: string;
  reason: string;
  status: string;
  lastWorkingDay: string;
  noticePeriodDays: number;
  noticePeriodBuyout: boolean;
  buyoutAmount?: number;
  feedbackCollected: boolean;
  knowledgeTransferComplete: boolean;
  assetsReturned: boolean;
  accessRevoked: boolean;
  settlementProcessed: boolean;
  initiatedAt: string;
}

interface ExitChecklistItem {
  id: string;
  title: string;
  category: "IT" | "HR" | "FINANCE" | "ADMIN" | "TEAM";
  priority: string;
  isCompleted: boolean;
  completedAt?: string;
  completedBy?: string;
}

interface AssetReturn {
  assetId: string;
  assetName: string;
  category: string;
  requestId: string;
  status?: string;
}

interface Settlement {
  employeeName: string;
  employeeCode: string;
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
    pfEmployerContribution: number;
  };
  totalPayable: number;
  totalDeductions: number;
  netSettlement: number;
}

interface KTAssignment {
  successorName: string;
  tasksTransferred: number;
  sessions: Array<{ topic: string; daysFromNow: number }>;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  INITIATED: { color: "bg-blue-900/50 text-blue-600 dark:text-blue-400", label: "Initiated", icon: "🚀" },
  IN_PROGRESS: { color: "bg-amber-900/50 text-amber-600 dark:text-amber-400", label: "In Progress", icon: "⏳" },
  CHECKLIST_PENDING: { color: "bg-orange-900/50 text-orange-600 dark:text-orange-400", label: "Checklist Pending", icon: "📋" },
  SETTLEMENT_PENDING: { color: "bg-purple-900/50 text-purple-600 dark:text-purple-400", label: "Settlement Pending", icon: "💰" },
  COMPLETED: { color: "bg-emerald-900/50 text-emerald-600 dark:text-emerald-400", label: "Completed", icon: "✅" },
  CANCELLED: { color: "bg-slate-100 dark:bg-slate-700 text-slate-400", label: "Cancelled", icon: "❌" },
};

const CATEGORY_COLORS: Record<string, string> = {
  IT: "text-cyan-600 dark:text-cyan-400 bg-cyan-900/30",
  HR: "text-pink-600 dark:text-pink-400 bg-pink-900/30",
  FINANCE: "text-green-600 dark:text-green-400 bg-green-900/30",
  ADMIN: "text-amber-600 dark:text-amber-400 bg-amber-900/30",
  TEAM: "text-purple-600 dark:text-purple-400 bg-purple-900/30",
};

// ══════════════════════════════════════════════════════════════
// Page Component
// ══════════════════════════════════════════════════════════════

export default function ExitManagementPage() {
  const { token, user } = useAuth();
  const [workflow, setWorkflow] = useState<ExitWorkflow | null>(null);
  const [checklist, setChecklist] = useState<ExitChecklistItem[]>([]);
  const [assets, setAssets] = useState<AssetReturn[]>([]);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [ktAssignment, setKTAssignment] = useState<KTAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"checklist" | "assets" | "settlement" | "kt" | "interview">("checklist");
  const [showSettlement, setShowSettlement] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [feedback, setFeedback] = useState({
    overallExperience: 3,
    managementRating: 3,
    workLifeBalance: 3,
    growthOpportunities: 3,
    compensationSatisfaction: 3,
    reasonForLeaving: "",
    wouldRecommend: true,
    suggestions: "",
    bestAspect: "",
    worstAspect: "",
  });

  useEffect(() => {
    if (token) loadExitData();
  }, [token]);

  const loadExitData = async () => {
    setLoading(true);
    try {
      const [wfRes, clRes, assetRes] = await Promise.all([
        api.get<ExitWorkflow>("/hr/exit/my-workflow", token!),
        api.get<ExitChecklistItem[]>("/hr/exit/my-checklist", token!),
        api.get<AssetReturn[]>("/hr/exit/my-assets", token!),
      ]);
      if (wfRes.success && wfRes.data) setWorkflow(wfRes.data);
      if (clRes.success && clRes.data) setChecklist(clRes.data);
      if (assetRes.success && assetRes.data) setAssets(assetRes.data);
    } catch {
      // Silently handle — employee may not have exit workflow
    }
    setLoading(false);
  };

  const loadSettlement = async () => {
    const res = await api.get<Settlement>("/hr/exit/my-settlement", token!);
    if (res.success && res.data) {
      setSettlement(res.data);
      setShowSettlement(true);
    }
  };

  const handleCompleteItem = async (itemId: string) => {
    setSubmitting(true);
    const res = await api.post(`/hr/exit/checklist/${itemId}/complete`, {}, token!);
    if (res.success) {
      setChecklist((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, isCompleted: true, completedAt: new Date().toISOString() } : i))
      );
    }
    setSubmitting(false);
  };

  const handleSubmitFeedback = async () => {
    setSubmitting(true);
    const res = await api.post("/hr/exit/feedback", feedback, token!);
    if (res.success) {
      setShowFeedback(false);
      if (workflow) setWorkflow({ ...workflow, feedbackCollected: true });
    }
    setSubmitting(false);
  };

  // ── Computed values ──
  const completedCount = useMemo(() => checklist.filter((i) => i.isCompleted).length, [checklist]);
  const totalCount = checklist.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const daysRemaining = useMemo(() => {
    if (!workflow?.lastWorkingDay) return 0;
    const lwd = new Date(workflow.lastWorkingDay);
    return Math.max(0, Math.ceil((lwd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  }, [workflow]);

  const groupedChecklist = useMemo(() => {
    const groups: Record<string, ExitChecklistItem[]> = {};
    for (const item of checklist) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [checklist]);

  const tabs = [
    { id: "checklist", label: "Exit Checklist", icon: "📋" }, { id: "assets", label: "Asset Return", icon: "💻" }, { id: "settlement", label: "Settlement", icon: "💰" }, { id: "kt", label: "Knowledge Transfer", icon: "📚" }, { id: "interview", label: "Exit Interview", icon: "🎤" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 flex items-center justify-center">
        <div className="text-slate-400">Loading exit management data...</div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
        <Link href="/portal" className="text-sm text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Back to Portal</Link>
        <div className="mt-8 text-center bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl p-12">
          <p className="text-4xl mb-4">🏢</p>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No Active Exit Process</h2>
          <p className="text-sm text-slate-400">You don&apos;t have an active exit workflow. If you&apos;ve submitted a resignation, this page will be updated once your exit is initiated.</p>
          <Link href="/portal/resignation" className="inline-block mt-4 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-700">
            Go to Resignation Page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">🚪 Exit Management</h1>
          <p className="text-sm text-slate-500">Manage your exit process and checklist</p>
        </div>
        <div className="text-right">
          <span className={`px-3 py-1 text-xs rounded-full ${STATUS_CONFIG[workflow.status]?.color || "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>
            {STATUS_CONFIG[workflow.status]?.icon} {STATUS_CONFIG[workflow.status]?.label || workflow.status}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{daysRemaining}</p>
          <p className="text-xs text-slate-500 mt-1">Days Remaining</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-cyan-600 dark:text-cyan-400">{progressPercent}%</p>
          <p className="text-xs text-slate-500 mt-1">Checklist Progress</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{workflow.noticePeriodDays}</p>
          <p className="text-xs text-slate-500 mt-1">Notice Period (days)</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-600 dark:text-green-400">{completedCount}/{totalCount}</p>
          <p className="text-xs text-slate-500 mt-1">Items Completed</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
          <p className="text-sm font-medium text-slate-900 dark:text-white">{formatDate(workflow.lastWorkingDay)}</p>
          <p className="text-xs text-slate-500 mt-1">Last Working Day</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-900 dark:text-white">Exit Progress</span>
          <span className="text-sm text-slate-400">{progressPercent}%</span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-slate-600">
          {["Initiated", "Checklist", "Assets", "KT", "Settlement", "Complete"].map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl p-1 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                : "text-slate-500 hover:text-slate-600 dark:text-slate-300"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Checklist Tab */}
      {activeTab === "checklist" && (
        <div className="space-y-4">
          {Object.entries(groupedChecklist).map(([category, items]) => (
            <div key={category} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-[10px] rounded uppercase font-medium ${CATEGORY_COLORS[category] || "text-slate-400 bg-slate-100 dark:bg-slate-800"}`}>
                    {category}
                  </span>
                  <span className="text-xs text-slate-500">
                    {items.filter((i) => i.isCompleted).length}/{items.length} completed
                  </span>
                </div>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800/50">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => !item.isCompleted && handleCompleteItem(item.id)}
                      disabled={item.isCompleted || submitting}
                      className={`w-5 h-5 rounded flex items-center justify-center text-xs shrink-0 ${
                        item.isCompleted
                          ? "bg-emerald-600 text-slate-900 dark:text-white"
                          : "bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-emerald-500 cursor-pointer"
                      }`}
                    >
                      {item.isCompleted ? "✓" : ""}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${item.isCompleted ? "text-slate-500 line-through" : "text-slate-200"}`}>
                        {item.title}
                      </p>
                      {item.completedAt && (
                        <p className="text-[10px] text-slate-600">Completed {formatDate(item.completedAt)}</p>
                      )}
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      item.priority === "HIGH" ? "text-red-600 dark:text-red-400 bg-red-900/20" :
                      item.priority === "MEDIUM" ? "text-amber-600 dark:text-amber-400 bg-amber-900/20" :
                      "text-slate-400 bg-slate-100 dark:bg-slate-800"
                    }`}>
                      {item.priority}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assets Tab */}
      {activeTab === "assets" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Asset Return Status</h3>
            <p className="text-xs text-slate-500 mt-0.5">{assets.length} assets assigned — return required before exit</p>
          </div>
          {assets.length > 0 ? (
            <div className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {assets.map((asset) => (
                <div key={asset.assetId} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-cyan-900/30 flex items-center justify-center text-sm">
                      {asset.category === "LAPTOP" ? "💻" : asset.category === "MONITOR" ? "🖥️" : "📦"}
                    </span>
                    <div>
                      <p className="text-sm text-slate-900 dark:text-white">{asset.assetName}</p>
                      <p className="text-xs text-slate-500">{asset.category}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded ${
                    asset.status === "RETURNED" ? "bg-emerald-900/50 text-emerald-600 dark:text-emerald-400" : "bg-amber-900/50 text-amber-600 dark:text-amber-400"
                  }`}>
                    {asset.status || "PENDING"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-sm">No assets assigned to you</div>
          )}
        </div>
      )}

      {/* Settlement Tab */}
      {activeTab === "settlement" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          {settlement ? (
            <>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Final Settlement Preview</h3>
              <p className="text-xs text-slate-500 mb-4">
                {settlement.employeeName} · {settlement.employeeCode} · Tenure: {settlement.tenureYears} years
              </p>

              {/* Payable */}
              <div className="mb-6">
                <h4 className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-2">Payable Components</h4>
                <div className="space-y-1.5">
                  {[
                    { label: "Pending Salary", value: settlement.components.pendingSalary },
                    { label: "Leave Encashment", value: settlement.components.leaveEncashment },
                    { label: "Gratuity", value: settlement.components.gratuity },
                    { label: "Pro-rata Bonus", value: settlement.components.bonus },
                    { label: "Pending Reimbursements", value: settlement.components.pendingReimbursements },
                    { label: "PF Employer Contribution", value: settlement.components.pfEmployerContribution },
                  ].filter((c) => c.value > 0).map((c) => (
                    <div key={c.label} className="flex justify-between items-center bg-emerald-900/10 rounded px-3 py-2">
                      <span className="text-xs text-slate-400">{c.label}</span>
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{formatCurrency(c.value)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center bg-emerald-900/20 rounded px-3 py-2 font-medium">
                    <span className="text-xs text-slate-600 dark:text-slate-300">Total Payable</span>
                    <span className="text-sm text-emerald-600 dark:text-emerald-400">{formatCurrency(settlement.totalPayable)}</span>
                  </div>
                </div>
              </div>

              {/* Deductions */}
              {settlement.totalDeductions > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs text-red-600 dark:text-red-400 font-medium mb-2">Deductions</h4>
                  <div className="space-y-1.5">
                    {[
                      { label: "Professional Tax", value: settlement.components.deductions },
                      { label: "Advance Recovery", value: settlement.components.advanceRecovery },
                      { label: "Notice Period Recovery", value: settlement.components.noticePeriodRecovery },
                    ].filter((c) => c.value > 0).map((c) => (
                      <div key={c.label} className="flex justify-between items-center bg-red-900/10 rounded px-3 py-2">
                        <span className="text-xs text-slate-400">{c.label}</span>
                        <span className="text-xs text-red-600 dark:text-red-400 font-medium">-{formatCurrency(c.value)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center bg-red-900/20 rounded px-3 py-2 font-medium">
                      <span className="text-xs text-slate-600 dark:text-slate-300">Total Deductions</span>
                      <span className="text-sm text-red-600 dark:text-red-400">-{formatCurrency(settlement.totalDeductions)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Net */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">Net Settlement Amount</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(settlement.netSettlement)}</p>
                <p className="text-[10px] text-slate-600 mt-1">*Estimated. Actual may vary.</p>
              </div>
            </>
          ) : (
            <div className="text-center">
              <p className="text-slate-400 mb-4">Settlement preview not yet available.</p>
              <button onClick={loadSettlement} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">
                Load Settlement Preview
              </button>
            </div>
          )}
        </div>
      )}

      {/* Knowledge Transfer Tab */}
      {activeTab === "kt" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Knowledge Transfer</h3>
          {ktAssignment ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Successor</p>
                  <p className="text-sm text-slate-900 dark:text-white font-medium">{ktAssignment.successorName}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Tasks Transferred</p>
                  <p className="text-sm text-slate-900 dark:text-white font-medium">{ktAssignment.tasksTransferred}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-2">Scheduled Sessions</p>
                <div className="space-y-2">
                  {ktAssignment.sessions.map((session, i) => {
                    const sessionDate = new Date();
                    sessionDate.setDate(sessionDate.getDate() + session.daysFromNow);
                    return (
                      <div key={i} className="flex items-center gap-3 bg-white dark:bg-slate-800/30 rounded-lg px-3 py-2">
                        <span className="w-6 h-6 rounded bg-purple-900/50 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                        <div className="flex-1">
                          <p className="text-sm text-slate-200">{session.topic}</p>
                          <p className="text-[10px] text-slate-500">{formatDate(sessionDate.toISOString())}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 py-8">
              <p className="mb-2">No knowledge transfer assignments yet.</p>
              <p className="text-xs">KT will be scheduled once a successor is assigned by your manager.</p>
            </div>
          )}
        </div>
      )}

      {/* Exit Interview Tab */}
      {activeTab === "interview" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Exit Interview</h3>
          {workflow.feedbackCollected ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-3">✅</p>
              <p className="text-slate-900 dark:text-white font-medium">Feedback Submitted</p>
              <p className="text-xs text-slate-500 mt-1">Thank you for sharing your experience.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-4">Share your experience. This feedback is confidential and helps us improve.</p>
              <div className="space-y-4">
                {[
                  { id: "overallExperience", label: "Overall Experience" }, { id: "managementRating", label: "Management" }, { id: "workLifeBalance", label: "Work-Life Balance" }, { id: "growthOpportunities", label: "Growth Opportunities" }, { id: "compensationSatisfaction", label: "Compensation" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs text-slate-400">{label}</label>
                      <span className="text-xs text-slate-900 dark:text-white font-medium">{(feedback as any)[key]}/5</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={(feedback as any)[key]}
                      onChange={(e) => setFeedback({ ...feedback, [key]: Number(e.target.value) })}
                      className="w-full accent-brand-500"
                    />
                  </div>
                ))}

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Reason for Leaving</label>
                  <textarea
                    value={feedback.reasonForLeaving}
                    onChange={(e) => setFeedback({ ...feedback, reasonForLeaving: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
                    rows={3}
                    placeholder="What prompted you to leave?"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Best Aspect</label>
                    <input
                      value={feedback.bestAspect}
                      onChange={(e) => setFeedback({ ...feedback, bestAspect: e.target.value })}
                      className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
                      placeholder="What did you enjoy most?"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Area for Improvement</label>
                    <input
                      value={feedback.worstAspect}
                      onChange={(e) => setFeedback({ ...feedback, worstAspect: e.target.value })}
                      className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
                      placeholder="What could be better?"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Suggestions</label>
                  <textarea
                    value={feedback.suggestions}
                    onChange={(e) => setFeedback({ ...feedback, suggestions: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
                    rows={2}
                    placeholder="Any suggestions for improvement?"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-slate-400">Would you recommend Circuvent as an employer?</label>
                  <button
                    onClick={() => setFeedback({ ...feedback, wouldRecommend: !feedback.wouldRecommend })}
                    className={`px-3 py-1 text-xs rounded-full ${
                      feedback.wouldRecommend ? "bg-emerald-900/50 text-emerald-600 dark:text-emerald-400" : "bg-red-900/50 text-red-600 dark:text-red-400"
                    }`}
                  >
                    {feedback.wouldRecommend ? "Yes" : "No"}
                  </button>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSubmitFeedback}
                    disabled={submitting || !feedback.reasonForLeaving}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50"
                  >
                    {submitting ? "Submitting..." : "Submit Feedback"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Status Indicators */}
      <div className="mt-6 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <h3 className="text-xs text-slate-500 font-medium mb-3">Exit Workflow Status</h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {[
            { label: "Feedback", done: workflow.feedbackCollected },
            { label: "KT Complete", done: workflow.knowledgeTransferComplete },
            { label: "Assets Returned", done: workflow.assetsReturned },
            { label: "Access Revoked", done: workflow.accessRevoked },
            { label: "Settlement Processed", done: workflow.settlementProcessed },
          ].map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                item.done ? "bg-emerald-900/20" : "bg-slate-50 dark:bg-slate-800/50"
              }`}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                item.done ? "bg-emerald-600 text-slate-900 dark:text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-500"
              }`}>
                {item.done ? "✓" : ""}
              </span>
              <span className={`text-xs ${item.done ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
