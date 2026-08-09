import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, Switch, StyleSheet, Alert } from "react-native";
import { api, Room } from "../api";
import { useDevices, capabilities } from "../store";
import { Card, SectionLabel, PrimaryButton, useTheme } from "../ui";
import { deviceMeta } from "../theme";
import { Icon } from "../icons";

const ICONS = ["🏠", "🛋️", "🛏️", "🍳", "🚿", "🖥️", "🌿", "🚗", "🏢", "🛁", "🎮", "📺"];

export default function Rooms() {
  const { c } = useTheme();
  const { devices, patch, toggle } = useDevices();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("🏠");

  const load = useCallback(async () => {
    const r = await api.rooms();
    if (r.ok) setRooms(r.data.rooms || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!newName.trim()) return;
    await api.createRoom(newName.trim(), newIcon);
    setNewName(""); setNewIcon("🏠"); setCreating(false);
    load();
  };

  if (open) return <RoomDetail name={open} onBack={() => { setOpen(null); load(); }} onChanged={load} />;

  const unassigned = devices.filter((d) => !d.room);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
      {rooms.map((r) => (
        <Pressable key={r.name} onPress={() => setOpen(r.name)}>
          <Card padded style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Text style={{ fontSize: 28 }}>{r.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: "800", fontSize: 16 }}>{r.name}</Text>
                <Text style={{ color: c.faint, fontSize: 12 }}>{r.count} device{r.count === 1 ? "" : "s"}</Text>
              </View>
              <Text style={{ color: c.faint, fontSize: 20 }}>›</Text>
            </View>
          </Card>
        </Pressable>
      ))}

      {unassigned.length > 0 && (
        <Pressable onPress={() => setOpen("")}>
          <Card padded style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Text style={{ fontSize: 28 }}>📦</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: "800", fontSize: 16 }}>Unassigned</Text>
                <Text style={{ color: c.faint, fontSize: 12 }}>{unassigned.length} device{unassigned.length === 1 ? "" : "s"}</Text>
              </View>
              <Text style={{ color: c.faint, fontSize: 20 }}>›</Text>
            </View>
          </Card>
        </Pressable>
      )}

      {creating ? (
        <Card padded style={{ marginTop: 8 }}>
          <TextInput value={newName} onChangeText={setNewName} placeholder="Room name" placeholderTextColor={c.faint} style={[s.input, { color: c.text, borderColor: c.border }]} />
          <View style={s.iconGrid}>
            {ICONS.map((ic) => (
              <Pressable key={ic} onPress={() => setNewIcon(ic)} style={[s.iconChip, { backgroundColor: newIcon === ic ? c.accent : c.card, borderColor: newIcon === ic ? c.accent : c.border }]}>
                <Text style={{ fontSize: 18 }}>{ic}</Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton label="Add room" onPress={create} />
        </Card>
      ) : (
        <PrimaryButton label="New room" icon="＋" onPress={() => setCreating(true)} style={{ marginTop: 8 }} />
      )}
    </ScrollView>
  );
}

function RoomDetail({ name, onBack, onChanged }: { name: string; onBack: () => void; onChanged: () => void }) {
  const { c } = useTheme();
  const { devices, patch, toggle } = useDevices();
  const [managing, setManaging] = useState(false);
  const inRoom = name ? devices.filter((d) => d.room === name) : devices.filter((d) => !d.room);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
      <View style={s.top}>
        <Pressable onPress={onBack} hitSlop={10}><Text style={{ color: c.textDim, fontSize: 16 }}>‹ Rooms</Text></Pressable>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: "800" }}>{name || "Unassigned"}</Text>
        {name ? <Pressable onPress={() => setManaging((m) => !m)} hitSlop={10}><Text style={{ color: c.accent, fontSize: 13 }}>{managing ? "Done" : "Manage"}</Text></Pressable> : <View style={{ width: 54 }} />}
      </View>

      {managing && name ? (
        <>
          <SectionLabel>Add / remove devices</SectionLabel>
          {devices.map((d) => {
            const inThis = d.room === name;
            return (
              <Card key={d.id} padded style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Icon name={deviceMeta(d.type).icon} size={20} color={deviceMeta(d.type).accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: "600" }} numberOfLines={1}>{d.name || d.id}</Text>
                    {!!d.room && d.room !== name && <Text style={{ color: c.faint, fontSize: 11 }}>in {d.room}</Text>}
                  </View>
                  <Switch value={inThis} onValueChange={(v) => { patch(d.id, { room: v ? name : "" }); onChanged(); }} trackColor={{ true: c.accent, false: c.borderHi }} thumbColor="#fff" />
                </View>
              </Card>
            );
          })}
        </>
      ) : (
        <>
          {inRoom.length === 0 && <Text style={{ color: c.faint }}>No devices here yet.</Text>}
          {inRoom.map((d) => {
            const cap = capabilities(d.type);
            const meta = deviceMeta(d.type);
            return (
              <Card key={d.id} padded style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Icon name={meta.icon} size={20} color={meta.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: "700" }} numberOfLines={1}>{d.name || d.id}</Text>
                    <Text style={{ color: c.faint, fontSize: 12 }}>{d.online ? "online" : "offline"}</Text>
                  </View>
                  {cap.power && (
                    <Switch value={!!d.state[cap.power.field]} onValueChange={(v) => toggle(d.id, cap.power!.field, v)} trackColor={{ true: c.accent, false: c.borderHi }} thumbColor="#fff" />
                  )}
                </View>
              </Card>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  input: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 15, marginBottom: 10 },
  iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  iconChip: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
