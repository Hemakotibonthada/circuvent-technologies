import React, { useMemo, useState } from "react";
import { View, Text, FlatList, Pressable, TextInput, Switch, RefreshControl, StyleSheet, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Device } from "../api";
import { useDevices, capabilities, capabilitiesFor } from "../store";
import { Screen, Card, StatTile, useTheme, ListSkeleton, deviceMotion, useSpin, useGlowPulse, RoomChips } from "../ui";
import { GRAD, deviceMeta, TAP_SLOP } from "../theme";
import { Icon } from "../icons";
import { toggleFeedback } from "../haptics";

export default function Devices({ onOpen, onAdd }: { onOpen: (d: Device) => void; onAdd: () => void }) {
  const { c } = useTheme();
  const { devices, loading, refresh, toggle, patch } = useDevices();
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [roomIdx, setRoomIdx] = useState(0);

  // "All" first, then every room that actually has a device. Derived rather
  // than configured, so a room appears the moment something is put in it and
  // disappears when the last device leaves.
  const rooms = useMemo(() => {
    const found = [...new Set(devices.map((d) => d.room).filter((r): r is string => !!r))].sort();
    return ["All", ...found];
  }, [devices]);

  // A room can vanish while it is selected (last device moved out), which would
  // otherwise leave the list filtered to a room that no longer exists.
  const room = rooms[Math.min(roomIdx, rooms.length - 1)] ?? "All";

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = room === "All" ? devices : devices.filter((d) => d.room === room);
    if (s) {
      list = list.filter((d) => (d.name || d.id).toLowerCase().includes(s) || d.type.includes(s) || (d.room || "").toLowerCase().includes(s));
    }
    return list;
  }, [devices, q, room]);

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
          {q ? <Pressable hitSlop={TAP_SLOP} onPress={() => setQ("")}><Text style={{ color: c.faint }}>✕</Text></Pressable> : null}
        </View>
        {rooms.length > 1 && (
          <View style={{ marginBottom: 10 }}>
            <RoomChips options={rooms} value={Math.min(roomIdx, rooms.length - 1)} onChange={setRoomIdx} />
          </View>
        )}
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
              <Text style={{ color: c.textDim, marginTop: 12 }}>
                {q ? "No matches" : room !== "All" ? `Nothing in ${room} yet` : "No devices yet"}
              </Text>
              {!q && room === "All" && <Pressable onPress={onAdd} style={{ marginTop: 16 }}><LinearGradient colors={c.accentGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 12, paddingVertical: 13, paddingHorizontal: 24 }}><Text style={{ color: c.onAccent, fontWeight: "800" }}>＋ Add your first device</Text></LinearGradient></Pressable>}
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

/**
 * A device tile.
 *
 * The state of a device is readable from across the room without reading any
 * text: an appliance that is on gets an accent-tinted surface, a lit border and
 * a coloured shadow, and its icon carries motion that matches what the hardware
 * is doing — a fan spins, a light breathes. Off is flat and grey.
 *
 * The icon itself is the switch. Two taps used to be needed to turn something
 * on from this grid (open the device, find the control); the common case is now
 * one tap on the thing you were already looking at, with the card body still
 * opening the full controls.
 */
function DeviceCard({ device, onOpen, onToggle, onFav }: { device: Device; onOpen: (d: Device) => void; onToggle: (id: string, f: string, v: boolean) => void; onFav: (v: boolean) => void }) {
  const { c } = useTheme();
  const meta = deviceMeta(device.type);
  const cap = capabilitiesFor(device);

  const field = cap.power?.field ?? meta.toggle?.field ?? "";
  const isOn = field ? !!device.state[field] : false;
  const canToggle = !!field && device.online;

  const motion = deviceMotion(device.type);
  const spin = useSpin(motion === "spin" && isOn);
  const glow = useGlowPulse(motion === "glow" && isOn);

  const toggle = () => {
    if (!canToggle) return;
    toggleFeedback(!isOn);
    onToggle(device.id, field, !isOn);
  };

  return (
    <Card
      onPress={() => onOpen(device)}
      padded
      style={
        isOn
          ? {
              borderColor: meta.accent,
              // A coloured shadow is what makes a lit tile read as lit rather
              // than merely selected. Android needs elevation for any shadow.
              shadowColor: meta.accent,
              shadowOpacity: 0.45,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 4 },
              elevation: 7,
            }
          : undefined
      }
    >
      {/* Tinted wash behind the content, so "on" colours the whole tile rather
          than just the icon. Non-interactive so it cannot eat the card press. */}
      {isOn && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: meta.accent, opacity: 0.1, borderRadius: 18 }]}
        />
      )}

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Pressable
          onPress={toggle}
          disabled={!canToggle}
          hitSlop={10}
          accessibilityRole="switch"
          accessibilityState={{ checked: isOn, disabled: !canToggle }}
          accessibilityLabel={`${device.name || device.id}${canToggle ? (isOn ? ", on" : ", off") : ", not controllable"}`}
          style={({ pressed }) => [s.pillTap, { opacity: pressed ? 0.75 : 1 }]}
        >
          {isOn ? (
            <Animated.View style={{ opacity: motion === "glow" ? glow : 1 }}>
              <LinearGradient colors={meta.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.pill}>
                <Animated.View style={motion === "spin" ? { transform: [{ rotate: spin }] } : undefined}>
                  <Icon name={meta.icon} size={22} color="#fff" />
                </Animated.View>
              </LinearGradient>
            </Animated.View>
          ) : (
            <View style={[s.pill, { backgroundColor: c.cardHi, borderWidth: 1, borderColor: c.border }]}>
              <Icon name={meta.icon} size={22} color={canToggle ? c.textDim : c.faint} />
            </View>
          )}
        </Pressable>

        <Pressable
          onPress={() => onFav(!device.favorite)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={device.favorite ? "Remove from favourites" : "Add to favourites"}
          style={{ minWidth: 36, minHeight: 36, alignItems: "flex-end" }}
        >
          <Icon name={device.favorite ? "star" : "starOff"} size={18} color={device.favorite ? c.amber : c.faint} />
        </Pressable>
      </View>

      <Text style={{ color: c.text, fontWeight: "700", fontSize: 15, marginTop: 10 }} numberOfLines={1}>{device.name || device.id}</Text>
      <Text style={{ color: c.faint, fontSize: 12 }} numberOfLines={1}>{device.room || meta.label}</Text>

      <View style={s.bottom}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
          <View style={[s.dot, { backgroundColor: device.online ? c.green : c.faint }]} />
          <Text style={{ color: isOn ? meta.accent : c.textDim, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>
            {cap.metric ? cap.metric(device) : device.online ? (field ? (isOn ? "On" : "Off") : "Online") : "Offline"}
          </Text>
        </View>
        {canToggle ? (
          <Switch
            value={isOn}
            onValueChange={(v) => { toggleFeedback(v); onToggle(device.id, field, v); }}
            trackColor={{ true: meta.accent, false: c.borderHi }}
            thumbColor="#fff"
            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            accessibilityLabel={`Toggle ${device.name || device.id}`}
          />
        ) : (
          <Icon name="chevron" size={16} color={c.faint} />
        )}
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  addBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, minHeight: 44, justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, marginBottom: 14 },
  stats: { flexDirection: "row", gap: 10, marginBottom: 16 },
  pillTap: { minWidth: 46, minHeight: 46, alignItems: "flex-start", justifyContent: "center" },
    pill: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  bottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, minHeight: 30 },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
