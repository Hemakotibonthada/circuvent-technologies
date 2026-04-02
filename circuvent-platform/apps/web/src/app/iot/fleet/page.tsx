"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, StatCard, Badge, Button, DataTable, Select, Tabs } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

export default function IoTFleetPage() {
  const { token } = useAuth();
  const { data: dashboard } = useApi<any>("/iot/devices/dashboard/summary");
  const { data: health } = useApi<any>("/iot/heartbeat/health");
  const { data: devices } = useApi<any[]>("/iot/devices");
  const [activeTab, setActiveTab] = useState("overview");

  // Firmware rollout
  const [rolloutVersion, setRolloutVersion] = useState("");
  const [rolloutResult, setRolloutResult] = useState<any>(null);
  const [processing, setProcessing] = useState(false);

  const tabs = [
    { id: "overview", label: "Fleet Overview" }, { id: "firmware", label: "Firmware" }, { id: "alerts", label: "Active Alerts", count: health?.criticalAlerts }, { id: "commands", label: "Commands" },
  ];

  const deviceStatusColors: Record<string, any> = {
    ONLINE: "green", OFFLINE: "red", MAINTENANCE: "amber",
    REGISTERED: "purple", PROVISIONED: "cyan", DECOMMISSIONED: "slate",
  };

  // Calculate firmware distribution from devices
  const firmwareDistribution = (devices || []).reduce((acc: Record<string, number>, d: any) => {
    acc[d.firmwareVersion] = (acc[d.firmwareVersion] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="IoT Fleet Analytics"
        subtitle={`${dashboard?.total ?? 0} devices across the fleet`}
        breadcrumbs={[{ label: "IoT Devices", href: "/iot" }, { label: "Fleet Analytics" }]}
      />

      {/* Fleet Health Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard title="Total Fleet" value={dashboard?.total ?? 0} color="blue" />
        <StatCard title="Online" value={dashboard?.online ?? 0} subtitle={`${dashboard?.onlinePercentage ?? 0}%`} color="green" />
        <StatCard title="Offline" value={dashboard?.offline ?? 0} color="red" />
        <StatCard title="Healthy" value={health?.healthy ?? 0} color="emerald" />
        <StatCard title="Alerts" value={(health?.criticalAlerts ?? 0) + (health?.warningAlerts ?? 0)} color={health?.criticalAlerts > 0 ? "red" : "amber"} />
      </div>

      {/* Average Metrics */}
      {health?.averageMetrics && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="text-center">
            <p className="text-xs text-slate-500 uppercase">Avg CPU</p>
            <p className={`text-3xl font-bold ${health.averageMetrics.avgCpu > 80 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
              {health.averageMetrics.avgCpu}%
            </p>
            <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={`h-2 rounded-full ${health.averageMetrics.avgCpu > 80 ? "bg-red-500" : "bg-green-500"}`}
                style={{ width: `${health.averageMetrics.avgCpu}%` }} />
            </Card>
          </div>
          <Card className="text-center">
            <p className="text-xs text-slate-500 uppercase">Avg Memory</p>
            <p className={`text-3xl font-bold ${health.averageMetrics.avgMemory > 85 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
              {health.averageMetrics.avgMemory}%
            </p>
            <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={`h-2 rounded-full ${health.averageMetrics.avgMemory > 85 ? "bg-red-500" : "bg-blue-500"}`}
                style={{ width: `${health.averageMetrics.avgMemory}%` }} />
            </Card>
          </div>
          <Card className="text-center">
            <p className="text-xs text-slate-500 uppercase">Avg Temperature</p>
            <p className={`text-3xl font-bold ${health.averageMetrics.avgTemperature > 70 ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"}`}>
              {health.averageMetrics.avgTemperature}°C
            </p>
            <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={`h-2 rounded-full ${health.averageMetrics.avgTemperature > 70 ? "bg-amber-500" : "bg-cyan-500"}`}
                style={{ width: `${Math.min(health.averageMetrics.avgTemperature, 100)}%` }} />
            </Card>
          </div>
        </div>
      )}

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Status Distribution */}
          <Card>
            <CardHeader title="Device Status Distribution" />
            <div className="space-y-3">
              {Object.entries(deviceStatusColors).map(([status, color]) => {
                const count = (devices || []).filter((d: any) => d.status === status).length;
                const pct = (devices?.length || 0) > 0 ? Math.round((count / devices!.length) * 100) : 0;
                return (
                  <div key={status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge color={color}>{status}</Badge>
                    </Card>
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium text-slate-900 dark:text-white w-8 text-right">{count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Devices */}
          <Card>
            <CardHeader title="Recently Registered" />
            <div className="space-y-2">
              {(dashboard?.recentDevices || []).slice(0, 5).map((d: any) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                  <div>
                    <span className="font-mono text-xs text-brand-600 dark:text-brand-400">{d.deviceCode}</span>
                    <p className="text-xs text-slate-400">{d.deviceName}</p>
                  </Card>
                  <Badge color={deviceStatusColors[d.status]}>{d.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Firmware Tab */}
      {activeTab === "firmware" && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Firmware Distribution" />
            <div className="space-y-3">
              {Object.entries(firmwareDistribution).sort(([a], [b]) => b.localeCompare(a)).map(([version, count]) => (
                <div key={version} className="flex items-center justify-between">
                  <Badge color="cyan">v{version}</Badge>
                  <div className="flex items-center gap-3">
                    <div className="w-40 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-2 rounded-full bg-cyan-500"
                        style={{ width: `${((count as number) / (devices?.length || 1)) * 100}%` }} />
                    </Card>
                    <span className="text-sm text-slate-900 dark:text-white w-12 text-right">{count as number} devices</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Alerts Tab */}
      {activeTab === "alerts" && health?.devicesNeedingAttention && (
        <Card padding={false}>
          <DataTable
            columns={[{ key: "deviceCode", header: "Device", render: (a: any) => <span className="font-mono text-xs text-brand-600 dark:text-brand-400">{a.deviceCode}</span> }, { key: "deviceName", header: "Name" }, { key: "alertType", header: "Alert", render: (a: any) => <Badge color="red">{a.alertType}</Badge> }, { key: "severity", header: "Severity", render: (a: any) => <Badge color={a.severity === "CRITICAL" ? "red" : "amber"}>{a.severity}</Badge> }, { key: "message", header: "Message", render: (a: any) => <span className="text-xs">{a.message}</span> }, { key: "since", header: "Since", render: (a: any) => timeAgo(a.since) },
            ]}
            data={health.devicesNeedingAttention}
            keyExtractor={(a: any) => a.alertId}
            emptyMessage="No active alerts — all devices healthy."
          />
        </Card>
      )}

      {/* Commands Tab */}
      {activeTab === "commands" && (
        <Card>
          <CardHeader title="Device Commands" subtitle="View sent commands and their status" />
          <p className="text-sm text-slate-400 text-center py-8">
            Use the <a href="/iot/health" className="text-brand-600 dark:text-brand-600 dark:text-brand-400 hover:underline">Health Monitor</a> to send commands to specific devices.
          </p>
        </Card>
      )}
    </div>
  );
}
