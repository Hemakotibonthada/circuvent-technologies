"use client";

import React, { useState, useMemo } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, StatCard, Badge, Button,
  DataTable, Modal, Input, Select, Textarea, Tabs, EmptyState,
} from "@/components/ui";
import { formatDate, timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

/* ── Types ──────────────────────────────────────────────── */

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";
type PipelineStatus = "IDLE" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "PARTIALLY_SUCCEEDED";
type TriggerType = "MANUAL" | "CI" | "SCHEDULE" | "WEBHOOK" | "PR";

interface Pipeline {
  id: string;
  name: string;
  description: string;
  repositoryUrl: string;
  defaultBranch: string;
  status: PipelineStatus;
  runCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  lastRunId: string | null;
}

interface PipelineRun {
  id: string;
  pipelineId: string;
  pipelineName: string;
  runNumber: number;
  status: PipelineStatus;
  trigger: TriggerType;
  branch: string;
  commitHash: string;
  commitMessage: string;
  startedAt: string;
  completedAt: string | null;
  duration: number;
  triggeredBy: string;
}

/* ── Color maps ─────────────────────────────────────────── */

const statusColors: Record<PipelineStatus, BadgeColor> = {
  IDLE: "slate", RUNNING: "blue", SUCCEEDED: "green", FAILED: "red", CANCELLED: "amber", PARTIALLY_SUCCEEDED: "orange",
};

const triggerColors: Record<TriggerType, BadgeColor> = {
  MANUAL: "slate", CI: "blue", SCHEDULE: "purple", WEBHOOK: "cyan", PR: "green",
};

/* ── Pipelines Page ─────────────────────────────────────── */

export default function PipelinesPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [createModal, setCreateModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [triggerModal, setTriggerModal] = useState(false);
  const [triggerBranch, setTriggerBranch] = useState("main");

  const [newPipeline, setNewPipeline] = useState({
    name: "", description: "", repositoryUrl: "", defaultBranch: "main", tags: "",
  });

  const { data: pipelines, refetch: mutatePipelines } = useApi<Pipeline[]>("/hr-payroll/devflow/pipelines");
  const { data: selectedRuns } = useApi<PipelineRun[]>(
    selectedPipeline ? `/hr-payroll/devflow/pipelines/${selectedPipeline.id}/runs` : null,
  );

  const filtered = useMemo(() => {
    let list = pipelines ?? [];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (statusFilter !== "ALL") {
      list = list.filter((p) => p.status === statusFilter);
    }
    return list;
  }, [pipelines, search, statusFilter]);

  const stats = useMemo(() => {
    const all = pipelines ?? [];
    return {
      total: all.length,
      running: all.filter((p) => p.status === "RUNNING").length,
      succeeded: all.filter((p) => p.status === "SUCCEEDED").length,
      failed: all.filter((p) => p.status === "FAILED").length,
    };
  }, [pipelines]);

  const handleCreate = async () => {
    await api.post("/hr-payroll/devflow/pipelines", {
      ...newPipeline,
      tags: newPipeline.tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setCreateModal(false);
    setNewPipeline({ name: "", description: "", repositoryUrl: "", defaultBranch: "main", tags: "" });
    mutatePipelines();
  };

  const handleTrigger = async () => {
    if (!selectedPipeline) return;
    await api.post(`/hr-payroll/devflow/pipelines/${selectedPipeline.id}/trigger`, { branch: triggerBranch, trigger: "MANUAL" });
    setTriggerModal(false);
    setTriggerBranch("main");
    mutatePipelines();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/hr-payroll/devflow/pipelines/${id}`);
    mutatePipelines();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline Management"
        subtitle="Create, configure, and manage CI/CD pipelines"
        actions={
          <Button onClick={() => setCreateModal(true)}>
            New Pipeline
          </Button>
        }
      />

      {/* ── Stats ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total" value={stats.total} icon="🔧" />
        <StatCard title="Running" value={stats.running} icon="▶️" />
        <StatCard title="Succeeded" value={stats.succeeded} icon="✅" />
        <StatCard title="Failed" value={stats.failed} icon="❌" />
      </div>

      {/* ── Filters ──────────────────────────────────────── */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Search pipelines..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "ALL", label: "All Statuses" },
              { value: "IDLE", label: "Idle" },
              { value: "RUNNING", label: "Running" },
              { value: "SUCCEEDED", label: "Succeeded" },
              { value: "FAILED", label: "Failed" },
              { value: "CANCELLED", label: "Cancelled" },
            ]}
          />
        </div>
      </Card>

      {/* ── Pipeline Table ───────────────────────────────── */}
      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            title="No pipelines found"
            description={search || statusFilter !== "ALL" ? "Try adjusting your filters" : "Create your first CI/CD pipeline"}
          />
        ) : (
          <DataTable
            columns={[{ key: "name", header: "Pipeline",
                render: (p: Pipeline) => (
                  <button
                    className="text-left"
                    onClick={() => { setSelectedPipeline(p); setDetailModal(true); }}
                  >
                    <p className="font-medium text-blue-600 dark:text-blue-400 hover:underline">{p.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">{p.description}</p>
                  </button>
                ),
              }, { key: "repositoryUrl", header: "Repository",
                render: (p: Pipeline) => <span className="text-sm font-mono text-gray-600 dark:text-gray-400 truncate max-w-[200px] block">{p.repositoryUrl}</span>,
              }, { key: "status", header: "Status",
                render: (p: Pipeline) => <Badge color={statusColors[p.status]}>{p.status}</Badge>,
              }, { key: "runCount", header: "Runs",
                render: (p: Pipeline) => <span className="text-sm text-gray-700 dark:text-gray-300">{p.runCount}</span>,
              }, { key: "tags", header: "Tags",
                render: (p: Pipeline) => (
                  <div className="flex flex-wrap gap-1">
                    {p.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">{tag}</span>
                    ))}
                  </div>
                ),
              }, { key: "updatedAt", header: "Updated",
                render: (p: Pipeline) => <span className="text-sm text-gray-500 dark:text-gray-400">{timeAgo(p.updatedAt)}</span>,
              }, { key: "actions", header: "",
                render: (p: Pipeline) => (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedPipeline(p); setTriggerModal(true); }}>▶</Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}>🗑</Button>
                  </div>
                ),
              },
            ]}
            data={filtered}
            keyExtractor={(p: Pipeline) => p.id}
            emptyMessage="No pipelines match your filters"
          />
        )}
      </Card>

      {/* ── Create Pipeline Modal ────────────────────────── */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Pipeline">
        <div className="space-y-4">
          <Input label="Name" required value={newPipeline.name} onChange={(e) => setNewPipeline({ ...newPipeline, name: e.target.value })} placeholder="e.g., Build & Deploy API" />
          <Textarea label="Description" value={newPipeline.description} onChange={(e) => setNewPipeline({ ...newPipeline, description: e.target.value })} placeholder="Pipeline description..." />
          <Input label="Repository URL" required value={newPipeline.repositoryUrl} onChange={(e) => setNewPipeline({ ...newPipeline, repositoryUrl: e.target.value })} placeholder="https://github.com/org/repo" />
          <Input label="Default Branch" value={newPipeline.defaultBranch} onChange={(e) => setNewPipeline({ ...newPipeline, defaultBranch: e.target.value })} />
          <Input label="Tags (comma separated)" value={newPipeline.tags} onChange={(e) => setNewPipeline({ ...newPipeline, tags: e.target.value })} placeholder="frontend, production, auto" />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newPipeline.name || !newPipeline.repositoryUrl}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* ── Pipeline Detail Modal ────────────────────────── */}
      <Modal open={detailModal} onClose={() => { setDetailModal(false); setSelectedPipeline(null); }} title={selectedPipeline?.name ?? "Pipeline Details"}>
        {selectedPipeline && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Status</span>
                <div className="mt-1"><Badge color={statusColors[selectedPipeline.status]}>{selectedPipeline.status}</Badge></div>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Default Branch</span>
                <p className="mt-1 font-mono text-gray-900 dark:text-white">{selectedPipeline.defaultBranch}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Repository</span>
                <p className="mt-1 text-gray-900 dark:text-white truncate">{selectedPipeline.repositoryUrl}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Total Runs</span>
                <p className="mt-1 text-gray-900 dark:text-white">{selectedPipeline.runCount}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Created</span>
                <p className="mt-1 text-gray-900 dark:text-white">{formatDate(selectedPipeline.createdAt)}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Created By</span>
                <p className="mt-1 text-gray-900 dark:text-white">{selectedPipeline.createdBy}</p>
              </div>
            </div>
            {selectedPipeline.tags.length > 0 && (
              <div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Tags</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedPipeline.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">{tag}</span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Recent Runs</h5>
              {(selectedRuns ?? []).length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No runs yet</p>
              ) : (
                <div className="space-y-2">
                  {(selectedRuns ?? []).slice(0, 5).map((run) => (
                    <div key={run.id} className="flex items-center justify-between p-2 rounded border border-gray-200 dark:border-gray-700 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-gray-600 dark:text-gray-400">#{run.runNumber}</span>
                        <Badge color={statusColors[run.status]}>{run.status}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                        <span>{run.branch}</span>
                        <span>{run.duration}s</span>
                        <span>{timeAgo(run.startedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setDetailModal(false)}>Close</Button>
              <Button onClick={() => { setTriggerModal(true); setDetailModal(false); }}>Trigger Run</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Trigger Modal ────────────────────────────────── */}
      <Modal open={triggerModal} onClose={() => { setTriggerModal(false); }} title="Trigger Pipeline">
        {selectedPipeline && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Pipeline</p>
              <p className="font-medium text-gray-900 dark:text-white">{selectedPipeline.name}</p>
            </div>
            <Input label="Branch" value={triggerBranch} onChange={(e) => setTriggerBranch(e.target.value)} placeholder="main" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setTriggerModal(false)}>Cancel</Button>
              <Button onClick={handleTrigger}>Run</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
