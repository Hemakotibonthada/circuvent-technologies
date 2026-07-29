import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { API_BASE } from "../../config";
import { api } from "../../api";
import { useDevices } from "../../store";
import { Card, IconButton, PrimaryButton, Screen, SectionLabel, StatTile, Title, useTheme } from "../../ui";
import { GRAD } from "../../theme";

export default function SystemManagement({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const { devices, refresh } = useDevices(); const [health, setHealth] = useState("checking");
  const load = useCallback(async () => { const r = await api.health(); setHealth(r.ok ? (r.data.ok ? "ok" : "reachable") : "unavailable"); }, []);
  useEffect(() => { load(); }, [load]); const online = devices.filter((d) => d.online).length;
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>System</Title></View><View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}><StatTile label="Devices" value={String(devices.length)} grad={GRAD.violet} glyph="📟" /><StatTile label="Online" value={String(online)} grad={GRAD.green} glyph="🟢" /></View><SectionLabel>Control plane</SectionLabel><Card style={{ marginBottom: 14 }}><Text style={{ color: c.text, fontWeight: "800" }}>Health: {health}</Text><Text style={{ color: c.textDim, marginTop: 8 }}>API: {API_BASE}</Text><Text style={{ color: c.textDim }}>Live link: connected</Text><Text style={{ color: c.textDim }}>Broker: mqtt.circuvent.com</Text><Text style={{ color: c.textDim }}>App version: 1.0.0</Text></Card><PrimaryButton label="Refresh system" onPress={() => { refresh(); load(); }} /></ScrollView></Screen>;
}
