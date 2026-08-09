import React, { useMemo } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { Device } from "../../api";
import { capabilities, useDevices } from "../../store";
import { Card, IconButton, PrimaryButton, Screen, SectionLabel, Title, useTheme } from "../../ui";
import { deviceMeta } from "../../theme";
import { Icon } from "../../icons";

export default function DeviceHub({ onBack, onOpenDevice, onAdd }: { onBack: () => void; onOpenDevice: (d: Device) => void; onAdd: () => void }) {
  const { c } = useTheme(); const { devices, toggle, patch } = useDevices();
  const groups = useMemo(() => devices.reduce<Record<string, Record<string, Device[]>>>((m, d) => { const room = d.room || "Unassigned"; m[room] ||= {}; m[room][d.type] ||= []; m[room][d.type].push(d); return m; }, {}), [devices]);
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Device Hub</Title></View><PrimaryButton label="Add device" icon="＋" onPress={onAdd} style={{ marginBottom: 16 }} />
    {Object.entries(groups).map(([room, types]) => <View key={room}><SectionLabel>{room}</SectionLabel>{Object.entries(types).map(([type, list]) => <Card key={room + type} style={{ marginBottom: 12 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}><Icon name={deviceMeta(type).icon} size={18} color={deviceMeta(type).accent} /><Text style={{ color: c.text, fontWeight: "800" }}>{deviceMeta(type).label}</Text></View>{list.map((d) => <Row key={d.id} d={d} onOpenDevice={onOpenDevice} onFav={(v) => patch(d.id, { favorite: v })} onToggle={(f, v) => toggle(d.id, f, v)} />)}</Card>)}</View>)}
    {!devices.length && <Text style={{ color: c.faint }}>No devices yet.</Text>}</ScrollView></Screen>;
}
function Row({ d, onOpenDevice, onFav, onToggle }: { d: Device; onOpenDevice: (d: Device) => void; onFav: (v: boolean) => void; onToggle: (f: string, v: boolean) => void }) {
  const { c } = useTheme(); const cap = capabilities(d.type);
  return <Card padded={false} onPress={() => onOpenDevice(d)} style={{ paddingVertical: 10, borderWidth: 0, backgroundColor: "transparent" }}><View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><Text onPress={() => onFav(!d.favorite)} style={{ fontSize: 18 }}>{d.favorite ? "⭐" : "☆"}</Text><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: "700" }}>{d.name}</Text><Text style={{ color: c.faint, fontSize: 12 }}>{d.online ? "online" : "offline"}</Text></View>{cap.power ? <Switch value={!!d.state[cap.power.field]} onValueChange={(v) => onToggle(cap.power!.field, v)} trackColor={{ true: c.accent, false: c.borderHi }} thumbColor="#fff" /> : <Text style={{ color: c.faint }}>Open ›</Text>}</View></Card>;
}
