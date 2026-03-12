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

const templateStatusColors: Record<string, BadgeColor> = {
  ACTIVE: "green",
  DRAFT: "slate",
  ARCHIVED: "amber",
};

const instanceStatusColors: Record<string, BadgeColor> = {
  RUNNING: "blue",
  COMPLETED: "green",
  FAILED: "red",
  PAUSED: "amber",
  CANCELLED: "slate",
};

const stepStatusColors: Record<string, BadgeColor> = {
  PENDING: "slate",
  IN_PROGRESS: "blue",
  COMPLETED: "green",
  FAILED: "red",
  SKIPPED: "amber",
};

const triggerColors: Record<string, BadgeColor> = {
  MANUAL: "blue",
  ON_EVENT: "purple",
  SCHEDULED: "cyan",
  ON_CONDITION: "amber",
};

/* ── types ──────────────────────────────────────────────── */

interface WorkflowStep {
  id: string;
  name: string;
  type: string;
  order: number;
  config: Record<string, any>;
  status?: string;
  completedAt?: string;
  error?: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  trigger: string;
  status: string;
  steps: WorkflowStep[];
  createdAt: string;
  executionCount: number;
  lastRun?: string;
}

interface WorkflowInstance {
  id: string;
  templateId: string;
  templateName?: string;
  status: string;
  triggeredBy?: string;
  triggeredByName?: string;
  startedAt: string;
  completedAt?: string;
  currentStep: number;
  totalSteps: number;
  steps: WorkflowStep[];
  error?: string;
}

interface WorkflowLog {
  id: string;
  instanceId: string;
  templateName?: string;
  stepName: string;
  level: string;
  message: string;
  timestamp: string;
}

interface WorkflowStats {
  activeTemplates: number;
  totalExecutions: number;
  runningInstances: number;
  successRate: number;
  failedThisWeek: number;
  avgDuration: string;
}

/* ── component ──────────────────────────────────────────── */

export default function WorkflowAutomationPage() {
  const { token, user, isAdmin, isHR } = useAuth();

  const [activeTab, setActiveTab] = useState("templates");
  const tabs = [
    { id: "templates", label: "Templates" },
    { id: "instances", label: "Running Instances" },
    { id: "logs", label: "Logs" },
  ];

  /* ── data ─────────────────────────────────────────────── */
  const { data: templates, loading: tmplLoading, refetch: refetchTmpl } = useApi<WorkflowTemplate[]>("/hr/workflows/templates");
  const { data: instances, loading: instLoading, refetch: refetchInst } = useApi<WorkflowInstance[]>("/hr/workflows/instances");
  const { data: logs, loading: logsLoading } = useApi<WorkflowLog[]>("/hr/workflows/logs");
  const { data: stats } = useApi<WorkflowStats>("/hr/workflows/stats");

  /* ── state ────────────────────────────────────────────── */
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<WorkflowInstance | null>(null);
  const [showTrigger, setShowTrigger] = useState<WorkflowTemplate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [form, setForm] = useState({
    name: "", description: "", category: "HR", trigger: "MANUAL",
  });

  const [steps, setSteps] = useState<Array<{
    name: string; type: string; config: string;
  }>>([
    { name: "", type: "ACTION", config: "" },
  ]);

  const [triggerParams, setTriggerParams] = useState("");

  /* ── helpers ──────────────────────────────────────────── */
  const flash = (type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  /* ── actions ──────────────────────────────────────────── */
  const handleCreate = async () => {
    setSubmitting(true);
    const body = {
      ...form,
      steps: steps
        .filter((s) => s.name.trim())
        .map((s, i) => ({
          name: s.name,
          type: s.type,
          order: i + 1,
          config: s.config ? (() => { try { return JSON.parse(s.config); } catch { return {}; } })() : {},
        })),
    };
    const res = await api.post("/hr/workflows/templates", body, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Workflow template created");
      setShowCreate(false);
      setForm({ name: "", description: "", category: "HR", trigger: "MANUAL" });
      setSteps([{ name: "", type: "ACTION", config: "" }]);
      refetchTmpl();
    } else flash("error", res.error || "Failed to create workflow");
  };

  const handleTrigger = async () => {
    if (!showTrigger) return;
    setSubmitting(true);
    let params = {};
    if (triggerParams.trim()) {
      try { params = JSON.parse(triggerParams); } catch { /* use empty */ }
    }
    const res = await api.post(`/hr/workflows/templates/${showTrigger.id}/trigger`, { params }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Workflow triggered");
      setShowTrigger(null);
      setTriggerParams("");
      refetchInst();
    } else flash("error", res.error || "Trigger failed");
  };

  const handlePause = async (id: string) => {
    const res = await api.patch(`/hr/workflows/instances/${id}/pause`, {}, token || undefined);
    if (res.success) { flash("success", "Instance paused"); refetchInst(); }
    else flash("error", res.error || "Failed");
  };

  const handleResume = async (id: string) => {
    const res = await api.patch(`/hr/workflows/instances/${id}/resume`, {}, token || undefined);
    if (res.success) { flash("success", "Instance resumed"); refetchInst(); }
    else flash("error", res.error || "Failed");
  };

  const handleCancel = async (id: string) => {
    const res = await api.patch(`/hr/workflows/instances/${id}/cancel`, {}, token || undefined);
    if (res.success) { flash("success", "Instance cancelled"); refetchInst(); }
    else flash("error", res.error || "Failed");
  };

  /* ── step builder helpers ─────────────────────────────── */
  const addStep = () => setSteps([...steps, { name: "", type: "ACTION", config: "" }]);
  const removeStep = (idx: number) => setSteps(steps.filter((_, i) => i !== idx));
  const updateStep = (idx: number, field: string, value: string) => {
    const next = [...steps];
    next[idx] = { ...next[idx], [field]: value };
    setSteps(next);
  };

  /* ── columns ──────────────────────────────────────────── */
  const templateColumns = [
    {
      key: "name", header: "Workflow",
      render: (t: WorkflowTemplate) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{t.name}</p>
          <p className="text-xs text-slate-500">{t.description?.slice(0, 60)}</p>
        </div>
      ),
    },
    { key: "category", header: "Category", render: (t: WorkflowTemplate) => <Badge color="blue">{t.category}</Badge> },
    { key: "trigger", header: "Trigger", render: (t: WorkflowTemplate) => <Badge color={triggerColors[t.trigger] || "slate"}>{t.trigger}</Badge> },
    { key: "steps", header: "Steps", render: (t: WorkflowTemplate) => <span className="text-slate-400">{t.steps?.length || 0}</span> },
    { key: "status", header: "Status", render: (t: WorkflowTemplate) => <Badge color={templateStatusColors[t.status] || "slate"}>{t.status}</Badge> },
    { key: "executionCount", header: "Runs", render: (t: WorkflowTemplate) => t.executionCount },
    { key: "lastRun", header: "Last Run", render: (t: WorkflowTemplate) => t.lastRun ? formatDate(t.lastRun) : "—" },
    {
      key: "actions", header: "",
      render: (t: WorkflowTemplate) => t.status === "ACTIVE" && t.trigger === "MANUAL" ? (
        <Button size="sm" variant="outline" onClick={() => { setShowTrigger(t); setTriggerParams(""); }}>
          Trigger
        </Button>
      ) : null,
    },
  ];

  const instanceColumns = [
    { key: "templateName", header: "Workflow", render: (i: WorkflowInstance) => <span className="font-medium text-slate-900 dark:text-white">{i.templateName || i.templateId}</span> },
    { key: "status", header: "Status", render: (i: WorkflowInstance) => <Badge color={instanceStatusColors[i.status] || "slate"}>{i.status}</Badge> },
    {
      key: "progress", header: "Progress",
      render: (i: WorkflowInstance) => {
        const pct = i.totalSteps > 0 ? Math.round((i.currentStep / i.totalSteps) * 100) : 0;
        return (
          <div className="flex items-center gap-2">
            <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-slate-400">{i.currentStep}/{i.totalSteps}</span>
          </div>
        );
      },
    },
    { key: "triggeredByName", header: "Triggered By", render: (i: WorkflowInstance) => i.triggeredByName || "System" },
    { key: "startedAt", header: "Started", render: (i: WorkflowInstance) => formatDateTime(i.startedAt) },
    { key: "completedAt", header: "Completed", render: (i: WorkflowInstance) => i.completedAt ? formatDateTime(i.completedAt) : "—" },
    {
      key: "actions", header: "",
      render: (i: WorkflowInstance) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowDetail(i)}>Details</Button>
          {i.status === "RUNNING" && (
            <>
              <Button size="sm" variant="outline" onClick={() => handlePause(i.id)}>Pause</Button>
              <Button size="sm" variant="danger" onClick={() => handleCancel(i.id)}>Cancel</Button>
            </>
          )}
          {i.status === "PAUSED" && (
            <Button size="sm" variant="outline" onClick={() => handleResume(i.id)}>Resume</Button>
          )}
        </div>
      ),
    },
  ];

  const logColumns = [
    { key: "timestamp", header: "Time", render: (l: WorkflowLog) => <span className="text-xs font-mono">{formatDateTime(l.timestamp)}</span> },
    { key: "templateName", header: "Workflow", render: (l: WorkflowLog) => l.templateName || l.instanceId },
    { key: "stepName", header: "Step", render: (l: WorkflowLog) => <span className="text-slate-600 dark:text-slate-300">{l.stepName}</span> },
    {
      key: "level", header: "Level",
      render: (l: WorkflowLog) => (
        <Badge color={l.level === "ERROR" ? "red" : l.level === "WARN" ? "amber" : l.level === "INFO" ? "blue" : "slate"}>
          {l.level}
        </Badge>
      ),
    },
    { key: "message", header: "Message", render: (l: WorkflowLog) => <span className="text-sm text-slate-400">{l.message}</span> },
  ];

  const s = stats || { activeTemplates: 0, totalExecutions: 0, runningInstances: 0, successRate: 0, failedThisWeek: 0, avgDuration: "—" };

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`fixed right-4 top-4 z-[100] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          feedback.type === "success" ? "border border-green-500/30 bg-green-500/10 text-green-400"
            : "border border-red-500/30 bg-red-500/10 text-red-400"
        }`}>{feedback.msg}</div>
      )}

      <PageHeader
        title="Workflow Automation"
        subtitle="Design, trigger, and monitor automated workflows"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Workflows" }]}
        actions={
          (isAdmin || isHR) ? <Button onClick={() => setShowCreate(true)}>+ New Workflow</Button> : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard title="Active Templates" value={s.activeTemplates} color="blue" />
        <StatCard title="Total Executions" value={s.totalExecutions} color="purple" />
        <StatCard title="Running" value={s.runningInstances} color="cyan" />
        <StatCard title="Success Rate" value={`${s.successRate}%`} color="green" />
        <StatCard title="Failed (Week)" value={s.failedThisWeek} color="red" />
        <StatCard title="Avg Duration" value={s.avgDuration} color="amber" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <Card>
        {activeTab === "templates" && (
          <>
            <CardHeader title="Workflow Templates" subtitle="Defined automation workflows" />
            <DataTable columns={templateColumns} data={templates || []} keyExtractor={(t) => t.id} loading={tmplLoading} emptyMessage="No workflow templates. Create one to automate processes." />
          </>
        )}
        {activeTab === "instances" && (
          <>
            <CardHeader title="Workflow Instances" subtitle="Running and recent executions" />
            <DataTable columns={instanceColumns} data={instances || []} keyExtractor={(i) => i.id} loading={instLoading} emptyMessage="No workflow instances." />
          </>
        )}
        {activeTab === "logs" && (
          <>
            <CardHeader title="Execution Logs" subtitle="Detailed workflow execution logs" />
            <DataTable columns={logColumns} data={logs || []} keyExtractor={(l) => l.id} loading={logsLoading} emptyMessage="No logs available." />
          </>
        )}
      </Card>

      {/* ── create template modal ───────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Workflow Template" size="xl">
        <div className="max-h-[70vh] space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Workflow Name" placeholder="Employee Onboarding" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label="Category" options={[
              { value: "HR", label: "HR" },
              { value: "FINANCE", label: "Finance" },
              { value: "IT", label: "IT" },
              { value: "OPERATIONS", label: "Operations" },
              { value: "CUSTOM", label: "Custom" },
            ]} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <Textarea label="Description" placeholder="What does this workflow automate?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Select label="Trigger Type" options={[
            { value: "MANUAL", label: "Manual – Triggered by user" },
            { value: "ON_EVENT", label: "Event – Triggered on system event" },
            { value: "SCHEDULED", label: "Scheduled – Runs on schedule" },
            { value: "ON_CONDITION", label: "Condition – Runs when condition met" },
          ]} value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })} />

          {/* step builder */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7004">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Workflow Steps</h4>
              <Button size="sm" variant="outline" onClick={addStep}>+ Add Step</Button>
            </div>
            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600/20 text-xs font-bold text-brand-400 mt-1">
                      {idx + 1}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="Step name" value={step.name} onChange={(e) => updateStep(idx, "name", e.target.value)} />
                        <Select options={[
                          { value: "ACTION", label: "Action" },
                          { value: "APPROVAL", label: "Approval" },
                          { value: "NOTIFICATION", label: "Notification" },
                          { value: "CONDITION", label: "Condition" },
                          { value: "DELAY", label: "Delay" },
                          { value: "INTEGRATION", label: "Integration" },
                        ]} value={step.type} onChange={(e) => updateStep(idx, "type", e.target.value)} />
                      </div>
                      <Input placeholder='Config JSON (optional): {"email": "hr@company.com"}' value={step.config} onChange={(e) => updateStep(idx, "config", e.target.value)} />
                    </div>
                    {steps.length > 1 && (
                      <Button size="sm" variant="danger" onClick={() => removeStep(idx)}>✕</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={submitting} disabled={!form.name || steps.every((s) => !s.name.trim())}>
              Create Workflow
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── trigger modal ───────────────────────────────── */}
      <Modal open={!!showTrigger} onClose={() => setShowTrigger(null)} title={`Trigger: ${showTrigger?.name || ""}`}>
        <div className="space-y-4">
          <p className="text-sm text-slate-400">{showTrigger?.description}</p>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-sm">
            <span className="text-slate-500">Steps:</span> <span className="text-slate-900 dark:text-white">{showTrigger?.steps?.length || 0}</span>
            <span className="mx-3 text-slate-700">|</span>
            <span className="text-slate-500">Previous Runs:</span> <span className="text-slate-900 dark:text-white">{showTrigger?.executionCount || 0}</span>
          </div>
          <Textarea label="Parameters (JSON, optional)" placeholder='{"employeeId": "emp_001"}' value={triggerParams} onChange={(e) => setTriggerParams(e.target.value)} />
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowTrigger(null)}>Cancel</Button>
            <Button onClick={handleTrigger} loading={submitting}>Trigger Workflow</Button>
          </div>
        </div>
      </Modal>

      {/* ── instance detail modal ───────────────────────── */}
      <Modal open={!!showDetail} onClose={() => setShowDetail(null)} title={`Instance: ${showDetail?.templateName || ""}`} size="lg">
        {showDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500">Status</p>
                <Badge color={instanceStatusColors[showDetail.status] || "slate"}>{showDetail.status}</Badge>
              </div>
              <div>
                <p className="text-xs text-slate-500">Started</p>
                <p className="text-slate-600 dark:text-slate-300">{formatDateTime(showDetail.startedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Triggered By</p>
                <p className="text-slate-600 dark:text-slate-300">{showDetail.triggeredByName || "System"}</p>
              </div>
            </div>

            {showDetail.error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <p className="text-xs font-medium text-red-400">Error</p>
                <p className="text-sm text-red-300">{showDetail.error}</p>
              </div>
            )}

            {/* step progress */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7004">
              <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Step Progress</h4>
              <div className="space-y-2">
                {(showDetail.steps || []).map((step, idx) => (
                  <div key={step.id || idx} className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      step.status === "COMPLETED" ? "bg-green-500/20 text-green-400"
                      : step.status === "IN_PROGRESS" ? "bg-blue-500/20 text-blue-400"
                      : step.status === "FAILED" ? "bg-red-500/20 text-red-400"
                      : "bg-slate-50 dark:bg-slate-800 text-slate-500"
                    }`}>
                      {step.status === "COMPLETED" ? "✓" : step.status === "FAILED" ? "✕" : idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{step.name}</p>
                      <p className="text-xs text-slate-500">{step.type}</p>
                    </div>
                    <Badge color={stepStatusColors[step.status || "PENDING"] || "slate"}>
                      {step.status || "PENDING"}
                    </Badge>
                    {step.completedAt && (
                      <span className="text-xs text-slate-500">{formatDateTime(step.completedAt)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
