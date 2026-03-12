"use client";

// ══════════════════════════════════════════════════════════════
// Admin System Dashboard — Platform health, user management,
// audit trail, service monitoring, and configuration.
// ══════════════════════════════════════════════════════════════

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui";

interface ServiceHealth {
  name: string;
  status: "UP" | "DOWN" | "DEGRADED";
  uptime: number;
  responseTime: number;
  lastCheck: string;
}

interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  activeConnections: number;
  dbPoolUtilization: number;
}

interface AuditEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  timestamp: string;
  ipAddress: string;
}

interface PlatformStats {
  totalApiCalls: number;
  averageResponseTime: number;
  uptimePercent: number;
  errorRate: number;
  activeUsers: number;
  peakConcurrency: number;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data: userStats } = useApi<any>("/auth/users/stats");
  const { data: systemHealth } = useApi<any>("/system/health");
  const { data: auditLog } = useApi<AuditEntry[]>("/audit/recent");
  const { data: platformStats } = useApi<PlatformStats>("/system/stats");

  const [activeTab, setActiveTab] = useState<"overview" | "audit" | "config" | "activity">("overview");

  const services: ServiceHealth[] = systemHealth?.services || [];

  const systemMetrics: SystemMetrics = {
    cpuUsage: systemHealth?.cpu || 0,
    memoryUsage: systemHealth?.memory || 0,
    diskUsage: systemHealth?.disk || 0,
    activeConnections: systemHealth?.connections || 0,
    dbPoolUtilization: systemHealth?.dbPool || 0,
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "UP": return "bg-emerald-500";
      case "DOWN": return "bg-red-500";
      case "DEGRADED": return "bg-amber-500";
      default: return "bg-slate-500";
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "UP": return "green";
      case "DOWN": return "red";
      case "DEGRADED": return "amber";
      default: return "slate";
    }
  };

  const roleColors: Record<string, string> = {
    ADMIN: "text-red-600 dark:text-red-400", HR_MANAGER: "text-blue-600 dark:text-blue-400",
    PRODUCT_MANAGER: "text-purple-600 dark:text-purple-400", DEVELOPER: "text-emerald-600 dark:text-emerald-400",
    ENGINEER: "text-cyan-600 dark:text-cyan-400", MANAGER: "text-amber-600 dark:text-amber-400",
    INTERN: "text-pink-600 dark:text-pink-400", CLIENT: "text-orange-600 dark:text-orange-400",
    CANDIDATE: "text-slate-400",
  };
  const roleBreakdown = (userStats?.byRole ? Object.entries(userStats.byRole) : []).map(([role, count]: [string, any]) => ({
    role: role.replace(/_/g, " "), count: Number(count) || 0, color: roleColors[role] || "text-slate-400",
  }));

  const quickActions = [
    { label: "User Management", href: "/hr/user-management", icon: "🔑", desc: "Manage users and roles" },
    { label: "Feature Flags", href: "/settings", icon: "🚩", desc: "Toggle platform features" },
    { label: "Audit Logs", href: "/admin/audit", icon: "📋", desc: "View system audit trail" },
    { label: "Database Admin", href: "/admin/database", icon: "🗄️", desc: "DB health and backups" },
    { label: "API Monitoring", href: "/admin/api", icon: "📡", desc: "Monitor API endpoints" },
    { label: "Notifications", href: "/admin/notifications", icon: "🔔", desc: "System notifications" },
    { label: "Security", href: "/admin/security", icon: "🛡️", desc: "Security settings" },
    { label: "Backup & Restore", href: "/admin/backup", icon: "💾", desc: "Data backup management" },
    { label: "Email Templates", href: "/admin/emails", icon: "📧", desc: "Manage email templates" },
    { label: "System Config", href: "/admin/config", icon: "⚙️", desc: "Platform configuration" },
    { label: "Reports", href: "/admin/reports", icon: "📊", desc: "System reports" },
    { label: "Integrations", href: "/admin/integrations", icon: "🔗", desc: "Third-party integrations" },
  ];

  const recentAuditEntries: AuditEntry[] = auditLog?.slice(0, 10) || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Administration"
        subtitle={`Welcome, ${user?.firstName || "Admin"} — Platform overview and controls`}
      />

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard title="Total Users" value={userStats?.totalUsers || 0} icon="👥" color="blue" />
        <StatCard title="Active Sessions" value={systemMetrics.activeConnections} icon="🟢" color="green" />
        <StatCard title="API Calls (24h)" value={platformStats?.totalApiCalls || 0} icon="📡" color="purple" />
        <StatCard title="Uptime" value={`${platformStats?.uptimePercent || 0}%`} icon="⬆️" color="cyan" />
        <StatCard title="Error Rate" value={`${platformStats?.errorRate || 0}%`} icon="⚠️" color="red" />
        <StatCard title="Avg Response" value={`${platformStats?.averageResponseTime || 0}ms`} icon="⚡" color="amber" />
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50 p-1">
        {(["overview", "audit", "config", "activity"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-brand-600 text-white"
                : "text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:bg-slate-800"
            }`}
          >
            {tab === "overview" && "🖥️ "}
            {tab === "audit" && "📋 "}
            {tab === "config" && "⚙️ "}
            {tab === "activity" && "📊 "}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <>
          {/* Services Grid */}
          <Card>
            <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Microservice Health</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-3">
              {services.map((svc) => (
                <div
                  key={svc.name}
                  className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 p-4 dark:bg-slate-800/50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${statusColor(svc.status)} animate-pulse`} />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{svc.name}</p>
                      <p className="text-xs text-slate-500">{svc.responseTime}ms avg</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge color={statusBadge(svc.status) as any}>{svc.status}</Badge>
                    <p className="mt-1 text-xs text-slate-500">{svc.uptime}% uptime</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* System Metrics + User Stats */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">System Resources</h3>
              <div className="space-y-4">
                {[
                  { label: "CPU Usage", value: systemMetrics.cpuUsage, color: systemMetrics.cpuUsage > 80 ? "bg-red-500" : "bg-emerald-500" },
                  { label: "Memory Usage", value: systemMetrics.memoryUsage, color: systemMetrics.memoryUsage > 80 ? "bg-red-500" : "bg-blue-500" },
                  { label: "Disk Usage", value: systemMetrics.diskUsage, color: systemMetrics.diskUsage > 80 ? "bg-red-500" : "bg-purple-500" },
                  { label: "DB Pool", value: systemMetrics.dbPoolUtilization, color: systemMetrics.dbPoolUtilization > 80 ? "bg-red-500" : "bg-cyan-500" },
                ].map((metric) => (
                  <div key={metric.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">{metric.label}</span>
                      <span className="text-slate-900 dark:text-white font-medium">{metric.value}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className={`h-2 rounded-full ${metric.color} transition-all duration-300`}
                        style={{ width: `${metric.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-center">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{systemMetrics.activeConnections}</p>
                  <p className="text-xs text-slate-400">Active Connections</p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-center">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{systemHealth?.dbSize || "—"}</p>
                  <p className="text-xs text-slate-400">Database Size</p>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Users by Role</h3>
              <div className="space-y-2">
                {roleBreakdown.map((r) => (
                  <div
                    key={r.role}
                    className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50"
                  >
                    <span className={`text-sm ${r.color}`}>{r.role}</span>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{r.count}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/5 p-3 text-center">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {roleBreakdown.reduce((s, r) => s + r.count, 0)}
                </p>
                <p className="text-xs text-slate-400">Total Registered Users</p>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Audit Tab */}
      {activeTab === "audit" && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Recent Audit Trail</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">Time</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">User</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">Action</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">Entity</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">Entity ID</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-400">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {recentAuditEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-200 dark:border-slate-800 hover:bg-white dark:bg-slate-800/30">
                    <td className="px-3 py-2.5 text-xs text-slate-400">
                      {new Date(entry.timestamp).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-900 dark:text-white">{entry.userName}</td>
                    <td className="px-3 py-2.5">
                      <Badge
                        color={
                          entry.action === "CREATE" ? "green" :
                          entry.action === "DELETE" ? "red" :
                          entry.action === "UPDATE" ? "blue" :
                          "slate"
                        }
                      >
                        {entry.action}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300">{entry.entity}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{entry.entityId}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{entry.ipAddress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {recentAuditEntries.length === 0 && (
            <div className="py-8 text-center text-slate-500">No audit entries found</div>
          )}
        </Card>
      )}

      {/* Config Tab */}
      {activeTab === "config" && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Configuration Management</h3>
          <p className="py-8 text-center text-sm text-slate-500">Configuration data will be loaded from the system settings API.</p>
        </Card>
      )}

      {/* Activity Tab */}
      {activeTab === "activity" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Platform Statistics</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total API Calls", value: platformStats?.totalApiCalls || 0, icon: "📡" },
                { label: "Avg Response Time", value: `${platformStats?.averageResponseTime || 0}ms`, icon: "⚡" },
                { label: "Active Users (24h)", value: platformStats?.activeUsers || 0, icon: "👥" },
                { label: "Peak Concurrency", value: platformStats?.peakConcurrency || 0, icon: "📈" },
                { label: "Uptime (30d)", value: `${platformStats?.uptimePercent || 0}%`, icon: "⬆️" },
                { label: "Error Rate", value: `${platformStats?.errorRate || 0}%`, icon: "🔴" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-center">
                  <span className="text-lg">{stat.icon}</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{stat.value}</p>
                  <p className="text-xs text-slate-400">{stat.label}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Recent Registrations</h3>
            <div className="space-y-2">
              {(userStats?.recentRegistrations || []).map((reg: any, i: number) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                  <div>
                    <p className="text-sm text-slate-900 dark:text-white">{reg.name}</p>
                    <p className="text-xs text-slate-500">{reg.date}</p>
                  </div>
                  <Badge color="blue">{(reg.role || "").replace(/_/g, " ")}</Badge>
                </div>
              ))}              {(!userStats?.recentRegistrations || userStats.recentRegistrations.length === 0) && (
                <p className=\"py-4 text-center text-sm text-slate-500\">No recent registrations</p>
              )}            </div>
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {quickActions.map((action) => (
            <a
              key={action.label}
              href={action.href}
              className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-center transition-colors hover:border-brand-300 dark:hover:border-brand-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <span className="text-2xl">{action.icon}</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white">{action.label}</span>
              <span className="text-xs text-slate-500">{action.desc}</span>
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
