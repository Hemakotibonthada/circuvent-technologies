import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { Device } from "../../api";
import { useDevices } from "../../store";
import { Gauge } from "../../charts";
import { Card, IconButton, Screen, SectionLabel, Title, useTheme } from "../../ui";

function stale(d: Device) { return d.last_seen ? Date.now() - new Date(d.last_seen).getTime() > 3600000 : !d.online; }
function oldFw(v?: string) { if (!v) return true; const nums = v.match(/\d+/g)?.map(Number) || []; return (nums[0] || 0) < 1; }
export default function Maintenance({ onBack, onOpenDevice }: { onBack: () => void; onOpenDevice: (d: Device) => void }) {
  const { c } = useTheme(); const { devices } = useDevices(); const online = devices.filter((d) => d.online).length;
  const issues = useMemo(() => devices.map((d) => ({ d, reasons: [!d.online && "Offline", stale(d) && "No update > 1h", d.type === "guardian" && Number(d.state.battery ?? 100) < 20 && "Low battery", oldFw(d.fw_version) && "Firmware review"].filter(Boolean) as string[] })).filter((x) => x.reasons.length), [devices]);
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Maintenance</Title></View><Card style={{ alignItems: "center", marginBottom: 14 }}><Gauge value={online} max={Math.max(devices.length, 1)} unit={`/${devices.length}`} label="health score" /></Card><SectionLabel>Needs attention</SectionLabel>{issues.map(({ d, reasons }) => <Card key={d.id} onPress={() => onOpenDevice(d)} style={{ marginBottom: 10 }}><Text style={{ color: c.text, fontWeight: "800" }}>{d.name}</Text><Text style={{ color: c.faint, marginTop: 4 }}>{reasons.join(" • ")}</Text><Text style={{ color: c.accent, marginTop: 8, fontWeight: "800" }}>Open Control ›</Text></Card>)}{!issues.length && <Text style={{ color: c.faint }}>All devices look healthy.</Text>}</ScrollView></Screen>;
}
