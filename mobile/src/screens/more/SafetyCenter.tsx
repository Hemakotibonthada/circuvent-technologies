import React, { useMemo } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { api, AppEvent, Device } from "../../api";
import { useDevices } from "../../store";
import { Card, GhostButton, IconButton, Screen, SectionLabel, Title, useTheme } from "../../ui";
import { AsyncView, RefreshScroll, unwrap, useAsync } from "../../async";

const safety = (d: Device) => ["guardian", "motion-sensor", "aquaguard"].includes(d.type);
export default function SafetyCenter({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const { devices, command } = useDevices();
  /* An empty alert list on a safety screen has to mean "nothing happened",
     not "we could not ask". It used to mean both. */
  const state = useAsync<AppEvent[]>(async () => {
    const data = await unwrap<{ events?: AppEvent[] }>(api.events(50), "safety alerts");
    return (data.events || []).filter((e) => /security|alert/i.test(e.kind));
  }, []);
  const list = useMemo(() => devices.filter(safety), [devices]);
  return <Screen><RefreshScroll state={state}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Safety Center</Title></View><SectionLabel>Safety devices</SectionLabel>
    {list.map((d) => <Card key={d.id} style={{ marginBottom: 10 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: "800" }}>{d.name}</Text><Text style={{ color: c.faint }}>{d.type} • {d.online ? "online" : "offline"}</Text></View>{(d.type === "guardian" || d.type === "motion-sensor") && <Switch value={!!d.state.armed} onValueChange={(v) => command(d.id, { action: "set", armed: v })} trackColor={{ true: c.accent, false: c.borderHi }} thumbColor="#fff" />}</View>{d.state.sos ? <View style={{ marginTop: 10 }}><Text style={{ color: c.red, fontWeight: "800" }}>SOS active</Text><GhostButton label="Clear SOS" onPress={() => command(d.id, { action: "set", sos: false })} style={{ marginTop: 8 }} /></View> : null}{d.type === "aquaguard" && <Text style={{ color: c.textDim, marginTop: 8 }}>Level {Number(d.state.level ?? 0)}% {d.state.dryRun ? "• Dry-run" : ""} {d.state.overflow ? "• Overflow" : ""}</Text>}</Card>)}
    {!list.length && <Text style={{ color: c.faint }}>No safety devices found.</Text>}<SectionLabel style={{ marginTop: 10 }}>RECENT ALERTS</SectionLabel><AsyncView state={state} isEmpty={(ev) => ev.length === 0} emptyIcon="security" emptyTitle="No alerts" emptySubtitle="Your safety devices have not reported anything." loadingText="Loading safety alerts…">{(events) => events.map((e) => <Card key={e.id} style={{ marginBottom: 8 }}><Text style={{ color: c.text, fontWeight: "800" }}>{e.title}</Text><Text style={{ color: c.textDim }}>{e.body}</Text></Card>)}</AsyncView></RefreshScroll></Screen>;
}
