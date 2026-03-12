"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, StatCard, Badge, Button, DataTable, Modal, Input, Select, Textarea } from "@/components/ui";
import { deviceStatusColors } from "@/lib/status-colors";
import { timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface Device {
  id: string; deviceName: string; deviceCode: string; macAddress: string; ipAddress: string | null;
  firmwareVersion: string; hardwareModel: string | null; status: string; location: string | null;
  lastHeartbeat: string | null; createdAt: string;
  project: { id: string; name: string; code: string } | null;
  registeredBy: { id: string; firstName: string; lastName: string };
  _count: { firmwareHistory: number; telemetryLogs: number };
}

interface IoTDashboard {
  total: number; online: number; offline: number; maintenance: number;
  registered: number; decommissioned: number; onlinePercentage: number;
  recentDevices: any[]; recentAlerts: any[];
}

export default function IoTPage() {
  const { token } = useAuth();
  const { data: devices, loading, refetch } = useApi<Device[]>("/iot/devices");
  const { data: dashboard } = useApi<IoTDashboard>("/iot/devices/dashboard/summary");
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [form, setForm] = useState({
    deviceName: "", macAddress: "", firmwareVersion: "", hardwareModel: "",
    location: "", ipAddress: "", projectId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const handleRegister = async () => {
    setSubmitting(true);
    await api.post("/iot/devices", {
      ...form,
      projectId: form.projectId || undefined,
    }, token || undefined);
    setShowRegisterModal(false);
    setForm({ deviceName: "", macAddress: "", firmwareVersion: "", hardwareModel: "", location: "", ipAddress: "", projectId: "" });
    setSubmitting(false);
    refetch();
  };

  const filteredDevices = statusFilter
    ? (devices || []).filter((d) => d.status === statusFilter)
    : (devices || []);

  const columns = [
    {
      id: "deviceCode",
      header: "Code",
      render: (d: Device) => <span className="font-mono text-xs text-brand-600 dark:text-brand-400">{d.deviceCode}</span>,
    }, { key: "deviceName",
      header: "Device Name",
      render: (d: Device) => (
        <a href={`/iot/${d.id}`} className="font-medium text-slate-900 dark:text-white hover:text-brand-600 dark:text-brand-400">{d.deviceName}</a>
      ),
    }, { key: "macAddress",
      header: "MAC Address",
      render: (d: Device) => <span className="font-mono text-xs text-slate-400">{d.macAddress}</span>,
    }, { key: "firmwareVersion",
      header: "Firmware",
      render: (d: Device) => <Badge color="cyan">v{d.firmwareVersion}</Badge>,
    }, { key: "status",
      header: "Status",
      render: (d: Device) => (
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${d.status === "ONLINE" ? "bg-green-500 animate-pulse" : d.status === "OFFLINE" ? "bg-red-500" : "bg-amber-500"}`} />
          <Badge color={deviceStatusColors[d.status]}>{d.status}</Badge>
        </div>
      ),
    }, { key: "project",
      header: "Project",
      render: (d: Device) => d.project ? <span className="text-xs">{d.project.name}</span> : <span className="text-slate-600">—</span>,
    }, { key: "location",
      header: "Location",
      render: (d: Device) => d.location || "—",
    }, { key: "lastHeartbeat",
      header: "Last Seen",
      render: (d: Device) => d.lastHeartbeat ? timeAgo(d.lastHeartbeat) : "Never",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="IoT Device Registry"
        subtitle="Monitor deployed devices, firmware, and telemetry"
        actions={<Button onClick={() => setShowRegisterModal(true)}>+ Register Device</Button>}
      />

      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard title="Total Devices" value={dashboard?.total ?? "—"} color="blue" />
        <StatCard title="Online" value={dashboard?.online ?? "—"} subtitle={`${dashboard?.onlinePercentage ?? 0}%`} color="green" />
        <StatCard title="Offline" value={dashboard?.offline ?? "—"} color="red" />
        <StatCard title="Maintenance" value={dashboard?.maintenance ?? "—"} color="amber" />
        <StatCard title="Registered" value={dashboard?.registered ?? "—"} color="purple" />
        <StatCard title="Decommissioned" value={dashboard?.decommissioned ?? "—"} color="slate" />
      </div>

      {/* Alerts Panel */}
      {dashboard?.recentAlerts && dashboard.recentAlerts.length > 0 && (
        <Card className="border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/5">
          <h3 className="mb-3 text-sm font-semibold text-red-600 dark:text-red-400">Recent Alerts</h3>
          <div className="space-y-2">
            {dashboard.recentAlerts.slice(0, 5).map((alert: any) => (
              <div key={alert.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Badge color={alert.logLevel === "CRITICAL" ? "red" : "orange"}>{alert.logLevel}</Badge>
                  <span className="text-slate-600 dark:text-slate-300">{alert.device.deviceName}</span>
                </Card>
                <span className="text-slate-500">{timeAgo(alert.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Filter */}
      <div className="flex gap-2">
        {["", "ONLINE", "OFFLINE", "MAINTENANCE", "REGISTERED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === s ? "bg-brand-600 text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {/* Devices Table */}
      <Card padding={false}>
        <DataTable
          columns={columns}
          data={filteredDevices}
          keyExtractor={(d) => d.id}
          loading={loading}
          emptyMessage="No devices registered yet."
        />
      </Card>

      {/* Register Modal */}
      <Modal open={showRegisterModal} onClose={() => setShowRegisterModal(false)} title="Register New Device" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Device Name" placeholder="Sensor Hub A1" value={form.deviceName} onChange={(e) => setForm({ ...form, deviceName: e.target.value })} />
            <Input label="MAC Address" placeholder="AA:BB:CC:DD:EE:FF" value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Firmware Version" placeholder="1.0.0" value={form.firmwareVersion} onChange={(e) => setForm({ ...form, firmwareVersion: e.target.value })} />
            <Input label="Hardware Model" placeholder="ESP32-S3" value={form.hardwareModel} onChange={(e) => setForm({ ...form, hardwareModel: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="IP Address" placeholder="192.168.1.100" value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} />
            <Input label="Location" placeholder="Lab-A, Rack 3" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowRegisterModal(false)}>Cancel</Button>
            <Button onClick={handleRegister} loading={submitting} disabled={!form.deviceName || !form.macAddress || !form.firmwareVersion}>
              Register Device
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
