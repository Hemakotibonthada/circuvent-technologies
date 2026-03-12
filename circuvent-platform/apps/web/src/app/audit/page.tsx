"use client";

import React, { useState } from "react";
import { useApi } from "@/hooks/use-auth";
import { PageHeader, Card, Badge, DataTable, Select, Input } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

interface AuditLog {
  id: string; action: string; entity: string; entityId: string | null;
  ipAddress: string | null; createdAt: string;
  user: { id: string; email: string; firstName: string; lastName: string; role: string } | null;
}

export default function AuditPage() {
  const { data: logs, loading } = useApi<{ logs: AuditLog[] }>("/audit");

  const actionColors: Record<string, any> = {
    CREATE: "green", UPDATE: "blue", DELETE: "red", LOGIN: "cyan",
    LOGOUT: "slate", LOGIN_FAILED: "red", APPROVE: "emerald",
    REJECT: "red", PAYMENT: "amber", EXPORT: "purple",
  };

  const columns = [
    { key: "createdAt", header: "Timestamp", render: (l: AuditLog) => <span className="font-mono text-xs">{formatDateTime(l.createdAt)}</span> },
    { key: "action", header: "Action", render: (l: AuditLog) => <Badge color={actionColors[l.action] || "slate"}>{l.action}</Badge> },
    { key: "entity", header: "Entity", render: (l: AuditLog) => <span className="text-slate-900 dark:text-white">{l.entity}</span> },
    { key: "entityId", header: "Entity ID", render: (l: AuditLog) => l.entityId ? <span className="font-mono text-xs text-slate-500">{l.entityId.slice(0, 8)}...</span> : "—" },
    { key: "user", header: "User", render: (l: AuditLog) => l.user ? (
      <div>
        <span className="text-sm">{l.user.firstName} {l.user.lastName}</span>
        <Badge color={l.user.role === "ADMIN" ? "red" : l.user.role === "ENGINEER" ? "blue" : "green"} className="ml-2">{l.user.role}</Badge>
      </div>
    ) : <span className="text-slate-500">System</span> },
    { key: "ipAddress", header: "IP", render: (l: AuditLog) => <span className="font-mono text-xs text-slate-500">{l.ipAddress || "—"}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Logs" subtitle="Complete activity trail across all modules" />
      <Card padding={false}>
        <DataTable
          columns={columns}
          data={(logs as any)?.logs || (logs as any) || []}
          keyExtractor={(l) => l.id}
          loading={loading}
          emptyMessage="No audit logs recorded yet."
        />
      </Card>
    </div>
  );
}
