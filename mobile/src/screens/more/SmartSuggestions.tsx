import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api } from "../../api";
import { useDevices } from "../../store";
import { Card, IconButton, PrimaryButton, Screen, SectionLabel, Title, useTheme } from "../../ui";

export default function SmartSuggestions({ onBack, onOpenAutomate, onOpenDevices, onOpenSettings }: { onBack: () => void; onOpenAutomate: () => void; onOpenDevices: () => void; onOpenSettings: () => void }) {
  const { c } = useTheme(); const { devices } = useDevices(); const [scenes, setScenes] = useState(0);
  const load = useCallback(async () => { const r = await api.scenes(); if (r.ok) setScenes(r.data.scenes.length); }, []); useEffect(() => { load(); }, [load]);
  const items = useMemo(() => { const off = devices.filter((d) => !d.online).length; const hasPump = devices.some((d) => ["aquaguard", "agri-starter"].includes(d.type)); return [{ t: "Create a Good Night scene", b: scenes ? "You can refine bedtime scenes." : "No bedtime scene found in your scene data.", go: onOpenAutomate }, hasPump ? { t: "Schedule your pump", b: "Pump device detected; automate safe run windows.", go: onOpenAutomate } : null, off ? { t: `${off} devices offline — check them`, b: "Offline devices may need power or Wi‑Fi attention.", go: onOpenDevices } : null, { t: "Enable notifications", b: "Keep alert delivery available for safety events.", go: onOpenSettings }].filter(Boolean) as { t: string; b: string; go: () => void }[]; }, [devices, scenes, onOpenAutomate, onOpenDevices, onOpenSettings]);
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Suggestions</Title></View><SectionLabel>ACTIONABLE</SectionLabel>{items.map((x) => <Card key={x.t} style={{ marginBottom: 10 }}><Text style={{ color: c.text, fontWeight: "900" }}>{x.t}</Text><Text style={{ color: c.textDim, marginTop: 6 }}>{x.b}</Text><PrimaryButton label="Take action" onPress={x.go} style={{ marginTop: 10 }} /></Card>)}</ScrollView></Screen>;
}
