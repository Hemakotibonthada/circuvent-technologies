"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, StatCard, Badge, Button, DataTable, Modal, Input, Select, Textarea } from "@/components/ui";
import { projectStatusColors } from "@/lib/status-colors";
import { formatDate, formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface Project {
  id: string;
  name: string;
  code: string;
  description: string | null;
  type: "SOFTWARE" | "HARDWARE" | "HYBRID";
  status: string;
  isRnD: boolean;
  budget: number | null;
  budgetCurrency: string;
  startDate: string | null;
  createdAt: string;
  _count: { sprints: number; hardwareRevisions: number; devices: number };
  members: any[];
}

interface Dashboard {
  totalProjects: number;
  active: number;
  byType: { type: string; _count: { id: number } }[];
  byStatus: { status: string; _count: { id: number } }[];
  recentProjects: Project[];
}

export default function ProjectsPage() {
  const { token } = useAuth();
  const { data: projects, loading, refetch } = useApi<Project[]>("/projects");
  const { data: dashboard } = useApi<Dashboard>("/projects/dashboard");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    name: "", description: "", type: "SOFTWARE", budget: "", isRnD: false, rnDCategory: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      await api.post("/projects", {
        ...formData,
        budget: formData.budget ? Number(formData.budget) : undefined,
      }, token || undefined);
      setShowCreateModal(false);
      setFormData({ name: "", description: "", type: "SOFTWARE", budget: "", isRnD: false, rnDCategory: "" });
      refetch();
    } catch {
      // error handled by api client
    } finally {
      setSubmitting(false);
    }
  };

  const typeColors: Record<string, string> = { SOFTWARE: "blue", HARDWARE: "amber", HYBRID: "purple" };

  const columns = [
    {
      key: "code",
      header: "Code",
      render: (p: Project) => <span className="font-mono text-xs text-brand-400">{p.code}</span>,
    },
    {
      key: "name",
      header: "Project Name",
      render: (p: Project) => (
        <div>
          <a href={`/projects/${p.id}`} className="font-medium text-slate-900 dark:text-white hover:text-brand-400">{p.name}</a>
          {p.description && <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{p.description}</p>}
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (p: Project) => <Badge color={typeColors[p.type] as any}>{p.type}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (p: Project) => <Badge color={projectStatusColors[p.status]}>{p.status}</Badge>,
    },
    {
      key: "isRnD",
      header: "R&D",
      render: (p: Project) => p.isRnD ? <Badge color="emerald">R&D</Badge> : <span className="text-slate-600">—</span>,
    },
    {
      key: "sprint_count",
      header: "Sprints",
      render: (p: Project) => <span>{p._count.sprints}</span>,
    },
    {
      key: "hw_count",
      header: "HW Revs",
      render: (p: Project) => <span>{p._count.hardwareRevisions}</span>,
    },
    {
      key: "budget",
      header: "Budget",
      render: (p: Project) => p.budget ? formatCurrency(Number(p.budget), p.budgetCurrency) : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects & Engineering"
        subtitle="Manage software sprints and hardware revisions"
        actions={<Button onClick={() => setShowCreateModal(true)}>+ New Project</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Projects" value={dashboard?.totalProjects ?? "—"} color="blue" />
        <StatCard title="Active" value={dashboard?.active ?? "—"} color="green" />
        <StatCard
          title="Software"
          value={dashboard?.byType.find((t) => t.type === "SOFTWARE")?._count.id ?? 0}
          color="cyan"
        />
        <StatCard
          title="Hardware / Hybrid"
          value={
            (dashboard?.byType.find((t) => t.type === "HARDWARE")?._count.id ?? 0) +
            (dashboard?.byType.find((t) => t.type === "HYBRID")?._count.id ?? 0)
          }
          color="amber"
        />
      </div>

      {/* Projects Table */}
      <Card padding={false}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">All Projects</h3>
        </div>
        <DataTable
          columns={columns}
          data={projects || []}
          keyExtractor={(p) => p.id}
          loading={loading}
          emptyMessage="No projects yet. Create your first project to get started."
        />
      </Card>

      {/* Create Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New Project" size="lg">
        <div className="space-y-4">
          <Input
            label="Project Name"
            placeholder="e.g., Smart IoT Gateway"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <Textarea
            label="Description"
            placeholder="Brief description of the project..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Project Type"
              options={[
                { value: "SOFTWARE", label: "Software" },
                { value: "HARDWARE", label: "Hardware" },
                { value: "HYBRID", label: "Hybrid (SW + HW)" },
              ]}
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            />
            <Input
              label="Budget (INR)"
              type="number"
              placeholder="500000"
              value={formData.budget}
              onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isRnD"
              checked={formData.isRnD}
              onChange={(e) => setFormData({ ...formData, isRnD: e.target.checked })}
              className="rounded border-slate-600 bg-slate-100 dark:bg-slate-800"
            />
            <label htmlFor="isRnD" className="text-sm text-slate-600 dark:text-slate-300">Mark as R&D Project (for tax tagging)</label>
          </div>
          {formData.isRnD && (
            <Select
              label="R&D Category"
              options={[
                { value: "SOFTWARE_DEVELOPMENT", label: "Software Development" },
                { value: "HARDWARE_PROTOTYPING", label: "Hardware Prototyping" },
                { value: "IOT_FIRMWARE", label: "IoT Firmware" },
                { value: "AI_ML_RESEARCH", label: "AI/ML Research" },
              ]}
              value={formData.rnDCategory}
              onChange={(e) => setFormData({ ...formData, rnDCategory: e.target.value })}
            />
          )}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={submitting} disabled={!formData.name}>Create Project</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
