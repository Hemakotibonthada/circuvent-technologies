"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, Badge, Button, StatCard, DataTable, Modal, Input, Tabs } from "@/components/ui";
import { deviceStatusColors } from "@/lib/status-colors";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface DeviceDetail {
  id: string; deviceName: string; deviceCode: string; macAddress: string; ipAddress: string | null;
  firmwareVersion: string; hardwareModel: string | null; status: string; location: string | null;
  lastHeartbeat: string | null; metadata: any; createdAt: string;
  project: any | null;
  registeredBy: { id: string; firstName: string; lastName: string; email: string };
  firmwareHistory: { id: string; fromVersion: string; toVersion: string; status: string; initiatedAt: string; completedAt: string | null; notes: string | null }[];
  telemetryLogs: { id: string; timestamp: string; payload: any; logLevel: string }[];
}

export default function DeviceDetailPage({ params }: { params: { id: string } }) {
  const { token } = useAuth();
  const { data: device, loading, refetch } = useApi<DeviceDetail>(`/iot/devices/${params.id}`);
  const [activeTab, setActiveTab] = useState("overview");
  const [showFirmwareModal, setShowFirmwareModal] = useState(false);
  const [fwForm, setFwForm] = useState({ toVersion: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleFirmwareUpdate = async () => {
    setSubmitting(true);
    await api.post(`/iot/devices/${params.id}/firmware`, fwForm, token || undefined);
    setShowFirmwareModal(false);
    setFwForm({ toVersion: "", notes: "" });
    setSubmitting(false);
    refetch();
  };

  const handleStatusChange = async (status: string) => {
    await api.patch(`/iot/devices/${params.id}/status`, { status }, token || undefined);
    refetch();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div>;
  if (!device) return <div className="py-20 text-center text-slate-400">Device not found</div>;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "telemetry", label: "Telemetry", count: device.telemetryLogs.length },
    { id: "firmware", label: "Firmware History", count: device.firmwareHistory.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={device.deviceName}
        subtitle={`${device.deviceCode} · ${device.macAddress}`}
        breadcrumbs={[{ label: "IoT Devices", href: "/iot" }, { label: device.deviceName }]}
        actions={
          <div className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${device.status === "ONLINE" ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
            <Badge color={deviceStatusColors[device.status]}>{device.status}</Badge>
            <Button size="sm" variant="outline" onClick={() => setShowFirmwareModal(true)}>Update Firmware</Button>
          </div>
        }
      />

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── OVERVIEW ── */}
      {activeTab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Device Information" />
            <dl className="space-y-3">
              {[
                ["Device Code", device.deviceCode],
                ["MAC Address", device.macAddress],
                ["IP Address", device.ipAddress || "—"],
                ["Firmware", `v${device.firmwareVersion}`],
                ["Hardware Model", device.hardwareModel || "—"],
                ["Location", device.location || "—"],
                ["Last Heartbeat", device.lastHeartbeat ? formatDateTime(device.lastHeartbeat) : "Never"],
                ["Registered", formatDateTime(device.createdAt)],
                ["Registered By", `${device.registeredBy.firstName} ${device.registeredBy.lastName}`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-slate-200/50 dark:border-slate-800/50 pb-2">
                  <dt className="text-sm text-slate-400">{label}</dt>
                  <dd className="text-sm font-medium text-slate-900 dark:text-white font-mono">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Status Control" />
            <div className="grid grid-cols-2 gap-3">
              {["ONLINE", "OFFLINE", "MAINTENANCE", "DECOMMISSIONED"].map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={device.status === s}
                  className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                    device.status === s
                      ? "border-brand-500 bg-brand-500/10 text-brand-400"
                      : "border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:border-slate-600 hover:text-white"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {device.project && (
              <div className="mt-6">
                <h4 className="text-sm font-medium text-slate-400 mb-2">Linked Project</h4>
                <a href={`/projects/${device.project.id}`} className="block rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50 hover:bg-slate-800">
                  <p className="text-sm font-medium text-white">{device.project.name}</p>
                  <p className="text-xs text-slate-500">{device.project.code}</p>
                </a>
              </div>
            )}

            {device.metadata && Object.keys(device.metadata).length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-medium text-slate-400 mb-2">Metadata</h4>
                <pre className="overflow-auto rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-300">{JSON.stringify(device.metadata, null, 2)}</pre>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── TELEMETRY TAB ── */}
      {activeTab === "telemetry" && (
        <Card padding={false}>
          <DataTable
            columns={[
              { key: "timestamp", header: "Time", render: (l: any) => <span className="text-xs font-mono">{formatDateTime(l.timestamp)}</span> },
              { key: "logLevel", header: "Level", render: (l: any) => <Badge color={l.logLevel === "ERROR" ? "red" : l.logLevel === "CRITICAL" ? "red" : l.logLevel === "WARN" ? "amber" : "green"}>{l.logLevel}</Badge> },
              { key: "payload", header: "Payload", render: (l: any) => <pre className="text-xs text-slate-400 max-w-md truncate">{JSON.stringify(l.payload)}</pre> },
            ]}
            data={device.telemetryLogs}
            keyExtractor={(l: any) => l.id}
            emptyMessage="No telemetry data yet."
          />
        </Card>
      )}

      {/* ── FIRMWARE TAB ── */}
      {activeTab === "firmware" && (
        <Card padding={false}>
          <DataTable
            columns={[
              { key: "initiatedAt", header: "Date", render: (f: any) => formatDateTime(f.initiatedAt) },
              { key: "fromVersion", header: "From", render: (f: any) => <span className="font-mono text-xs">v{f.fromVersion}</span> },
              { key: "toVersion", header: "To", render: (f: any) => <span className="font-mono text-xs text-green-400">v{f.toVersion}</span> },
              { key: "status", header: "Status", render: (f: any) => <Badge color={f.status === "completed" ? "green" : f.status === "failed" ? "red" : "amber"}>{f.status}</Badge> },
              { key: "notes", header: "Notes", render: (f: any) => f.notes || "—" },
            ]}
            data={device.firmwareHistory}
            keyExtractor={(f: any) => f.id}
            emptyMessage="No firmware updates recorded."
          />
        </Card>
      )}

      {/* Firmware Update Modal */}
      <Modal open={showFirmwareModal} onClose={() => setShowFirmwareModal(false)} title="Update Firmware">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">Current version: <span className="font-mono text-white">v{device.firmwareVersion}</span></p>
          <Input label="New Version" placeholder="1.1.0" value={fwForm.toVersion} onChange={(e) => setFwForm({ ...fwForm, toVersion: e.target.value })} />
          <Input label="Notes" placeholder="Bug fixes, improvements..." value={fwForm.notes} onChange={(e) => setFwForm({ ...fwForm, notes: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowFirmwareModal(false)}>Cancel</Button>
            <Button onClick={handleFirmwareUpdate} loading={submitting} disabled={!fwForm.toVersion}>Update Firmware</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
