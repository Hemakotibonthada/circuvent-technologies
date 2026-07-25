import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, AppEvent } from "../../api";
import { Card, Chip, IconButton, Screen, SectionLabel, Title, useTheme } from "../../ui";

type Kind = "all" | "alert" | "security" | "activity" | "info" | "success";
const kinds: Kind[] = ["all", "alert", "security", "activity", "info", "success"];
function rel(ts: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return `${s}s ago`; const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}
export default function ActivityLog({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const [events, setEvents] = useState<AppEvent[]>([]); const [kind, setKind] = useState<Kind>("all");
  const load = useCallback(async () => { const r = await api.events(200); if (r.ok) setEvents(r.data.events || []); }, []);
  useEffect(() => { load(); }, [load]);
  const filtered = useMemo(() => kind === "all" ? events : events.filter((e) => e.kind === kind || e.kind.includes(kind)), [events, kind]);
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Activity Log</Title></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>{kinds.map((k) => <Chip key={k} label={k} active={kind === k} onPress={() => setKind(k)} />)}</ScrollView>
    <SectionLabel>TIMELINE</SectionLabel>{filtered.map((e) => <Card key={e.id} style={{ marginBottom: 10 }}><View style={{ flexDirection: "row", gap: 10 }}><Text style={{ fontSize: 20 }}>{e.kind.includes("alert") ? "🚨" : e.kind.includes("security") ? "🛡️" : "•"}</Text><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: "800" }}>{e.title}</Text><Text style={{ color: c.textDim, marginTop: 3 }}>{e.body}</Text><Text style={{ color: c.faint, fontSize: 12, marginTop: 6 }}>{e.kind} • {rel(e.ts)}</Text></View></View></Card>)}
    {!filtered.length && <Text style={{ color: c.faint }}>No events found.</Text>}
  </ScrollView></Screen>;
}
