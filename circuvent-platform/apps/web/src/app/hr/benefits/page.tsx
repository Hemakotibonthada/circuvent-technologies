"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, CardHeader, StatCard, Badge, Button,
  DataTable, Modal, Input, Select, Textarea, Tabs, EmptyState,
} from "@/components/ui";
import { formatDate, formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api-client";

/* ── colour maps ────────────────────────────────────────── */

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

const planTypeColors: Record<string, BadgeColor> = {
  HEALTH: "green",
  DENTAL: "cyan",
  VISION: "blue",
  LIFE: "purple",
  RETIREMENT: "amber",
  DISABILITY: "orange",
  WELLNESS: "pink",
  EDUCATION: "emerald",
  OTHER: "slate",
};

const enrollmentStatusColors: Record<string, BadgeColor> = {
  ACTIVE: "green",
  PENDING: "amber",
  CANCELLED: "red",
  EXPIRED: "slate",
  LAPSED: "orange",
};

/* ── types ──────────────────────────────────────────────── */

interface BenefitPlan {
  id: string;
  name: string;
  type: string;
  provider: string;
  description: string;
  coverageAmount: number;
  employeeCost: number;
  employerCost: number;
  isActive: boolean;
  eligibility: string;
  enrollmentWindow?: string;
}

interface Enrollment {
  id: string;
  planId: string;
  planName?: string;
  planType?: string;
  employeeId: string;
  employeeName?: string;
  status: string;
  enrolledAt: string;
  expiresAt?: string;
  dependents: number;
}

interface BenefitStats {
  totalPlans: number;
  activePlans: number;
  myEnrollments: number;
  totalEnrolled: number;
  totalEmployerCost: number;
}

/* ── component ──────────────────────────────────────────── */

export default function BenefitsAdminPage() {
  const { token, isAdmin, isHR } = useAuth();

  const [activeTab, setActiveTab] = useState("plans");
  const tabs = [
    { id: "plans", label: "Available Plans" },
    { id: "my", label: "My Enrollments" },
    ...((isAdmin || isHR) ? [{ id: "all", label: "All Enrollments" }] : []),
  ];

  /* ── data ─────────────────────────────────────────────── */
  const { data: plans, loading: plansLoading, refetch: refetchPlans } = useApi<BenefitPlan[]>("/hr/benefits/plans");
  const { data: myEnrollments, loading: myLoading, refetch: refetchMy } = useApi<Enrollment[]>("/hr/benefits/enrollments/me");
  const { data: allEnrollments, loading: allLoading, refetch: refetchAll } = useApi<Enrollment[]>(
    (isAdmin || isHR) ? "/hr/benefits/enrollments" : null,
  );
  const { data: stats } = useApi<BenefitStats>("/hr/benefits/stats");

  /* ── state ────────────────────────────────────────────── */
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [showEnroll, setShowEnroll] = useState<BenefitPlan | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [planForm, setPlanForm] = useState({
    name: "", type: "HEALTH", provider: "", description: "",
    coverageAmount: "", employeeCost: "", employerCost: "",
    eligibility: "ALL", enrollmentWindow: "",
  });

  const [enrollForm, setEnrollForm] = useState({ dependents: "0" });

  /* ── helpers ──────────────────────────────────────────── */
  const flash = (type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  /* ── actions ──────────────────────────────────────────── */
  const handleCreatePlan = async () => {
    setSubmitting(true);
    const res = await api.post("/hr/benefits/plans", {
      ...planForm,
      coverageAmount: Number(planForm.coverageAmount),
      employeeCost: Number(planForm.employeeCost),
      employerCost: Number(planForm.employerCost),
    }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Benefit plan created");
      setShowCreatePlan(false);
      setPlanForm({ name: "", type: "HEALTH", provider: "", description: "", coverageAmount: "", employeeCost: "", employerCost: "", eligibility: "ALL", enrollmentWindow: "" });
      refetchPlans();
    } else flash("error", res.error || "Failed to create plan");
  };

  const handleEnroll = async () => {
    if (!showEnroll) return;
    setSubmitting(true);
    const res = await api.post("/hr/benefits/enroll", {
      planId: showEnroll.id,
      dependents: Number(enrollForm.dependents),
    }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", `Enrolled in ${showEnroll.name}`);
      setShowEnroll(null);
      setEnrollForm({ dependents: "0" });
      refetchMy();
    } else flash("error", res.error || "Enrollment failed");
  };

  const handleCancel = async (enrollmentId: string) => {
    const res = await api.patch(`/hr/benefits/enrollments/${enrollmentId}/cancel`, {}, token || undefined);
    if (res.success) { flash("success", "Enrollment cancelled"); refetchMy(); refetchAll(); }
    else flash("error", res.error || "Cancellation failed");
  };

  /* ── columns ──────────────────────────────────────────── */
  const planColumns = [
    {
      key: "name", header: "Plan",
      render: (p: BenefitPlan) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{p.name}</p>
          <p className="text-xs text-slate-500">{p.provider}</p>
        </div>
      ),
    },
    { key: "type", header: "Type", render: (p: BenefitPlan) => <Badge color={planTypeColors[p.type] || "slate"}>{p.type}</Badge> },
    { key: "coverageAmount", header: "Coverage", render: (p: BenefitPlan) => formatCurrency(p.coverageAmount) },
    { key: "employeeCost", header: "Employee Cost", render: (p: BenefitPlan) => <span className="text-amber-400">{formatCurrency(p.employeeCost)}/mo</span> },
    { key: "employerCost", header: "Employer Cost", render: (p: BenefitPlan) => formatCurrency(p.employerCost) },
    { key: "eligibility", header: "Eligibility", render: (p: BenefitPlan) => <Badge color="blue">{p.eligibility}</Badge> },
    {
      key: "isActive", header: "Status",
      render: (p: BenefitPlan) => <Badge color={p.isActive ? "green" : "slate"}>{p.isActive ? "Open" : "Closed"}</Badge>,
    },
    {
      key: "actions", header: "",
      render: (p: BenefitPlan) => (
        <div className="flex gap-2">
          {p.isActive && (
            <Button size="sm" variant="outline" onClick={() => { setShowEnroll(p); setEnrollForm({ dependents: "0" }); }}>Enroll</Button>
          )}
        </div>
      ),
    },
  ];

  const enrollmentColumns = [
    { key: "planName", header: "Plan", render: (e: Enrollment) => <span className="font-medium text-slate-900 dark:text-white">{e.planName || e.planId}</span> },
    { key: "planType", header: "Type", render: (e: Enrollment) => <Badge color={planTypeColors[e.planType || ""] || "slate"}>{e.planType || "—"}</Badge> },
    { key: "status", header: "Status", render: (e: Enrollment) => <Badge color={enrollmentStatusColors[e.status] || "slate"}>{e.status}</Badge> },
    { key: "dependents", header: "Dependents", render: (e: Enrollment) => e.dependents },
    { key: "enrolledAt", header: "Enrolled", render: (e: Enrollment) => formatDate(e.enrolledAt) },
    { key: "expiresAt", header: "Expires", render: (e: Enrollment) => e.expiresAt ? formatDate(e.expiresAt) : "—" },
    {
      key: "actions", header: "",
      render: (e: Enrollment) => e.status === "ACTIVE" ? (
        <Button size="sm" variant="danger" onClick={() => handleCancel(e.id)}>Cancel</Button>
      ) : null,
    },
  ];

  const allEnrollmentColumns = [
    { key: "employeeName", header: "Employee", render: (e: Enrollment) => <span className="font-medium text-slate-900 dark:text-white">{e.employeeName || e.employeeId}</span> },
    ...enrollmentColumns,
  ];

  const s = stats || { totalPlans: 0, activePlans: 0, myEnrollments: 0, totalEnrolled: 0, totalEmployerCost: 0 };

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`fixed right-4 top-4 z-[100] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          feedback.type === "success" ? "border border-green-500/30 bg-green-500/10 text-green-400"
            : "border border-red-500/30 bg-red-500/10 text-red-400"
        }`}>{feedback.msg}</div>
      )}

      <PageHeader
        title="Benefits Administration"
        subtitle="Manage employee benefit plans and enrollments"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Benefits" }]}
        actions={
          (isAdmin || isHR) ? <Button onClick={() => setShowCreatePlan(true)}>+ New Plan</Button> : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard title="Total Plans" value={s.totalPlans} color="blue" />
        <StatCard title="Active Plans" value={s.activePlans} color="green" />
        <StatCard title="My Enrollments" value={s.myEnrollments} color="purple" />
        <StatCard title="Total Enrolled" value={s.totalEnrolled} color="cyan" />
        <StatCard title="Employer Cost" value={formatCurrency(s.totalEmployerCost)} color="amber" subtitle="Monthly" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <Card>
        {activeTab === "plans" && (
          <>
            <CardHeader title="Available Benefit Plans" subtitle="Browse and enroll in benefit programs" />
            <DataTable columns={planColumns} data={plans || []} keyExtractor={(p) => p.id} loading={plansLoading} emptyMessage="No benefit plans available." />
          </>
        )}
        {activeTab === "my" && (
          <>
            <CardHeader title="My Enrollments" subtitle="Your active benefit enrollments" />
            <DataTable columns={enrollmentColumns} data={myEnrollments || []} keyExtractor={(e) => e.id} loading={myLoading} emptyMessage="You have no active enrollments." />
          </>
        )}
        {activeTab === "all" && (
          <>
            <CardHeader title="All Enrollments" subtitle="Company-wide benefit enrollments" />
            <DataTable columns={allEnrollmentColumns} data={allEnrollments || []} keyExtractor={(e) => e.id} loading={allLoading} emptyMessage="No enrollments found." />
          </>
        )}
      </Card>

      {/* ── create plan modal ───────────────────────────── */}
      <Modal open={showCreatePlan} onClose={() => setShowCreatePlan(false)} title="Create Benefit Plan" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Plan Name" placeholder="Gold Health Insurance" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} />
            <Select label="Type" options={[
              { value: "HEALTH", label: "Health" }, { value: "DENTAL", label: "Dental" },
              { value: "VISION", label: "Vision" }, { value: "LIFE", label: "Life Insurance" },
              { value: "RETIREMENT", label: "Retirement" }, { value: "DISABILITY", label: "Disability" },
              { value: "WELLNESS", label: "Wellness" }, { value: "EDUCATION", label: "Education" },
              { value: "OTHER", label: "Other" },
            ]} value={planForm.type} onChange={(e) => setPlanForm({ ...planForm, type: e.target.value })} />
          </div>
          <Input label="Provider" placeholder="ICICI Lombard, LIC, etc." value={planForm.provider} onChange={(e) => setPlanForm({ ...planForm, provider: e.target.value })} />
          <Textarea label="Description" placeholder="Plan details and benefits..." value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Coverage (₹)" type="number" value={planForm.coverageAmount} onChange={(e) => setPlanForm({ ...planForm, coverageAmount: e.target.value })} />
            <Input label="Employee Cost/mo (₹)" type="number" value={planForm.employeeCost} onChange={(e) => setPlanForm({ ...planForm, employeeCost: e.target.value })} />
            <Input label="Employer Cost/mo (₹)" type="number" value={planForm.employerCost} onChange={(e) => setPlanForm({ ...planForm, employerCost: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Eligibility" options={[
              { value: "ALL", label: "All Employees" },
              { value: "FULL_TIME", label: "Full-Time Only" },
              { value: "MANAGERS", label: "Managers+" },
            ]} value={planForm.eligibility} onChange={(e) => setPlanForm({ ...planForm, eligibility: e.target.value })} />
            <Input label="Enrollment Window" placeholder="Jan 1 – Mar 31" value={planForm.enrollmentWindow} onChange={(e) => setPlanForm({ ...planForm, enrollmentWindow: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowCreatePlan(false)}>Cancel</Button>
            <Button onClick={handleCreatePlan} loading={submitting} disabled={!planForm.name || !planForm.provider}>Create Plan</Button>
          </div>
        </div>
      </Modal>

      {/* ── enroll modal ────────────────────────────────── */}
      <Modal open={!!showEnroll} onClose={() => setShowEnroll(null)} title={`Enroll in: ${showEnroll?.name || ""}`}>
        {showEnroll && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Plan</span>
                <span className="text-slate-900 dark:text-white font-medium">{showEnroll.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Type</span>
                <Badge color={planTypeColors[showEnroll.type] || "slate"}>{showEnroll.type}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Coverage</span>
                <span className="text-slate-900 dark:text-white">{formatCurrency(showEnroll.coverageAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Your Monthly Cost</span>
                <span className="text-amber-400 font-medium">{formatCurrency(showEnroll.employeeCost)}</span>
              </div>
            </div>

            <Input label="Number of Dependents" type="number" min="0" value={enrollForm.dependents} onChange={(e) => setEnrollForm({ dependents: e.target.value })} />

            <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
              <Button variant="ghost" onClick={() => setShowEnroll(null)}>Cancel</Button>
              <Button onClick={handleEnroll} loading={submitting}>Enroll Now</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
