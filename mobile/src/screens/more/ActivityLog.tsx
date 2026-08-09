import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, AppEvent } from "../../api";
import { Card, Chip, IconButton, Screen, SectionLabel, Title, useTheme } from "../../ui";
import { AsyncView, RefreshScroll, unwrap, useAsync } from "../../async";

type Kind = "all" | "alert" | "security" | "activity" | "info" | "success";
const kinds: Kind[] = ["all", "alert", "security", "activity", "info", "success"];
function rel(ts: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return `${s}s ago`; const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}
export default function ActivityLog({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const [kind, setKind] = useState<Kind>("all");
  /* Was `if (r.ok) setEvents(...)` — a failed request left the timeline empty,
     which reads as "nothing has happened" rather than "we could not ask". */
  const state = useAsync<AppEvent[]>(async () => {
    const data = await unwrap<{ events?: AppEvent[] }>(api.events(200), "the activity log");
    return data.events || [];
  }, []);
  const events = state.data ?? [];
  const filtered = useMemo(() => kind === "all" ? events : events.filter((e) => e.kind === kind || e.kind.includes(kind)), [events, kind]);
  return <Screen><RefreshScroll state={state}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Activity Log</Title></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>{kinds.map((k) => <Chip key={k} label={k} active={kind === k} onPress={() => setKind(k)} />)}</ScrollView>
    <SectionLabel>Timeline</SectionLabel>
    <AsyncView state={state} isEmpty={() => filtered.length === 0} emptyIcon="history" emptyTitle="No events" emptySubtitle="Activity from your devices will appear here." loadingText="Loading activity…">{() => <>{filtered.map((e) => <Card key={e.id} style={{ marginBottom: 10 }}><View style={{ flexDirection: "row", gap: 10 }}><Text style={{ fontSize: 20 }}>{e.kind.includes("alert") ? "🚨" : e.kind.includes("security") ? "🛡️" : "•"}</Text><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: "800" }}>{e.title}</Text><Text style={{ color: c.textDim, marginTop: 3 }}>{e.body}</Text><Text style={{ color: c.faint, fontSize: 12, marginTop: 6 }}>{e.kind} • {rel(e.ts)}</Text></View></View></Card>)}
    </>}</AsyncView>
  </RefreshScroll></Screen>;
}
