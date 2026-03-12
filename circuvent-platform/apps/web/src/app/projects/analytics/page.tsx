"use client";

import React, { useState } from "react";
import { useApi } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, StatCard, Badge, DataTable, Tabs } from "@/components/ui";
import { formatCurrency, timeAgo } from "@/lib/utils";

interface ProjectDashboard {
  totalProjects: number;
  active: number;
  byType: { type: string; _count: { id: number } }[];
  byStatus: { status: string; _count: { id: number } }[];
  recentProjects: any[];
}

export default function ProjectAnalyticsPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const { data: dashboard } = useApi<ProjectDashboard>("/projects/dashboard");
  const { data: projects } = useApi<any[]>("/projects");

  const tabsList = [
    { id: "overview", label: "Overview" },
    { id: "status", label: "Status Distribution" },
    { id: "type", label: "Type Breakdown" },
    { id: "recent", label: "Recent Activity" },
  ];

  const statusColors: Record<string, any> = {
    PLANNING: "purple", ACTIVE: "green", ON_HOLD: "amber", COMPLETED: "blue", ARCHIVED: "slate",
  };
  const typeColors: Record<string, any> = { SOFTWARE: "blue", HARDWARE: "amber", HYBRID: "purple" };

  const rndProjects = (projects || []).filter((p: any) => p.isRnD);
  const activeProjects = (projects || []).filter((p: any) => p.status === "ACTIVE");
  const totalBudget = (projects || []).reduce((sum: number, p: any) => sum + (Number(p.budget) || 0), 0);
  const totalSprints = (projects || []).reduce((sum: number, p: any) => sum + (p._count?.sprints || 0), 0);
  const totalHwRevisions = (projects || []).reduce((sum: number, p: any) => sum + (p._count?.hardwareRevisions || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Analytics"
        subtitle="Engineering pipeline analysis, R&D tracking, and budget utilization"
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "Analytics" }]}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard title="Total Projects" value={dashboard?.totalProjects ?? 0} color="blue" />
        <StatCard title="Active" value={dashboard?.active ?? 0} color="green" />
        <StatCard title="R&D Projects" value={rndProjects.length} color="emerald" />
        <StatCard title="Total Budget" value={formatCurrency(totalBudget)} color="purple" />
        <StatCard title="Sprints" value={totalSprints} color="cyan" />
        <StatCard title="HW Revisions" value={totalHwRevisions} color="amber" />
      </div>

      <Tabs tabs={tabsList} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Project Pipeline" />
            <div className="space-y-4">
              {["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"].map((status) => {
                const count = (projects || []).filter((p: any) => p.status === status).length;
                const pct = (projects?.length || 0) > 0 ? Math.round((count / projects!.length) * 100) : 0;
                return (
                  <div key={status}>
                    <div className="flex justify-between text-sm mb-1">
                      <Badge color={statusColors[status]}>{status}</Badge>
                      <span className="text-slate-900 dark:text-white">{count} ({pct}%)</span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className={`h-3 rounded-full transition-all ${
                        status === "ACTIVE" ? "bg-green-500" :
                        status === "COMPLETED" ? "bg-blue-500" :
                        status === "ON_HOLD" ? "bg-amber-500" : "bg-slate-600"
                      }`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="Type Distribution" />
            <div className="grid grid-cols-3 gap-4 text-center py-4">
              {["SOFTWARE", "HARDWARE", "HYBRID"].map((type) => {
                const count = dashboard?.byType.find((t) => t.type === type)?._count.id || 0;
                return (
                  <div key={type}>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">{count}</p>
                    <Badge color={typeColors[type]}>{type}</Badge>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="R&D Summary" />
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-sm text-slate-400">R&D Projects</span><span className="text-white font-bold">{rndProjects.length}</span></div>
              <div className="flex justify-between"><span className="text-sm text-slate-400">R&D Budget</span><span className="text-green-400 font-bold">{formatCurrency(rndProjects.reduce((s: number, p: any) => s + (Number(p.budget) || 0), 0))}</span></div>
              <div className="flex justify-between"><span className="text-sm text-slate-400">% of Total Projects</span><span className="text-slate-900 dark:text-white">{(projects?.length || 0) > 0 ? Math.round((rndProjects.length / projects!.length) * 100) : 0}%</span></div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Active Projects at Risk" />
            <div className="space-y-2">
              {activeProjects.filter((p: any) => p.endDate && new Date(p.endDate) < new Date()).length === 0 ? (
                <p className="text-sm text-green-400 text-center py-4">No overdue projects</p>
              ) : (
                activeProjects.filter((p: any) => p.endDate && new Date(p.endDate) < new Date()).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-red-500/5 border border-red-500/20 p-3">
                    <div>
                      <span className="font-mono text-xs text-brand-400">{p.code}</span>
                      <p className="text-sm text-slate-900 dark:text-white">{p.name}</p>
                    </div>
                    <Badge color="red">OVERDUE</Badge>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {activeTab === "status" && (
        <Card padding={false}>
          <DataTable
            columns={[
              { key: "code", header: "Code", render: (p: any) => <span className="font-mono text-xs text-brand-400">{p.code}</span> },
              { key: "name", header: "Project", render: (p: any) => <span className="text-white font-medium">{p.name}</span> },
              { key: "type", header: "Type", render: (p: any) => <Badge color={typeColors[p.type]}>{p.type}</Badge> },
              { key: "status", header: "Status", render: (p: any) => <Badge color={statusColors[p.status]}>{p.status}</Badge> },
              { key: "isRnD", header: "R&D", render: (p: any) => p.isRnD ? <Badge color="emerald">R&D</Badge> : "—" },
              { key: "budget", header: "Budget", render: (p: any) => p.budget ? formatCurrency(Number(p.budget)) : "—" },
              { key: "sprints", header: "Sprints", render: (p: any) => p._count?.sprints ?? 0 },
              { key: "members", header: "Team", render: (p: any) => p.members?.length ?? 0 },
            ]}
            data={projects || []}
            keyExtractor={(p: any) => p.id}
            emptyMessage="No projects found."
          />
        </Card>
      )}

      {activeTab === "type" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {["SOFTWARE", "HARDWARE", "HYBRID"].map((type) => {
            const typeProjects = (projects || []).filter((p: any) => p.type === type);
            return (
              <Card key={type}>
                <CardHeader title={`${type} Projects`} subtitle={`${typeProjects.length} projects`} />
                <div className="space-y-2">
                  {typeProjects.slice(0, 5).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <a href={`/projects/${p.id}`} className="text-brand-400 hover:underline">{p.name}</a>
                      <Badge color={statusColors[p.status]}>{p.status}</Badge>
                    </div>
                  ))}
                  {typeProjects.length === 0 && <p className="text-xs text-slate-500 text-center py-4">No {type.toLowerCase()} projects</p>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {activeTab === "recent" && (
        <Card padding={false}>
          <DataTable
            columns={[
              { key: "code", header: "Code", render: (p: any) => <span className="font-mono text-xs text-brand-400">{p.code}</span> },
              { key: "name", header: "Project", render: (p: any) => <a href={`/projects/${p.id}`} className="text-white font-medium hover:text-brand-400">{p.name}</a> },
              { key: "status", header: "Status", render: (p: any) => <Badge color={statusColors[p.status]}>{p.status}</Badge> },
              { key: "updatedAt", header: "Last Updated", render: (p: any) => timeAgo(p.updatedAt || p.createdAt) },
              { key: "sprints", header: "Sprints", render: (p: any) => p._count?.sprints ?? 0 },
            ]}
            data={[...(projects || [])].sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()).slice(0, 20)}
            keyExtractor={(p: any) => p.id}
            emptyMessage="No recent activity."
          />
        </Card>
      )}
    </div>
  );
}
