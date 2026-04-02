"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, StatCard, Badge, Button, DataTable, Modal, Input, Select, Textarea, Tabs, EmptyState } from "@/components/ui";
import { formatCurrency, formatDateTime, timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface ResourceDashboard {
  total: number; available: number; allocated: number; maintenance: number; offline: number;
  utilizationPercent: number; totalVramGb: number; availableVramGb: number; totalCostPerHour: number;
  byType: { type: string; count: number; available: number }[];
  activeAllocations: any[];
}

interface TrainingDashboard {
  total: number; byStatus: Record<string, number>;
  recentJobs: any[]; averageDurationMinutes: number;
}

interface TradingDashboard {
  total: number; byStatus: Record<string, number>;
  activeBots: any[]; recentTrades: any[];
}

export default function AIPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("resources");
  const { data: resDash } = useApi<ResourceDashboard>("/ai/resources/dashboard");
  const { data: trainDash } = useApi<TrainingDashboard>("/ai/training/dashboard");
  const { data: tradeDash } = useApi<TradingDashboard>("/ai/trading/dashboard");
  const { data: resources, refetch: refetchResources } = useApi<any[]>("/ai/resources");
  const { data: jobs, refetch: refetchJobs } = useApi<any[]>("/ai/training");
  const { data: bots, refetch: refetchBots } = useApi<any[]>("/ai/trading");

  const [showResourceModal, setShowResourceModal] = useState(false);
  const [showJobModal, setShowJobModal] = useState(false);
  const [showBotModal, setShowBotModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Resource form
  const [resForm, setResForm] = useState({ name: "", type: "GPU", model: "", vramGb: "", coresCount: "", location: "", costPerHourINR: "" });
  // Job form
  const [jobForm, setJobForm] = useState({ name: "", modelName: "", framework: "PyTorch", priority: "5", epochsTotal: "10", datasetPath: "" });
  // Bot form
  const [botForm, setBotForm] = useState({ name: "", strategy: "mean_reversion", description: "" });

  const handleCreateResource = async () => {
    setSubmitting(true);
    await api.post("/ai/resources", {
      ...resForm,
      vramGb: resForm.vramGb ? Number(resForm.vramGb) : undefined,
      coresCount: resForm.coresCount ? Number(resForm.coresCount) : undefined,
      costPerHourINR: resForm.costPerHourINR ? Number(resForm.costPerHourINR) : undefined,
    }, token || undefined);
    setShowResourceModal(false);
    setResForm({ name: "", type: "GPU", model: "", vramGb: "", coresCount: "", location: "", costPerHourINR: "" });
    setSubmitting(false);
    refetchResources();
  };

  const handleSubmitJob = async () => {
    setSubmitting(true);
    await api.post("/ai/training", {
      ...jobForm,
      priority: Number(jobForm.priority),
      epochsTotal: Number(jobForm.epochsTotal),
    }, token || undefined);
    setShowJobModal(false);
    setJobForm({ name: "", modelName: "", framework: "PyTorch", priority: "5", epochsTotal: "10", datasetPath: "" });
    setSubmitting(false);
    refetchJobs();
  };

  const handleCreateBot = async () => {
    setSubmitting(true);
    await api.post("/ai/trading", {
      ...botForm,
      configJson: {
        market: "NSE",
        instruments: ["NIFTY", "BANKNIFTY"],
        riskLimits: { maxPositionSize: 100000, maxDailyLoss: 10000, maxDrawdownPercent: 5, stopLossPercent: 2, takeProfitPercent: 3, maxOpenPositions: 5 },
      },
    }, token || undefined);
    setShowBotModal(false);
    setBotForm({ name: "", strategy: "mean_reversion", description: "" });
    setSubmitting(false);
    refetchBots();
  };

  const tabs = [
    { id: "resources", label: "Compute Resources", count: resDash?.total }, { id: "training", label: "Training Jobs", count: trainDash?.total }, { id: "trading", label: "Trading Bots", count: tradeDash?.total },
  ];

  const statusColors: Record<string, any> = {
    AVAILABLE: "green", ALLOCATED: "blue", MAINTENANCE: "amber", OFFLINE: "red",
    QUEUED: "slate", PREPARING: "purple", RUNNING: "blue", PAUSED: "amber", COMPLETED: "green", FAILED: "red", CANCELLED: "slate",
    INACTIVE: "slate", BACKTESTING: "cyan", PAPER_TRADING: "purple", LIVE: "green", ERROR: "red", DECOMMISSIONED: "slate",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Resource Orchestrator"
        subtitle="GPU/CPU allocation, ML training jobs, automated trading bots"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowResourceModal(true)}>+ Resource</Button>
            <Button variant="outline" size="sm" onClick={() => setShowJobModal(true)}>+ Training Job</Button>
            <Button size="sm" onClick={() => setShowBotModal(true)}>+ Trading Bot</Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard title="Total Resources" value={resDash?.total ?? "—"} color="blue" />
        <StatCard title="Available" value={resDash?.available ?? "—"} color="green" />
        <StatCard title="Utilization" value={`${resDash?.utilizationPercent ?? 0}%`} color={resDash?.utilizationPercent && resDash.utilizationPercent > 80 ? "red" : "cyan"} />
        <StatCard title="VRAM Free" value={`${resDash?.availableVramGb ?? 0} GB`} color="purple" />
        <StatCard title="Active Jobs" value={trainDash?.byStatus?.RUNNING ?? 0} color="blue" />
        <StatCard title="Live Bots" value={tradeDash?.byStatus?.LIVE ?? 0} color="green" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── RESOURCES TAB ── */}
      {activeTab === "resources" && (
        <div className="space-y-4">
          {/* Resource type breakdown */}
          {resDash?.byType && (
            <div className="grid grid-cols-3 gap-4">
              {resDash.byType.map((t) => (
                <Card key={t.type} className="text-center">
                  <Badge color={t.type === "GPU" ? "green" : t.type === "TPU" ? "purple" : "blue"}>{t.type}</Badge>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{t.count}</p>
                  <p className="text-xs text-slate-500">{t.available} available</p>
                </Card>
              ))}
            </div>
          )}

          <Card padding={false}>
            <DataTable
              columns={[{ key: "resourceCode", header: "Code", render: (r: any) => <span className="font-mono text-xs text-brand-600 dark:text-brand-400">{r.resourceCode}</span> }, { key: "name", header: "Name", render: (r: any) => <span className="text-slate-900 dark:text-white font-medium">{r.name}</span> }, { key: "type", header: "Type", render: (r: any) => <Badge color={r.type === "GPU" ? "green" : "blue"}>{r.type}</Badge> }, { key: "model", header: "Model", render: (r: any) => r.model || "—" }, { key: "vramGb", header: "VRAM", render: (r: any) => r.vramGb ? `${r.vramGb} GB` : "—" }, { key: "status", header: "Status", render: (r: any) => <Badge color={statusColors[r.status]}>{r.status}</Badge> }, { key: "cost", header: "₹/hr", render: (r: any) => r.costPerHourINR ? formatCurrency(Number(r.costPerHourINR)) : "—" }, { key: "location", header: "Location", render: (r: any) => r.location || "—" },
              ]}
              data={resources || []}
              keyExtractor={(r: any) => r.id}
              emptyMessage="No compute resources registered yet."
            />
          </Card>
        </div>
      )}

      {/* ── TRAINING JOBS TAB ── */}
      {activeTab === "training" && (
        <div className="space-y-4">
          {trainDash && (
            <div className="grid grid-cols-4 gap-3">
              {Object.entries(trainDash.byStatus || {}).map(([status, count]) => (
                <Card key={status} className="text-center p-3">
                  <Badge color={statusColors[status]}>{status}</Badge>
                  <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{count as number}</p>
                </Card>
              ))}
            </div>
          )}

          <Card padding={false}>
            <DataTable
              columns={[{ key: "jobCode", header: "Code", render: (j: any) => <span className="font-mono text-xs text-brand-600 dark:text-brand-400">{j.jobCode}</span> }, { key: "name", header: "Name", render: (j: any) => <span className="text-slate-900 dark:text-white">{j.name}</span> }, { key: "modelName", header: "Model" }, { key: "framework", header: "Framework", render: (j: any) => <Badge color="cyan">{j.framework}</Badge> }, { key: "status", header: "Status", render: (j: any) => <Badge color={statusColors[j.status]}>{j.status}</Badge> }, { key: "progress", header: "Progress", render: (j: any) => j.epochsTotal ? `${j.epochsCompleted || 0}/${j.epochsTotal} epochs` : "—" }, { key: "resource", header: "Resource", render: (j: any) => j.resource ? j.resource.name : "Unassigned" }, { key: "priority", header: "Priority", render: (j: any) => <Badge color={j.priority <= 3 ? "red" : j.priority <= 6 ? "amber" : "slate"}>P{j.priority}</Badge> }, { key: "createdAt", header: "Submitted", render: (j: any) => timeAgo(j.createdAt) },
              ]}
              data={jobs || []}
              keyExtractor={(j: any) => j.id}
              emptyMessage="No training jobs."
            />
          </Card>
        </div>
      )}

      {/* ── TRADING BOTS TAB ── */}
      {activeTab === "trading" && (
        <div className="space-y-4">
          {tradeDash?.activeBots && tradeDash.activeBots.length > 0 && (
            <Card>
              <CardHeader title="Active Bots" />
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {tradeDash.activeBots.map((bot: any) => (
                  <div key={bot.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 p-4 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-brand-600 dark:text-brand-400">{bot.botCode}</span>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{bot.name}</p>
                      </Card>
                      <Badge color={statusColors[bot.status]}>{bot.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Strategy: {bot.strategy}</p>
                    {bot.lastTradeAt && <p className="text-xs text-slate-500">Last trade: {timeAgo(bot.lastTradeAt)}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Card padding={false}>
            <DataTable
              columns={[{ key: "botCode", header: "Code", render: (b: any) => <span className="font-mono text-xs text-brand-600 dark:text-brand-400">{b.botCode}</span> }, { key: "name", header: "Name", render: (b: any) => <span className="text-slate-900 dark:text-white">{b.name}</span> }, { key: "strategy", header: "Strategy" }, { key: "status", header: "Status", render: (b: any) => <Badge color={statusColors[b.status]}>{b.status}</Badge> }, { key: "lastTradeAt", header: "Last Trade", render: (b: any) => b.lastTradeAt ? timeAgo(b.lastTradeAt) : "Never" }, { key: "logs", header: "Logs", render: (b: any) => b._count?.logs ?? 0 }, { key: "createdAt", header: "Created", render: (b: any) => timeAgo(b.createdAt) },
              ]}
              data={bots || []}
              keyExtractor={(b: any) => b.id}
              emptyMessage="No trading bots created."
            />
          </Card>
        </div>
      )}

      {/* ── CREATE RESOURCE MODAL ── */}
      <Modal open={showResourceModal} onClose={() => setShowResourceModal(false)} title="Register Compute Resource" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name" placeholder="A100 GPU #1" value={resForm.name} onChange={(e) => setResForm({ ...resForm, name: e.target.value })} />
            <Select label="Type" options={[{ value: "GPU", label: "GPU" }, { value: "CPU", label: "CPU" }, { value: "TPU", label: "TPU" }]} value={resForm.type} onChange={(e) => setResForm({ ...resForm, type: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Model" placeholder="NVIDIA A100 80GB" value={resForm.model} onChange={(e) => setResForm({ ...resForm, model: e.target.value })} />
            <Input label="VRAM (GB)" type="number" placeholder="80" value={resForm.vramGb} onChange={(e) => setResForm({ ...resForm, vramGb: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Location" placeholder="DC-BLR-1, Rack-3" value={resForm.location} onChange={(e) => setResForm({ ...resForm, location: e.target.value })} />
            <Input label="Cost (₹/hr)" type="number" placeholder="150" value={resForm.costPerHourINR} onChange={(e) => setResForm({ ...resForm, costPerHourINR: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowResourceModal(false)}>Cancel</Button>
            <Button onClick={handleCreateResource} loading={submitting} disabled={!resForm.name}>Register</Button>
          </div>
        </div>
      </Modal>

      {/* ── SUBMIT JOB MODAL ── */}
      <Modal open={showJobModal} onClose={() => setShowJobModal(false)} title="Submit Training Job" size="lg">
        <div className="space-y-4">
          <Input label="Job Name" placeholder="Train anomaly detector v3" value={jobForm.name} onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Model Name" placeholder="anomaly-detector-v3" value={jobForm.modelName} onChange={(e) => setJobForm({ ...jobForm, modelName: e.target.value })} />
            <Select label="Framework" options={[{ value: "PyTorch", label: "PyTorch" }, { value: "TensorFlow", label: "TensorFlow" }, { value: "JAX", label: "JAX" }, { value: "ONNX", label: "ONNX" }]} value={jobForm.framework} onChange={(e) => setJobForm({ ...jobForm, framework: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Epochs" type="number" value={jobForm.epochsTotal} onChange={(e) => setJobForm({ ...jobForm, epochsTotal: e.target.value })} />
            <Select label="Priority" options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `P${i + 1}${i === 0 ? " (Highest)" : i === 9 ? " (Lowest)" : ""}` }))} value={jobForm.priority} onChange={(e) => setJobForm({ ...jobForm, priority: e.target.value })} />
          </div>
          <Input label="Dataset Path" placeholder="/data/datasets/anomaly-v3/" value={jobForm.datasetPath} onChange={(e) => setJobForm({ ...jobForm, datasetPath: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowJobModal(false)}>Cancel</Button>
            <Button onClick={handleSubmitJob} loading={submitting} disabled={!jobForm.name || !jobForm.modelName}>Submit Job</Button>
          </div>
        </div>
      </Modal>

      {/* ── CREATE BOT MODAL ── */}
      <Modal open={showBotModal} onClose={() => setShowBotModal(false)} title="Create Trading Bot">
        <div className="space-y-4">
          <Input label="Bot Name" placeholder="Alpha Momentum Bot" value={botForm.name} onChange={(e) => setBotForm({ ...botForm, name: e.target.value })} />
          <Select label="Strategy" options={[
            { value: "mean_reversion", label: "Mean Reversion" },
            { value: "momentum", label: "Momentum" },
            { value: "ml_signal", label: "ML Signal" },
            { value: "pairs_trading", label: "Pairs Trading" },
            { value: "stat_arb", label: "Statistical Arbitrage" },
          ]} value={botForm.strategy} onChange={(e) => setBotForm({ ...botForm, strategy: e.target.value })} />
          <Textarea label="Description" value={botForm.description} onChange={(e) => setBotForm({ ...botForm, description: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowBotModal(false)}>Cancel</Button>
            <Button onClick={handleCreateBot} loading={submitting} disabled={!botForm.name}>Create Bot</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
