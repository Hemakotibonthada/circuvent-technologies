"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, CardHeader, StatCard, Badge, Button,
  DataTable, Modal, Input, Select, Textarea, Tabs, EmptyState,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/utils";
import { api } from "@/lib/api-client";

/* ── colour maps ────────────────────────────────────────── */

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

const statusColors: Record<string, BadgeColor> = {
  OPEN: "amber",
  INVESTIGATING: "blue",
  RESOLVED: "green",
  CLOSED: "slate",
  ESCALATED: "red",
  WITHDRAWN: "slate",
};

const priorityColors: Record<string, BadgeColor> = {
  LOW: "slate",
  MEDIUM: "amber",
  HIGH: "orange",
  CRITICAL: "red",
};

const categoryColors: Record<string, BadgeColor> = {
  HARASSMENT: "red",
  DISCRIMINATION: "pink",
  SAFETY: "orange",
  POLICY_VIOLATION: "amber",
  COMPENSATION: "purple",
  WORKPLACE_CONDITION: "blue",
  MANAGEMENT: "cyan",
  OTHER: "slate",
};

/* ── types ──────────────────────────────────────────────── */

interface Grievance {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  filedBy: string;
  filedByName?: string;
  assignedTo?: string;
  assignedToName?: string;
  resolution?: string;
  filedAt: string;
  resolvedAt?: string;
  dueDate?: string;
  isAnonymous: boolean;
  isOverdue: boolean;
}

interface GrievanceStats {
  total: number;
  open: number;
  investigating: number;
  resolved: number;
  escalated: number;
  overdue: number;
  avgResolutionDays: number;
}

/* ── component ──────────────────────────────────────────── */

export default function GrievanceManagementPage() {
  const { token, user, isAdmin, isHR } = useAuth();

  const [activeTab, setActiveTab] = useState("open");
  const tabs = [
    { id: "open", label: "Open" },
    { id: "investigating", label: "Investigating" },
    { id: "resolved", label: "Resolved" },
    { id: "all", label: "All" },
  ];

  /* ── data ─────────────────────────────────────────────── */
  const { data: grievances, loading, refetch } = useApi<Grievance[]>("/hr/grievances");
  const { data: stats } = useApi<GrievanceStats>("/hr/grievances/stats");

  /* ── modals ───────────────────────────────────────────── */
  const [showFile, setShowFile] = useState(false);
  const [showDetail, setShowDetail] = useState<Grievance | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "OTHER",
    priority: "MEDIUM",
    isAnonymous: "false",
  });

  const [resolveNote, setResolveNote] = useState("");

  /* ── helpers ──────────────────────────────────────────── */
  const flash = (type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const filtered = (status: string) => (grievances || []).filter((g) => g.status === status.toUpperCase());
  const displayData = activeTab === "all" ? (grievances || [])
    : activeTab === "open" ? [...filtered("OPEN"), ...filtered("ESCALATED")]
    : activeTab === "investigating" ? filtered("INVESTIGATING")
    : [...filtered("RESOLVED"), ...filtered("CLOSED")];

  /* ── actions ──────────────────────────────────────────── */
  const handleFile = async () => {
    setSubmitting(true);
    const res = await api.post("/hr/grievances", {
      ...form, isAnonymous: form.isAnonymous === "true",
    }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Grievance filed successfully");
      setShowFile(false);
      setForm({ title: "", description: "", category: "OTHER", priority: "MEDIUM", isAnonymous: "false" });
      refetch();
    } else flash("error", res.error || "Failed to file grievance");
  };

  const handleEscalate = async (id: string) => {
    const res = await api.patch(`/hr/grievances/${id}/escalate`, {}, token || undefined);
    if (res.success) { flash("success", "Grievance escalated"); refetch(); }
    else flash("error", res.error || "Escalation failed");
  };

  const handleAssign = async (id: string) => {
    const res = await api.patch(`/hr/grievances/${id}/assign`, { assignedTo: user?.id }, token || undefined);
    if (res.success) { flash("success", "Assigned to you"); refetch(); }
    else flash("error", res.error || "Assignment failed");
  };

  const handleStartInvestigation = async (id: string) => {
    const res = await api.patch(`/hr/grievances/${id}/investigate`, {}, token || undefined);
    if (res.success) { flash("success", "Investigation started"); refetch(); }
    else flash("error", res.error || "Failed");
  };

  const handleResolve = async (id: string) => {
    const res = await api.patch(`/hr/grievances/${id}/resolve`, { resolution: resolveNote }, token || undefined);
    if (res.success) {
      flash("success", "Grievance resolved");
      setShowDetail(null);
      setResolveNote("");
      refetch();
    } else flash("error", res.error || "Failed to resolve");
  };

  /* ── columns ──────────────────────────────────────────── */
  const columns = [
    {
      key: "title", header: "Grievance",
      render: (g: Grievance) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{g.title}</p>
          <p className="text-xs text-slate-500">{g.isAnonymous ? "Anonymous" : g.filedByName || g.filedBy}</p>
        </div>
      ),
    },
    { key: "category", header: "Category", render: (g: Grievance) => <Badge color={categoryColors[g.category] || "slate"}>{g.category.replace(/_/g, " ")}</Badge> },
    { key: "priority", header: "Priority", render: (g: Grievance) => <Badge color={priorityColors[g.priority] || "slate"}>{g.priority}</Badge> },
    { key: "status", header: "Status", render: (g: Grievance) => <Badge color={statusColors[g.status] || "slate"}>{g.status}</Badge> },
    {
      key: "assignedToName", header: "Assigned To",
      render: (g: Grievance) => g.assignedToName || <span className="text-slate-500">Unassigned</span>,
    },
    { key: "filedAt", header: "Filed", render: (g: Grievance) => formatDate(g.filedAt) },
    {
      key: "overdue", header: "",
      render: (g: Grievance) => g.isOverdue ? <Badge color="red">OVERDUE</Badge> : null,
    },
    {
      key: "actions", header: "",
      render: (g: Grievance) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setShowDetail(g); setResolveNote(""); }}>View</Button>
          {g.status === "OPEN" && (isAdmin || isHR) && (
            <>
              <Button size="sm" variant="outline" onClick={() => handleAssign(g.id)}>Assign Me</Button>
              <Button size="sm" variant="outline" onClick={() => handleStartInvestigation(g.id)}>Investigate</Button>
            </>
          )}
          {(g.status === "OPEN" || g.status === "INVESTIGATING") && (isAdmin || isHR) && (
            <Button size="sm" variant="danger" onClick={() => handleEscalate(g.id)}>Escalate</Button>
          )}
        </div>
      ),
    },
  ];

  const s = stats || { total: 0, open: 0, investigating: 0, resolved: 0, escalated: 0, overdue: 0, avgResolutionDays: 0 };

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`fixed right-4 top-4 z-[100] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          feedback.type === "success" ? "border border-green-500/30 bg-green-500/10 text-green-400"
            : "border border-red-500/30 bg-red-500/10 text-red-400"
        }`}>{feedback.msg}</div>
      )}

      <PageHeader
        title="Grievance Management"
        subtitle="File, track, and resolve workplace grievances"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Grievances" }]}
        actions={<Button onClick={() => setShowFile(true)}>File Grievance</Button>}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        <StatCard title="Total" value={s.total} color="blue" />
        <StatCard title="Open" value={s.open} color="amber" />
        <StatCard title="Investigating" value={s.investigating} color="cyan" />
        <StatCard title="Resolved" value={s.resolved} color="green" />
        <StatCard title="Escalated" value={s.escalated} color="red" />
        <StatCard title="Overdue" value={s.overdue} color="orange" />
        <StatCard title="Avg Resolution" value={`${s.avgResolutionDays}d`} color="purple" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <Card>
        <CardHeader title={`${activeTab === "all" ? "All" : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Grievances`} subtitle={`${displayData.length} records`} />
        <DataTable
          columns={columns}
          data={displayData}
          keyExtractor={(g) => g.id}
          loading={loading}
          emptyMessage="No grievances found in this category."
        />
      </Card>

      {/* ── file grievance modal ────────────────────────── */}
      <Modal open={showFile} onClose={() => setShowFile(false)} title="File a Grievance" size="lg">
        <div className="space-y-4">
          <Input label="Title" placeholder="Brief description of the issue" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea label="Description" placeholder="Provide detailed information about the grievance..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-3 gap-4">
            <Select label="Category" options={[
              { value: "HARASSMENT", label: "Harassment" },
              { value: "DISCRIMINATION", label: "Discrimination" },
              { value: "SAFETY", label: "Safety" },
              { value: "POLICY_VIOLATION", label: "Policy Violation" },
              { value: "COMPENSATION", label: "Compensation" },
              { value: "WORKPLACE_CONDITION", label: "Workplace Condition" },
              { value: "MANAGEMENT", label: "Management" },
              { value: "OTHER", label: "Other" },
            ]} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Select label="Priority" options={[
              { value: "LOW", label: "Low" },
              { value: "MEDIUM", label: "Medium" },
              { value: "HIGH", label: "High" },
              { value: "CRITICAL", label: "Critical" },
            ]} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
            <Select label="File Anonymously?" options={[
              { value: "false", label: "No" },
              { value: "true", label: "Yes" },
            ]} value={form.isAnonymous} onChange={(e) => setForm({ ...form, isAnonymous: e.target.value })} />
          </div>
          <p className="text-xs text-slate-500">Anonymous grievances protect your identity but may limit the investigation process.</p>
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowFile(false)}>Cancel</Button>
            <Button onClick={handleFile} loading={submitting} disabled={!form.title || !form.description}>File Grievance</Button>
          </div>
        </div>
      </Modal>

      {/* ── detail / resolve modal ──────────────────────── */}
      <Modal open={!!showDetail} onClose={() => setShowDetail(null)} title={showDetail?.title || "Grievance Details"} size="lg">
        {showDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-500">Category</p>
                <Badge color={categoryColors[showDetail.category] || "slate"}>{showDetail.category.replace(/_/g, " ")}</Badge>
              </div>
              <div>
                <p className="text-xs text-slate-500">Priority</p>
                <Badge color={priorityColors[showDetail.priority] || "slate"}>{showDetail.priority}</Badge>
              </div>
              <div>
                <p className="text-xs text-slate-500">Status</p>
                <Badge color={statusColors[showDetail.status] || "slate"}>{showDetail.status}</Badge>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs font-medium text-slate-400 mb-1">Description</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{showDetail.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500">Filed By</p>
                <p className="text-slate-600 dark:text-slate-300">{showDetail.isAnonymous ? "Anonymous" : showDetail.filedByName || showDetail.filedBy}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Filed On</p>
                <p className="text-slate-600 dark:text-slate-300">{formatDateTime(showDetail.filedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Assigned To</p>
                <p className="text-slate-600 dark:text-slate-300">{showDetail.assignedToName || "Unassigned"}</p>
              </div>
              {showDetail.resolvedAt && (
                <div>
                  <p className="text-xs text-slate-500">Resolved On</p>
                  <p className="text-slate-600 dark:text-slate-300">{formatDateTime(showDetail.resolvedAt)}</p>
                </div>
              )}
            </div>

            {showDetail.resolution && (
              <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                <p className="text-xs font-medium text-green-400 mb-1">Resolution</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{showDetail.resolution}</p>
              </div>
            )}

            {(showDetail.status === "OPEN" || showDetail.status === "INVESTIGATING") && (isAdmin || isHR) && (
              <>
                <Textarea label="Resolution Notes" placeholder="Describe how this was resolved..." value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} />
                <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
                  <Button variant="ghost" onClick={() => handleEscalate(showDetail.id)}>Escalate</Button>
                  <Button onClick={() => handleResolve(showDetail.id)} loading={submitting} disabled={!resolveNote}>Resolve</Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
