import React from "react";
import { ScrollView, Text, View } from "react-native";
import { API_BASE } from "../../config";
import { useDevices } from "../../store";
import { Card, IconButton, PrimaryButton, Screen, SectionLabel, Title, useTheme } from "../../ui";

export default function MqttSettings({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const { devices, refresh } = useDevices(); const online = devices.filter((d) => d.online).length;
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>MQTT Settings</Title></View><SectionLabel>CONNECTION</SectionLabel><Card style={{ marginBottom: 14 }}><Text style={{ color: c.textDim }}>API base: {API_BASE}</Text><Text style={{ color: c.textDim, marginTop: 6 }}>Broker host: mqtt.circuvent.com</Text><Text style={{ color: c.textDim, marginTop: 6 }}>Live-link status: connected</Text><Text style={{ color: c.textDim, marginTop: 6 }}>Devices online: {online}/{devices.length}</Text></Card><PrimaryButton label="Reconnect / Refresh" onPress={refresh} /><SectionLabel style={{ marginTop: 18 }}>PER DEVICE</SectionLabel>{devices.map((d) => <Text key={d.id} style={{ color: d.online ? c.green : c.faint, marginBottom: 6 }}>• {d.name}: {d.online ? "online" : "offline"}</Text>)}</ScrollView></Screen>;
}
