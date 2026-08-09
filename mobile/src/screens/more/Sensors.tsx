import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { api, Device } from "../../api";
import { useDevices } from "../../store";
import { Card, IconButton, Screen, SectionLabel, Title, useTheme } from "../../ui";
import { Sparkline } from "../../charts";
import { deviceMeta } from "../../theme";
import { Icon } from "../../icons";
import { AsyncView, RefreshScroll, useAsync } from "../../async";

type Props = { onBack: () => void };
type Series = Record<string, number[]>;
const keys = ["temperature", "humidity", "level", "watts", "motion", "battery", "pump", "power", "brightness", "speed", "position"];
const label = (k: string) => k.replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase());
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : typeof v === "string" && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : null);
const unit = (k: string) => (k.includes("temp") ? "°C" : /humidity|level|battery|brightness|position/.test(k) ? "%" : k.includes("watt") ? "W" : "");
function readings(d: Device) {
  return Object.entries(d.state || {})
    .map(([k, v]) => [k, num(v)] as const)
    .filter(([k, v]) => v !== null && (keys.includes(k) || typeof d.state[k] === "number"));
}

export default function Sensors({ onBack }: Props) {
  const { c } = useTheme();
  const { devices } = useDevices();
  const sensorDevices = useMemo(() => devices.filter((d) => readings(d).length), [devices]);
  const ids = sensorDevices.map((d) => d.id).join(",");

  /*
   * History is fetched per device, so a partial failure is the normal outcome:
   * one device's telemetry can be missing while the rest are fine. Failing the
   * whole screen for that would be worse than what it did before. Instead each
   * device is settled independently and the screen only reports an error when
   * every one of them failed, which is what a hub being unreachable looks like.
   */
  const state = useAsync<Record<string, Series>>(async () => {
    if (!sensorDevices.length) return {};
    const results = await Promise.all(
      sensorDevices.map(async (d) => {
        const ks = readings(d).map(([k]) => k);
        const metric = ks.includes("watts") ? "watts" : ks[0];
        const next: Series = {};
        try {
          const r = await api.deviceEnergy(d.id, 24, metric);
          if (r.ok && r.data.series?.length) next[metric] = r.data.series.map((p) => Number(p.avg || p.max || 0));
          if (!Object.keys(next).length) {
            const tr = await api.telemetry(d.id, 24);
            if (tr.ok) ks.forEach((k) => { next[k] = tr.data.telemetry.map((t) => num(t.payload?.[k]) ?? 0).filter(Number.isFinite); });
            else return { id: d.id, next, failed: true };
          }
          return { id: d.id, next, failed: false };
        } catch {
          return { id: d.id, next, failed: true };
        }
      })
    );
    if (results.length && results.every((r) => r.failed)) {
      throw new Error("Can't reach the hub to load sensor history");
    }
    return Object.fromEntries(results.map((r) => [r.id, r.next]));
  }, [ids]);

  return (
    <Screen>
      <RefreshScroll state={state}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <IconButton glyph="‹" onPress={onBack} />
          <Title>Sensors</Title>
        </View>
        <SectionLabel>Live sensor grid</SectionLabel>
        <AsyncView
          state={state}
          isEmpty={() => sensorDevices.length === 0}
          emptyIcon="sensors"
          emptyTitle="No numeric telemetry yet"
          emptySubtitle="Devices appear here once they report a numeric reading."
          loadingText="Loading sensor history…"
        >
          {(series) => (
            <>
              {sensorDevices.map((d) => (
                <DeviceSensors key={d.id} d={d} series={series[d.id] || {}} />
              ))}
              <Text style={{ color: c.faint, fontSize: 12, marginTop: 4 }}>Pull down to refresh readings.</Text>
            </>
          )}
        </AsyncView>
      </RefreshScroll>
    </Screen>
  );
}

function DeviceSensors({ d, series }: { d: Device; series: Series }) {
  const { c } = useTheme();
  const meta = deviceMeta(d.type);
  const vals = readings(d);
  return (
    <Card style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Icon name={meta.icon} size={22} color={meta.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: "800" }}>{d.name}</Text>
          <Text style={{ color: c.faint, fontSize: 12 }}>{d.room || meta.label}</Text>
        </View>
        <View style={{ width: 8, height: 8, borderRadius: 5, backgroundColor: d.online ? c.green : c.faint }} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {vals.map(([k, v]) => (
          <Card key={k} padded hi style={{ width: "47%" }}>
            <Text style={{ color: c.faint, fontSize: 11 }}>{label(k)}</Text>
            <Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }}>
              {v}
              {unit(k)}
            </Text>
            <Sparkline data={series[k] || [Number(v)]} color={meta.accent} />
          </Card>
        ))}
      </View>
    </Card>
  );
}
