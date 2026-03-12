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

const statusColors: Record<string, BadgeColor> = {
  DRAFT: "slate",
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "slate",
  COMPLETED: "emerald",
  IN_PROGRESS: "cyan",
};

const travelTypeColors: Record<string, BadgeColor> = {
  DOMESTIC: "blue",
  INTERNATIONAL: "purple",
  LOCAL: "cyan",
};

/* ── types ──────────────────────────────────────────────── */

interface Leg {
  from: string;
  to: string;
  departureDate: string;
  returnDate: string;
  mode: string;
}

interface TravelRequest {
  id: string;
  employeeId: string;
  employeeName?: string;
  purpose: string;
  travelType: string;
  status: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  estimatedCost: number;
  actualCost?: number;
  itinerary?: Leg[];
  createdAt: string;
}

interface TravelPolicy {
  id: string;
  name: string;
  description: string;
  maxDailyAllowance: number;
  requiresPreApproval: boolean;
  applicableTo: string;
  isActive: boolean;
}

interface TravelStats {
  totalRequests: number;
  pending: number;
  approved: number;
  rejected: number;
  totalBudget: number;
  spent: number;
}

/* ── component ──────────────────────────────────────────── */

export default function TravelManagementPage() {
  const { token, user, isAdmin, isHR } = useAuth();

  /* ── tabs ──────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState("my");
  const tabs = [
    { id: "my", label: "My Requests" }, { key: "all", label: "All Requests" }, { key: "policies", label: "Policies" },
  ];

  /* ── data fetching ────────────────────────────────────── */
  const { data: requests, loading, refetch } = useApi<TravelRequest[]>("/hr/travel/requests");
  const { data: allRequests, loading: allLoading, refetch: refetchAll } = useApi<TravelRequest[]>(
    isAdmin || isHR ? "/hr/travel/requests?scope=all" : null,
  );
  const { data: policies, loading: policiesLoading, refetch: refetchPolicies } = useApi<TravelPolicy[]>("/hr/travel/policies");
  const { data: stats } = useApi<TravelStats>("/hr/travel/stats");

  /* ── modals ───────────────────────────────────────────── */
  const [showCreate, setShowCreate] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  /* ── form state ───────────────────────────────────────── */
  const [form, setForm] = useState({
    purpose: "",
    travelType: "DOMESTIC",
    destination: "",
    departureDate: "",
    returnDate: "",
    estimatedCost: "",
    notes: "",
  });

  const [legs, setLegs] = useState<Leg[]>([
    { from: "", to: "", departureDate: "", returnDate: "", mode: "FLIGHT" },
  ]);

  const [policyForm, setPolicyForm] = useState({
    name: "",
    description: "",
    maxDailyAllowance: "",
    requiresPreApproval: "true",
    applicableTo: "ALL",
  });

  /* ── helpers ──────────────────────────────────────────── */
  const flash = (type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const resetForm = () => {
    setForm({ purpose: "", travelType: "DOMESTIC", destination: "", departureDate: "", returnDate: "", estimatedCost: "", notes: "" });
    setLegs([{ from: "", to: "", departureDate: "", returnDate: "", mode: "FLIGHT" }]);
  };

  /* ── actions ──────────────────────────────────────────── */
  const handleCreate = async () => {
    setSubmitting(true);
    const body = {
      ...form,
      estimatedCost: Number(form.estimatedCost),
      itinerary: legs,
    };
    const res = await api.post("/hr/travel/requests", body, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Travel request submitted");
      setShowCreate(false);
      resetForm();
      refetch();
      refetchAll();
    } else {
      flash("error", res.error || "Failed to submit");
    }
  };

  const handleApprove = async (id: string) => {
    const res = await api.patch(`/hr/travel/requests/${id}/approve`, {}, token || undefined);
    if (res.success) { flash("success", "Request approved"); refetch(); refetchAll(); }
    else flash("error", res.error || "Approval failed");
  };

  const handleReject = async (id: string) => {
    const res = await api.patch(`/hr/travel/requests/${id}/reject`, { reason: "Does not meet policy" }, token || undefined);
    if (res.success) { flash("success", "Request rejected"); refetch(); refetchAll(); }
    else flash("error", res.error || "Rejection failed");
  };

  const handleCancel = async (id: string) => {
    const res = await api.patch(`/hr/travel/requests/${id}/cancel`, {}, token || undefined);
    if (res.success) { flash("success", "Request cancelled"); refetch(); refetchAll(); }
    else flash("error", res.error || "Cancellation failed");
  };

  const handleCreatePolicy = async () => {
    setSubmitting(true);
    const body = {
      ...policyForm,
      maxDailyAllowance: Number(policyForm.maxDailyAllowance),
      requiresPreApproval: policyForm.requiresPreApproval === "true",
    };
    const res = await api.post("/hr/travel/policies", body, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Policy created");
      setShowPolicy(false);
      setPolicyForm({ name: "", description: "", maxDailyAllowance: "", requiresPreApproval: "true", applicableTo: "ALL" });
      refetchPolicies();
    } else {
      flash("error", res.error || "Failed to create policy");
    }
  };

  /* ── itinerary helpers ────────────────────────────────── */
  const addLeg = () => setLegs([...legs, { from: "", to: "", departureDate: "", returnDate: "", mode: "FLIGHT" }]);
  const removeLeg = (idx: number) => setLegs(legs.filter((_, i) => i !== idx));
  const updateLeg = (idx: number, field: keyof Leg, value: string) => {
    const next = [...legs];
    next[idx] = { ...next[idx], [field]: value };
    setLegs(next);
  };

  /* ── columns ──────────────────────────────────────────── */
  const requestColumns = [
    {
      id: "purpose", header: "Purpose",
      render: (r: TravelRequest) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{r.purpose}</p>
          <p className="text-xs text-slate-500">{r.destination}</p>
        </div>
      ),
    }, { key: "travelType", header: "Type",
      render: (r: TravelRequest) => <Badge color={travelTypeColors[r.travelType] || "slate"}>{r.travelType}</Badge>,
    }, { key: "dates", header: "Dates",
      render: (r: TravelRequest) => (
        <span className="text-xs">
          {formatDate(r.departureDate)} → {formatDate(r.returnDate)}
        </span>
      ),
    }, { key: "estimatedCost", header: "Est. Cost",
      render: (r: TravelRequest) => formatCurrency(r.estimatedCost),
    }, { key: "status", header: "Status",
      render: (r: TravelRequest) => <Badge color={statusColors[r.status] || "slate"}>{r.status}</Badge>,
    }, { key: "actions", header: "",
      render: (r: TravelRequest) => (
        <div className="flex gap-2">
          {r.status === "PENDING" && (isAdmin || isHR) && (
            <>
              <Button size="sm" variant="outline" onClick={() => handleApprove(r.id)}>Approve</Button>
              <Button size="sm" variant="ghost" onClick={() => handleReject(r.id)}>Reject</Button>
            </>
          )}
          {r.status === "PENDING" && (
            <Button size="sm" variant="danger" onClick={() => handleCancel(r.id)}>Cancel</Button>
          )}
        </div>
      ),
    },
  ];

  const allRequestColumns = [
    {
      id: "employee", header: "Employee",
      render: (r: TravelRequest) => <span className="font-medium text-slate-900 dark:text-white">{r.employeeName || r.employeeId}</span>,
    },
    ...requestColumns,
  ];

  const policyColumns = [
    { id: "name", header: "Policy Name", render: (p: TravelPolicy) => <span className="font-medium text-slate-900 dark:text-white">{p.name}</span> }, { key: "description", header: "Description" }, { key: "maxDailyAllowance", header: "Max Daily",
      render: (p: TravelPolicy) => formatCurrency(p.maxDailyAllowance),
    }, { key: "requiresPreApproval", header: "Pre-Approval",
      render: (p: TravelPolicy) => <Badge color={p.requiresPreApproval ? "amber" : "green"}>{p.requiresPreApproval ? "Required" : "Not Required"}</Badge>,
    }, { key: "applicableTo", header: "Applies To",
      render: (p: TravelPolicy) => <Badge color="blue">{p.applicableTo}</Badge>,
    }, { key: "isActive", header: "Status",
      render: (p: TravelPolicy) => <Badge color={p.isActive ? "green" : "slate"}>{p.isActive ? "Active" : "Inactive"}</Badge>,
    },
  ];

  /* ── computed stats ───────────────────────────────────── */
  const s = stats || { totalRequests: 0, pending: 0, approved: 0, rejected: 0, totalBudget: 0, spent: 0 };
  const myData = requests || [];
  const allData = allRequests || [];

  /* ── render ───────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* feedback toast */}
      {feedback && (
        <div className={`fixed right-4 top-4 z-[100] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          feedback.type === "success"
            ? "border border-green-200 dark:border-green-500/30 bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400"
            : "border border-red-200 dark:border-red-500/30 bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400"
        }`}>
          {feedback.msg}
        </div>
      )}

      <PageHeader
        title="Travel Management"
        subtitle="Create, track, and approve travel requests"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Travel" }]}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setShowCreate(true)}>+ New Request</Button>
            {(isAdmin || isHR) && (
              <Button variant="secondary" onClick={() => setShowPolicy(true)}>+ Policy</Button>
            )}
          </div>
        }
      />

      {/* stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard title="Total Requests" value={s.totalRequests} color="blue" />
        <StatCard title="Pending" value={s.pending} color="amber" />
        <StatCard title="Approved" value={s.approved} color="green" />
        <StatCard title="Rejected" value={s.rejected} color="red" />
        <StatCard title="Budget" value={formatCurrency(s.totalBudget)} color="purple" />
        <StatCard title="Spent" value={formatCurrency(s.spent)} color="cyan" />
      </div>

      {/* tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* tab content */}
      <Card>
        {activeTab === "my" && (
          <>
            <CardHeader title="My Travel Requests" subtitle="Your submitted requests" />
            <DataTable
              columns={requestColumns}
              data={myData}
              keyExtractor={(r) => r.id}
              loading={loading}
              emptyMessage="You haven't submitted any travel requests yet."
            />
          </>
        )}

        {activeTab === "all" && (
          <>
            <CardHeader title="All Requests" subtitle="Team travel requests" />
            {isAdmin || isHR ? (
              <DataTable
                columns={allRequestColumns}
                data={allData}
                keyExtractor={(r) => r.id}
                loading={allLoading}
                emptyMessage="No travel requests found."
              />
            ) : (
              <EmptyState title="Access Restricted" subtitle="Only HR and Admins can view all requests." />
            )}
          </>
        )}

        {activeTab === "policies" && (
          <>
            <CardHeader
              title="Travel Policies"
              subtitle="Company travel policies and limits"
              actions={(isAdmin || isHR) ? <Button size="sm" variant="outline" onClick={() => setShowPolicy(true)}>Add Policy</Button> : undefined}
            />
            <DataTable
              columns={policyColumns}
              data={policies || []}
              keyExtractor={(p) => p.id}
              loading={policiesLoading}
              emptyMessage="No travel policies configured."
            />
          </>
        )}
      </Card>

      {/* ── create request modal ────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Travel Request" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Purpose" placeholder="Client meeting, Conference..." value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            <Select label="Travel Type" options={[{ value: "DOMESTIC", label: "Domestic" }, { value: "INTERNATIONAL", label: "International" }, { value: "LOCAL", label: "Local" }]} value={form.travelType} onChange={(e) => setForm({ ...form, travelType: e.target.value })} />
          </div>
          <Input label="Destination" placeholder="City, Country" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Departure Date" type="date" value={form.departureDate} onChange={(e) => setForm({ ...form, departureDate: e.target.value })} />
            <Input label="Return Date" type="date" value={form.returnDate} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} />
            <Input label="Estimated Cost (₹)" type="number" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} />
          </div>

          {/* itinerary builder */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Itinerary</h4>
              <Button size="sm" variant="outline" onClick={addLeg}>+ Add Leg</Button>
            </div>
            <div className="space-y-3">
              {legs.map((leg, idx) => (
                <div key={idx} className="grid grid-cols-6 gap-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <Input placeholder="From" value={leg.from} onChange={(e) => updateLeg(idx, "from", e.target.value)} />
                  <Input placeholder="To" value={leg.to} onChange={(e) => updateLeg(idx, "to", e.target.value)} />
                  <Input type="date" value={leg.departureDate} onChange={(e) => updateLeg(idx, "departureDate", e.target.value)} />
                  <Input type="date" value={leg.returnDate} onChange={(e) => updateLeg(idx, "returnDate", e.target.value)} />
                  <Select
                    options={[
                      { value: "FLIGHT", label: "Flight" },
                      { value: "TRAIN", label: "Train" },
                      { value: "BUS", label: "Bus" },
                      { value: "CAR", label: "Car" },
                    ]}
                    value={leg.mode}
                    onChange={(e) => updateLeg(idx, "mode", e.target.value)}
                  />
                  {legs.length > 1 && (
                    <Button size="sm" variant="danger" onClick={() => removeLeg(idx)}>✕</Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Textarea label="Additional Notes" placeholder="Any special requirements..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} loading={submitting} disabled={!form.purpose || !form.destination || !form.departureDate}>
              Submit Request
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── create policy modal ─────────────────────────── */}
      <Modal open={showPolicy} onClose={() => setShowPolicy(false)} title="Create Travel Policy" size="lg">
        <div className="space-y-4">
          <Input label="Policy Name" placeholder="Domestic Travel Policy" value={policyForm.name} onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })} />
          <Textarea label="Description" placeholder="Describe the policy..." value={policyForm.description} onChange={(e) => setPolicyForm({ ...policyForm, description: e.target.value })} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Max Daily Allowance (₹)" type="number" value={policyForm.maxDailyAllowance} onChange={(e) => setPolicyForm({ ...policyForm, maxDailyAllowance: e.target.value })} />
            <Select
              label="Requires Pre-Approval"
              options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]}
              value={policyForm.requiresPreApproval}
              onChange={(e) => setPolicyForm({ ...policyForm, requiresPreApproval: e.target.value })}
            />
            <Select
              label="Applicable To"
              options={[
                { value: "ALL", label: "All Employees" },
                { value: "MANAGERS", label: "Managers Only" },
                { value: "EXECUTIVES", label: "Executives" },
              ]}
              value={policyForm.applicableTo}
              onChange={(e) => setPolicyForm({ ...policyForm, applicableTo: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowPolicy(false)}>Cancel</Button>
            <Button onClick={handleCreatePolicy} loading={submitting} disabled={!policyForm.name}>Create Policy</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
