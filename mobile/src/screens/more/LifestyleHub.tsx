import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api } from "../../api";
import { useDevices } from "../../store";
import { Card, IconButton, Screen, SectionLabel, Title, useTheme } from "../../ui";
import { Sparkline } from "../../charts";

export default function LifestyleHub({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const { devices } = useDevices(); const [scenes, setScenes] = useState(0); const [water, setWater] = useState<number[]>([]);
  const load = useCallback(async () => { const s = await api.scenes(); if (s.ok) setScenes(s.data.scenes.length); const aq = devices.find((d) => d.type === "aquaguard"); if (aq) { const t = await api.telemetry(aq.id, 24); if (t.ok) setWater(t.data.telemetry.map((x) => Number(x.payload?.level)).filter(Number.isFinite)); } }, [devices]);
  useEffect(() => { load(); }, [load]);
  const comfort = useMemo(() => { const nums = devices.flatMap((d) => [Number(d.state.temperature), Number(d.state.humidity)]).filter(Number.isFinite); return nums.length ? "Comfort telemetry available" : "Add temperature/humidity sensor for comfort scoring"; }, [devices]);
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Lifestyle</Title></View><SectionLabel>Comfort</SectionLabel><Card style={{ marginBottom: 12 }}><Text style={{ color: c.text, fontWeight: "900" }}>{comfort}</Text></Card><SectionLabel>Water</SectionLabel><Card style={{ marginBottom: 12 }}><Text style={{ color: c.textDim }}>AquaGuard level trend</Text><Sparkline data={water} /></Card><SectionLabel>Routines</SectionLabel><Card style={{ marginBottom: 12 }}><Text style={{ color: c.text, fontWeight: "900" }}>{scenes} scenes configured</Text></Card><SectionLabel>Energy tip</SectionLabel><Card><Text style={{ color: c.textDim }}>Turn off idle rooms and schedule pumps during low-use hours to save energy.</Text></Card></ScrollView></Screen>;
}
