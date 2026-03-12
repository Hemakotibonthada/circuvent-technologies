"use client";
import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function IoTCommandCenterPage() {
  const { token } = useAuth();
  const { data: devices, loading: devicesLoading } = useApi<any[]>("/iot/devices");
  const { data: health } = useApi<any>("/iot/heartbeat/health");
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [commandResult, setCommandResult] = useState<any>(null);

  const statusColors: Record<string, string> = {
    ONLINE: "bg-emerald-500", OFFLINE: "bg-red-500", REGISTERED: "bg-blue-500",
    PROVISIONED: "bg-cyan-500", MAINTENANCE: "bg-amber-500", DECOMMISSIONED: "bg-slate-600",
  };

  const statusCounts: Record<string, number> = {};
  devices?.forEach((d: any) => { statusCounts[d.status] = (statusCounts[d.status] || 0) + 1; });

  const sendCommand = async (deviceId: string, command: string) => {
    const res = await api.post("/iot/heartbeat/commands", { deviceId, command, payload: {} }, token || undefined);
    setCommandResult(res.data);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">🎛️ IoT Command Center</h1>
          <p className="text-slate-400 text-sm mt-1">Real-time fleet overview, device control, and health monitoring</p>
        </div>
      </div>

      {/* Fleet Status Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Total Devices", value: devices?.length || 0, icon: "📡", color: "brand" },
          { label: "Online", value: statusCounts["ONLINE"] || 0, icon: "🟢", color: "emerald" },
          { label: "Offline", value: statusCounts["OFFLINE"] || 0, icon: "🔴", color: "red" },
          { label: "Registered", value: statusCounts["REGISTERED"] || 0, icon: "📋", color: "blue" },
          { label: "Maintenance", value: statusCounts["MAINTENANCE"] || 0, icon: "🔧", color: "amber" },
          { label: "Alerts", value: health?.recentAlerts?.length || 0, icon: "⚠️", color: "orange" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xl">{s.icon}</span>
              <span className={`text-2xl font-bold text-${s.color}-400`}>{s.value}</span>
            </div>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Device Fleet Grid */}
        <div className="lg:col-span-2 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">📡 Device Fleet</h2>
          {devicesLoading ? <div className="text-center text-slate-500 py-8">Loading fleet...</div> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {devices?.map((d: any) => (
                <button key={d.id} onClick={() => setSelectedDevice(d.id)}
                  className={`bg-slate-100 dark:bg-slate-800/50 border rounded-lg p-3 text-left transition-colors hover:border-brand-500/50
                    ${selectedDevice === d.id ? "border-brand-500 bg-brand-900/20" : "border-slate-200 dark:border-slate-700"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full ${statusColors[d.status] || "bg-slate-500"}`} />
                    <span className="text-xs text-slate-500 font-mono">{d.deviceCode}</span>
                  </div>
                  <p className="text-sm text-slate-900 dark:text-white truncate">{d.deviceName || d.name}</p>
                  <p className="text-xs text-slate-500">{d.firmwareVersion}</p>
                </button>
              ))}
              {(!devices || devices.length === 0) && (
                <div className="col-span-full text-center text-slate-500 py-8">No devices registered</div>
              )}
            </div>
          )}
        </div>

        {/* Device Detail / Command Panel */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">🎮 Device Commands</h2>
            {selectedDevice ? (
              <div className="space-y-2">
                {["RESTART", "STATUS_REPORT", "OTA_CHECK", "CALIBRATE", "SLEEP_MODE"].map(cmd => (
                  <button key={cmd} onClick={() => sendCommand(selectedDevice, cmd)}
                    className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors text-left flex items-center gap-2">
                    <span className="text-sm">{cmd === "RESTART" ? "🔄" : cmd === "STATUS_REPORT" ? "📊" : cmd === "OTA_CHECK" ? "📥" : cmd === "CALIBRATE" ? "🔧" : "💤"}</span>
                    {cmd.replace("_", " ")}
                  </button>
                ))}
                {commandResult && (
                  <div className="mt-2 bg-slate-100 dark:bg-slate-800/50 rounded-lg p-2 text-xs text-emerald-400">
                    ✓ Command sent: {JSON.stringify(commandResult).slice(0, 100)}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-slate-500 text-xs text-center py-8">Select a device to send commands</p>
            )}
          </div>

          {/* Recent Alerts */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">⚠️ Recent Alerts</h2>
            {health?.recentAlerts?.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {health.recentAlerts.slice(0, 10).map((alert: any, i: number) => (
                  <div key={i} className="bg-red-900/20 border border-red-900/30 rounded-lg p-2 text-xs">
                    <p className="text-red-400">{alert.message || alert.alertType}</p>
                    <p className="text-slate-500">{alert.deviceId?.slice(0, 12)}... — {new Date(alert.triggeredAt || alert.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-slate-500 text-xs text-center py-4">No active alerts</p>}
          </div>

          {/* Quick Links */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">⚡ Quick Access</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Health Monitor", href: "/iot/health", icon: "💓" },
                { label: "Fleet Overview", href: "/iot/fleet", icon: "🚀" },
                { label: "Device List", href: "/iot", icon: "📡" },
                { label: "Live Telemetry", href: "/iot/live", icon: "📺" },
              ].map(link => (
                <Link key={link.label} href={link.href}>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 text-center hover:bg-slate-700 transition-colors cursor-pointer">
                    <span className="text-lg block">{link.icon}</span>
                    <span className="text-xs text-slate-400">{link.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
