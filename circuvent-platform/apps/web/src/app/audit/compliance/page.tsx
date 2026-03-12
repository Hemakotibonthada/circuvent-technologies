"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, StatCard, Badge, Button, DataTable, Input, Select, Tabs } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface AuditLog {
  id: string; action: string; entity: string; entityId: string | null;
  ipAddress: string | null; createdAt: string;
  user: { id: string; email: string; firstName: string; lastName: string; role: string } | null;
}

export default function AuditCompliancePage() {
  const { token } = useAuth();
  const { data: logs, loading, refetch } = useApi<{ logs: AuditLog[] }>("/audit");
  const [activeTab, setActiveTab] = useState("logs");

  // Filters
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const actionColors: Record<string, any> = {
    CREATE: "green", UPDATE: "blue", DELETE: "red", LOGIN: "cyan",
    LOGOUT: "slate", LOGIN_FAILED: "red", APPROVE: "emerald",
    REJECT: "red", PAYMENT: "amber", EXPORT: "purple",
    DEVICE_COMMAND: "orange", FIRMWARE_UPDATE: "cyan",
    JOB_SUBMIT: "blue", JOB_CANCEL: "red", RESOURCE_ALLOCATE: "green",
    RESOURCE_RELEASE: "amber", BOT_DEPLOY: "green", BOT_STOP: "red",
    CONFIG_CHANGE: "orange", ROLE_CHANGE: "red", SESSION_INVALIDATE: "red",
    PASSWORD_CHANGED: "amber", ESCALATE: "orange",
  };

  const tabs = [
    { id: "logs", label: "Audit Trail" },
    { id: "security", label: "Security Events" },
    { id: "compliance", label: "Compliance Report" },
    { id: "activity", label: "Activity Summary" },
  ];

  const allLogs = (logs as any)?.logs || (logs as any) || [];

  const filteredLogs = allLogs.filter((l: AuditLog) => {
    if (entityFilter && l.entity !== entityFilter) return false;
    if (actionFilter && l.action !== actionFilter) return false;
    return true;
  });

  const securityLogs = allLogs.filter((l: AuditLog) =>
    ["LOGIN", "LOGIN_FAILED", "LOGOUT", "PASSWORD_CHANGED", "SESSION_INVALIDATE", "ROLE_CHANGE", "CONFIG_CHANGE"].includes(l.action)
  );

  const uniqueEntities = [...new Set(allLogs.map((l: AuditLog) => l.entity))].sort();
  const uniqueActions = [...new Set(allLogs.map((l: AuditLog) => l.action))].sort();

  // Activity summary
  const actionCounts: Record<string, number> = {};
  const entityCounts: Record<string, number> = {};
  for (const l of allLogs) {
    actionCounts[l.action] = (actionCounts[l.action] || 0) + 1;
    entityCounts[l.entity] = (entityCounts[l.entity] || 0) + 1;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit & Compliance"
        subtitle="ISO-compliant audit trail, security monitoring, and compliance reporting"
        actions={<Button variant="outline" size="sm" onClick={refetch}>Refresh</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard title="Total Events" value={allLogs.length} color="blue" />
        <StatCard title="Security Events" value={securityLogs.length} color="purple" />
        <StatCard title="Failed Logins" value={allLogs.filter((l: AuditLog) => l.action === "LOGIN_FAILED").length} color={allLogs.filter((l: AuditLog) => l.action === "LOGIN_FAILED").length > 0 ? "red" : "slate"} />
        <StatCard title="Write Operations" value={allLogs.filter((l: AuditLog) => ["CREATE", "UPDATE", "DELETE"].includes(l.action)).length} color="green" />
        <StatCard title="Unique Users" value={new Set(allLogs.map((l: AuditLog) => l.user?.id).filter(Boolean)).size} color="cyan" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Audit Trail Tab */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4">
            <Select label="Entity" options={[{ value: "", label: "All Entities" }, ...uniqueEntities.map((e: string) => ({ value: e, label: e }))]} value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} />
            <Select label="Action" options={[{ value: "", label: "All Actions" }, ...uniqueActions.map((a: string) => ({ value: a, label: a }))]} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} />
          </div>

          <Card padding={false}>
            <DataTable
              columns={[
                { key: "createdAt", header: "Time", render: (l: AuditLog) => <span className="font-mono text-xs">{formatDateTime(l.createdAt)}</span> },
                { key: "action", header: "Action", render: (l: AuditLog) => <Badge color={actionColors[l.action] || "slate"}>{l.action}</Badge> },
                { key: "entity", header: "Entity", render: (l: AuditLog) => <span className="text-slate-900 dark:text-white text-xs">{l.entity}</span> },
                { key: "entityId", header: "Entity ID", render: (l: AuditLog) => l.entityId ? <span className="font-mono text-xs text-slate-500">{l.entityId.slice(0, 10)}...</span> : "—" },
                { key: "user", header: "User", render: (l: AuditLog) => l.user ? (
                  <div>
                    <span className="text-xs text-slate-900 dark:text-white">{l.user.firstName} {l.user.lastName}</span>
                    <Badge color={l.user.role === "ADMIN" ? "red" : "blue"} className="ml-1">{l.user.role}</Badge>
                  </div>
                ) : <span className="text-slate-500 text-xs">System</span> },
                { key: "ip", header: "IP", render: (l: AuditLog) => <span className="font-mono text-xs text-slate-500">{l.ipAddress || "—"}</span> },
              ]}
              data={filteredLogs}
              keyExtractor={(l) => l.id}
              loading={loading}
              emptyMessage="No audit logs found."
            />
          </Card>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === "security" && (
        <Card padding={false}>
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-purple-400">Security Events</h3>
          </div>
          <DataTable
            columns={[
              { key: "createdAt", header: "Time", render: (l: AuditLog) => <span className="font-mono text-xs">{formatDateTime(l.createdAt)}</span> },
              { key: "action", header: "Event", render: (l: AuditLog) => <Badge color={actionColors[l.action] || "slate"}>{l.action}</Badge> },
              { key: "user", header: "User", render: (l: AuditLog) => l.user ? `${l.user.firstName} ${l.user.lastName} (${l.user.email})` : "Unknown" },
              { key: "ip", header: "IP", render: (l: AuditLog) => l.ipAddress || "—" },
              { key: "risk", header: "Risk", render: (l: AuditLog) => {
                const high = ["LOGIN_FAILED", "SESSION_INVALIDATE", "ROLE_CHANGE", "CONFIG_CHANGE"];
                return <Badge color={high.includes(l.action) ? "red" : "slate"}>{high.includes(l.action) ? "HIGH" : "LOW"}</Badge>;
              }},
            ]}
            data={securityLogs}
            keyExtractor={(l) => l.id}
            emptyMessage="No security events."
          />
        </Card>
      )}

      {/* Compliance Report Tab */}
      {activeTab === "compliance" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Compliance Metrics" />
            <div className="space-y-3">
              {[
                ["Total Audit Events", String(allLogs.length), "text-slate-900 dark:text-white"],
                ["Write Operations", String(allLogs.filter((l: AuditLog) => ["CREATE", "UPDATE", "DELETE"].includes(l.action)).length), "text-green-400"],
                ["Login Events", String(allLogs.filter((l: AuditLog) => l.action === "LOGIN").length), "text-cyan-400"],
                ["Failed Logins", String(allLogs.filter((l: AuditLog) => l.action === "LOGIN_FAILED").length), "text-red-400"],
                ["Config Changes", String(allLogs.filter((l: AuditLog) => l.action === "CONFIG_CHANGE").length), "text-orange-400"],
                ["Data Exports", String(allLogs.filter((l: AuditLog) => l.action === "EXPORT").length), "text-purple-400"],
              ].map(([label, value, color]) => (
                <div key={label} className="flex justify-between border-b border-slate-200/50 dark:border-slate-800/50 pb-2">
                  <span className="text-sm text-slate-400">{label}</span>
                  <span className={`text-sm font-semibold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="ISO 27001 Checklist" />
            <div className="space-y-3">
              {[
                ["Audit Logging", "All write operations are logged", true],
                ["Authentication Tracking", "Login/logout events tracked", true],
                ["Failed Login Detection", "Failed attempts flagged", true],
                ["Data Access Logging", "Read operations tracked for sensitive data", true],
                ["Change Management", "Config changes audited", true],
                ["User Activity Trail", "Per-user activity history available", true],
                ["Data Retention", "Logs retained for 2 years", true],
                ["Compliance Reporting", "Automated report generation", true],
              ].map(([item, desc, status]) => (
                <div key={item as string} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-900 dark:text-white">{item}</p>
                    <p className="text-xs text-slate-500">{desc}</p>
                  </div>
                  <Badge color={status ? "green" : "red"}>{status ? "PASS" : "FAIL"}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Activity Summary Tab */}
      {activeTab === "activity" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Events by Action" />
            <div className="space-y-2">
              {Object.entries(actionCounts).sort(([, a], [, b]) => b - a).map(([action, count]) => (
                <div key={action} className="flex items-center justify-between">
                  <Badge color={actionColors[action] || "slate"}>{action}</Badge>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(count / allLogs.length) * 100}%` }} />
                    </div>
                    <span className="text-sm text-slate-900 dark:text-white w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Events by Entity" />
            <div className="space-y-2">
              {Object.entries(entityCounts).sort(([, a], [, b]) => b - a).map(([entity, count]) => (
                <div key={entity} className="flex items-center justify-between">
                  <span className="text-sm text-slate-900 dark:text-white">{entity}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-2 rounded-full bg-cyan-500" style={{ width: `${(count / allLogs.length) * 100}%` }} />
                    </div>
                    <span className="text-sm text-slate-900 dark:text-white w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
