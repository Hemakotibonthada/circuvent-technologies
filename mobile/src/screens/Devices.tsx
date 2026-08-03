import React, { useMemo, useState } from "react";
import { View, Text, FlatList, Pressable, TextInput, Switch, RefreshControl, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Device } from "../api";
import { useDevices, capabilities } from "../store";
import { Screen, Card, StatTile, useTheme, ListSkeleton } from "../ui";
import { GRAD, deviceMeta } from "../theme";
import { Icon } from "../icons";

export default function Devices({ onOpen, onAdd }: { onOpen: (d: Device) => void; onAdd: () => void }) {
  const { c } = useTheme();
  const { devices, loading, refresh, toggle, patch } = useDevices();
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return devices;
    return devices.filter((d) => (d.name || d.id).toLowerCase().includes(s) || d.type.includes(s) || (d.room || "").toLowerCase().includes(s));
  }, [devices, q]);

  const online = devices.filter((d) => d.online).length;

  const listHeader = (
    <View style={s.stats}>
      <StatTile label="Devices" value={String(devices.length)} grad={GRAD.violet} icon="devices" />
      <StatTile label="Online" value={String(online)} grad={GRAD.green} icon="online" />
      <StatTile label="Offline" value={String(devices.length - online)} grad={GRAD.slate} icon="offline" />
    </View>
  );

  return (
    <Screen>
      {/* Fixed top area — the search input lives OUTSIDE the FlatList so it never
          remounts when the filtered data changes (which would drop the keyboard). */}
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 4 }}>
        <View style={s.topRow}>
          <Text style={{ color: c.text, fontSize: 26, fontWeight: "800" }}>Devices</Text>
          <Pressable onPress={onAdd} style={[s.addBtn, { borderColor: c.border, backgroundColor: c.card }]}>
            <Text style={{ color: c.accentHi, fontWeight: "800", fontSize: 15 }}>＋ Add</Text>
          </Pressable>
        </View>
        <View style={[s.search, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={{ color: c.faint }}>🔎</Text>
          <TextInput value={q} onChangeText={setQ} placeholder="Search devices, rooms…" placeholderTextColor={c.faint} style={{ flex: 1, color: c.text, paddingVertical: 8 }} autoCorrect={false} />
          {q ? <Pressable onPress={() => setQ("")}><Text style={{ color: c.faint }}>✕</Text></Pressable> : null}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(d) => d.id}
        numColumns={2}
        keyboardShouldPersistTaps="handled"
        columnWrapperStyle={{ justifyContent: "space-between", gap: 12 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 90 }}
        ListHeaderComponent={listHeader}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accentHi} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} />}
        ListEmptyComponent={
          // Gated on `loading`: without it the first fetch renders "No devices
          // yet" and an invitation to add one, which is a confident lie about a
          // home that may be full of devices, on every cold start.
          loading ? (
            <View style={{ paddingVertical: 10 }}>
              <ListSkeleton rows={3} columns={2} height={132} />
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingVertical: 50 }}>
              <Text style={{ fontSize: 40 }}>📡</Text>
              <Text style={{ color: c.textDim, marginTop: 12 }}>{q ? "No matches" : "No devices yet"}</Text>
              {!q && <Pressable onPress={onAdd} style={{ marginTop: 16 }}><LinearGradient colors={c.accentGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 12, paddingVertical: 13, paddingHorizontal: 24 }}><Text style={{ color: c.onAccent, fontWeight: "800" }}>＋ Add your first device</Text></LinearGradient></Pressable>}
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={{ width: "48%", marginBottom: 12 }}>
            <DeviceCard device={item} onOpen={onOpen} onToggle={toggle} onFav={(v) => patch(item.id, { favorite: v })} />
          </View>
        )}
      />
    </Screen>
  );
}

function DeviceCard({ device, onOpen, onToggle, onFav }: { device: Device; onOpen: (d: Device) => void; onToggle: (id: string, f: string, v: boolean) => void; onFav: (v: boolean) => void }) {
  const { c } = useTheme();
  const meta = deviceMeta(device.type);
  const cap = capabilities(device.type);
  return (
    <Card onPress={() => onOpen(device)} padded>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <LinearGradient colors={meta.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.pill}><Icon name={meta.icon} size={22} color="#fff" /></LinearGradient>
        <Pressable onPress={() => onFav(!device.favorite)} hitSlop={8}>
          <Text style={{ fontSize: 16 }}>{device.favorite ? "⭐" : "☆"}</Text>
        </Pressable>
      </View>
      <Text style={{ color: c.text, fontWeight: "700", fontSize: 15, marginTop: 10 }} numberOfLines={1}>{device.name || device.id}</Text>
      <Text style={{ color: c.faint, fontSize: 12 }} numberOfLines={1}>{device.room || meta.label}</Text>
      <View style={s.bottom}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={[s.dot, { backgroundColor: device.online ? c.green : c.faint }]} />
          <Text style={{ color: meta.accent, fontWeight: "800", fontSize: 14 }}>{cap.metric ? cap.metric(device) : device.online ? "online" : "offline"}</Text>
        </View>
        {cap.power ? (
          <Switch
            value={!!device.state[cap.power.field]}
            onValueChange={(v) => onToggle(device.id, cap.power!.field, v)}
            trackColor={{ true: c.accent, false: "#334155" }}
            thumbColor="#fff"
            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
          />
        ) : (
          <Text style={{ color: c.faint, fontSize: 18 }}>›</Text>
        )}
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  addBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, marginBottom: 14 },
  stats: { flexDirection: "row", gap: 10, marginBottom: 16 },
  pill: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  bottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, minHeight: 30 },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
