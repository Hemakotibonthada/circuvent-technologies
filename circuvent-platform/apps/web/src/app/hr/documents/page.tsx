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

const docStatusColors: Record<string, BadgeColor> = {
  GENERATED: "green",
  PENDING: "amber",
  FAILED: "red",
  EXPIRED: "slate",
};

const categoryColors: Record<string, BadgeColor> = {
  OFFER_LETTER: "blue",
  EXPERIENCE_LETTER: "green",
  SALARY_SLIP: "purple",
  NDA: "red",
  EMPLOYMENT_VERIFICATION: "cyan",
  RELIEVING_LETTER: "amber",
  APPRAISAL_LETTER: "pink",
  WARNING_LETTER: "orange",
  CUSTOM: "slate",
};

/* ── types ──────────────────────────────────────────────── */

interface DocTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  variables: string[];
  isActive: boolean;
  createdAt: string;
}

interface GeneratedDocument {
  id: string;
  templateId: string;
  templateName?: string;
  employeeId: string;
  employeeName?: string;
  category: string;
  status: string;
  generatedAt: string;
  downloadUrl?: string;
  variables: Record<string, string>;
}

interface DocStats {
  totalTemplates: number;
  activeTemplates: number;
  documentsGenerated: number;
  documentsThisMonth: number;
}

/* ── component ──────────────────────────────────────────── */

export default function DocumentManagementPage() {
  const { token, isAdmin, isHR } = useAuth();

  const [activeTab, setActiveTab] = useState("templates");
  const tabs = [
    { id: "templates", label: "Templates" }, { key: "generated", label: "Generated Documents" },
  ];

  /* ── data ─────────────────────────────────────────────── */
  const { data: templates, loading: tmplLoading, refetch: refetchTmpl } = useApi<DocTemplate[]>("/hr/documents/templates");
  const { data: documents, loading: docLoading, refetch: refetchDocs } = useApi<GeneratedDocument[]>("/hr/documents");
  const { data: stats } = useApi<DocStats>("/hr/documents/stats");

  /* ── state ────────────────────────────────────────────── */
  const [showGenerate, setShowGenerate] = useState<DocTemplate | null>(null);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [templateForm, setTemplateForm] = useState({
    name: "", category: "CUSTOM", description: "", variables: "",
  });

  const [generateVars, setGenerateVars] = useState<Record<string, string>>({});
  const [generateEmployeeId, setGenerateEmployeeId] = useState("");

  /* ── helpers ──────────────────────────────────────────── */
  const flash = (type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  /* ── actions ──────────────────────────────────────────── */
  const handleCreateTemplate = async () => {
    setSubmitting(true);
    const vars = templateForm.variables.split(",").map((v) => v.trim()).filter(Boolean);
    const res = await api.post("/hr/documents/templates", {
      ...templateForm, variables: vars,
    }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Template created");
      setShowCreateTemplate(false);
      setTemplateForm({ name: "", category: "CUSTOM", description: "", variables: "" });
      refetchTmpl();
    } else flash("error", res.error || "Failed to create template");
  };

  const openGenerate = (tmpl: DocTemplate) => {
    const vars: Record<string, string> = {};
    (tmpl.variables || []).forEach((v) => { vars[v] = ""; });
    setGenerateVars(vars);
    setGenerateEmployeeId("");
    setShowGenerate(tmpl);
  };

  const handleGenerate = async () => {
    if (!showGenerate) return;
    setSubmitting(true);
    const res = await api.post("/hr/documents/generate", {
      templateId: showGenerate.id,
      employeeId: generateEmployeeId,
      variables: generateVars,
    }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Document generated successfully");
      setShowGenerate(null);
      refetchDocs();
    } else flash("error", res.error || "Generation failed");
  };

  const handleSeedDefaults = async () => {
    setSubmitting(true);
    const res = await api.post("/hr/documents/templates/seed", {}, token || undefined);
    setSubmitting(false);
    if (res.success) { flash("success", "Default templates seeded"); refetchTmpl(); }
    else flash("error", res.error || "Seed failed");
  };

  const handleDownload = async (doc: GeneratedDocument) => {
    if (doc.downloadUrl) {
      window.open(doc.downloadUrl, "_blank");
    } else {
      flash("error", "Download URL not available");
    }
  };

  const handleToggleTemplate = async (id: string, isActive: boolean) => {
    const res = await api.patch(`/hr/documents/templates/${id}`, { isActive: !isActive }, token || undefined);
    if (res.success) { flash("success", `Template ${!isActive ? "activated" : "deactivated"}`); refetchTmpl(); }
    else flash("error", res.error || "Failed");
  };

  /* ── columns ──────────────────────────────────────────── */
  const templateColumns = [
    {
      id: "name", header: "Template",
      render: (t: DocTemplate) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{t.name}</p>
          <p className="text-xs text-slate-500">{t.description?.slice(0, 80)}</p>
        </div>
      ),
    }, { key: "category", header: "Category", render: (t: DocTemplate) => <Badge color={categoryColors[t.category] || "slate"}>{t.category.replace(/_/g, " ")}</Badge> }, { key: "variables", header: "Variables",
      render: (t: DocTemplate) => (
        <div className="flex flex-wrap gap-1">
          {(t.variables || []).slice(0, 4).map((v) => (
            <span key={v} className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">{`{{${v}}}`}</span>
          ))}
          {(t.variables || []).length > 4 && <span className="text-xs text-slate-500">+{t.variables.length - 4}</span>}
        </div>
      ),
    }, { key: "isActive", header: "Status",
      render: (t: DocTemplate) => (
        <button
          onClick={() => handleToggleTemplate(t.id, t.isActive)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${t.isActive ? "bg-brand-600" : "bg-slate-100 dark:bg-slate-700"}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${t.isActive ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      ),
    }, { key: "actions", header: "",
      render: (t: DocTemplate) => t.isActive ? (
        <Button size="sm" variant="outline" onClick={() => openGenerate(t)}>Generate</Button>
      ) : null,
    },
  ];

  const docColumns = [
    { id: "templateName", header: "Template", render: (d: GeneratedDocument) => <span className="font-medium text-slate-900 dark:text-white">{d.templateName || d.templateId}</span> }, { key: "category", header: "Category", render: (d: GeneratedDocument) => <Badge color={categoryColors[d.category] || "slate"}>{d.category.replace(/_/g, " ")}</Badge> }, { key: "employeeName", header: "Employee", render: (d: GeneratedDocument) => d.employeeName || d.employeeId }, { key: "status", header: "Status", render: (d: GeneratedDocument) => <Badge color={docStatusColors[d.status] || "slate"}>{d.status}</Badge> }, { key: "generatedAt", header: "Generated", render: (d: GeneratedDocument) => formatDateTime(d.generatedAt) }, { key: "actions", header: "",
      render: (d: GeneratedDocument) => d.status === "GENERATED" ? (
        <Button size="sm" variant="ghost" onClick={() => handleDownload(d)}>Download</Button>
      ) : null,
    },
  ];

  const s = stats || { totalTemplates: 0, activeTemplates: 0, documentsGenerated: 0, documentsThisMonth: 0 };

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`fixed right-4 top-4 z-[100] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          feedback.type === "success" ? "border border-green-200 dark:border-green-500/30 bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400"
            : "border border-red-200 dark:border-red-500/30 bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400"
        }`}>{feedback.msg}</div>
      )}

      <PageHeader
        title="Document Management"
        subtitle="Templates, generation, and document tracking"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Documents" }]}
        actions={
          (isAdmin || isHR) ? (
            <div className="flex gap-2">
              <Button onClick={() => setShowCreateTemplate(true)}>+ Template</Button>
              <Button variant="secondary" onClick={handleSeedDefaults} loading={submitting}>Seed Defaults</Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="Total Templates" value={s.totalTemplates} color="blue" />
        <StatCard title="Active" value={s.activeTemplates} color="green" />
        <StatCard title="Docs Generated" value={s.documentsGenerated} color="purple" />
        <StatCard title="This Month" value={s.documentsThisMonth} color="cyan" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <Card>
        {activeTab === "templates" && (
          <>
            <CardHeader title="Document Templates" subtitle="Available templates for document generation" />
            <DataTable columns={templateColumns} data={templates || []} keyExtractor={(t) => t.id} loading={tmplLoading} emptyMessage="No templates found. Click 'Seed Defaults' to add standard templates." />
          </>
        )}
        {activeTab === "generated" && (
          <>
            <CardHeader title="Generated Documents" subtitle="All generated documents" />
            <DataTable columns={docColumns} data={documents || []} keyExtractor={(d) => d.id} loading={docLoading} emptyMessage="No documents generated yet." />
          </>
        )}
      </Card>

      {/* ── create template modal ───────────────────────── */}
      <Modal open={showCreateTemplate} onClose={() => setShowCreateTemplate(false)} title="Create Document Template" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Template Name" placeholder="Offer Letter – Standard" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
            <Select label="Category" options={[
              { value: "OFFER_LETTER", label: "Offer Letter" },
              { value: "EXPERIENCE_LETTER", label: "Experience Letter" },
              { value: "SALARY_SLIP", label: "Salary Slip" },
              { value: "NDA", label: "NDA" },
              { value: "EMPLOYMENT_VERIFICATION", label: "Employment Verification" },
              { value: "RELIEVING_LETTER", label: "Relieving Letter" },
              { value: "APPRAISAL_LETTER", label: "Appraisal Letter" },
              { value: "WARNING_LETTER", label: "Warning Letter" },
              { value: "CUSTOM", label: "Custom" },
            ]} value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })} />
          </div>
          <Textarea label="Description" placeholder="Describe the template purpose..." value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} />
          <Input label="Variables (comma-separated)" placeholder="employeeName, designation, joiningDate, salary" value={templateForm.variables} onChange={(e) => setTemplateForm({ ...templateForm, variables: e.target.value })} />
          <p className="text-xs text-slate-500">Variables will be used as placeholders in the document. Use camelCase names.</p>
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowCreateTemplate(false)}>Cancel</Button>
            <Button onClick={handleCreateTemplate} loading={submitting} disabled={!templateForm.name}>Create Template</Button>
          </div>
        </div>
      </Modal>

      {/* ── generate document modal ─────────────────────── */}
      <Modal open={!!showGenerate} onClose={() => setShowGenerate(null)} title={`Generate: ${showGenerate?.name || ""}`} size="lg">
        <div className="space-y-4">
          <Input label="Employee ID" placeholder="emp_xxxxxxxx" value={generateEmployeeId} onChange={(e) => setGenerateEmployeeId(e.target.value)} />

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Template Variables</h4>
            <div className="grid grid-cols-2 gap-3">
              {Object.keys(generateVars).map((key) => (
                <Input
                  key={key}
                  label={key}
                  placeholder={`Enter ${key}...`}
                  value={generateVars[key]}
                  onChange={(e) => setGenerateVars({ ...generateVars, [key]: e.target.value })}
                />
              ))}
            </div>
            {Object.keys(generateVars).length === 0 && (
              <p className="text-xs text-slate-500">No variables required for this template.</p>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowGenerate(null)}>Cancel</Button>
            <Button onClick={handleGenerate} loading={submitting} disabled={!generateEmployeeId}>Generate Document</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
