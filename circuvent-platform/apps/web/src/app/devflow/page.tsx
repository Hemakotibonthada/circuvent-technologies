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
type EnvironmentType = "DEVELOPMENT" | "STAGING" | "PRODUCTION" | "QA" | "UAT" | "DR";

interface Pipeline {
  id: string;
  name: string;
  description: string;
  repositoryUrl: string;
  defaultBranch: string;
  status: PipelineStatus;
  lastRunId: string | null;
  runCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
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

interface Environment {
  id: string;
  name: string;
  type: EnvironmentType;
  url: string;
  status: "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";
  lastDeployedAt: string | null;
  lastDeployedRelease: string | null;
}

interface MetricsData {
  velocity: { avgBuildTime: number; deploymentFrequency: number; successRate: number; avgLeadTime: number };
  quality: { codeCoverage: number; bugRate: number; techDebt: number; testPassRate: number };
  deployment: { totalDeployments: number; successfulDeployments: number; rollbacks: number; mttr: number };
}

/* ── Color maps ─────────────────────────────────────────── */

const statusColors: Record<PipelineStatus, BadgeColor> = {
  IDLE: "slate", RUNNING: "blue", SUCCEEDED: "green", FAILED: "red", CANCELLED: "amber", PARTIALLY_SUCCEEDED: "orange",
};

const envStatusColors: Record<string, BadgeColor> = {
  HEALTHY: "green", DEGRADED: "amber", DOWN: "red", UNKNOWN: "slate",
};

const envTypeColors: Record<EnvironmentType, BadgeColor> = {
  DEVELOPMENT: "blue", STAGING: "amber", PRODUCTION: "green", QA: "purple", UAT: "cyan", DR: "red",
};

const triggerColors: Record<TriggerType, BadgeColor> = {
  MANUAL: "slate", CI: "blue", SCHEDULE: "purple", WEBHOOK: "cyan", PR: "green",
};

/* ── DevFlow Dashboard ──────────────────────────────────── */

export default function DevFlowPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [triggerModal, setTriggerModal] = useState(false);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [triggerBranch, setTriggerBranch] = useState("main");

  const { data: pipelines } = useApi<Pipeline[]>("/hr-payroll/devflow/pipelines");
  const { data: runs } = useApi<PipelineRun[]>("/hr-payroll/devflow/runs?limit=20");
  const { data: environments } = useApi<Environment[]>("/hr-payroll/devflow/environments");
  const { data: metrics } = useApi<MetricsData>("/hr-payroll/devflow/analytics/velocity");

  const stats = useMemo(() => {
    const pList = pipelines ?? [];
    const rList = runs ?? [];
    return {
      totalPipelines: pList.length,
      activePipelines: pList.filter((p) => p.status === "RUNNING").length,
      successRate: rList.length > 0 ? Math.round((rList.filter((r) => r.status === "SUCCEEDED").length / rList.length) * 100) : 0,
      totalRuns: rList.length,
      avgBuildTime: metrics?.velocity?.avgBuildTime ?? 0,
      deployFreq: metrics?.velocity?.deploymentFrequency ?? 0,
    };
  }, [pipelines, runs, metrics]);

  const handleTrigger = async () => {
    if (!selectedPipeline) return;
    await api.post(`/hr-payroll/devflow/pipelines/${selectedPipeline.id}/trigger`, { branch: triggerBranch, trigger: "MANUAL" });
    setTriggerModal(false);
    setSelectedPipeline(null);
    setTriggerBranch("main");
  };

  const tabs = [
    { id: "overview", label: "Overview" }, { id: "runs", label: "Recent Runs" }, { id: "environments", label: "Environments" }, { id: "metrics", label: "Metrics" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="DevFlow — CI/CD"
        subtitle="Pipeline management, deployments, and engineering metrics"
        actions={
          <Button onClick={() => setTriggerModal(true)}>
            Trigger Pipeline
          </Button>
        }
      />

      {/* ── Stats ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Pipelines" value={stats.totalPipelines} icon="🔧" />
        <StatCard title="Active" value={stats.activePipelines} icon="▶️" />
        <StatCard title="Success Rate" value={`${stats.successRate}%`} icon="✅" />
        <StatCard title="Total Runs" value={stats.totalRuns} icon="🔄" />
        <StatCard title="Avg Build" value={`${stats.avgBuildTime}s`} icon="⏱️" />
        <StatCard title="Deploy/Week" value={stats.deployFreq} icon="🚀" />
      </div>

      {/* ── Tabs ─────────────────────────────────────────── */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── Overview Tab ─────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pipeline List */}
          <Card>
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Pipelines</h3>
            {(pipelines ?? []).length === 0 ? (
              <EmptyState title="No pipelines" description="Create your first CI/CD pipeline" />
            ) : (
              <div className="space-y-3">
                {(pipelines ?? []).slice(0, 8).map((pipeline) => (
                  <div key={pipeline.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{pipeline.name}</p>
                        <Badge color={statusColors[pipeline.status]}>{pipeline.status}</Badge>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{pipeline.repositoryUrl} · {pipeline.runCount} runs</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSelectedPipeline(pipeline); setTriggerModal(true); }}
                    >
                      ▶
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Run Timeline */}
          <Card>
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Recent Runs</h3>
            {(runs ?? []).length === 0 ? (
              <EmptyState title="No runs yet" description="Trigger a pipeline to see runs" />
            ) : (
              <div className="space-y-3">
                {(runs ?? []).slice(0, 8).map((run) => (
                  <div key={run.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className={`w-2 h-2 rounded-full ${run.status === "SUCCEEDED" ? "bg-green-500" : run.status === "FAILED" ? "bg-red-500" : run.status === "RUNNING" ? "bg-blue-500 animate-pulse" : "bg-gray-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{run.pipelineName} #{run.runNumber}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{run.branch} · {run.commitMessage?.slice(0, 40) ?? ""} · {timeAgo(run.startedAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge color={triggerColors[run.trigger]}>{run.trigger}</Badge>
                      <Badge color={statusColors[run.status]}>{run.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Runs Tab ─────────────────────────────────────── */}
      {activeTab === "runs" && (
        <Card>
          <DataTable
            columns={[{ key: "runNumber", header: "#", render: (r: PipelineRun) => <span className="font-mono text-sm dark:text-gray-300">#{r.runNumber}</span> }, { key: "pipelineName", header: "Pipeline", render: (r: PipelineRun) => <span className="font-medium dark:text-white">{r.pipelineName}</span> }, { key: "branch", header: "Branch", render: (r: PipelineRun) => <span className="font-mono text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded dark:text-gray-300">{r.branch}</span> }, { key: "status", header: "Status", render: (r: PipelineRun) => <Badge color={statusColors[r.status]}>{r.status}</Badge> }, { key: "trigger", header: "Trigger", render: (r: PipelineRun) => <Badge color={triggerColors[r.trigger]}>{r.trigger}</Badge> }, { key: "duration", header: "Duration", render: (r: PipelineRun) => <span className="text-sm dark:text-gray-300">{r.duration}s</span> }, { key: "startedAt", header: "Started", render: (r: PipelineRun) => <span className="text-sm text-gray-500 dark:text-gray-400">{timeAgo(r.startedAt)}</span> }, { key: "triggeredBy", header: "By", render: (r: PipelineRun) => <span className="text-sm dark:text-gray-300">{r.triggeredBy}</span> },
            ]}
            data={runs ?? []}
            keyExtractor={(r: PipelineRun) => r.id}
            emptyMessage="No pipeline runs found"
          />
        </Card>
      )}

      {/* ── Environments Tab ─────────────────────────────── */}
      {activeTab === "environments" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(environments ?? []).length === 0 ? (
            <Card><EmptyState title="No environments" description="Set up deployment environments" /></Card>
          ) : (
            (environments ?? []).map((env) => (
              <Card key={env.id}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-900 dark:text-white">{env.name}</h4>
                  <Badge color={envStatusColors[env.status]}>{env.status}</Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Type</span>
                    <Badge color={envTypeColors[env.type]}>{env.type}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">URL</span>
                    <a href={env.url} className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[180px]" target="_blank" rel="noopener noreferrer">{env.url}</a>
                  </div>
                  {env.lastDeployedAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Last Deploy</span>
                      <span className="text-gray-700 dark:text-gray-300">{timeAgo(env.lastDeployedAt)}</span>
                    </div>
                  )}
                  {env.lastDeployedRelease && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Release</span>
                      <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{env.lastDeployedRelease}</span>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── Metrics Tab ──────────────────────────────────── */}
      {activeTab === "metrics" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Velocity</h4>
            <div className="space-y-3">
              <MetricRow label="Avg Build Time" value={`${metrics?.velocity?.avgBuildTime ?? 0}s`} />
              <MetricRow label="Deploy Frequency" value={`${metrics?.velocity?.deploymentFrequency ?? 0}/week`} />
              <MetricRow label="Success Rate" value={`${metrics?.velocity?.successRate ?? 0}%`} color={((metrics?.velocity?.successRate ?? 0) >= 90) ? "green" : "amber"} />
              <MetricRow label="Lead Time" value={`${metrics?.velocity?.avgLeadTime ?? 0}h`} />
            </div>
          </Card>
          <Card>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Quality</h4>
            <div className="space-y-3">
              <MetricRow label="Code Coverage" value={`${metrics?.quality?.codeCoverage ?? 0}%`} color={((metrics?.quality?.codeCoverage ?? 0) >= 80) ? "green" : "red"} />
              <MetricRow label="Bug Rate" value={`${metrics?.quality?.bugRate ?? 0}/sprint`} />
              <MetricRow label="Tech Debt" value={`${metrics?.quality?.techDebt ?? 0}h`} />
              <MetricRow label="Test Pass Rate" value={`${metrics?.quality?.testPassRate ?? 0}%`} color={((metrics?.quality?.testPassRate ?? 0) >= 95) ? "green" : "amber"} />
            </div>
          </Card>
          <Card>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Deployment (DORA)</h4>
            <div className="space-y-3">
              <MetricRow label="Total Deployments" value={String(metrics?.deployment?.totalDeployments ?? 0)} />
              <MetricRow label="Successful" value={String(metrics?.deployment?.successfulDeployments ?? 0)} />
              <MetricRow label="Rollbacks" value={String(metrics?.deployment?.rollbacks ?? 0)} color={(metrics?.deployment?.rollbacks ?? 0) === 0 ? "green" : "red"} />
              <MetricRow label="MTTR" value={`${metrics?.deployment?.mttr ?? 0}h`} />
            </div>
          </Card>
        </div>
      )}

      {/* ── Trigger Modal ────────────────────────────────── */}
      <Modal open={triggerModal} onClose={() => { setTriggerModal(false); setSelectedPipeline(null); }} title="Trigger Pipeline">
        <div className="space-y-4">
          {!selectedPipeline ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">Select a pipeline to trigger:</p>
              {(pipelines ?? []).map((p) => (
                <button
                  key={p.id}
                  className="w-full text-left p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  onClick={() => setSelectedPipeline(p)}
                >
                  <p className="font-medium text-gray-900 dark:text-white">{p.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{p.description}</p>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pipeline</p>
                <p className="text-gray-900 dark:text-white">{selectedPipeline.name}</p>
              </div>
              <Input
                label="Branch"
                value={triggerBranch}
                onChange={(e) => setTriggerBranch(e.target.value)}
                placeholder="main"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setTriggerModal(false); setSelectedPipeline(null); }}>Cancel</Button>
                <Button onClick={handleTrigger}>Run Pipeline</Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

/* ── MetricRow component ─────────────────────────────────── */

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  const colorClass = color === "green"
    ? "text-green-600 dark:text-green-400"
    : color === "red"
    ? "text-red-600 dark:text-red-400"
    : color === "amber"
    ? "text-amber-600 dark:text-amber-400"
    : "text-gray-900 dark:text-white";

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`text-sm font-semibold ${colorClass}`}>{value}</span>
    </div>
  );
}
