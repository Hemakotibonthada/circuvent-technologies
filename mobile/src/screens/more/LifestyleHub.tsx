import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { api } from "../../api";
import { useDevices } from "../../store";
import { Card, IconButton, Screen, SectionLabel, Title, useTheme } from "../../ui";
import { StaleNotice, unwrap, useAsync } from "../../async";
import { Sparkline } from "../../charts";

export default function LifestyleHub({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const { devices } = useDevices();
  /* Both calls used to fail silently, leaving a scene count of 0 and a flat water chart that looked like real readings. */
  const state = useAsync<{ scenes: number; water: number[] }>(async () => {
    const s = await unwrap<{ scenes: unknown[] }>(api.scenes(), "your scenes");
    const aq = devices.find((d) => d.type === "aquaguard");
    let water: number[] = [];
    if (aq) {
      const t = await unwrap<{ telemetry: { payload?: Record<string, unknown> }[] }>(api.telemetry(aq.id, 24), "water level history");
      water = t.telemetry.map((x) => Number(x.payload?.level)).filter(Number.isFinite);
    }
    return { scenes: s.scenes.length, water };
  }, [devices.length]);
  const scenes = state.data?.scenes ?? 0;
  const water = state.data?.water ?? [];

  const comfort = useMemo(() => { const nums = devices.flatMap((d) => [Number(d.state.temperature), Number(d.state.humidity)]).filter(Number.isFinite); return nums.length ? "Comfort telemetry available" : "Add temperature/humidity sensor for comfort scoring"; }, [devices]);
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Lifestyle</Title></View><StaleNotice error={state.error} onRetry={state.reload} /><SectionLabel>Comfort</SectionLabel><Card style={{ marginBottom: 12 }}><Text style={{ color: c.text, fontWeight: "900" }}>{comfort}</Text></Card><SectionLabel>Water</SectionLabel><Card style={{ marginBottom: 12 }}><Text style={{ color: c.textDim }}>AquaGuard level trend</Text><Sparkline data={water} /></Card><SectionLabel>Routines</SectionLabel><Card style={{ marginBottom: 12 }}><Text style={{ color: c.text, fontWeight: "900" }}>{scenes} scenes configured</Text></Card><SectionLabel>Energy tip</SectionLabel><Card><Text style={{ color: c.textDim }}>Turn off idle rooms and schedule pumps during low-use hours to save energy.</Text></Card></ScrollView></Screen>;
}
