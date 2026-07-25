import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, AppEvent, EnergySeries, EnergySummary } from "../../api";
import { useDevices } from "../../store";
import { BarChart, Donut, Gauge, LineChart } from "../../charts";
import { Card, IconButton, Screen, SectionLabel, StatTile, Title, useTheme } from "../../ui";
import { GRAD } from "../../theme";

const colors = ["#06b6d4", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6"];
export default function Analytics({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const { devices } = useDevices(); const [summary, setSummary] = useState<EnergySummary | null>(null); const [series, setSeries] = useState<EnergySeries | null>(null); const [events, setEvents] = useState<AppEvent[]>([]);
  const load = useCallback(async () => { const [s, e] = await Promise.all([api.energySummary(), api.events(200)]); if (s.ok) { setSummary(s.data); const top = [...(s.data.byDevice || [])].sort((a, b) => b.watts - a.watts)[0]; if (top) api.deviceEnergy(top.id, 24, "watts").then((r) => r.ok && setSeries(r.data)); } if (e.ok) setEvents(e.data.events || []); }, []);
  useEffect(() => { load(); }, [load]);
  const online = devices.filter((d) => d.online).length;
  const typeSegments = useMemo(() => Object.entries(devices.reduce<Record<string, number>>((m, d) => ({ ...m, [d.type]: (m[d.type] || 0) + 1 }), {})).map(([label, value], i) => ({ label, value, color: colors[i % colors.length] })), [devices]);
  const active = useMemo(() => Object.entries(events.reduce<Record<string, number>>((m, e) => e.device_id ? ({ ...m, [e.device_id]: (m[e.device_id] || 0) + 1 }) : m, {})).sort((a, b) => b[1] - a[1]).slice(0, 5), [events]);
  const commandsByDay = useMemo(() => { const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toISOString().slice(0, 10); }); const counts = Object.fromEntries(days.map((d) => [d, 0])); events.filter((e) => /command|control|scene|automation/i.test(`${e.kind} ${e.title}`)).forEach((e) => { const k = e.ts.slice(0, 10); if (k in counts) counts[k] += 1; }); return days.map((d) => counts[d]); }, [events]);
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Analytics</Title></View>
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}><StatTile label="Live watts" value={String(Math.round(summary?.liveWatts || 0))} grad={GRAD.amber} glyph="⚡" /><StatTile label="Events" value={String(events.length)} grad={GRAD.violet} glyph="📜" /></View>
    <Card style={{ alignItems: "center", marginBottom: 14 }}><Gauge value={online} max={Math.max(devices.length, 1)} label="online rate" unit={`/${devices.length}`} /></Card>
    <SectionLabel>ENERGY TREND</SectionLabel><Card style={{ marginBottom: 14 }}><LineChart data={(series?.series || []).map((p) => p.avg)} /><Text style={{ color: c.faint, marginTop: 8 }}>Top consumer trend from live energy data.</Text></Card>
    <SectionLabel>DEVICE TYPES</SectionLabel><Card style={{ marginBottom: 14 }}>{typeSegments.length ? <Donut segments={typeSegments} /> : <Text style={{ color: c.faint }}>No devices yet.</Text>}</Card>
    <SectionLabel>MOST ACTIVE</SectionLabel><Card style={{ marginBottom: 14 }}>{active.map(([id, n]) => <Text key={id} style={{ color: c.textDim, marginBottom: 6 }}>{devices.find((d) => d.id === id)?.name || id}: <Text style={{ color: c.text, fontWeight: "800" }}>{n}</Text></Text>)}{!active.length && <Text style={{ color: c.faint }}>No activity yet.</Text>}</Card>
    <SectionLabel>COMMANDS / DAY</SectionLabel><Card><BarChart data={commandsByDay} /></Card>
  </ScrollView></Screen>;
}
