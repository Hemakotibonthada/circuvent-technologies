import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, AppEvent } from "../../api";
import { useDevices } from "../../store";
import { Card, IconButton, PrimaryButton, Screen, SectionLabel, Title, useTheme } from "../../ui";

export default function SecurityDashboard({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const { devices, command } = useDevices(); const [events, setEvents] = useState<AppEvent[]>([]);
  const sec = useMemo(() => devices.filter((d) => ["guardian", "motion-sensor"].includes(d.type)), [devices]); const armed = sec.filter((d) => d.state.armed).length; const sos = sec.filter((d) => d.state.sos);
  const load = useCallback(async () => { const r = await api.events(50); if (r.ok) setEvents((r.data.events || []).filter((e) => /security/i.test(e.kind))); }, []); useEffect(() => { load(); }, [load]);
  const setAll = (v: boolean) => sec.forEach((d) => command(d.id, { action: "set", armed: v }));
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Security</Title></View>{sos.map((d) => <Card key={d.id} hi style={{ borderColor: c.red, marginBottom: 10 }}><Text style={{ color: c.red, fontWeight: "900" }}>SOS: {d.name}</Text></Card>)}<View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}><PrimaryButton label="Arm all" icon="🛡️" onPress={() => setAll(true)} style={{ flex: 1 }} /><PrimaryButton label="Disarm all" icon="○" onPress={() => setAll(false)} style={{ flex: 1 }} /></View><Card style={{ marginBottom: 14 }}><Text style={{ color: c.text, fontSize: 24, fontWeight: "800" }}>{armed} armed / {Math.max(sec.length - armed, 0)} disarmed</Text><Text style={{ color: c.faint }}>Security device state</Text></Card><SectionLabel>Motion state</SectionLabel>{sec.map((d) => <Card key={d.id} style={{ marginBottom: 8 }}><Text style={{ color: c.text, fontWeight: "800" }}>{d.name}</Text><Text style={{ color: d.state.motion ? c.amber : c.textDim }}>{d.type === "motion-sensor" ? (d.state.motion ? "Motion detected" : "Clear") : (d.state.armed ? "Armed" : "Disarmed")}</Text></Card>)}<SectionLabel>Recent security events</SectionLabel>{events.map((e) => <Text key={e.id} style={{ color: c.textDim, marginBottom: 8 }}>• {e.title}</Text>)}</ScrollView></Screen>;
}
