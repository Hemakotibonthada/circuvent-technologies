import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { api, AppEvent, Device } from "../../api";
import { useDevices } from "../../store";
import { Card, GhostButton, IconButton, Screen, SectionLabel, Title, useTheme } from "../../ui";

const safety = (d: Device) => ["guardian", "motion-sensor", "aquaguard"].includes(d.type);
export default function SafetyCenter({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const { devices, command } = useDevices(); const [events, setEvents] = useState<AppEvent[]>([]);
  const load = useCallback(async () => { const r = await api.events(50); if (r.ok) setEvents((r.data.events || []).filter((e) => /security|alert/i.test(e.kind))); }, []);
  useEffect(() => { load(); }, [load]); const list = useMemo(() => devices.filter(safety), [devices]);
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Safety Center</Title></View><SectionLabel>Safety devices</SectionLabel>
    {list.map((d) => <Card key={d.id} style={{ marginBottom: 10 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: "800" }}>{d.name}</Text><Text style={{ color: c.faint }}>{d.type} • {d.online ? "online" : "offline"}</Text></View>{(d.type === "guardian" || d.type === "motion-sensor") && <Switch value={!!d.state.armed} onValueChange={(v) => command(d.id, { action: "set", armed: v })} trackColor={{ true: c.accent, false: c.borderHi }} thumbColor="#fff" />}</View>{d.state.sos ? <View style={{ marginTop: 10 }}><Text style={{ color: c.red, fontWeight: "800" }}>SOS active</Text><GhostButton label="Clear SOS" onPress={() => command(d.id, { action: "set", sos: false })} style={{ marginTop: 8 }} /></View> : null}{d.type === "aquaguard" && <Text style={{ color: c.textDim, marginTop: 8 }}>Level {Number(d.state.level ?? 0)}% {d.state.dryRun ? "• Dry-run" : ""} {d.state.overflow ? "• Overflow" : ""}</Text>}</Card>)}
    {!list.length && <Text style={{ color: c.faint }}>No safety devices found.</Text>}<SectionLabel style={{ marginTop: 10 }}>RECENT ALERTS</SectionLabel>{events.map((e) => <Card key={e.id} style={{ marginBottom: 8 }}><Text style={{ color: c.text, fontWeight: "800" }}>{e.title}</Text><Text style={{ color: c.textDim }}>{e.body}</Text></Card>)}</ScrollView></Screen>;
}
