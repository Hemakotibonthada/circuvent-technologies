"use client";

import React, { useState, useEffect } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { useWebSocket } from "@/hooks/use-websocket";
import { PageHeader, Card, CardHeader, StatCard, Badge, Button } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/utils";

interface LiveMetric {
  deviceId: string;
  deviceCode?: string;
  cpuUsage?: number;
  memoryUsage?: number;
  temperature?: number;
  batteryLevel?: number;
  timestamp: string;
  isHealthy: boolean;
}

export default function IoTLiveDashboard() {
  const { token } = useAuth();
  const { data: health } = useApi<any>("/iot/heartbeat/health");
  const [liveMetrics, setLiveMetrics] = useState<Map<string, LiveMetric>>(new Map());
  const [alerts, setAlerts] = useState<any[]>([]);

  const { isConnected, subscribe, onMessage, connectionStatus } = useWebSocket({
    channels: ["iot:heartbeat", "iot:alerts"],
    autoConnect: true,
  });

  // Listen for heartbeat events
  useEffect(() => {
    const unsubHeartbeat = onMessage("iot:heartbeat", (msg) => {
      if (msg.event === "heartbeat_received") {
        setLiveMetrics((prev) => {
          const next = new Map(prev);
          next.set(msg.data.deviceId, msg.data as LiveMetric);
          return next;
        });
      }
    });

    const unsubAlerts = onMessage("iot:alerts", (msg) => {
      if (msg.event === "new_alert") {
        setAlerts((prev) => [msg.data, ...prev].slice(0, 20));
      }
    });

    return () => { unsubHeartbeat(); unsubAlerts(); };
  }, [onMessage]);

  const liveDevices = Array.from(liveMetrics.values());
  const healthyDevices = liveDevices.filter((d) => d.isHealthy);
  const unhealthyDevices = liveDevices.filter((d) => !d.isHealthy);

  return (
    <div className="space-y-6">
      <PageHeader
        title="IoT Live Dashboard"
        subtitle="Real-time device monitoring via WebSocket"
        breadcrumbs={[{ label: "IoT Devices", href: "/iot" }, { label: "Live Dashboard" }]}
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
              <span className="text-xs text-slate-500">
                {connectionStatus === "connected" ? "Live" : connectionStatus === "connecting" ? "Connecting..." : "Disconnected"}
              </span>
            </div>
          </div>
        }
      />

      {/* Connection Status Banner */}
      {!isConnected && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
          <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-400">WebSocket Not Connected</p>
            <p className="text-xs text-slate-400">Real-time data requires WebSocket. Sign in and ensure the WS server is running.</p>
          </div>
        </div>
      )}

      {/* Live Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard title="Live Devices" value={liveDevices.length} color="green" />
        <StatCard title="Healthy" value={healthyDevices.length} color="emerald" />
        <StatCard title="Unhealthy" value={unhealthyDevices.length} color={unhealthyDevices.length > 0 ? "red" : "slate"} />
        <StatCard title="Live Alerts" value={alerts.length} color={alerts.length > 0 ? "red" : "slate"} />
        <StatCard title="Total Fleet" value={health?.totalDevices ?? "—"} color="blue" />
      </div>

      {/* Live Alerts Stream */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader title="Live Alert Stream" subtitle="Real-time alerts from devices" />
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {alerts.map((alert, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-red-500/5 border border-red-500/10 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge color={alert.severity === "CRITICAL" ? "red" : "amber"}>{alert.severity}</Badge>
                  <span className="text-xs text-white">{alert.alertType}</span>
                  <span className="text-xs text-slate-500">{alert.message}</span>
                </div>
                <span className="text-[10px] text-slate-600">{timeAgo(alert.timestamp)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Live Device Grid */}
      <div>
        <h3 className="mb-4 text-sm font-semibold text-slate-400 uppercase tracking-wider">
          Live Device Metrics ({liveDevices.length})
        </h3>

        {liveDevices.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-2xl mb-2">📡</p>
            <p className="text-sm text-slate-400">
              {isConnected
                ? "Waiting for device heartbeats..."
                : "Connect WebSocket to see live data"
              }
            </p>
            <p className="text-xs text-slate-600 mt-1">
              Devices send heartbeats every 30 seconds. Data will appear here in real-time.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {liveDevices.map((device) => (
              <Card key={device.deviceId} className={device.isHealthy ? "border-green-500/10" : "border-red-500/20 bg-red-500/5"}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-mono text-xs text-brand-400">{device.deviceCode || device.deviceId.slice(0, 12)}</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${device.isHealthy ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                      <span className="text-[10px] text-slate-500">{device.isHealthy ? "Healthy" : "Attention"}</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-600">{timeAgo(device.timestamp)}</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {device.cpuUsage !== undefined && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase">CPU</p>
                      <div className="flex items-center gap-2">
                        <p className={`text-lg font-bold ${device.cpuUsage > 80 ? "text-red-400" : "text-slate-900 dark:text-white"}`}>{device.cpuUsage}%</p>
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className={`h-1.5 rounded-full ${device.cpuUsage > 80 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${device.cpuUsage}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {device.memoryUsage !== undefined && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase">Memory</p>
                      <div className="flex items-center gap-2">
                        <p className={`text-lg font-bold ${device.memoryUsage > 85 ? "text-red-400" : "text-slate-900 dark:text-white"}`}>{device.memoryUsage}%</p>
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className={`h-1.5 rounded-full ${device.memoryUsage > 85 ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${device.memoryUsage}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {device.temperature !== undefined && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase">Temp</p>
                      <p className={`text-lg font-bold ${device.temperature > 70 ? "text-amber-400" : "text-slate-900 dark:text-white"}`}>{device.temperature}°C</p>
                    </div>
                  )}
                  {device.batteryLevel !== undefined && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase">Battery</p>
                      <p className={`text-lg font-bold ${device.batteryLevel < 20 ? "text-red-400" : "text-slate-900 dark:text-white"}`}>{device.batteryLevel}%</p>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Static Health Data (fallback when no WS) */}
      {!isConnected && health && (
        <Card>
          <CardHeader title="Fleet Health (Last Known)" subtitle="Data from REST API — connect WebSocket for live data" />
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{health.online ?? 0}</p>
              <p className="text-xs text-slate-500">Online</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-400">{health.offline ?? 0}</p>
              <p className="text-xs text-slate-500">Offline</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-400">{health.criticalAlerts ?? 0}</p>
              <p className="text-xs text-slate-500">Critical Alerts</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
