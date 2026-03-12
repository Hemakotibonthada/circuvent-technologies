"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, StatCard, Badge, Button, DataTable, Modal, Input, Select } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface HealthDashboard {
  totalDevices: number; online: number; offline: number; healthy: number; unhealthy: number;
  averageMetrics: { avgCpu: number; avgMemory: number; avgTemperature: number };
  criticalAlerts: number; warningAlerts: number;
  devicesNeedingAttention: { alertId: string; deviceCode: string; deviceName: string; alertType: string; severity: string; message: string; since: string }[];
}

export default function IoTHealthPage() {
  const { token } = useAuth();
  const { data: dashboard, loading, refetch } = useApi<HealthDashboard>("/iot/heartbeat/health");
  const [showCommandModal, setShowCommandModal] = useState(false);
  const [cmdForm, setCmdForm] = useState({ deviceId: "", command: "DIAGNOSTIC", payload: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleResolveAlert = async (alertId: string) => {
    await api.patch(`/iot/heartbeat/alerts/${alertId}/resolve`, {}, token || undefined);
    refetch();
  };

  const handleRunOfflineDetection = async () => {
    setSubmitting(true);
    await api.post("/iot/heartbeat/detect-offline", {}, token || undefined);
    setSubmitting(false);
    refetch();
  };

  const handleSendCommand = async () => {
    setSubmitting(true);
    await api.post("/iot/heartbeat/commands", {
      deviceId: cmdForm.deviceId,
      command: cmdForm.command,
      payload: cmdForm.payload ? JSON.parse(cmdForm.payload) : undefined,
    }, token || undefined);
    setShowCommandModal(false);
    setCmdForm({ deviceId: "", command: "DIAGNOSTIC", payload: "" });
    setSubmitting(false);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="IoT Health Monitor"
        subtitle="Real-time device health, heartbeat tracking, and alert management"
        breadcrumbs={[{ label: "IoT Devices", href: "/iot" }, { label: "Health Monitor" }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRunOfflineDetection} loading={submitting}>Scan Offline</Button>
            <Button size="sm" onClick={() => setShowCommandModal(true)}>Send Command</Button>
          </div>
        }
      />

      {/* Health Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard title="Total Devices" value={dashboard?.totalDevices ?? 0} color="blue" />
        <StatCard title="Online" value={dashboard?.online ?? 0} color="green" />
        <StatCard title="Offline" value={dashboard?.offline ?? 0} color="red" />
        <StatCard title="Avg CPU" value={`${dashboard?.averageMetrics.avgCpu ?? 0}%`} color={dashboard?.averageMetrics.avgCpu && dashboard.averageMetrics.avgCpu > 80 ? "red" : "cyan"} />
        <StatCard title="Avg Memory" value={`${dashboard?.averageMetrics.avgMemory ?? 0}%`} color="purple" />
        <StatCard title="Avg Temp" value={`${dashboard?.averageMetrics.avgTemperature ?? 0}°C`} color={dashboard?.averageMetrics.avgTemperature && dashboard.averageMetrics.avgTemperature > 70 ? "red" : "green"} />
      </div>

      {/* Alert Summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card className={dashboard?.criticalAlerts ? "border-red-500/30 bg-red-500/5" : ""}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Critical Alerts</p>
              <p className="text-3xl font-bold text-red-400">{dashboard?.criticalAlerts ?? 0}</p>
            </div>
            <div className="rounded-full bg-red-500/10 p-3">
              <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.27 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
        </Card>
        <Card className={dashboard?.warningAlerts ? "border-amber-500/30 bg-amber-500/5" : ""}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Warning Alerts</p>
              <p className="text-3xl font-bold text-amber-400">{dashboard?.warningAlerts ?? 0}</p>
            </div>
            <div className="rounded-full bg-amber-500/10 p-3">
              <svg className="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </Card>
      </div>

      {/* Devices Needing Attention */}
      {dashboard?.devicesNeedingAttention && dashboard.devicesNeedingAttention.length > 0 && (
        <Card>
          <CardHeader title="Devices Needing Attention" subtitle={`${dashboard.devicesNeedingAttention.length} critical issues`} />
          <DataTable
            columns={[
              { key: "deviceCode", header: "Device", render: (d: any) => (
                <div>
                  <span className="font-mono text-xs text-brand-400">{d.deviceCode}</span>
                  <p className="text-xs text-slate-400">{d.deviceName}</p>
                </div>
              )},
              { key: "alertType", header: "Alert Type", render: (d: any) => <Badge color="red">{d.alertType}</Badge> },
              { key: "severity", header: "Severity", render: (d: any) => <Badge color={d.severity === "CRITICAL" ? "red" : "amber"}>{d.severity}</Badge> },
              { key: "message", header: "Message", render: (d: any) => <span className="text-xs">{d.message}</span> },
              { key: "since", header: "Since", render: (d: any) => timeAgo(d.since) },
              { key: "action", header: "", render: (d: any) => (
                <Button size="sm" variant="outline" onClick={() => handleResolveAlert(d.alertId)}>Resolve</Button>
              )},
            ]}
            data={dashboard.devicesNeedingAttention}
            keyExtractor={(d: any) => d.alertId}
          />
        </Card>
      )}

      {!dashboard?.devicesNeedingAttention?.length && (
        <Card className="border-green-500/20 bg-green-500/5">
          <div className="flex items-center justify-center py-8 text-center">
            <div>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
                <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-green-400">All Systems Healthy</h3>
              <p className="mt-1 text-sm text-slate-400">No critical alerts. All monitored devices are operating normally.</p>
            </div>
          </div>
        </Card>
      )}

      {/* Send Command Modal */}
      <Modal open={showCommandModal} onClose={() => setShowCommandModal(false)} title="Send Device Command">
        <div className="space-y-4">
          <Input label="Device ID" placeholder="cm..." value={cmdForm.deviceId} onChange={(e) => setCmdForm({ ...cmdForm, deviceId: e.target.value })} />
          <Select label="Command" options={[
            { value: "DIAGNOSTIC", label: "Run Diagnostics" },
            { value: "RESTART", label: "Restart Device" },
            { value: "OTA_UPDATE", label: "OTA Firmware Update" },
            { value: "CONFIG_PUSH", label: "Push Configuration" },
            { value: "LOG_DUMP", label: "Dump Logs" },
            { value: "FACTORY_RESET", label: "Factory Reset" },
          ]} value={cmdForm.command} onChange={(e) => setCmdForm({ ...cmdForm, command: e.target.value })} />
          <Input label="Payload (JSON, optional)" placeholder='{"targetVersion": "2.0.0"}' value={cmdForm.payload} onChange={(e) => setCmdForm({ ...cmdForm, payload: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCommandModal(false)}>Cancel</Button>
            <Button onClick={handleSendCommand} loading={submitting} disabled={!cmdForm.deviceId}>Send Command</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
