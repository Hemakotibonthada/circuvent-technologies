import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, AdminDevice, AdminEvent, AdminStats, AdminUser } from "../../api";
import { Card, Chip, GhostButton, IconButton, Screen, SectionLabel, StatTile, Title, useTheme } from "../../ui";
import { GRAD } from "../../theme";

type Tab = "overview" | "devices" | "users" | "logs";
export default function AdminConsole({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const [checked, setChecked] = useState(false); const [admin, setAdmin] = useState(false); const [tab, setTab] = useState<Tab>("overview"); const [stats, setStats] = useState<AdminStats | null>(null); const [devices, setDevices] = useState<AdminDevice[]>([]); const [users, setUsers] = useState<AdminUser[]>([]); const [events, setEvents] = useState<AdminEvent[]>([]);
  const load = useCallback(async () => { const me = await api.adminMe(); setChecked(true); if (!me.ok || !me.data.admin) { setAdmin(false); return; } setAdmin(true); const [s, d, u, e] = await Promise.all([api.adminStats(), api.adminDevices(), api.adminUsers(), api.adminEvents(100)]); if (s.ok) setStats(s.data); if (d.ok) setDevices(d.data.devices || []); if (u.ok) setUsers(u.data.users || []); if (e.ok) setEvents(e.data.events || []); }, []);
  useEffect(() => { load(); }, [load]);
  if (!checked) return <Screen><View style={{ padding: 16, paddingTop: 56 }}><Title>Admin Console</Title><Text style={{ color: c.faint, marginTop: 12 }}>Checking admin access…</Text></View></Screen>;
  if (!admin) return <Screen><View style={{ padding: 16, paddingTop: 56 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Admin Console</Title></View><Card><Text style={{ color: c.text, fontWeight: "900" }}>Admins only</Text><Text style={{ color: c.textDim, marginTop: 6 }}>Your account is not authorized for control-plane administration.</Text></Card></View></Screen>;
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>Admin Console</Title></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>{(["overview", "devices", "users", "logs"] as Tab[]).map((t) => <Chip key={t} label={t} active={tab === t} onPress={() => setTab(t)} />)}</ScrollView>{tab === "overview" && <Overview stats={stats} />}{tab === "devices" && <Devices devices={devices} reload={load} />}{tab === "users" && <Users users={users} reload={load} />}{tab === "logs" && <Logs events={events} />}</ScrollView></Screen>;
}
function Overview({ stats }: { stats: AdminStats | null }) {
  const { c } = useTheme();
  return <View><View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}><StatTile label="Users" value={String(stats?.users || 0)} grad={GRAD.violet} glyph="👥" /><StatTile label="Devices" value={String(stats?.devices || 0)} grad={GRAD.cyan} glyph="📟" /></View><View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}><StatTile label="Online" value={String(stats?.online || 0)} grad={GRAD.green} glyph="🟢" /><StatTile label="Events 7d" value={String(stats?.events7d || 0)} grad={GRAD.amber} glyph="📜" /></View><SectionLabel>BY TYPE</SectionLabel><Card>{(stats?.byType || []).map((x) => <Text key={x.type} style={{ color: c.textDim, marginBottom: 6 }}>{x.type}: <Text style={{ color: c.text, fontWeight: "800" }}>{x.count}</Text></Text>)}</Card></View>;
}
function Devices({ devices, reload }: { devices: AdminDevice[]; reload: () => void }) {
  const { c } = useTheme();
  return <View>{devices.map((d) => <Card key={d.id} style={{ marginBottom: 10 }}><Text style={{ color: c.text, fontWeight: "900" }}>{d.name}</Text><Text style={{ color: c.faint }}>{d.id} • {d.type} • {d.owner_email || "unowned"}</Text><View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}><GhostButton label={d.state?.power ? "Force off" : "Force on"} onPress={async () => { await api.adminCommand(d.id, { action: "set", power: !d.state?.power }); reload(); }} style={{ flex: 1 }} /><GhostButton label="Delete" onPress={async () => { await api.adminDeleteDevice(d.id); reload(); }} style={{ flex: 1 }} /></View></Card>)}</View>;
}
function Users({ users, reload }: { users: AdminUser[]; reload: () => void }) {
  const { c } = useTheme();
  return <View>{users.map((u) => <Card key={u.id} style={{ marginBottom: 10 }}><Text style={{ color: c.text, fontWeight: "900" }}>{u.name || u.email}</Text><Text style={{ color: c.faint }}>{u.email} • {u.devices} devices • {u.is_admin ? "admin" : "user"}</Text><View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}><GhostButton label={u.is_admin ? "Make user" : "Make admin"} onPress={async () => { await api.adminSetRole(u.id, !u.is_admin); reload(); }} style={{ flex: 1 }} /><GhostButton label="Delete" onPress={async () => { await api.adminDeleteUser(u.id); reload(); }} style={{ flex: 1 }} /></View></Card>)}</View>;
}
function Logs({ events }: { events: AdminEvent[] }) {
  const { c } = useTheme();
  return <View>{events.map((e) => <Card key={e.id} style={{ marginBottom: 8 }}><Text style={{ color: c.text, fontWeight: "800" }}>{e.title}</Text><Text style={{ color: c.textDim }}>{e.body}</Text><Text style={{ color: c.faint, fontSize: 12 }}>{e.owner_email || "system"} • {e.kind}</Text></Card>)}</View>;
}
