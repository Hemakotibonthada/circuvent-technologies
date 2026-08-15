import React, { useMemo } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { countBy, fleetHealth, formatDuration } from "../../../enterprise";
import { Screen, useTheme } from "../../../ui";
import { Donut, HBars } from "../../../charts";
import { HealthStrip, Kpi, KpiGrid, Callout, MetricRow } from "../../../enterprise-ui";
import { describeBrokerCert } from "../../../broker-cert";
import { AccessRequired, EmptyFleet, FleetError, FleetLoading, FleetScaffold } from "./parts";
import { latestFirmware, useFleetBundle } from "./useFleet";

export default function FleetOverview({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const fleet = useFleetBundle(true);
  const devices = fleet.data?.devices || [];
  const health = useMemo(() => fleetHealth(devices), [devices]);
  const versionRows = useMemo(() => countBy(devices, (d) => d.fw_version || "unknown"), [devices]);
  const versionTarget = useMemo(() => latestFirmware(devices), [devices]);
  const typeRows = fleet.data?.stats?.byType || [];
  const cert = describeBrokerCert(fleet.data?.health?.brokerCert);

  if (fleet.loading) return <Screen><FleetScaffold title="Fleet overview" subtitle="Loading control plane" onBack={onBack}><FleetLoading /></FleetScaffold></Screen>;
  if (fleet.adminBlocked) return <Screen><FleetScaffold title="Fleet overview" subtitle="Admin-only" onBack={onBack} onRefresh={fleet.reload}><AccessRequired onRetry={fleet.reload} /></FleetScaffold></Screen>;
  if (fleet.error && !fleet.data) return <Screen><FleetScaffold title="Fleet overview" subtitle="Control plane" onBack={onBack} onRefresh={fleet.reload}><FleetError message={fleet.error} onRetry={fleet.reload} /></FleetScaffold></Screen>;

  return (
    <Screen>
      <FleetScaffold title="Fleet overview" subtitle="Live device-fleet health" onBack={onBack} onRefresh={fleet.reload}>
        <ScrollView refreshControl={<RefreshControl refreshing={fleet.refreshing} onRefresh={fleet.refresh} tintColor={c.accent} />} contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}>
          {fleet.error ? <Callout kind="warning" text={fleet.error} icon="warning" /> : null}
          {!devices.length ? <EmptyFleet /> : null}
          <KpiGrid>
            <Kpi icon="fleet" label="Total" value={health.total} tint={c.accentHi} />
            <Kpi icon="online" label="Online" value={health.online} tint={c.green} />
            <Kpi icon="offline" label="Offline" value={health.offline} tint={c.faint} invertDelta />
            <Kpi icon="latency" label="Stale" value={health.stale} tint={health.stale ? c.amber : c.green} invertDelta footnote="Online flag set but silent" />
            <Kpi icon="version" label="Firmware versions" value={versionRows.length} footnote={versionTarget ? `Latest seen ${versionTarget}` : "No versions reported"} />
          </KpiGrid>

          {fleet.data?.health ? (
            <HealthStrip items={[
              { label: "MQTT", ok: fleet.data.health.mqtt, detail: fleet.data.health.mqtt ? "broker reachable" : "broker down" },
              { label: "Database", ok: fleet.data.health.db, detail: fleet.data.health.db ? "reachable" : "down" },
              // Not a binary leg: the broker is reachable whatever the expiry
              // says, so `ok` tracks the broker and the pill carries the date.
              { label: "Certificate", ok: cert.level !== "expired", detail: cert.level === "unknown" ? "not reported" : "expires in", status: cert.detail.toUpperCase(), tone: cert.level === "expired" ? c.red : cert.level === "expiring" ? c.amber : cert.level === "unknown" ? c.faint : c.green },
              { label: "Uptime", ok: fleet.data.health.uptimeSec > 0, detail: formatDuration(fleet.data.health.uptimeSec) },
              { label: "Node", ok: true, detail: fleet.data.health.node || "—" },
            ]} />
          ) : <Callout kind="info" icon="info" text="Platform health endpoint did not return data for this account." />}

          <View style={{ gap: 10 }}>
            <Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>Firmware distribution</Text>
            {versionRows.length ? <HBars unit=" devices" items={versionRows.map((r, i) => ({ name: r.key, value: r.count, color: [c.accent, c.cyan, c.violet, c.amber, c.green][i % 5] }))} /> : <Callout kind="info" text="No firmware versions are present in the loaded inventory." />}
          </View>

          <View style={{ gap: 10 }}>
            <Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>Device types</Text>
            {typeRows.length ? (
              <View style={{ alignItems: "center", gap: 12 }}>
                <Donut size={180} segments={typeRows.map((r, i) => ({ label: r.type || "unknown", value: r.count, color: [c.accent, c.green, c.amber, c.cyan, c.violet][i % 5] }))} />
                {typeRows.map((r) => <MetricRow key={r.type} label={r.type || "unknown"} value={`${r.count} devices`} icon="device" />)}
              </View>
            ) : <Callout kind="info" text="The statistics endpoint did not include a type distribution." />}
          </View>
        </ScrollView>
      </FleetScaffold>
    </Screen>
  );
}
