import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../../../api";
import type { Device } from "../../../api";
import { fleetHealth, formatDuration, formatRelative } from "../../../enterprise";
import { LineChart, Donut } from "../../../charts";
import { Screen, Card, ErrorState, EmptyState, useTheme } from "../../../ui";
import { HealthStrip, Kpi, KpiGrid, Callout, ScreenHeader, MetricRow, LoadingState } from "../../../enterprise-ui";
import { fmtMs, fmtNum, latencyStats, normalizeAdminDevice, Page } from "./parts";
import { useHealthProbe } from "./useProbe";
import { logDiagnostic } from "./log";

export default function SystemHealth({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [source, setSource] = useState<"admin" | "public">("public");
  const [health, setHealth] = useState<{ mqtt?: boolean; db?: boolean; uptimeSec?: number; node?: string; ok?: boolean }>({});
  const [stats, setStats] = useState<{ users: number; devices: number; online: number; events7d: number; pendingSignups: number }>();
  const [devices, setDevices] = useState<Device[]>([]);
  const probe = useHealthProbe(15000);

  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      const adminHealth = await api.adminHealth();
      if (adminHealth.ok) {
        const [adminStats, adminDevices] = await Promise.all([api.adminStats(), api.adminDevices()]);
        setSource("admin"); setHealth(adminHealth.data); setStats(adminStats.ok ? adminStats.data : undefined);
        setDevices(adminDevices.ok ? adminDevices.data.devices.map(normalizeAdminDevice) : []);
      } else {
        const [publicHealth, userDevices] = await Promise.all([api.health(), api.devices()]);
        setSource("public"); setHealth(publicHealth.ok ? publicHealth.data : { ok: false });
        setDevices(userDevices.ok ? userDevices.data.devices : []);
        if (!publicHealth.ok && !userDevices.ok) throw new Error("Unable to reach health or devices endpoints.");
      }
      await logDiagnostic({ severity: "info", kind: "refresh", title: "System health refreshed", detail: "Loaded live control-plane and fleet state" });
    } catch (e) { setError(e instanceof Error ? e.message : "Load failed"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const fh = useMemo(() => fleetHealth(devices), [devices]);
  const goodProbeMs = probe.samples.filter((s) => s.ok).map((s) => s.ms);
  const probeStats = latencyStats(goodProbeMs);

  return <Screen><ScreenHeader title="System health" subtitle="Control-plane liveness and fleet rollup" onBack={onBack} actions={[{ icon: "refresh", label: "Refresh", onPress: load }]} />
    <Page>{loading ? <LoadingState text="Reading real health endpoints…" /> : error ? <ErrorState text={error} onRetry={load} /> : <>
      <Callout kind="info" icon="latency" title="Measurement source" text={source === "admin" ? "Health strip uses real adminHealth() MQTT and database legs. The chart is an unauthenticated api.health() HTTP round-trip measured on this device." : "Admin health was not available, so this screen is using the unauthenticated api.health() endpoint and user-visible devices."} />
      <HealthStrip items={source === "admin" ? [
        { label: "MQTT broker leg", ok: !!health.mqtt, detail: "adminHealth()" },
        { label: "Database leg", ok: !!health.db, detail: "adminHealth()" },
        { label: "Control-plane process", ok: true, detail: health.uptimeSec != null ? formatDuration(health.uptimeSec) : health.node },
      ] : [{ label: "Public /health", ok: health.ok !== false, detail: "api.health()" }]} />
      <KpiGrid>
        <Kpi icon="users" label="Users" value={stats ? fmtNum(stats.users) : "—"} tint={c.violet} />
        <Kpi icon="devices" label="Devices" value={fmtNum(stats?.devices ?? fh.total)} tint={c.cyan} />
        <Kpi icon="online" label="Online" value={fmtNum(stats?.online ?? fh.online)} unit={`${Math.round(fh.onlinePct)}%`} tint={c.green} />
        <Kpi icon="offline" label="Stale" value={fmtNum(fh.stale)} tint={fh.stale ? c.amber : c.green} />
        <Kpi icon="alerts" label="Events 7d" value={stats ? fmtNum(stats.events7d) : "—"} tint={c.amber} />
        <Kpi icon="pending" label="Pending signups" value={stats ? fmtNum(stats.pendingSignups) : "—"} tint={stats?.pendingSignups ? c.amber : c.green} />
      </KpiGrid>
      <Card padded style={{ marginBottom: 12 }}>
        <Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>HTTP round-trip to the control plane from this device</Text>
        <Text style={{ color: c.faint, marginTop: 4 }}>Measured by timing real api.health() fetches every 15 seconds while the app is active. History begins when probing starts and is persisted locally.</Text>
        <LineChart data={goodProbeMs.slice(-60)} color={c.accentHi} height={170} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
          {[ ["Min", probeStats.min], ["Avg", probeStats.avg], ["P95", probeStats.p95], ["Max", probeStats.max] ].map(([k, v]) => <View key={String(k)} style={{ minWidth: 70 }}><Text style={{ color: c.faint, fontSize: 11 }}>{k}</Text><Text style={{ color: c.text, fontWeight: "900" }}>{fmtMs(Number(v))}</Text></View>)}
        </View>
      </Card>
      <Card padded style={{ marginBottom: 12 }}>
        <Text style={{ color: c.text, fontWeight: "900", fontSize: 16, marginBottom: 10 }}>Fleet composition</Text>
        {fh.total ? <Donut segments={[{ label: "Online", value: fh.online, color: c.green }, { label: "Offline", value: fh.offline, color: c.red }, { label: "Stale", value: fh.stale, color: c.amber }]} /> : <EmptyState icon="devices" title="No devices" subtitle="No real fleet rows were returned." />}
      </Card>
      <Card padded>{devices.slice(0, 8).map((d, i) => <MetricRow key={d.id} label={d.name} value={`${d.online ? "online" : "offline"} · ${formatRelative(d.last_seen)}`} icon="device" last={i === Math.min(8, devices.length) - 1} />)}</Card>
    </>}</Page></Screen>;
}
