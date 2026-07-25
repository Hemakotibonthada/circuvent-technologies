import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { useDevices } from "../../store";
import { Avatar, Card, IconButton, ListRow, PrimaryButton, Screen, SectionLabel, StatTile, Title, useTheme } from "../../ui";
import { GRAD } from "../../theme";
export default function Profile({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const { account, logout } = useAuth(); const { devices } = useDevices(); const [name, setName] = useState(account?.name || "Circuvent User"); const [rooms, setRooms] = useState(0); const [scenes, setScenes] = useState(0);
  useEffect(() => { AsyncStorage.getItem("cv-profile-name").then((v) => v && setName(v)); api.rooms().then((r) => r.ok && setRooms((r.data.rooms || []).length)); api.scenes().then((r) => r.ok && setScenes((r.data.scenes || []).length)); }, []);
  const save = useCallback(() => AsyncStorage.setItem("cv-profile-name", name), [name]);
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Profile</Title></View><Card style={{ marginBottom: 14 }}><View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}><Avatar name={name} size={64} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: "900", fontSize: 20 }}>{name}</Text><Text style={{ color: c.faint }}>{account?.email || "Signed in account"}</Text></View></View><TextInput value={name} onChangeText={setName} onBlur={save} style={{ color: c.text, borderWidth: 1, borderColor: c.borderHi, borderRadius: 12, padding: 12, marginTop: 14 }} /></Card><View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}><StatTile label="Devices" value={String(devices.length)} grad={GRAD.cyan} glyph="📟" /><StatTile label="Rooms" value={String(rooms)} grad={GRAD.violet} glyph="🏠" /><StatTile label="Scenes" value={String(scenes)} grad={GRAD.amber} glyph="✨" /></View><SectionLabel>SETTINGS SHORTCUTS</SectionLabel><Card style={{ marginBottom: 14 }}><ListRow icon="🔔" title="Notifications" subtitle="Alerts and quiet hours" right={<Text style={{ color: c.faint }}>Use More</Text>} /><ListRow icon="🔐" title="Security" subtitle="Lock, sessions, 2FA" right={<Text style={{ color: c.faint }}>Use More</Text>} /><ListRow icon="☁️" title="Backup" subtitle="Export account data" right={<Text style={{ color: c.faint }}>Use More</Text>} /></Card><PrimaryButton label="Logout" onPress={logout} /></ScrollView></Screen>;
}
