import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, EnergySeries } from "../../api";
import { useDevices } from "../../store";
import { Card, IconButton, Screen, SectionLabel, Title, useTheme } from "../../ui";

export default function AiHub({ onBack, onOpenEnergy, onOpenAutomate, onOpenDevices, onOpenSuggestions }: { onBack: () => void; onOpenEnergy: () => void; onOpenAutomate: () => void; onOpenDevices: () => void; onOpenSuggestions: () => void }) {
  const { c } = useTheme(); const { devices } = useDevices(); const [automations, setAutomations] = useState(0); const [series, setSeries] = useState<EnergySeries | null>(null);
  const load = useCallback(async () => { const [a, s] = await Promise.all([api.automations(), api.energySummary()]); if (a.ok) setAutomations(a.data.automations.length); const top = s.ok ? [...s.data.byDevice].sort((x, y) => y.watts - x.watts)[0] : null; if (top) api.deviceEnergy(top.id, 24, "watts").then((r) => r.ok && setSeries(r.data)); }, []);
  useEffect(() => { load(); }, [load]);
  const insights = useMemo(() => {
    const out: { title: string; body: string; action: string; go: () => void }[] = [];
    const off = devices.filter((d) => !d.online).length; if (off) out.push({ title: `${off} devices offline`, body: "Maintenance attention recommended.", action: "Open devices", go: onOpenDevices });
    const low = devices.find((d) => d.type === "aquaguard" && Number(d.state.level ?? 100) < 25); if (low) out.push({ title: "AquaGuard tank low", body: `${low.name} level is ${low.state.level}%.`, action: "Open energy", go: onOpenEnergy });
    if (!automations) out.push({ title: "No automations yet", body: "Create routines to reduce manual control.", action: "Automate", go: onOpenAutomate });
    if (series?.series.length) { const peak = series.series.reduce((m, p) => p.max > m.max ? p : m, series.series[0]); out.push({ title: `Peak power at ${new Date(peak.t).getHours()}:00`, body: `Recorded ${Math.round(peak.max)} W from real telemetry.`, action: "Energy", go: onOpenEnergy }); }
    if (!out.length) out.push({ title: "Home is stable", body: "No urgent insight from current telemetry.", action: "Suggestions", go: onOpenSuggestions }); return out;
  }, [devices, automations, series, onOpenDevices, onOpenEnergy, onOpenAutomate, onOpenSuggestions]);
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>AI Insights</Title></View><SectionLabel>REAL DATA INSIGHTS</SectionLabel>{insights.map((x) => <Card key={x.title} onPress={x.go} style={{ marginBottom: 10 }}><Text style={{ color: c.text, fontWeight: "900", fontSize: 17 }}>{x.title}</Text><Text style={{ color: c.textDim, marginTop: 6 }}>{x.body}</Text><Text style={{ color: c.accent, fontWeight: "800", marginTop: 10 }}>{x.action} ›</Text></Card>)}</ScrollView></Screen>;
}
