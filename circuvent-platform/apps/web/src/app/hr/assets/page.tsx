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
  AVAILABLE: "green",
  ASSIGNED: "blue",
  IN_MAINTENANCE: "amber",
  RETIRED: "slate",
  DISPOSED: "red",
  LOST: "red",
};

const categoryColors: Record<string, BadgeColor> = {
  LAPTOP: "blue",
  MONITOR: "cyan",
  PHONE: "purple",
  VEHICLE: "emerald",
  FURNITURE: "amber",
  SOFTWARE_LICENSE: "pink",
  OTHER: "slate",
};

const requestStatusColors: Record<string, BadgeColor> = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  FULFILLED: "emerald",
  RETURNED: "cyan",
};

/* ── types ──────────────────────────────────────────────── */

interface Asset {
  id: string;
  name: string;
  category: string;
  serialNumber: string;
  status: string;
  purchaseDate: string;
  purchaseCost: number;
  currentValue: number;
  assignedTo?: string;
  assignedToName?: string;
  location: string;
  nextMaintenanceDate?: string;
  notes?: string;
}

interface AssetRequest {
  id: string;
  employeeId: string;
  employeeName?: string;
  assetCategory: string;
  reason: string;
  status: string;
  createdAt: string;
  resolvedAt?: string;
}

interface MaintenanceRecord {
  id: string;
  assetId: string;
  assetName?: string;
  type: string;
  scheduledDate: string;
  completedDate?: string;
  cost: number;
  vendor?: string;
  notes?: string;
  status: string;
}

interface AssetStats {
  totalAssets: number;
  available: number;
  assigned: number;
  inMaintenance: number;
  totalValue: number;
  utilizationRate: number;
  maintenanceDue: number;
}

/* ── component ──────────────────────────────────────────── */

export default function AssetManagementPage() {
  const { token, isAdmin, isHR } = useAuth();

  /* ── tabs ──────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState("catalog");
  const tabs = [
    { id: "catalog", label: "Asset Catalog" }, { key: "requests", label: "Requests" }, { key: "maintenance", label: "Maintenance" },
  ];

  /* ── data ─────────────────────────────────────────────── */
  const { data: assets, loading, refetch } = useApi<Asset[]>("/hr/assets");
  const { data: requests, loading: reqLoading, refetch: refetchReqs } = useApi<AssetRequest[]>("/hr/assets/requests");
  const { data: maintenance, loading: maintLoading, refetch: refetchMaint } = useApi<MaintenanceRecord[]>("/hr/assets/maintenance");
  const { data: stats } = useApi<AssetStats>("/hr/assets/stats");

  /* ── modals ───────────────────────────────────────────── */
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState<Asset | null>(null);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  /* ── forms ────────────────────────────────────────────── */
  const [form, setForm] = useState({
    name: "", category: "LAPTOP", serialNumber: "", purchaseDate: "",
    purchaseCost: "", location: "", notes: "",
  });

  const [assignForm, setAssignForm] = useState({ employeeId: "" });

  const [maintForm, setMaintForm] = useState({
    assetId: "", type: "PREVENTIVE", scheduledDate: "",
    vendor: "", cost: "", notes: "",
  });

  /* ── helpers ──────────────────────────────────────────── */
  const flash = (type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  /* ── actions ──────────────────────────────────────────── */
  const handleCreate = async () => {
    setSubmitting(true);
    const res = await api.post("/hr/assets", {
      ...form, purchaseCost: Number(form.purchaseCost),
    }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Asset created");
      setShowCreate(false);
      setForm({ name: "", category: "LAPTOP", serialNumber: "", purchaseDate: "", purchaseCost: "", location: "", notes: "" });
      refetch();
    } else flash("error", res.error || "Failed to create asset");
  };

  const handleAssign = async () => {
    if (!showAssign) return;
    setSubmitting(true);
    const res = await api.patch(`/hr/assets/${showAssign.id}/assign`, { employeeId: assignForm.employeeId }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Asset assigned");
      setShowAssign(null);
      setAssignForm({ employeeId: "" });
      refetch();
    } else flash("error", res.error || "Assignment failed");
  };

  const handleUnassign = async (id: string) => {
    const res = await api.patch(`/hr/assets/${id}/unassign`, {}, token || undefined);
    if (res.success) { flash("success", "Asset unassigned"); refetch(); }
    else flash("error", res.error || "Failed to unassign");
  };

  const handleScheduleMaintenance = async () => {
    setSubmitting(true);
    const res = await api.post("/hr/assets/maintenance", {
      ...maintForm, cost: Number(maintForm.cost),
    }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Maintenance scheduled");
      setShowMaintenance(false);
      setMaintForm({ assetId: "", type: "PREVENTIVE", scheduledDate: "", vendor: "", cost: "", notes: "" });
      refetchMaint();
    } else flash("error", res.error || "Failed to schedule");
  };

  const handleDepreciation = async () => {
    setSubmitting(true);
    const res = await api.post("/hr/assets/depreciation/run", {}, token || undefined);
    setSubmitting(false);
    if (res.success) { flash("success", "Depreciation calculation triggered"); refetch(); }
    else flash("error", res.error || "Depreciation failed");
  };

  const handleApproveRequest = async (id: string) => {
    const res = await api.patch(`/hr/assets/requests/${id}/approve`, {}, token || undefined);
    if (res.success) { flash("success", "Request approved"); refetchReqs(); }
    else flash("error", res.error || "Failed");
  };

  const handleRejectRequest = async (id: string) => {
    const res = await api.patch(`/hr/assets/requests/${id}/reject`, {}, token || undefined);
    if (res.success) { flash("success", "Request rejected"); refetchReqs(); }
    else flash("error", res.error || "Failed");
  };

  /* ── columns ──────────────────────────────────────────── */
  const assetColumns = [
    {
      id: "name", header: "Asset",
      render: (a: Asset) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{a.name}</p>
          <p className="text-xs text-slate-500">SN: {a.serialNumber}</p>
        </div>
      ),
    }, { key: "category", header: "Category", render: (a: Asset) => <Badge color={categoryColors[a.category] || "slate"}>{a.category}</Badge> }, { key: "status", header: "Status", render: (a: Asset) => <Badge color={statusColors[a.status] || "slate"}>{a.status}</Badge> }, { key: "assignedToName", header: "Assigned To", render: (a: Asset) => a.assignedToName || <span className="text-slate-500">—</span> }, { key: "location", header: "Location" }, { key: "purchaseCost", header: "Purchase Cost", render: (a: Asset) => formatCurrency(a.purchaseCost) }, { key: "currentValue", header: "Current Value", render: (a: Asset) => formatCurrency(a.currentValue) }, { key: "actions", header: "",
      render: (a: Asset) => (
        <div className="flex gap-2">
          {a.status === "AVAILABLE" && (isAdmin || isHR) && (
            <Button size="sm" variant="outline" onClick={() => { setShowAssign(a); setAssignForm({ employeeId: "" }); }}>Assign</Button>
          )}
          {a.status === "ASSIGNED" && (isAdmin || isHR) && (
            <Button size="sm" variant="ghost" onClick={() => handleUnassign(a.id)}>Unassign</Button>
          )}
        </div>
      ),
    },
  ];

  const requestColumns = [
    { id: "employeeName", header: "Employee", render: (r: AssetRequest) => <span className="font-medium text-slate-900 dark:text-white">{r.employeeName || r.employeeId}</span> }, { key: "assetCategory", header: "Category", render: (r: AssetRequest) => <Badge color={categoryColors[r.assetCategory] || "slate"}>{r.assetCategory}</Badge> }, { key: "reason", header: "Reason" }, { key: "status", header: "Status", render: (r: AssetRequest) => <Badge color={requestStatusColors[r.status] || "slate"}>{r.status}</Badge> }, { key: "createdAt", header: "Requested", render: (r: AssetRequest) => formatDate(r.createdAt) }, { key: "actions", header: "",
      render: (r: AssetRequest) => r.status === "PENDING" && (isAdmin || isHR) ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => handleApproveRequest(r.id)}>Approve</Button>
          <Button size="sm" variant="ghost" onClick={() => handleRejectRequest(r.id)}>Reject</Button>
        </div>
      ) : null,
    },
  ];

  const maintenanceColumns = [
    { id: "assetName", header: "Asset", render: (m: MaintenanceRecord) => <span className="font-medium text-slate-900 dark:text-white">{m.assetName || m.assetId}</span> }, { key: "type", header: "Type", render: (m: MaintenanceRecord) => <Badge color={m.type === "PREVENTIVE" ? "blue" : "amber"}>{m.type}</Badge> }, { key: "scheduledDate", header: "Scheduled", render: (m: MaintenanceRecord) => formatDate(m.scheduledDate) }, { key: "completedDate", header: "Completed", render: (m: MaintenanceRecord) => m.completedDate ? formatDate(m.completedDate) : <span className="text-slate-500">—</span> }, { key: "cost", header: "Cost", render: (m: MaintenanceRecord) => formatCurrency(m.cost) }, { key: "vendor", header: "Vendor", render: (m: MaintenanceRecord) => m.vendor || "—" }, { key: "status", header: "Status", render: (m: MaintenanceRecord) => <Badge color={m.status === "COMPLETED" ? "green" : m.status === "SCHEDULED" ? "amber" : "red"}>{m.status}</Badge> },
  ];

  /* ── computed ─────────────────────────────────────────── */
  const s = stats || { totalAssets: 0, available: 0, assigned: 0, inMaintenance: 0, totalValue: 0, utilizationRate: 0, maintenanceDue: 0 };

  /* ── render ───────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`fixed right-4 top-4 z-[100] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          feedback.type === "success" ? "border border-green-200 dark:border-green-500/30 bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400"
            : "border border-red-200 dark:border-red-500/30 bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400"
        }`}>{feedback.msg}</div>
      )}

      <PageHeader
        title="Asset Management"
        subtitle="Track company assets, maintenance, and assignments"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Assets" }]}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setShowCreate(true)}>+ New Asset</Button>
            {(isAdmin || isHR) && (
              <Button variant="secondary" onClick={handleDepreciation} loading={submitting}>Run Depreciation</Button>
            )}
          </div>
        }
      />

      {/* stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        <StatCard title="Total Assets" value={s.totalAssets} color="blue" />
        <StatCard title="Available" value={s.available} color="green" />
        <StatCard title="Assigned" value={s.assigned} color="cyan" />
        <StatCard title="In Maintenance" value={s.inMaintenance} color="amber" />
        <StatCard title="Total Value" value={formatCurrency(s.totalValue)} color="purple" />
        <StatCard title="Utilization" value={`${s.utilizationRate}%`} color="emerald" />
        <StatCard title="Maintenance Due" value={s.maintenanceDue} color="red" />
      </div>

      {/* tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <Card>
        {activeTab === "catalog" && (
          <>
            <CardHeader title="Asset Catalog" subtitle="All company assets" />
            <DataTable columns={assetColumns} data={assets || []} keyExtractor={(a) => a.id} loading={loading} emptyMessage="No assets registered yet." />
          </>
        )}
        {activeTab === "requests" && (
          <>
            <CardHeader title="Asset Requests" subtitle="Employee requests for assets" />
            <DataTable columns={requestColumns} data={requests || []} keyExtractor={(r) => r.id} loading={reqLoading} emptyMessage="No asset requests." />
          </>
        )}
        {activeTab === "maintenance" && (
          <>
            <CardHeader
              title="Maintenance Schedule"
              subtitle="Upcoming and completed maintenance"
              actions={<Button size="sm" variant="outline" onClick={() => setShowMaintenance(true)}>+ Schedule</Button>}
            />
            <DataTable columns={maintenanceColumns} data={maintenance || []} keyExtractor={(m) => m.id} loading={maintLoading} emptyMessage="No maintenance records." />
          </>
        )}
      </Card>

      {/* ── create asset modal ──────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Register New Asset" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Asset Name" placeholder="MacBook Pro 16″" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label="Category" options={[
              { value: "LAPTOP", label: "Laptop" }, { value: "MONITOR", label: "Monitor" },
              { value: "PHONE", label: "Phone" }, { value: "VEHICLE", label: "Vehicle" },
              { value: "FURNITURE", label: "Furniture" }, { value: "SOFTWARE_LICENSE", label: "Software License" },
              { value: "OTHER", label: "Other" },
            ]} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Serial Number" placeholder="SN-XXXXX" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
            <Input label="Purchase Date" type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
            <Input label="Purchase Cost (₹)" type="number" value={form.purchaseCost} onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })} />
          </div>
          <Input label="Location" placeholder="Floor 3 – Desk 12A" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <Textarea label="Notes" placeholder="Additional details..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={submitting} disabled={!form.name || !form.serialNumber}>Register Asset</Button>
          </div>
        </div>
      </Modal>

      {/* ── assign modal ────────────────────────────────── */}
      <Modal open={!!showAssign} onClose={() => setShowAssign(null)} title={`Assign: ${showAssign?.name || ""}`}>
        <div className="space-y-4">
          <Input label="Employee ID" placeholder="emp_xxxxxxxx" value={assignForm.employeeId} onChange={(e) => setAssignForm({ employeeId: e.target.value })} />
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowAssign(null)}>Cancel</Button>
            <Button onClick={handleAssign} loading={submitting} disabled={!assignForm.employeeId}>Assign</Button>
          </div>
        </div>
      </Modal>

      {/* ── maintenance modal ───────────────────────────── */}
      <Modal open={showMaintenance} onClose={() => setShowMaintenance(false)} title="Schedule Maintenance" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Asset" options={[
              { value: "", label: "Select asset..." },
              ...(assets || []).map((a) => ({ value: a.id, label: `${a.name} (${a.serialNumber})` })),
            ]} value={maintForm.assetId} onChange={(e) => setMaintForm({ ...maintForm, assetId: e.target.value })} />
            <Select label="Type" options={[
              { value: "PREVENTIVE", label: "Preventive" },
              { value: "CORRECTIVE", label: "Corrective" },
              { value: "INSPECTION", label: "Inspection" },
            ]} value={maintForm.type} onChange={(e) => setMaintForm({ ...maintForm, type: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Scheduled Date" type="date" value={maintForm.scheduledDate} onChange={(e) => setMaintForm({ ...maintForm, scheduledDate: e.target.value })} />
            <Input label="Vendor" placeholder="Service provider" value={maintForm.vendor} onChange={(e) => setMaintForm({ ...maintForm, vendor: e.target.value })} />
            <Input label="Estimated Cost (₹)" type="number" value={maintForm.cost} onChange={(e) => setMaintForm({ ...maintForm, cost: e.target.value })} />
          </div>
          <Textarea label="Notes" placeholder="Maintenance details..." value={maintForm.notes} onChange={(e) => setMaintForm({ ...maintForm, notes: e.target.value })} />
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowMaintenance(false)}>Cancel</Button>
            <Button onClick={handleScheduleMaintenance} loading={submitting} disabled={!maintForm.assetId || !maintForm.scheduledDate}>Schedule</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
