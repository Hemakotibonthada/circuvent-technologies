"use client";

// ══════════════════════════════════════════════════════════════
// Product Manager Dashboard — Project metrics, resource
// allocation, client engagement, release roadmap, and team
// workload distribution.
// ══════════════════════════════════════════════════════════════

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui";

interface ProjectMetrics {
  activeProjects: number;
  completedThisQuarter: number;
  totalBudget: number;
  budgetUtilized: number;
  avgVelocity: number;
  sprintCompletion: number;
}

interface ResourceAllocation {
  department: string;
  allocated: number;
  available: number;
  utilization: number;
}

interface FeatureRequest {
  id: string;
  title: string;
  requester: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "PLANNED";
  votes: number;
  createdAt: string;
}

interface RoadmapItem {
  id: string;
  title: string;
  phase: string;
  status: "COMPLETED" | "IN_PROGRESS" | "PLANNED" | "BLOCKED";
  startDate: string;
  endDate: string;
  progress: number;
}

export default function ProductManagerDashboard() {
  const { user } = useAuth();
  const { data: projects } = useApi<any[]>("/projects");
  const { data: clientStats } = useApi<any>("/clients/stats");
  const { data: teamData } = useApi<any>("/hr/employees/dashboard");

  const [activeTab, setActiveTab] = useState<"metrics" | "resources" | "roadmap" | "requests">("metrics");

  const metrics: ProjectMetrics = {
    activeProjects: projects?.filter((p: any) => p.status === "ACTIVE").length || 0,
    completedThisQuarter: projects?.filter((p: any) => p.status === "COMPLETED").length || 0,
    totalBudget: projects?.reduce((s: number, p: any) => s + (p.budget || 0), 0) || 0,
    budgetUtilized: projects?.reduce((s: number, p: any) => s + (p.budgetUsed || 0), 0) || 0,
    avgVelocity: 0,
    sprintCompletion: 0,
  };

  const resourceAllocation: ResourceAllocation[] = teamData?.byDepartment?.map((d: any) => ({
    department: d.department || "Unknown",
    allocated: d._count?.id || 0,
    available: 0,
    utilization: 0,
  })) || [];

  const clientEngagement: any[] = [];
  const teamWorkload: any[] = [];
  const featureRequests: FeatureRequest[] = [];
  const roadmapItems: RoadmapItem[] = [];

  const healthColor = (health: string) => {
    switch (health) {
      case "GREEN": return "text-emerald-600 dark:text-emerald-400";
      case "AMBER": return "text-amber-600 dark:text-amber-400";
      case "RED": return "text-red-600 dark:text-red-400";
      default: return "text-slate-400";
    }
  };

  const healthDot = (health: string) => {
    switch (health) {
      case "GREEN": return "bg-emerald-500";
      case "AMBER": return "bg-amber-500";
      case "RED": return "bg-red-500";
      default: return "bg-slate-500";
    }
  };

  const priorityColor = (p: string) => {
    switch (p) {
      case "HIGH": return "red";
      case "MEDIUM": return "amber";
      case "LOW": return "slate";
      default: return "slate";
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "COMPLETED": return "green";
      case "IN_PROGRESS": return "blue";
      case "APPROVED": case "PLANNED": return "purple";
      case "BLOCKED": return "red";
      case "OPEN": return "amber";
      case "IN_REVIEW": return "cyan";
      case "REJECTED": return "red";
      default: return "slate";
    }
  };

  const budgetPercent = Math.round((metrics.budgetUtilized / metrics.totalBudget) * 100);

  const quickActions = [
    { label: "Create Project", href: "/projects/new", icon: "➕" },
    { label: "Sprint Planning", href: "/projects/sprint", icon: "🏃" },
    { label: "Client Reports", href: "/clients/reports", icon: "📊" },
    { label: "Resource Plan", href: "/resources", icon: "👥" },
    { label: "Backlog", href: "/projects/backlog", icon: "📋" },
    { label: "Releases", href: "/projects/releases", icon: "🚀" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Dashboard"
        subtitle={`Welcome, ${user?.firstName || "Product Manager"} — Here's your project landscape`}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Active Projects" value={metrics.activeProjects} icon="📁" color="blue" />
        <StatCard title="Completed (Qtr)" value={metrics.completedThisQuarter} icon="✅" color="green" />
        <StatCard title="Sprint Velocity" value={`${metrics.avgVelocity} pts`} icon="🏃" color="purple" />
        <StatCard title="Sprint Completion" value={`${metrics.sprintCompletion}%`} icon="📊" color="cyan" />
        <StatCard title="Budget Utilized" value={`${budgetPercent}%`} icon="💰" color="amber" />
        <StatCard title="Active Clients" value={clientStats?.activeClients || 0} icon="🤝" color="orange" />
      </div>

      {/* Tab Nav */}
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50 p-1">
        {(["metrics", "resources", "roadmap", "requests"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-brand-600 text-white"
                : "text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:bg-slate-800"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Metrics Tab */}
      {activeTab === "metrics" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Client Engagement</h3>
            <div className="space-y-3">
              {clientEngagement.map((c) => (
                <div key={c.client} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${healthDot(c.health)}`} />
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{c.client}</span>
                    </div>
                    <span className="text-xs text-slate-500">{c.lastContact}</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">Project: {c.project}</p>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className={`h-1.5 rounded-full ${c.satisfaction >= 80 ? "bg-emerald-500" : c.satisfaction >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${c.satisfaction}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400">{c.satisfaction}%</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Team Workload</h3>
            <div className="space-y-2">
              {teamWorkload.map((member) => {
                const utilization = Math.round((member.tasks / member.capacity) * 100);
                return (
                  <div key={member.name} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{member.name}</span>
                        <span className="ml-2 text-xs text-slate-500">{member.role}</span>
                      </div>
                      <span className={`text-xs font-medium ${utilization >= 90 ? "text-red-600 dark:text-red-400" : utilization >= 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {member.tasks}/{member.capacity} tasks
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className={`h-1.5 rounded-full ${utilization >= 90 ? "bg-red-500" : utilization >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${utilization}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">{utilization}%</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {member.projects.map((p) => (
                        <span key={p} className="rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-300">{p}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Resources Tab */}
      {activeTab === "resources" && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Resource Allocation</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">Department</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">Allocated</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">Available</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">Utilization</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {resourceAllocation.map((res) => (
                  <tr key={res.department} className="border-b border-slate-200 dark:border-slate-800">
                    <td className="px-3 py-3 text-sm text-slate-900 dark:text-white">{res.department}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 dark:text-slate-300">{res.allocated}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 dark:text-slate-300">{res.available}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 rounded-full bg-slate-200 dark:bg-slate-700">
                          <div
                            className={`h-1.5 rounded-full ${res.utilization >= 90 ? "bg-red-500" : "bg-emerald-500"}`}
                            style={{ width: `${res.utilization}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">{res.utilization}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge color={res.utilization >= 90 ? "red" : res.utilization >= 75 ? "amber" : "green"}>
                        {res.utilization >= 90 ? "Overloaded" : res.utilization >= 75 ? "Busy" : "Available"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{resourceAllocation.reduce((s, r) => s + r.allocated, 0)}</p>
              <p className="text-xs text-slate-400">Total Allocated</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{resourceAllocation.reduce((s, r) => s + r.available, 0)}</p>
              <p className="text-xs text-slate-400">Available</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-center">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{Math.round(resourceAllocation.reduce((s, r) => s + r.utilization, 0) / resourceAllocation.length)}%</p>
              <p className="text-xs text-slate-400">Avg Utilization</p>
            </div>
          </div>
        </Card>
      )}

      {/* Roadmap Tab */}
      {activeTab === "roadmap" && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Release Roadmap</h3>
          <div className="space-y-3">
            {roadmapItems.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500">{item.id}</span>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</span>
                  </div>
                  <Badge color={statusColor(item.status) as any}>{item.status.replace(/_/g, " ")}</Badge>
                </div>
                <div className="flex items-center gap-4 mb-2">
                  <span className="text-xs text-slate-500">Phase: {item.phase}</span>
                  <span className="text-xs text-slate-500">
                    {new Date(item.startDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })} — {new Date(item.endDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className={`h-2 rounded-full ${item.progress === 100 ? "bg-emerald-500" : item.progress > 0 ? "bg-brand-500" : "bg-slate-600"}`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-900 dark:text-white">{item.progress}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Feature Requests Tab */}
      {activeTab === "requests" && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Feature Requests</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">ID</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">Title</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">Requester</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">Priority</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">Status</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">Votes</th>
                </tr>
              </thead>
              <tbody>
                {featureRequests.map((fr) => (
                  <tr key={fr.id} className="border-b border-slate-200 dark:border-slate-800 hover:bg-white dark:bg-slate-800/30">
                    <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{fr.id}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-900 dark:text-white">{fr.title}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">{fr.requester}</td>
                    <td className="px-3 py-2.5"><Badge color={priorityColor(fr.priority) as any}>{fr.priority}</Badge></td>
                    <td className="px-3 py-2.5"><Badge color={statusColor(fr.status) as any}>{fr.status.replace(/_/g, " ")}</Badge></td>
                    <td className="px-3 py-2.5 text-sm text-slate-900 dark:text-white">👍 {fr.votes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          {quickActions.map((action) => (
            <a
              key={action.label}
              href={action.href}
              className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm text-slate-600 dark:text-slate-300 transition-colors hover:border-brand-300 dark:hover:border-brand-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
            >
              <span>{action.icon}</span> {action.label}
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
