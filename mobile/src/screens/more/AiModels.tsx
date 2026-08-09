import React from "react";
import { ScrollView, Text, View } from "react-native";
import { api } from "../../api";
import { useDevices } from "../../store";
import { Card, IconButton, Screen, SectionLabel, Title, useTheme } from "../../ui";
import { StaleNotice, unwrap, useAsync } from "../../async";

export default function AiModels({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const { devices } = useDevices();
  const state = useAsync<number>(async () => (await unwrap<{ automations: unknown[] }>(api.automations(), "your automations")).automations.length, []); const autos = state.data ?? 0;
  const models = [{ n: "Scheduling engine", e: autos > 0, u: `${autos} automations linked` }, { n: "Alerts engine", e: devices.some((d) => ["guardian", "motion-sensor", "aquaguard"].includes(d.type)), u: "Updated from safety devices" }, { n: "Energy analytics", e: devices.some((d) => Number(d.state.watts) > 0), u: "Updated from power telemetry" }, { n: "Scene suggestions", e: devices.length > 0, u: "Updated from device inventory" }];
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>AI Models</Title></View><StaleNotice error={state.error} onRetry={state.reload} /><SectionLabel>Intelligent features</SectionLabel>{models.map((m) => <Card key={m.n} style={{ marginBottom: 10 }}><Text style={{ color: c.text, fontWeight: "900" }}>{m.n}</Text><Text style={{ color: m.e ? c.green : c.faint, marginTop: 5 }}>{m.e ? "Enabled" : "Waiting for data"}</Text><Text style={{ color: c.textDim, marginTop: 3 }}>{m.u}</Text></Card>)}</ScrollView></Screen>;
}
