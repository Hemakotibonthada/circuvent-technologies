"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, StatCard, Badge, Button, DataTable, Tabs } from "@/components/ui";
import { formatCurrency, timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface QueueStatus {
  queueDepth: number;
  runningJobs: number;
  availableResources: number;
  estimatedClearTimeMinutes: number;
  queuedByPriority: { priority: number; count: number }[];
}

export default function AISchedulerPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("queue");
  const { data: queue, refetch: refetchQueue } = useApi<QueueStatus>("/ai/scheduler/queue");
  const { data: resources } = useApi<any[]>("/ai/resources");
  const { data: jobs } = useApi<any[]>("/ai/training");
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<any>(null);

  const handleProcessQueue = async () => {
    setProcessing(true);
    const res = await api.post<any>("/ai/scheduler/process-queue", {}, token || undefined);
    if (res.success) setProcessResult(res.data);
    setProcessing(false);
    refetchQueue();
  };

  const tabs = [
    { id: "queue", label: "Job Queue", count: queue?.queueDepth },
    { id: "allocation", label: "Resource Allocation" },
    { id: "performance", label: "Performance" },
  ];

  const statusColors: Record<string, any> = {
    QUEUED: "slate", PREPARING: "purple", RUNNING: "blue",
    PAUSED: "amber", COMPLETED: "green", FAILED: "red", CANCELLED: "slate",
    AVAILABLE: "green", ALLOCATED: "blue", MAINTENANCE: "amber", OFFLINE: "red",
  };

  const runningJobs = (jobs || []).filter((j: any) => j.status === "RUNNING");
  const queuedJobs = (jobs || []).filter((j: any) => j.status === "QUEUED");
  const allocatedResources = (resources || []).filter((r: any) => r.status === "ALLOCATED");
  const availableResources = (resources || []).filter((r: any) => r.status === "AVAILABLE");

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Resource Scheduler"
        subtitle="Job queue management, resource allocation, and performance monitoring"
        breadcrumbs={[{ label: "AI Orchestrator", href: "/ai" }, { label: "Scheduler" }]}
        actions={<Button onClick={handleProcessQueue} loading={processing}>Process Queue</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard title="Queue Depth" value={queue?.queueDepth ?? 0} color={queue?.queueDepth && queue.queueDepth > 5 ? "amber" : "blue"} />
        <StatCard title="Running Jobs" value={queue?.runningJobs ?? 0} color="green" />
        <StatCard title="Available GPUs" value={queue?.availableResources ?? 0} color="cyan" />
        <StatCard title="Est. Clear Time" value={`${queue?.estimatedClearTimeMinutes ?? 0}m`} color="purple" />
        <StatCard title="Total Resources" value={resources?.length ?? 0} color="slate" />
      </div>

      {/* Process Result */}
      {processResult && (
        <Card className="border-green-500/20 bg-green-500/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-green-400">Queue Processed</p>
              <p className="text-xs text-slate-400">{processResult.assigned} jobs assigned, {processResult.remaining} remaining</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setProcessResult(null)}>Dismiss</Button>
          </div>
        </Card>
      )}

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Queue Tab */}
      {activeTab === "queue" && (
        <div className="space-y-6">
          {/* Priority breakdown */}
          {queue?.queuedByPriority && queue.queuedByPriority.length > 0 && (
            <Card>
              <CardHeader title="Queue by Priority" />
              <div className="flex gap-3">
                {queue.queuedByPriority.map((p) => (
                  <div key={p.priority} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white p- dark:bg-slate-800/303 text-center">
                    <Badge color={p.priority <= 3 ? "red" : p.priority <= 6 ? "amber" : "slate"}>P{p.priority}</Badge>
                    <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{p.count}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Queued Jobs */}
          <Card padding={false}>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-400">Queued Jobs ({queuedJobs.length})</h3>
            </div>
            <DataTable
              columns={[
                { key: "jobCode", header: "Code", render: (j: any) => <span className="font-mono text-xs text-brand-400">{j.jobCode}</span> },
                { key: "name", header: "Name", render: (j: any) => <span className="text-slate-900 dark:text-white">{j.name}</span> },
                { key: "modelName", header: "Model" },
                { key: "framework", header: "Framework", render: (j: any) => <Badge color="cyan">{j.framework}</Badge> },
                { key: "priority", header: "Priority", render: (j: any) => <Badge color={j.priority <= 3 ? "red" : j.priority <= 6 ? "amber" : "slate"}>P{j.priority}</Badge> },
                { key: "epochsTotal", header: "Epochs", render: (j: any) => j.epochsTotal || "—" },
                { key: "createdAt", header: "Queued", render: (j: any) => timeAgo(j.createdAt) },
              ]}
              data={queuedJobs}
              keyExtractor={(j: any) => j.id}
              emptyMessage="No jobs in queue."
            />
          </Card>

          {/* Running Jobs */}
          {runningJobs.length > 0 && (
            <Card padding={false}>
              <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-green-400">Running Jobs ({runningJobs.length})</h3>
              </div>
              <DataTable
                columns={[
                  { key: "jobCode", header: "Code", render: (j: any) => <span className="font-mono text-xs text-brand-400">{j.jobCode}</span> },
                  { key: "name", header: "Name", render: (j: any) => <span className="text-slate-900 dark:text-white">{j.name}</span> },
                  { key: "progress", header: "Progress", render: (j: any) => {
                    const pct = j.epochsTotal ? Math.round((j.epochsCompleted / j.epochsTotal) * 100) : 0;
                    return (
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-2 rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-400">{pct}%</span>
                      </div>
                    );
                  }},
                  { key: "resource", header: "Resource", render: (j: any) => j.resource ? <Badge color="blue">{j.resource.name}</Badge> : "—" },
                  { key: "startedAt", header: "Started", render: (j: any) => j.startedAt ? timeAgo(j.startedAt) : "—" },
                ]}
                data={runningJobs}
                keyExtractor={(j: any) => j.id}
              />
            </Card>
          )}
        </div>
      )}

      {/* Allocation Tab */}
      {activeTab === "allocation" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Allocated Resources" subtitle={`${allocatedResources.length} in use`} />
            <div className="space-y-3">
              {allocatedResources.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <div>
                    <span className="font-mono text-xs text-brand-400">{r.resourceCode}</span>
                    <p className="text-sm text-slate-900 dark:text-white">{r.name}</p>
                    <p className="text-xs text-slate-500">{r.model} {r.vramGb ? `— ${r.vramGb}GB` : ""}</p>
                  </div>
                  <Badge color="blue">ALLOCATED</Badge>
                </div>
              ))}
              {allocatedResources.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No resources allocated.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Available Resources" subtitle={`${availableResources.length} free`} />
            <div className="space-y-3">
              {availableResources.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <div>
                    <span className="font-mono text-xs text-brand-400">{r.resourceCode}</span>
                    <p className="text-sm text-slate-900 dark:text-white">{r.name}</p>
                    <p className="text-xs text-slate-500">{r.model} {r.vramGb ? `— ${r.vramGb}GB` : ""}</p>
                  </div>
                  <Badge color="green">AVAILABLE</Badge>
                </div>
              ))}
              {availableResources.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No resources available.</p>}
            </div>
          </Card>
        </div>
      )}

      {/* Performance Tab */}
      {activeTab === "performance" && (
        <Card>
          <CardHeader title="Scheduler Performance" subtitle="Job throughput and resource utilization" />
          <div className="grid grid-cols-3 gap-6 text-center py-8">
            <div>
              <p className="text-4xl font-bold text-slate-900 dark:text-white">{(jobs || []).filter((j: any) => j.status === "COMPLETED").length}</p>
              <p className="text-xs text-slate-400">Jobs Completed</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-red-400">{(jobs || []).filter((j: any) => j.status === "FAILED").length}</p>
              <p className="text-xs text-slate-400">Jobs Failed</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-cyan-400">
                {resources?.length ? Math.round((allocatedResources.length / resources.length) * 100) : 0}%
              </p>
              <p className="text-xs text-slate-400">Utilization</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
