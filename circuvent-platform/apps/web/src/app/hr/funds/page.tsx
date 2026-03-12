"use client";

import React, { useState, useCallback } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, StatCard, Badge, Button, DataTable, Modal, Input, Select, Tabs, Textarea } from "@/components/ui";
import { api } from "@/lib/api-client";
import { formatDate, timeAgo, formatCurrency } from "@/lib/utils";

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

// ══════════════════════════════════════════════════════════════
// Constants & Color Maps
// ══════════════════════════════════════════════════════════════

const ALLOWED_ROLES = ["ADMIN", "SUPER_ADMIN", "CEO", "HR_MANAGER"];

const categoryColors: Record<string, BadgeColor> = {
  OPERATIONAL: "blue",
  CAPITAL: "purple",
  PROJECT: "cyan",
  DEPARTMENT: "green",
  EMERGENCY: "red",
  PETTY_CASH: "amber",
  TRAVEL: "orange",
  TRAINING: "pink",
  RECRUITMENT: "emerald",
  MARKETING: "slate",
  R_AND_D: "purple",
  INFRASTRUCTURE: "blue",
};

const categoryLabels: Record<string, string> = {
  OPERATIONAL: "Operational",
  CAPITAL: "Capital",
  PROJECT: "Project",
  DEPARTMENT: "Department",
  EMERGENCY: "Emergency",
  PETTY_CASH: "Petty Cash",
  TRAVEL: "Travel",
  TRAINING: "Training",
  RECRUITMENT: "Recruitment",
  MARKETING: "Marketing",
  R_AND_D: "R&D",
  INFRASTRUCTURE: "Infrastructure",
};

const categoryOptions = Object.entries(categoryLabels).map(([value, label]) => ({ value, label }));

const txTypeColors: Record<string, BadgeColor> = {
  CREDIT: "green",
  DEBIT: "red",
  TRANSFER: "blue",
  HOLD: "amber",
  RELEASE: "cyan",
  REFUND: "purple",
};

const txStatusColors: Record<string, BadgeColor> = {
  PENDING: "amber",
  COMPLETED: "green",
  FAILED: "red",
  REVERSED: "slate",
};

const fundStatusColor = (isActive: boolean): BadgeColor => isActive ? "green" : "slate";

// ══════════════════════════════════════════════════════════════
// Interfaces
// ══════════════════════════════════════════════════════════════

interface Fund {
  id: string;
  name: string;
  code: string;
  category: string;
  description?: string;
  totalBudget: number;
  allocatedAmount: number;
  spentAmount: number;
  remainingAmount: number;
  currency: string;
  fiscalYear: string;
  department?: string;
  projectId?: string;
  managerId: string;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  transactions?: FundTransaction[];
  allocations?: FundAllocation[];
  createdAt: string;
  updatedAt: string;
}

interface FundTransaction {
  id: string;
  fundId: string;
  transactionType: string;
  amount: number;
  description: string;
  referenceType?: string;
  referenceId?: string;
  purchaseRequestId?: string;
  bankAccount?: string;
  beneficiaryAccount?: string;
  beneficiaryName?: string;
  transferRef?: string;
  status: string;
  processedAt?: string;
  processedBy?: string;
  balanceBefore?: number;
  balanceAfter?: number;
  notes?: string;
  createdAt: string;
}

interface FundAllocation {
  id: string;
  fundId: string;
  allocatedTo: string;
  allocationType: string;
  amount: number;
  purpose: string;
  approvedBy: string;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CompanyBankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  accountType: string;
  balance: number;
  currency: string;
  isDefault: boolean;
  isActive: boolean;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface DashboardData {
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  utilizationPercent: number;
  overBudgetFunds: Fund[];
  categoryBreakdown: { category: string; allocated: number; spent: number; remaining: number }[];
  departmentBreakdown: { department: string; allocated: number; spent: number }[];
  monthlyTrend: { month: string; spent: number }[];
  topSpendingFunds: { name: string; code: string; spent: number; budget: number }[];
  recentTransactions: FundTransaction[];
}

// ══════════════════════════════════════════════════════════════
// Utility Helpers
// ══════════════════════════════════════════════════════════════

const utilizationColor = (pct: number): BadgeColor => {
  if (pct < 50) return "green";
  if (pct <= 80) return "amber";
  return "red";
};

const maskAccount = (acct: string) => {
  if (!acct || acct.length < 6) return acct || "—";
  return "••••" + acct.slice(-4);
};

// ══════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════

export default function FundsBudgetPage() {
  const { user, token } = useAuth();
  const userRole = user?.role || "";

  // ── Access Guard ───────────────────────────────────────────
  if (!ALLOWED_ROLES.includes(userRole)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card>
          <div className="p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10">
              <svg className="h-8 w-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728l-12.728-12.728" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Access Denied</h2>
            <p className="text-slate-400 max-w-md">
              You do not have permission to access the Funds & Budget Management module.
              This section is restricted to Admin, Super Admin, CEO, and HR Manager roles.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Current role: <Badge color="slate">{userRole || "Unknown"}</Badge>
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // ── State ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedFund, setSelectedFund] = useState<Fund | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [txFilter, setTxFilter] = useState("");

  // Modal toggles
  const [showCreateFundModal, setShowCreateFundModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showAllocationModal, setShowAllocationModal] = useState(false);
  const [showBankAccountModal, setShowBankAccountModal] = useState(false);

  // ── Data Fetching ──────────────────────────────────────────
  const { data: dashboard, loading: dashLoading, refetch: refetchDashboard } = useApi<DashboardData>("/hr/funds/dashboard");
  const { data: funds, loading: fundsLoading, refetch: refetchFunds } = useApi<Fund[]>("/hr/funds");
  const { data: bankAccounts, loading: banksLoading, refetch: refetchBanks } = useApi<CompanyBankAccount[]>("/hr/funds/company-accounts");
  const { data: selectedFundDetail, loading: detailLoading, refetch: refetchDetail } = useApi<Fund>(
    selectedFund ? `/hr/funds/${selectedFund.id}` : null
  );
  const { data: fundTransactions, loading: txLoading, refetch: refetchTx } = useApi<FundTransaction[]>(
    selectedFund ? `/hr/funds/${selectedFund.id}/transactions` : null
  );
  const { data: fundAllocations, loading: allocLoading, refetch: refetchAlloc } = useApi<FundAllocation[]>(
    selectedFund ? `/hr/funds/${selectedFund.id}/allocations` : null
  );

  // ── Refetch all ────────────────────────────────────────────
  const refetchAll = useCallback(() => {
    refetchDashboard();
    refetchFunds();
    refetchBanks();
    if (selectedFund) {
      refetchDetail();
      refetchTx();
      refetchAlloc();
    }
  }, [refetchDashboard, refetchFunds, refetchBanks, selectedFund, refetchDetail, refetchTx, refetchAlloc]);

  // ── Create Fund Form ──────────────────────────────────────
  const [fundForm, setFundForm] = useState({
    code: "",
    name: "",
    category: "OPERATIONAL",
    description: "",
    totalBudget: "",
    fiscalYear: "FY 2025-26",
    department: "",
    managerId: "",
    startDate: "",
    endDate: "",
  });

  const resetFundForm = () => {
    setFundForm({
      code: "",
      name: "",
      category: "OPERATIONAL",
      description: "",
      totalBudget: "",
      fiscalYear: "FY 2025-26",
      department: "",
      managerId: "",
      startDate: "",
      endDate: "",
    });
  };

  const handleCreateFund = async () => {
    setSubmitting(true);
    try {
      await api.post("/hr/funds", {
        ...fundForm,
        totalBudget: Number(fundForm.totalBudget) || 0,
        startDate: fundForm.startDate || undefined,
        endDate: fundForm.endDate || undefined,
      }, token || undefined);
      setShowCreateFundModal(false);
      resetFundForm();
      refetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ── Transaction Form ──────────────────────────────────────
  const [txForm, setTxForm] = useState({
    transactionType: "DEBIT",
    amount: "",
    description: "",
    referenceType: "",
    referenceId: "",
    bankAccount: "",
    beneficiaryAccount: "",
    beneficiaryName: "",
    notes: "",
  });

  const resetTxForm = () => {
    setTxForm({
      transactionType: "DEBIT",
      amount: "",
      description: "",
      referenceType: "",
      referenceId: "",
      bankAccount: "",
      beneficiaryAccount: "",
      beneficiaryName: "",
      notes: "",
    });
  };

  const handleRecordTransaction = async () => {
    if (!selectedFund) return;
    setSubmitting(true);
    try {
      await api.post(`/hr/funds/${selectedFund.id}/transactions`, {
        ...txForm,
        amount: Number(txForm.amount) || 0,
        referenceType: txForm.referenceType || undefined,
        referenceId: txForm.referenceId || undefined,
        bankAccount: txForm.bankAccount || undefined,
        beneficiaryAccount: txForm.beneficiaryAccount || undefined,
        beneficiaryName: txForm.beneficiaryName || undefined,
        notes: txForm.notes || undefined,
      }, token || undefined);
      setShowTransactionModal(false);
      resetTxForm();
      refetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ── Allocation Form ───────────────────────────────────────
  const [allocForm, setAllocForm] = useState({
    allocatedTo: "",
    allocationType: "DEPARTMENT",
    amount: "",
    purpose: "",
    approvedBy: "",
    startDate: "",
    endDate: "",
  });

  const resetAllocForm = () => {
    setAllocForm({
      allocatedTo: "",
      allocationType: "DEPARTMENT",
      amount: "",
      purpose: "",
      approvedBy: "",
      startDate: "",
      endDate: "",
    });
  };

  const handleCreateAllocation = async () => {
    if (!selectedFund) return;
    setSubmitting(true);
    try {
      await api.post(`/hr/funds/${selectedFund.id}/allocations`, {
        ...allocForm,
        amount: Number(allocForm.amount) || 0,
        startDate: allocForm.startDate || new Date().toISOString(),
        endDate: allocForm.endDate || undefined,
      }, token || undefined);
      setShowAllocationModal(false);
      resetAllocForm();
      refetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ── Bank Account Form ─────────────────────────────────────
  const [bankForm, setBankForm] = useState({
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    branchName: "",
    accountType: "CURRENT",
    balance: "",
  });

  const resetBankForm = () => {
    setBankForm({
      bankName: "",
      accountNumber: "",
      ifscCode: "",
      branchName: "",
      accountType: "CURRENT",
      balance: "",
    });
  };

  const handleCreateBankAccount = async () => {
    setSubmitting(true);
    try {
      await api.post("/hr/funds/company-accounts", {
        ...bankForm,
        balance: Number(bankForm.balance) || 0,
      }, token || undefined);
      setShowBankAccountModal(false);
      resetBankForm();
      refetchBanks();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetDefaultBank = async (accountId: string) => {
    setSubmitting(true);
    try {
      await api.patch(`/hr/funds/company-accounts/${accountId}/set-default`, {}, token || undefined);
      refetchBanks();
    } finally {
      setSubmitting(false);
    }
  };

  // ── Reports ───────────────────────────────────────────────
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");
  const [reportType, setReportType] = useState("summary");
  const [reportResult, setReportResult] = useState<any>(null);

  const handleGenerateReport = async () => {
    setSubmitting(true);
    try {
      const res = await api.post<any>("/hr/funds/generate-report", {
        dateFrom: reportDateFrom || undefined,
        dateTo: reportDateTo || undefined,
        type: reportType,
      }, token || undefined);
      if (res.success) setReportResult(res.data);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAutoReconcile = async () => {
    setSubmitting(true);
    try {
      await api.post("/hr/funds/auto-reconcile", {}, token || undefined);
      refetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ── Select fund helper ────────────────────────────────────
  const selectFund = (fund: Fund) => {
    setSelectedFund(fund);
    setActiveTab("details");
  };

  // ── Filtered transactions ─────────────────────────────────
  const filteredTransactions = (fundTransactions || []).filter((tx) => {
    if (!txFilter) return true;
    return tx.transactionType === txFilter;
  });

  // ── Dashboard utilization % ───────────────────────────────
  const dashUtil = dashboard?.utilizationPercent ?? 0;
  const dashRemaining = dashboard?.remaining ?? 0;

  // ── Tabs ───────────────────────────────────────────────────
  const tabs = [
    { id: "overview", label: "Funds Overview", count: funds?.length }, { key: "details", label: "Fund Details" }, { key: "transactions", label: "Transactions" }, { key: "allocations", label: "Allocations" }, { key: "banks", label: "Bank Accounts", count: bankAccounts?.length }, { key: "reports", label: "Reports" },
  ];

  // ══════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* ─── Page Header ──────────────────────────────────────── */}
      <PageHeader
        title="Funds & Budget Management"
        subtitle="Manage company funds, budgets, allocations, and financial transactions"
        breadcrumbs={[{ label: "HR & Payroll", href: "/hr" }, { label: "Funds & Budget" }]}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setShowCreateFundModal(true)}>+ Create Fund</Button>
          </div>
        }
      />

      {/* ─── Dashboard Stats ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Total Budget"
          value={dashboard?.totalBudget ? formatCurrency(dashboard.totalBudget) : "₹0"}
          color="blue"
        />
        <StatCard
          title="Total Spent"
          value={dashboard?.totalSpent ? formatCurrency(dashboard.totalSpent) : "₹0"}
          color="amber"
        />
        <StatCard
          title="Remaining"
          value={dashRemaining ? formatCurrency(dashRemaining) : "₹0"}
          color="green"
        />
        <StatCard
          title="Budget Utilization"
          value={`${dashUtil.toFixed(1)}%`}
          color={dashUtil > 80 ? "red" : dashUtil > 50 ? "amber" : "green"}
        />
      </div>

      {/* ─── Over-Budget Alerts ──────────────────────────────── */}
      {dashboard?.overBudgetFunds && dashboard.overBudgetFunds.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-200 dark:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold">!</span>
            <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">Over-Budget Alerts</h3>
          </div>
          <div className="space-y-2">
            {dashboard.overBudgetFunds.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20 px-4 py-2">
                <div>
                  <span className="text-sm font-mono text-red-300">{f.code}</span>
                  <span className="ml-2 text-sm text-slate-900 dark:text-white">{f.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm text-red-600 dark:text-red-400">
                    Spent {formatCurrency(f.spentAmount)} / {formatCurrency(f.totalBudget)}
                  </span>
                  <Badge color="red" className="ml-2">
                    {((f.spentAmount / f.totalBudget) * 100).toFixed(0)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ─── Category Breakdown ──────────────────────────────── */}
      {dashboard?.categoryBreakdown && dashboard.categoryBreakdown.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Category Breakdown</h3>
          <div className="space-y-3">
            {dashboard.categoryBreakdown.map((cat) => {
              const pct = cat.allocated > 0 ? (cat.spent / cat.allocated) * 100 : 0;
              return (
                <div key={cat.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Badge color={categoryColors[cat.category] || "slate"}>
                        {categoryLabels[cat.category] || cat.category}
                      </Badge>
                    </div>
                    <span className="text-slate-400">
                      {formatCurrency(cat.spent)} / {formatCurrency(cat.allocated)}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-2 rounded-full ${pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-green-500"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ─── Department Breakdown & Monthly Trend ────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {dashboard?.departmentBreakdown && dashboard.departmentBreakdown.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Department Breakdown</h3>
            <div className="space-y-2">
              {dashboard.departmentBreakdown.map((dept) => (
                <div key={dept.department} className="flex items-center justify-between rounded-lg bg-slate-100 px-4 py-2 dark:bg-slate-800/50">
                  <span className="text-sm text-slate-900 dark:text-white">{dept.department}</span>
                  <div className="text-right">
                    <span className="text-sm text-slate-400 mr-3">Allocated: {formatCurrency(dept.allocated)}</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">Spent: {formatCurrency(dept.spent)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {dashboard?.monthlyTrend && dashboard.monthlyTrend.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Monthly Spending Trend</h3>
            <div className="space-y-2">
              {dashboard.monthlyTrend.map((m) => (
                <div key={m.month} className="flex items-center justify-between rounded-lg bg-slate-100 px-4 py-2 dark:bg-slate-800/50">
                  <span className="text-sm text-slate-400">{m.month}</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(m.spent)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* ─── Top Spending Funds ──────────────────────────────── */}
      {dashboard?.topSpendingFunds && dashboard.topSpendingFunds.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Top Spending Funds</h3>
          <div className="grid gap-3 lg:grid-cols-3">
            {dashboard.topSpendingFunds.map((f) => {
              const pct = f.budget > 0 ? (f.spent / f.budget) * 100 : 0;
              return (
                <div key={f.code} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-brand-600 dark:text-brand-400">{f.code}</span>
                    <Badge color={utilizationColor(pct)}>{pct.toFixed(0)}%</Badge>
                  </div>
                  <p className="text-sm text-slate-900 dark:text-white mb-2">{f.name}</p>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-1.5 rounded-full ${pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-green-500"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-slate-500">
                    <span>Spent: {formatCurrency(f.spent)}</span>
                    <span>Budget: {formatCurrency(f.budget)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ─── Recent Transactions (Dashboard) ─────────────────── */}
      {dashboard?.recentTransactions && dashboard.recentTransactions.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Recent Transactions</h3>
          <div className="space-y-2">
            {dashboard.recentTransactions.slice(0, 8).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-4 py-2 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <Badge color={txTypeColors[tx.transactionType] || "slate"}>{tx.transactionType}</Badge>
                  <span className="text-sm text-slate-900 dark:text-white">{tx.description}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-semibold ${tx.transactionType === "CREDIT" || tx.transactionType === "REFUND" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {tx.transactionType === "CREDIT" || tx.transactionType === "REFUND" ? "+" : "−"}{formatCurrency(tx.amount)}
                  </span>
                  <span className="text-xs text-slate-500">{timeAgo(tx.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ─── Tabs ─────────────────────────────────────────────── */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Funds Overview Tab                                     */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <Card padding={false}>
          <DataTable
            columns={[{ key: "code",
                header: "Code",
                render: (f: Fund) => (
                  <button onClick={() => selectFund(f)} className="font-mono text-xs text-brand-600 dark:text-brand-600 dark:text-brand-400 hover:underline">
                    {f.code}
                  </button>
                ),
              }, { key: "name",
                header: "Name",
                render: (f: Fund) => (
                  <button onClick={() => selectFund(f)} className="text-slate-900 dark:text-white hover:text-brand-300 text-left">
                    {f.name}
                  </button>
                ),
              }, { key: "category",
                header: "Category",
                render: (f: Fund) => (
                  <Badge color={categoryColors[f.category] || "slate"}>
                    {categoryLabels[f.category] || f.category}
                  </Badge>
                ),
              }, { key: "department",
                header: "Department",
                render: (f: Fund) => <span className="text-sm text-slate-600 dark:text-slate-300">{f.department || "—"}</span>,
              }, { key: "totalBudget",
                header: "Budget",
                render: (f: Fund) => <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(f.totalBudget)}</span>,
              }, { key: "spentAmount",
                header: "Spent",
                render: (f: Fund) => <span className="text-sm text-slate-600 dark:text-slate-300">{formatCurrency(f.spentAmount)}</span>,
              }, { key: "remainingAmount",
                header: "Remaining",
                render: (f: Fund) => <span className="text-sm text-green-600 dark:text-green-400">{formatCurrency(f.remainingAmount)}</span>,
              }, { key: "utilization",
                header: "Utilization",
                render: (f: Fund) => {
                  const pct = f.totalBudget > 0 ? (f.spentAmount / f.totalBudget) * 100 : 0;
                  return (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={`h-1.5 rounded-full ${pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-green-500"}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <Badge color={utilizationColor(pct)}>{pct.toFixed(0)}%</Badge>
                    </div>
                  );
                },
              }, { key: "isActive",
                header: "Status",
                render: (f: Fund) => <Badge color={fundStatusColor(f.isActive)}>{f.isActive ? "Active" : "Inactive"}</Badge>,
              },
            ]}
            data={funds || []}
            keyExtractor={(f: Fund) => f.id}
            loading={fundsLoading}
            emptyMessage="No funds created yet. Click 'Create Fund' to get started."
          />
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Fund Details Tab                                       */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === "details" && (
        <div className="space-y-6">
          {!selectedFund ? (
            <Card>
              <div className="py-12 text-center">
                <p className="text-slate-400">No fund selected. Go to Funds Overview and click a fund to view details.</p>
                <Button variant="outline" className="mt-4" onClick={() => setActiveTab("overview")}>
                  Go to Funds Overview
                </Button>
              </Card>
            </div>
          ) : (
            <>
              {/* Fund Header */}
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-lg text-brand-600 dark:text-brand-400">{selectedFundDetail?.code || selectedFund.code}</span>
                      <Badge color={fundStatusColor(selectedFundDetail?.isActive ?? selectedFund.isActive)}>
                        {(selectedFundDetail?.isActive ?? selectedFund.isActive) ? "Active" : "Inactive"}
                      </Badge>
                      <Badge color={categoryColors[(selectedFundDetail?.category || selectedFund.category)] || "slate"}>
                        {categoryLabels[(selectedFundDetail?.category || selectedFund.category)] || selectedFund.category}
                      </Badge>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selectedFundDetail?.name || selectedFund.name}</h2>
                    {(selectedFundDetail?.description || selectedFund.description) && (
                      <p className="mt-1 text-sm text-slate-400">{selectedFundDetail?.description || selectedFund.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                      <span>Fiscal Year: {selectedFundDetail?.fiscalYear || selectedFund.fiscalYear}</span>
                      {(selectedFundDetail?.department || selectedFund.department) && (
                        <span>Department: {selectedFundDetail?.department || selectedFund.department}</span>
                      )}
                      {selectedFundDetail?.startDate && <span>Start: {formatDate(selectedFundDetail.startDate)}</span>}
                      {selectedFundDetail?.endDate && <span>End: {formatDate(selectedFundDetail.endDate)}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setShowAllocationModal(true); }}>
                      + Allocation
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setShowTransactionModal(true); }}>
                      + Transaction
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Fund Metrics */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard
                  title="Total Budget"
                  value={formatCurrency(selectedFundDetail?.totalBudget ?? selectedFund.totalBudget)}
                  color="blue"
                />
                <StatCard
                  title="Allocated"
                  value={formatCurrency(selectedFundDetail?.allocatedAmount ?? selectedFund.allocatedAmount)}
                  color="purple"
                />
                <StatCard
                  title="Spent"
                  value={formatCurrency(selectedFundDetail?.spentAmount ?? selectedFund.spentAmount)}
                  color="amber"
                />
                <StatCard
                  title="Remaining"
                  value={formatCurrency(selectedFundDetail?.remainingAmount ?? selectedFund.remainingAmount)}
                  color="green"
                />
              </div>

              {/* Fund Allocations */}
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Allocations</h3>
                  <Button size="sm" variant="ghost" onClick={() => setShowAllocationModal(true)}>+ Add Allocation</Button>
                </div>
                {(!fundAllocations || fundAllocations.length === 0) ? (
                  <p className="text-center py-6 text-slate-500 text-sm">No allocations for this fund.</p>
                ) : (
                  <div className="space-y-2">
                    {fundAllocations.map((alloc) => (
                      <div key={alloc.id} className="flex items-center justify-between rounded-lg bg-slate-100 dark:bg-slate-800/50 px-4 py-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-900 dark:text-white">{alloc.allocatedTo}</span>
                            <Badge color="cyan">{alloc.allocationType}</Badge>
                            {alloc.isActive ? (
                              <Badge color="green">Active</Badge>
                            ) : (
                              <Badge color="slate">Inactive</Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-1">{alloc.purpose}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(alloc.amount)}</p>
                          <p className="text-xs text-slate-500">
                            {formatDate(alloc.startDate)}{alloc.endDate ? ` — ${formatDate(alloc.endDate)}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Fund Recent Transactions */}
              <Card>
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Recent Transactions</h3>
                {(!fundTransactions || fundTransactions.length === 0) ? (
                  <p className="text-center py-6 text-slate-500 text-sm">No transactions recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {fundTransactions.slice(0, 10).map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-4 py-2 dark:bg-slate-800/50">
                        <div className="flex items-center gap-3">
                          <Badge color={txTypeColors[tx.transactionType] || "slate"}>{tx.transactionType}</Badge>
                          <div>
                            <span className="text-sm text-slate-900 dark:text-white">{tx.description}</span>
                            {tx.referenceType && (
                              <span className="ml-2 text-xs text-slate-500">[{tx.referenceType}]</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge color={txStatusColors[tx.status] || "slate"}>{tx.status}</Badge>
                          <span className={`text-sm font-semibold ${tx.transactionType === "CREDIT" || tx.transactionType === "REFUND" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                            {tx.transactionType === "CREDIT" || tx.transactionType === "REFUND" ? "+" : "−"}{formatCurrency(tx.amount)}
                          </span>
                          <span className="text-xs text-slate-500">{timeAgo(tx.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Spending Breakdown by Reference Type */}
              {fundTransactions && fundTransactions.length > 0 && (
                <Card>
                  <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Spending Breakdown by Reference Type</h3>
                  <div className="space-y-2">
                    {(() => {
                      const byRef: Record<string, number> = {};
                      fundTransactions
                        .filter((tx) => tx.transactionType === "DEBIT")
                        .forEach((tx) => {
                          const key = tx.referenceType || "Manual";
                          byRef[key] = (byRef[key] || 0) + tx.amount;
                        });
                      return Object.entries(byRef)
                        .sort(([, a], [, b]) => b - a)
                        .map(([refType, total]) => (
                          <div key={refType} className="flex items-center justify-between rounded-lg bg-slate-100 px-4 py-2 dark:bg-slate-800/50">
                            <span className="text-sm text-slate-600 dark:text-slate-300">{refType}</span>
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(total)}</span>
                          </div>
                        ));
                    })()}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Transactions Tab                                       */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === "transactions" && (
        <div className="space-y-4">
          {!selectedFund ? (
            <Card>
              <div className="py-12 text-center">
                <p className="text-slate-400">Select a fund from the Funds Overview tab to view transactions.</p>
                <Button variant="outline" className="mt-4" onClick={() => setActiveTab("overview")}>
                  Go to Funds Overview
                </Button>
              </div>
            </Card>
          ) : (
            <>
              {/* Filter & Actions */}
              <Card>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="w-48">
                    <Select
                      label="Filter by Type"
                      options={[
                        { value: "", label: "All Types" },
                        { value: "CREDIT", label: "Credit" },
                        { value: "DEBIT", label: "Debit" },
                        { value: "TRANSFER", label: "Transfer" },
                        { value: "HOLD", label: "Hold" },
                        { value: "RELEASE", label: "Release" },
                        { value: "REFUND", label: "Refund" },
                      ]}
                      value={txFilter}
                      onChange={(e) => setTxFilter(e.target.value)}
                    />
                  </div>
                  <Button onClick={() => setShowTransactionModal(true)}>+ Record Manual Transaction</Button>
                  {txFilter && (
                    <Button variant="ghost" size="sm" onClick={() => setTxFilter("")}>Clear Filter</Button>
                  )}
                </div>
              </Card>

              {/* Transaction Table */}
              <Card padding={false}>
                <DataTable
                  columns={[{ key: "createdAt",
                      header: "Date",
                      render: (tx: FundTransaction) => (
                        <div>
                          <span className="text-sm text-slate-900 dark:text-white">{formatDate(tx.createdAt)}</span>
                          <span className="ml-2 text-xs text-slate-500">{timeAgo(tx.createdAt)}</span>
                        </div>
                      ),
                    }, { key: "transactionType",
                      header: "Type",
                      render: (tx: FundTransaction) => (
                        <Badge color={txTypeColors[tx.transactionType] || "slate"}>{tx.transactionType}</Badge>
                      ),
                    }, { key: "amount",
                      header: "Amount",
                      render: (tx: FundTransaction) => (
                        <span className={`font-semibold ${tx.transactionType === "CREDIT" || tx.transactionType === "REFUND" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {tx.transactionType === "CREDIT" || tx.transactionType === "REFUND" ? "+" : "−"}{formatCurrency(tx.amount)}
                        </span>
                      ),
                    }, { key: "description",
                      header: "Description",
                      render: (tx: FundTransaction) => <span className="text-sm text-slate-900 dark:text-white">{tx.description}</span>,
                    }, { key: "referenceType",
                      header: "Reference",
                      render: (tx: FundTransaction) => tx.referenceType ? (
                        <div>
                          <span className="text-xs text-slate-400">{tx.referenceType}</span>
                          {tx.referenceId && <span className="ml-1 text-xs text-slate-500 font-mono">{tx.referenceId.slice(0, 8)}</span>}
                        </div>
                      ) : <span className="text-xs text-slate-600">—</span>,
                    }, { key: "bankAccount",
                      header: "Bank",
                      render: (tx: FundTransaction) => tx.bankAccount ? (
                        <span className="text-xs text-slate-400">{tx.bankAccount}</span>
                      ) : <span className="text-xs text-slate-600">—</span>,
                    }, { key: "status",
                      header: "Status",
                      render: (tx: FundTransaction) => (
                        <Badge color={txStatusColors[tx.status] || "slate"}>{tx.status}</Badge>
                      ),
                    }, { key: "balance",
                      header: "Balance",
                      render: (tx: FundTransaction) => (
                        <div className="text-xs">
                          {tx.balanceBefore != null && (
                            <span className="text-slate-500">Before: {formatCurrency(tx.balanceBefore)}</span>
                          )}
                          {tx.balanceAfter != null && (
                            <span className="ml-2 text-slate-600 dark:text-slate-300">After: {formatCurrency(tx.balanceAfter)}</span>
                          )}
                          {tx.balanceBefore == null && tx.balanceAfter == null && (
                            <span className="text-slate-600">—</span>
                          )}
                        </div>
                      ),
                    },
                  ]}
                  data={filteredTransactions}
                  keyExtractor={(tx: FundTransaction) => tx.id}
                  loading={txLoading}
                  emptyMessage="No transactions found for this fund."
                />
              </Card>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Allocations Tab                                        */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === "allocations" && (
        <div className="space-y-4">
          {!selectedFund ? (
            <Card>
              <div className="py-12 text-center">
                <p className="text-slate-400">Select a fund from the Funds Overview tab to manage allocations.</p>
                <Button variant="outline" className="mt-4" onClick={() => setActiveTab("overview")}>
                  Go to Funds Overview
                </Button>
              </div>
            </Card>
          ) : (
            <>
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Allocations for <span className="text-brand-600 dark:text-brand-400">{selectedFund.code}</span> — {selectedFund.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Total Allocated: {formatCurrency(selectedFundDetail?.allocatedAmount ?? selectedFund.allocatedAmount)} of {formatCurrency(selectedFundDetail?.totalBudget ?? selectedFund.totalBudget)}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setShowAllocationModal(true)}>+ Create Allocation</Button>
                </div>
              </Card>

              <Card padding={false}>
                <DataTable
                  columns={[{ key: "allocatedTo",
                      header: "Allocated To",
                      render: (a: FundAllocation) => (
                        <div>
                          <span className="text-sm text-slate-900 dark:text-white">{a.allocatedTo}</span>
                          <Badge color="cyan" className="ml-2">{a.allocationType}</Badge>
                        </div>
                      ),
                    }, { key: "amount",
                      header: "Amount",
                      render: (a: FundAllocation) => <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(a.amount)}</span>,
                    }, { key: "purpose",
                      header: "Purpose",
                      render: (a: FundAllocation) => <span className="text-sm text-slate-600 dark:text-slate-300">{a.purpose}</span>,
                    }, { key: "period",
                      header: "Period",
                      render: (a: FundAllocation) => (
                        <span className="text-xs text-slate-400">
                          {formatDate(a.startDate)}{a.endDate ? ` — ${formatDate(a.endDate)}` : " — Ongoing"}
                        </span>
                      ),
                    }, { key: "isActive",
                      header: "Status",
                      render: (a: FundAllocation) => (
                        <Badge color={a.isActive ? "green" : "slate"}>{a.isActive ? "Active" : "Inactive"}</Badge>
                      ),
                    }, { key: "actions",
                      header: "",
                      render: (a: FundAllocation) => a.isActive ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await api.patch(`/hr/funds/${selectedFund.id}/allocations/${a.id}/deactivate`, {}, token || undefined);
                            refetchAll();
                          }}
                        >
                          Deactivate
                        </Button>
                      ) : null,
                    },
                  ]}
                  data={fundAllocations || []}
                  keyExtractor={(a: FundAllocation) => a.id}
                  loading={allocLoading}
                  emptyMessage="No allocations for this fund."
                />
              </Card>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Bank Accounts Tab                                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === "banks" && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Company Bank Accounts</h3>
              <Button size="sm" onClick={() => setShowBankAccountModal(true)}>+ Add Bank Account</Button>
            </div>
          </Card>

          <Card padding={false}>
            <DataTable
              columns={[{ key: "bankName",
                  header: "Bank Name",
                  render: (b: CompanyBankAccount) => <span className="text-sm font-medium text-slate-900 dark:text-white">{b.bankName}</span>,
                }, { key: "accountNumber",
                  header: "Account Number",
                  render: (b: CompanyBankAccount) => <span className="font-mono text-sm text-slate-600 dark:text-slate-300">{maskAccount(b.accountNumber)}</span>,
                }, { key: "ifscCode",
                  header: "IFSC",
                  render: (b: CompanyBankAccount) => <span className="font-mono text-xs text-slate-400">{b.ifscCode}</span>,
                }, { key: "branchName",
                  header: "Branch",
                  render: (b: CompanyBankAccount) => <span className="text-sm text-slate-600 dark:text-slate-300">{b.branchName}</span>,
                }, { key: "accountType",
                  header: "Type",
                  render: (b: CompanyBankAccount) => <Badge color="blue">{b.accountType}</Badge>,
                }, { key: "balance",
                  header: "Balance",
                  render: (b: CompanyBankAccount) => <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(b.balance)}</span>,
                }, { key: "isActive",
                  header: "Status",
                  render: (b: CompanyBankAccount) => (
                    <div className="flex items-center gap-2">
                      <Badge color={b.isActive ? "green" : "slate"}>{b.isActive ? "Active" : "Inactive"}</Badge>
                      {b.isDefault && <Badge color="amber">Default</Badge>}
                    </div>
                  ),
                }, { key: "actions",
                  header: "",
                  render: (b: CompanyBankAccount) => !b.isDefault && b.isActive ? (
                    <Button size="sm" variant="ghost" onClick={() => handleSetDefaultBank(b.id)} disabled={submitting}>
                      Set Default
                    </Button>
                  ) : null,
                },
              ]}
              data={bankAccounts || []}
              keyExtractor={(b: CompanyBankAccount) => b.id}
              loading={banksLoading}
              emptyMessage="No bank accounts configured."
            />
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Reports Tab                                            */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === "reports" && (
        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Generate Financial Report</h3>
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-48">
                <Input
                  label="Date From"
                  type="date"
                  value={reportDateFrom}
                  onChange={(e) => setReportDateFrom(e.target.value)}
                />
              </div>
              <div className="w-48">
                <Input
                  label="Date To"
                  type="date"
                  value={reportDateTo}
                  onChange={(e) => setReportDateTo(e.target.value)}
                />
              </div>
              <div className="w-56">
                <Select
                  label="Report Type"
                  options={[
                    { value: "summary", label: "Summary Report" },
                    { value: "detailed", label: "Detailed Report" },
                    { value: "by_department", label: "By Department" },
                    { value: "by_category", label: "By Category" },
                  ]}
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                />
              </div>
              <Button onClick={handleGenerateReport} loading={submitting}>Generate Report</Button>
              <Button variant="outline" onClick={handleAutoReconcile} loading={submitting}>Auto Reconcile</Button>
            </div>
          </Card>

          {reportResult && (
            <Card>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Report Results</h3>
              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50 overflow-auto max-h-96">
                <pre className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                  {JSON.stringify(reportResult, null, 2)}
                </pre>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Create Fund Modal                                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Modal open={showCreateFundModal} onClose={() => setShowCreateFundModal(false)} title="Create New Fund" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Fund Code"
              placeholder="FUND-OPS-001"
              value={fundForm.code}
              onChange={(e) => setFundForm({ ...fundForm, code: e.target.value })}
            />
            <Input
              label="Fund Name"
              placeholder="Operational Fund Q1"
              value={fundForm.name}
              onChange={(e) => setFundForm({ ...fundForm, name: e.target.value })}
            />
          </div>

          <Select
            label="Category"
            options={categoryOptions}
            value={fundForm.category}
            onChange={(e) => setFundForm({ ...fundForm, category: e.target.value })}
          />

          <Textarea
            label="Description"
            placeholder="Description of the fund purpose and scope..."
            value={fundForm.description}
            onChange={(e) => setFundForm({ ...fundForm, description: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Total Budget"
              type="number"
              placeholder="500000"
              value={fundForm.totalBudget}
              onChange={(e) => setFundForm({ ...fundForm, totalBudget: e.target.value })}
            />
            <Input
              label="Fiscal Year"
              placeholder="FY 2025-26"
              value={fundForm.fiscalYear}
              onChange={(e) => setFundForm({ ...fundForm, fiscalYear: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Department"
              placeholder="Engineering"
              value={fundForm.department}
              onChange={(e) => setFundForm({ ...fundForm, department: e.target.value })}
            />
            <Input
              label="Manager ID"
              placeholder="Manager employee ID"
              value={fundForm.managerId}
              onChange={(e) => setFundForm({ ...fundForm, managerId: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start Date"
              type="date"
              value={fundForm.startDate}
              onChange={(e) => setFundForm({ ...fundForm, startDate: e.target.value })}
            />
            <Input
              label="End Date"
              type="date"
              value={fundForm.endDate}
              onChange={(e) => setFundForm({ ...fundForm, endDate: e.target.value })}
            />
          </div>

          {fundForm.totalBudget && (
            <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Budget Amount</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(Number(fundForm.totalBudget) || 0)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setShowCreateFundModal(false); resetFundForm(); }}>Cancel</Button>
            <Button
              onClick={handleCreateFund}
              loading={submitting}
              disabled={!fundForm.code || !fundForm.name || !fundForm.totalBudget || !fundForm.managerId}
            >
              Create Fund
            </Button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Record Transaction Modal                               */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Modal open={showTransactionModal} onClose={() => setShowTransactionModal(false)} title="Record Manual Transaction" size="xl">
        <div className="space-y-4">
          {selectedFund && (
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50 text-sm">
              <span className="text-slate-400">Fund: </span>
              <span className="font-mono text-brand-600 dark:text-brand-400">{selectedFund.code}</span>
              <span className="ml-2 text-slate-900 dark:text-white">{selectedFund.name}</span>
              <span className="ml-4 text-slate-400">
                Remaining: <span className="text-green-600 dark:text-green-400">{formatCurrency(selectedFund.remainingAmount)}</span>
              </span>
            </div>
          )}

          <Select
            label="Transaction Type"
            options={[
              { value: "CREDIT", label: "Credit" },
              { value: "DEBIT", label: "Debit" },
              { value: "TRANSFER", label: "Transfer" },
              { value: "HOLD", label: "Hold" },
              { value: "RELEASE", label: "Release" },
              { value: "REFUND", label: "Refund" },
            ]}
            value={txForm.transactionType}
            onChange={(e) => setTxForm({ ...txForm, transactionType: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Amount"
              type="number"
              placeholder="25000"
              value={txForm.amount}
              onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
            />
            <Input
              label="Description"
              placeholder="Payment for vendor invoice"
              value={txForm.description}
              onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Reference Type"
              options={[
                { value: "", label: "None" },
                { value: "PurchaseRequest", label: "Purchase Request" },
                { value: "ExpenseClaim", label: "Expense Claim" },
                { value: "SalaryPayment", label: "Salary Payment" },
                { value: "VendorPayment", label: "Vendor Payment" },
                { value: "Reimbursement", label: "Reimbursement" },
                { value: "Other", label: "Other" },
              ]}
              value={txForm.referenceType}
              onChange={(e) => setTxForm({ ...txForm, referenceType: e.target.value })}
            />
            <Input
              label="Reference ID"
              placeholder="Reference ID (optional)"
              value={txForm.referenceId}
              onChange={(e) => setTxForm({ ...txForm, referenceId: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Bank Account"
              options={[
                { value: "", label: "Select Bank Account" },
                ...(bankAccounts || []).map((b) => ({
                  value: b.id,
                  label: `${b.bankName} — ${maskAccount(b.accountNumber)}${b.isDefault ? " (Default)" : ""}`,
                })),
              ]}
              value={txForm.bankAccount}
              onChange={(e) => setTxForm({ ...txForm, bankAccount: e.target.value })}
            />
            <Input
              label="Beneficiary Name"
              placeholder="Recipient name"
              value={txForm.beneficiaryName}
              onChange={(e) => setTxForm({ ...txForm, beneficiaryName: e.target.value })}
            />
          </div>

          <Input
            label="Beneficiary Account"
            placeholder="Recipient bank account number"
            value={txForm.beneficiaryAccount}
            onChange={(e) => setTxForm({ ...txForm, beneficiaryAccount: e.target.value })}
          />

          <Textarea
            label="Notes"
            placeholder="Additional notes..."
            value={txForm.notes}
            onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
          />

          {txForm.amount && (
            <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Transaction Amount</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(Number(txForm.amount) || 0)}</p>
              </div>
              <Badge color={txTypeColors[txForm.transactionType] || "slate"}>{txForm.transactionType}</Badge>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setShowTransactionModal(false); resetTxForm(); }}>Cancel</Button>
            <Button
              onClick={handleRecordTransaction}
              loading={submitting}
              disabled={!txForm.amount || !txForm.description}
            >
              Record Transaction
            </Button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Create Allocation Modal                                */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Modal open={showAllocationModal} onClose={() => setShowAllocationModal(false)} title="Create Fund Allocation" size="lg">
        <div className="space-y-4">
          {selectedFund && (
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50 text-sm">
              <span className="text-slate-400">Fund: </span>
              <span className="font-mono text-brand-600 dark:text-brand-400">{selectedFund.code}</span>
              <span className="ml-2 text-slate-900 dark:text-white">{selectedFund.name}</span>
              <span className="ml-4 text-slate-400">
                Available: <span className="text-green-600 dark:text-green-400">{formatCurrency(selectedFund.remainingAmount)}</span>
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Allocated To"
              placeholder="Department, project, or employee name"
              value={allocForm.allocatedTo}
              onChange={(e) => setAllocForm({ ...allocForm, allocatedTo: e.target.value })}
            />
            <Select
              label="Allocation Type"
              options={[
                { value: "DEPARTMENT", label: "Department" },
                { value: "PROJECT", label: "Project" },
                { value: "EMPLOYEE", label: "Employee" },
                { value: "VENDOR", label: "Vendor" },
              ]}
              value={allocForm.allocationType}
              onChange={(e) => setAllocForm({ ...allocForm, allocationType: e.target.value })}
            />
          </div>

          <Input
            label="Amount"
            type="number"
            placeholder="100000"
            value={allocForm.amount}
            onChange={(e) => setAllocForm({ ...allocForm, amount: e.target.value })}
          />

          <Textarea
            label="Purpose"
            placeholder="Purpose of this fund allocation..."
            value={allocForm.purpose}
            onChange={(e) => setAllocForm({ ...allocForm, purpose: e.target.value })}
          />

          <Input
            label="Approved By"
            placeholder="Approver employee ID"
            value={allocForm.approvedBy}
            onChange={(e) => setAllocForm({ ...allocForm, approvedBy: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start Date"
              type="date"
              value={allocForm.startDate}
              onChange={(e) => setAllocForm({ ...allocForm, startDate: e.target.value })}
            />
            <Input
              label="End Date"
              type="date"
              value={allocForm.endDate}
              onChange={(e) => setAllocForm({ ...allocForm, endDate: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setShowAllocationModal(false); resetAllocForm(); }}>Cancel</Button>
            <Button
              onClick={handleCreateAllocation}
              loading={submitting}
              disabled={!allocForm.allocatedTo || !allocForm.amount || !allocForm.purpose || !allocForm.approvedBy}
            >
              Create Allocation
            </Button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Add Bank Account Modal                                 */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Modal open={showBankAccountModal} onClose={() => setShowBankAccountModal(false)} title="Add Bank Account" size="lg">
        <div className="space-y-4">
          <Input
            label="Bank Name"
            placeholder="HDFC Bank"
            value={bankForm.bankName}
            onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Account Number"
              placeholder="50100XXXXXXXXX"
              value={bankForm.accountNumber}
              onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
            />
            <Input
              label="IFSC Code"
              placeholder="HDFC0001234"
              value={bankForm.ifscCode}
              onChange={(e) => setBankForm({ ...bankForm, ifscCode: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Branch Name"
              placeholder="Hyderabad Main Branch"
              value={bankForm.branchName}
              onChange={(e) => setBankForm({ ...bankForm, branchName: e.target.value })}
            />
            <Select
              label="Account Type"
              options={[
                { value: "CURRENT", label: "Current" },
                { value: "SAVINGS", label: "Savings" },
              ]}
              value={bankForm.accountType}
              onChange={(e) => setBankForm({ ...bankForm, accountType: e.target.value })}
            />
          </div>

          <Input
            label="Opening Balance"
            type="number"
            placeholder="0"
            value={bankForm.balance}
            onChange={(e) => setBankForm({ ...bankForm, balance: e.target.value })}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setShowBankAccountModal(false); resetBankForm(); }}>Cancel</Button>
            <Button
              onClick={handleCreateBankAccount}
              loading={submitting}
              disabled={!bankForm.bankName || !bankForm.accountNumber || !bankForm.ifscCode || !bankForm.branchName}
            >
              Add Account
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
