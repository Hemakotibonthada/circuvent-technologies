import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api, type AdminDevice, type AdminEvent, type AdminStats } from "../../../api";
import { useTheme, Card, useAppActive, EmptyState } from "../../../ui";
import { HealthStrip, HeroBand, Kpi, KpiGrid, LoadingState } from "../../../enterprise-ui";
import { BarChart, Donut, Legend } from "../../../charts";
import { bucketSeries, fleetHealth, formatDuration, formatRelative, pct } from "../../../enterprise";
import { unwrap, useAdminResource } from "./useAdmin";
import { AdminScreenFrame, QuickLink, ScreenGate, SectionTitle, SourceNote, styles } from "./parts";
import UserManagement from "./UserManagement";
import RolesAndAccess from "./RolesAndAccess";
import AuditTrail from "./AuditTrail";
import Reports from "./Reports";
import OrgSettings from "./OrgSettings";

type LocalScreen = "console" | "users" | "roles" | "audit" | "reports" | "settings";

interface ConsoleData {
  stats: AdminStats;
  health: { mqtt: boolean; db: boolean; uptimeSec: number; node: string };
  devices: AdminDevice[];
  events: AdminEvent[];
}

async function loadConsole(): Promise<ConsoleData> {
  const [stats, health, devs, evs] = await Promise.all([
    unwrap(api.adminStats(), "Unable to load administrator statistics."),
    unwrap(api.adminHealth(), "Unable to load control-plane health."),
    unwrap(api.adminDevices(), "Unable to load administrator devices."),
    unwrap(api.adminEvents(200), "Unable to load administrator events."),
  ]);
  return { stats, health, devices: devs.devices, events: evs.events };
}

export default function AdminConsole({ onBack }: { onBack: () => void }) {
  const [screen, setScreen] = useState<LocalScreen>("console");
  if (screen === "users") return <UserManagement onBack={() => setScreen("console")} />;
  if (screen === "roles") return <RolesAndAccess onBack={() => setScreen("console")} openUsers={() => setScreen("users")} />;
  if (screen === "audit") return <AuditTrail onBack={() => setScreen("console")} />;
  if (screen === "reports") return <Reports onBack={() => setScreen("console")} />;
  if (screen === "settings") return <OrgSettings onBack={() => setScreen("console")} />;
  return <ConsoleHome onBack={onBack} open={setScreen} />;
}

function ConsoleHome({ onBack, open }: { onBack: () => void; open: (s: LocalScreen) => void }) {
  const loader = useCallback(() => loadConsole(), []);
  const { state, refresh } = useAdminResource(loader);
  const active = useAppActive();

  useEffect(() => {
    if (!active || state.status !== "ready") return;
    const id = setInterval(() => refresh(), 30000);
    return () => clearInterval(id);
  }, [active, refresh, state.status]);

  return (
    <ScreenGate state={state} onBack={onBack} onRetry={refresh}>
      {(data) => <ConsoleReady data={data} refreshing={state.refreshing} onRefresh={refresh} onBack={onBack} open={open} />}
    </ScreenGate>
  );
}

function ConsoleReady({ data, refreshing, onRefresh, onBack, open }: { data: ConsoleData; refreshing: boolean; onRefresh: () => void; onBack: () => void; open: (s: LocalScreen) => void }) {
  const { c } = useTheme();
  const health = useMemo(() => fleetHealth(data.devices), [data.devices]);
  const typeSegments = useMemo(() => {
    const palette = [c.accent, c.cyan, c.violet, c.green, c.amber, c.red];
    return data.stats.byType.map((x, i) => ({ label: x.type || "unknown", value: x.count, color: palette[i % palette.length] }));
  }, [c, data.stats.byType]);
  const eventBuckets = useMemo(() => bucketSeries(data.events.map((e) => ({ t: new Date(e.ts).getTime(), v: 1 })).filter((p) => Number.isFinite(p.t)), 8), [data.events]);
  const bucketValues = eventBuckets.map((b) => b.v);
  const times = data.events.map((e) => new Date(e.ts).getTime()).filter(Number.isFinite);
  const min = times.length ? Math.min(...times) : 0;
  const max = times.length ? Math.max(...times) : 0;
  const bucketSize = min && max ? formatDuration(Math.max(1, (max - min) / 1000 / 8)) : "no observed span";

  return (
    <AdminScreenFrame title="Admin Console" subtitle="Operations landing page" onBack={onBack} refreshing={refreshing} onRefresh={onRefresh} actions={[{ icon: "refresh", label: "Refresh", onPress: onRefresh }]}>
      <HeroBand label="Control plane" value={data.health.db && data.health.mqtt ? "Healthy" : "Needs attention"} caption="Real-time status from /admin/health" right={<Text style={{ color: c.onAccent, fontWeight: "900" }}>{formatDuration(data.health.uptimeSec)}</Text>} />
      <HealthStrip items={[{ label: "Database", ok: data.health.db }, { label: "MQTT broker", ok: data.health.mqtt }, { label: "Node runtime", ok: !!data.health.node, detail: data.health.node }, { label: "Uptime", ok: data.health.uptimeSec > 0, detail: formatDuration(data.health.uptimeSec) }]} />
      <KpiGrid>
        <Kpi icon="users" label="Users" value={data.stats.users} />
        <Kpi icon="devices" label="Devices" value={data.stats.devices} />
        <Kpi icon="online" label="Online" value={data.stats.online} footnote={`${Math.round(pct(data.stats.online, data.stats.devices))}% online`} tint={c.green} />
        <Kpi icon="history" label="Events, 7d" value={data.stats.events7d} />
        <Kpi icon="pending" label="Pending signups" value={data.stats.pendingSignups} tint={data.stats.pendingSignups ? c.amber : c.text} />
        <Kpi icon="offline" label="Stale devices" value={health.stale} tint={health.stale ? c.amber : c.green} footnote="Derived from /admin/devices last_seen" />
      </KpiGrid>

      <SectionTitle icon="charts" title="Fleet mix" subtitle="Device-type distribution from /admin/stats" />
      <Card style={{ marginBottom: 14 }}>
        {typeSegments.length ? <><Donut segments={typeSegments} size={150} /><Legend items={typeSegments.map((s) => ({ name: s.label, color: s.color, value: String(s.value) }))} /></> : <EmptyState icon="devices" title="No devices yet" subtitle="The stats endpoint returned an empty device-type distribution." />}
      </Card>

      <SectionTitle icon="activity" title="Observed event volume" subtitle="Bounded by the latest 200 admin event rows" />
      <Card style={{ marginBottom: 14 }}>
        <BarChart data={bucketValues} color={c.accentHi} />
        <SourceNote text={`Bucket size: ${bucketSize}. This chart is based only on the ${data.events.length} rows fetched from /admin/events?limit=200, not an all-time audit log.`} />
        <Text style={{ color: c.textDim, fontSize: 12 }}>{data.events[0] ? `Newest event ${formatRelative(data.events[0].ts)}` : "No events returned by the server."}</Text>
      </Card>

      <SectionTitle icon="admin" title="Administration modules" subtitle="Open focused governance tools" />
      <View style={styles.wrap}>
        <View style={{ flex: 1, minWidth: 260 }}>
          <QuickLink icon="users" title="User management" subtitle="Real users, admin flag and ownership" onPress={() => open("users")} />
          <QuickLink icon="role" title="Roles and access" subtitle="Honest local presentation roles" onPress={() => open("roles")} />
          <QuickLink icon="audit" title="Audit trail" subtitle="Server events plus local admin actions" onPress={() => open("audit")} />
        </View>
        <View style={{ flex: 1, minWidth: 260 }}>
          <QuickLink icon="report" title="Reports" subtitle="On-screen, copyable real-data reports" onPress={() => open("reports")} />
          <QuickLink icon="settings" title="Organisation settings" subtitle="Connection and device-local preferences" onPress={() => open("settings")} />
        </View>
      </View>
    </AdminScreenFrame>
  );
}
