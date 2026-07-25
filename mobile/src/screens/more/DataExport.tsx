import React, { useCallback, useState } from "react";
import { ScrollView, Share, Text, View } from "react-native";
import { api } from "../../api";
import { useDevices } from "../../store";
import { Card, IconButton, PrimaryButton, Screen, SectionLabel, Title, useTheme } from "../../ui";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export default function DataExport({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const { devices } = useDevices(); const [busy, setBusy] = useState("");
  const share = useCallback(async (label: string, message: string) => { setBusy(label); try { await Share.share({ message }); } finally { setBusy(""); } }, []);
  const devicesCsv = () => ["id,name,type,room,online,last_seen,fw_version", ...devices.map((d) => [d.id, d.name, d.type, d.room, d.online, d.last_seen, d.fw_version].map(esc).join(","))].join("\n");
  const eventsJson = async () => { const r = await api.events(200); return JSON.stringify(r.ok ? r.data.events : [], null, 2); };
  const energyJson = async () => { const r = await api.energySummary(); return JSON.stringify(r.ok ? r.data : {}, null, 2); };
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Data Export</Title></View><SectionLabel>ACCOUNT DATA</SectionLabel><Card><Text style={{ color: c.textDim, marginBottom: 14 }}>Export devices, events, and energy data using the native share sheet.</Text><PrimaryButton label="Export devices CSV" busy={busy === "devices" } onPress={() => share("devices", devicesCsv())} style={{ marginBottom: 10 }} /><PrimaryButton label="Export events JSON" busy={busy === "events"} onPress={async () => share("events", await eventsJson())} style={{ marginBottom: 10 }} /><PrimaryButton label="Export energy JSON" busy={busy === "energy"} onPress={async () => share("energy", await energyJson())} /></Card></ScrollView></Screen>;
}
