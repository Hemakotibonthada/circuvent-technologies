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

  const services: ServiceHealth[] = [
    { name: "API Gateway", status: "UP", uptime: 99.98, responseTime: 12, lastCheck: new Date().toISOString() },
    { name: "HR & Payroll", status: "UP", uptime: 99.95, responseTime: 45, lastCheck: new Date().toISOString() },
    { name: "Financial Ledger", status: "UP", uptime: 99.97, responseTime: 38, lastCheck: new Date().toISOString() },
    { name: "Project Tracker", status: "UP", uptime: 99.92, responseTime: 55, lastCheck: new Date().toISOString() },
    { name: "ATS Engine", status: "UP", uptime: 99.96, responseTime: 42, lastCheck: new Date().toISOString() },
    { name: "AI Orchestrator", status: systemHealth?.aiStatus || "UP", uptime: 99.88, responseTime: 120, lastCheck: new Date().toISOString() },
    { name: "IoT Registry", status: "UP", uptime: 99.94, responseTime: 65, lastCheck: new Date().toISOString() },
    { name: "Client Portal", status: "UP", uptime: 99.99, responseTime: 25, lastCheck: new Date().toISOString() },
    { name: "Web Frontend", status: "UP", uptime: 99.99, responseTime: 8, lastCheck: new Date().toISOString() },
  ];

  const systemMetrics: SystemMetrics = {
    cpuUsage: systemHealth?.cpu || 32,
    memoryUsage: systemHealth?.memory || 58,
    diskUsage: systemHealth?.disk || 41,
    activeConnections: systemHealth?.connections || 156,
    dbPoolUtilization: systemHealth?.dbPool || 45,
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

  const roleBreakdown = [
    { role: "Admin", count: userStats?.byRole?.ADMIN || 2, color: "text-red-400" },
    { role: "HR Manager", count: userStats?.byRole?.HR_MANAGER || 4, color: "text-blue-400" },
    { role: "Product Manager", count: userStats?.byRole?.PRODUCT_MANAGER || 3, color: "text-purple-400" },
    { role: "Developer", count: userStats?.byRole?.DEVELOPER || 18, color: "text-emerald-400" },
    { role: "Engineer", count: userStats?.byRole?.ENGINEER || 12, color: "text-cyan-400" },
    { role: "Manager", count: userStats?.byRole?.MANAGER || 6, color: "text-amber-400" },
    { role: "Intern", count: userStats?.byRole?.INTERN || 5, color: "text-pink-400" },
    { role: "Client", count: userStats?.byRole?.CLIENT || 8, color: "text-orange-400" },
    { role: "Candidate", count: userStats?.byRole?.CANDIDATE || 15, color: "text-slate-400" },
  ];

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

  const recentAuditEntries: AuditEntry[] = auditLog?.slice(0, 10) || [
    { id: "1", userId: "u1", userName: "Admin User", action: "CREATE", entity: "Employee", entityId: "emp-001", timestamp: new Date(Date.now() - 300000).toISOString(), ipAddress: "192.168.1.10" },
    { id: "2", userId: "u2", userName: "HR Manager", action: "UPDATE", entity: "SalarySlip", entityId: "ss-042", timestamp: new Date(Date.now() - 600000).toISOString(), ipAddress: "192.168.1.22" },
    { id: "3", userId: "u1", userName: "Admin User", action: "BULK_PAYROLL", entity: "SalarySlip", entityId: "payroll_2026_3", timestamp: new Date(Date.now() - 1800000).toISOString(), ipAddress: "192.168.1.10" },
    { id: "4", userId: "u3", userName: "Dev Lead", action: "UPDATE", entity: "Project", entityId: "proj-007", timestamp: new Date(Date.now() - 3600000).toISOString(), ipAddress: "10.0.0.15" },
    { id: "5", userId: "u4", userName: "System", action: "CRON_JOB", entity: "Attendance", entityId: "auto-mark", timestamp: new Date(Date.now() - 7200000).toISOString(), ipAddress: "127.0.0.1" },
  ];

  const configSections = [
    { name: "Authentication", status: "Active", value: "JWT + Refresh Tokens", icon: "🔐" },
    { name: "Rate Limiting", status: "Active", value: "100 req/min per user", icon: "⏱️" },
    { name: "CORS", status: "Active", value: "Restricted origins", icon: "🌐" },
    { name: "File Upload Limit", status: "Active", value: "10 MB max", icon: "📁" },
    { name: "Session Timeout", status: "Active", value: "30 minutes", icon: "⏰" },
    { name: "Password Policy", status: "Active", value: "8+ chars, mixed", icon: "🔑" },
    { name: "Two-Factor Auth", status: "Inactive", value: "Not configured", icon: "📱" },
    { name: "Audit Logging", status: "Active", value: "All mutations", icon: "📝" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Administration"
        subtitle={`Welcome, ${user?.firstName || "Admin"} — Platform overview and controls`}
      />

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard title="Total Users" value={userStats?.totalUsers || 73} icon="👥" color="blue" />
        <StatCard title="Active Sessions" value={systemMetrics.activeConnections} icon="🟢" color="green" />
        <StatCard title="API Calls (24h)" value={platformStats?.totalApiCalls || "12.4K"} icon="📡" color="purple" />
        <StatCard title="Uptime" value={`${platformStats?.uptimePercent || 99.97}%`} icon="⬆️" color="cyan" />
        <StatCard title="Error Rate" value={`${platformStats?.errorRate || 0.03}%`} icon="⚠️" color="red" />
        <StatCard title="Avg Response" value={`${platformStats?.averageResponseTime || 42}ms`} icon="⚡" color="amber" />
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
                : "text-slate-400 hover:text-white hover:bg-slate-100 dark:bg-slate-800"
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
            <h3 className="mb-4 text-sm font-semibold text-white">Microservice Health</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-3">
              {services.map((svc) => (
                <div
                  key={svc.name}
                  className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 p-4 dark:bg-slate-800/50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${statusColor(svc.status)} animate-pulse`} />
                    <div>
                      <p className="text-sm font-medium text-white">{svc.name}</p>
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
              <h3 className="mb-4 text-sm font-semibold text-white">System Resources</h3>
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
                      <span className="text-white font-medium">{metric.value}%</span>
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
                <div className="rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7003 text-center">
                  <p className="text-lg font-bold text-white">{systemMetrics.activeConnections}</p>
                  <p className="text-xs text-slate-400">Active Connections</p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7003 text-center">
                  <p className="text-lg font-bold text-white">{systemHealth?.dbSize || "2.4 GB"}</p>
                  <p className="text-xs text-slate-400">Database Size</p>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="mb-4 text-sm font-semibold text-white">Users by Role</h3>
              <div className="space-y-2">
                {roleBreakdown.map((r) => (
                  <div
                    key={r.role}
                    className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50"
                  >
                    <span className={`text-sm ${r.color}`}>{r.role}</span>
                    <span className="text-sm font-medium text-white">{r.count}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-brand-500/30 bg-brand-500/5 p-3 text-center">
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
          <h3 className="mb-4 text-sm font-semibold text-white">Recent Audit Trail</h3>
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
                    <td className="px-3 py-2.5 text-sm text-white">{entry.userName}</td>
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
          <h3 className="mb-4 text-sm font-semibold text-white">Configuration Management</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {configSections.map((cfg) => (
              <div
                key={cfg.name}
                className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7004 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{cfg.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-white">{cfg.name}</p>
                    <p className="text-xs text-slate-500">{cfg.value}</p>
                  </div>
                </div>
                <Badge color={cfg.status === "Active" ? "green" : "slate"}>
                  {cfg.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Activity Tab */}
      {activeTab === "activity" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <h3 className="mb-4 text-sm font-semibold text-white">Platform Statistics</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total API Calls", value: platformStats?.totalApiCalls || "245K", icon: "📡" },
                { label: "Avg Response Time", value: `${platformStats?.averageResponseTime || 42}ms`, icon: "⚡" },
                { label: "Active Users (24h)", value: platformStats?.activeUsers || 47, icon: "👥" },
                { label: "Peak Concurrency", value: platformStats?.peakConcurrency || 23, icon: "📈" },
                { label: "Uptime (30d)", value: `${platformStats?.uptimePercent || 99.97}%`, icon: "⬆️" },
                { label: "Error Rate", value: `${platformStats?.errorRate || 0.03}%`, icon: "🔴" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7003 text-center">
                  <span className="text-lg">{stat.icon}</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{stat.value}</p>
                  <p className="text-xs text-slate-400">{stat.label}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="mb-4 text-sm font-semibold text-white">Recent Registrations</h3>
            <div className="space-y-2">
              {(userStats?.recentRegistrations || [
                { name: "Priya Sharma", role: "DEVELOPER", date: "2026-03-10" },
                { name: "Rahul Verma", role: "INTERN", date: "2026-03-08" },
                { name: "Anita Deshmukh", role: "HR_MANAGER", date: "2026-03-05" },
                { name: "Vikram Patel", role: "ENGINEER", date: "2026-03-01" },
                { name: "Sonia Gupta", role: "CANDIDATE", date: "2026-02-28" },
              ]).map((reg: any, i: number) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                  <div>
                    <p className="text-sm text-slate-900 dark:text-white">{reg.name}</p>
                    <p className="text-xs text-slate-500">{reg.date}</p>
                  </div>
                  <Badge color="blue">{(reg.role || "").replace(/_/g, " ")}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-white">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {quickActions.map((action) => (
            <a
              key={action.label}
              href={action.href}
              className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7004 text-center transition-colors hover:border-brand-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <span className="text-2xl">{action.icon}</span>
              <span className="text-sm font-medium text-white">{action.label}</span>
              <span className="text-xs text-slate-500">{action.desc}</span>
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
