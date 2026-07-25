import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, Device } from "../../api";
import { useDevices } from "../../store";
import { Card, IconButton, Screen, SectionLabel, Title, useTheme } from "../../ui";
import { Sparkline } from "../../charts";
import { deviceMeta } from "../../theme";

type Props = { onBack: () => void };
type Series = Record<string, number[]>;
const keys = ["temperature", "humidity", "level", "watts", "motion", "battery", "pump", "power", "brightness", "speed", "position"];
const label = (k: string) => k.replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase());
const num = (v: unknown) => typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : typeof v === "string" && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : null;
const unit = (k: string) => k.includes("temp") ? "°C" : /humidity|level|battery|brightness|position/.test(k) ? "%" : k.includes("watt") ? "W" : "";
function readings(d: Device) {
  return Object.entries(d.state || {}).map(([k, v]) => [k, num(v)] as const).filter(([k, v]) => v !== null && (keys.includes(k) || typeof d.state[k] === "number"));
}

export default function Sensors({ onBack }: Props) {
  const { c } = useTheme();
  const { devices } = useDevices();
  const [series, setSeries] = useState<Record<string, Series>>({});
  useEffect(() => {
    let stop = false;
    devices.forEach((d) => {
      const ks = readings(d).map(([k]) => k);
      if (!ks.length) return;
      const metric = ks.includes("watts") ? "watts" : ks[0];
      api.deviceEnergy(d.id, 24, metric).then(async (r) => {
        if (stop) return;
        const next: Series = {};
        if (r.ok && r.data.series?.length) next[metric] = r.data.series.map((p) => Number(p.avg || p.max || 0));
        if (!Object.keys(next).length) {
          const tr = await api.telemetry(d.id, 24);
          if (tr.ok) ks.forEach((k) => { next[k] = tr.data.telemetry.map((t) => num(t.payload?.[k]) ?? 0).filter(Number.isFinite); });
        }
        setSeries((prev) => ({ ...prev, [d.id]: next }));
      });
    });
    return () => { stop = true; };
  }, [devices]);
  const sensorDevices = useMemo(() => devices.filter((d) => readings(d).length), [devices]);
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Sensors</Title></View>
    <SectionLabel>LIVE SENSOR GRID</SectionLabel>
    {sensorDevices.map((d) => <DeviceSensors key={d.id} d={d} series={series[d.id] || {}} />)}
    {!sensorDevices.length && <Text style={{ color: c.faint }}>No numeric telemetry found yet.</Text>}
  </ScrollView></Screen>;
}

function DeviceSensors({ d, series }: { d: Device; series: Series }) {
  const { c } = useTheme(); const meta = deviceMeta(d.type); const vals = readings(d);
  return <Card style={{ marginBottom: 12 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}><Text style={{ fontSize: 22 }}>{meta.glyph}</Text><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: "800" }}>{d.name}</Text><Text style={{ color: c.faint, fontSize: 12 }}>{d.room || meta.label}</Text></View><View style={{ width: 8, height: 8, borderRadius: 5, backgroundColor: d.online ? c.green : c.faint }} /></View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{vals.map(([k, v]) => <Card key={k} padded hi style={{ width: "47%" }}><Text style={{ color: c.faint, fontSize: 11 }}>{label(k)}</Text><Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }}>{v}{unit(k)}</Text><Sparkline data={series[k] || [Number(v)]} color={meta.accent} /></Card>)}</View></Card>;
}
