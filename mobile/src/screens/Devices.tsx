import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, TextInput, StyleSheet, RefreshControl } from "react-native";
import { api, Device } from "../api";
import { useAuth } from "../auth";
import { useLive } from "../live";

const TYPE_LABEL: Record<string, string> = {
  "aquaguard": "Water Tank Controller",
  "home-hub": "Automation Hub",
};

export default function Devices({ onOpen, onAutomations }: { onOpen: (d: Device) => void; onAutomations: () => void }) {
  const { logout } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [cid, setCid] = useState("");
  const [ckey, setCkey] = useState("");
  const [cname, setCname] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await api.devices();
    if (r.ok) setDevices(r.data.devices || []);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // slow fallback; live updates arrive via WS
    return () => clearInterval(t);
  }, [load]);

  // Real-time device pushes (online/state) merged into the list.
  useLive((u) => {
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== u.deviceId) return d;
        if (u.kind === "status") return { ...d, online: !!u.payload?.online };
        if (u.kind === "state") return { ...d, online: true, state: { ...d.state, ...u.payload } };
        return { ...d, online: true };
      })
    );
  });

  const claim = async () => {
    setMsg("");
    const r = await api.claim(cid.trim(), ckey.trim(), cname.trim() || cid.trim());
    if (r.ok && r.data?.success) {
      setShowClaim(false); setCid(""); setCkey(""); setCname(""); load();
    } else setMsg(r.data?.error || "Could not add device.");
  };

  return (
    <View style={s.wrap}>
      <View style={s.top}>
        <Text style={s.h1}>My devices</Text>
        <View style={s.actions}>
          <Pressable onPress={onAutomations}><Text style={s.actionLink}>⚡ Automations</Text></Pressable>
          <Pressable onPress={logout}><Text style={s.logout}>Sign out</Text></Pressable>
        </View>
      </View>

      <FlatList
        data={devices}
        keyExtractor={(d) => d.id}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor="#06b6d4" onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={<Text style={s.empty}>No devices yet. Tap “Add a device”.</Text>}
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => onOpen(item)}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.type}>{TYPE_LABEL[item.type] || item.type}</Text>
            </View>
            <View style={[s.dot, { backgroundColor: item.online ? "#22c55e" : "#64748b" }]} />
            <Text style={s.state}>{summary(item)}</Text>
          </Pressable>
        )}
      />

      {showClaim ? (
        <View style={s.claim}>
          <TextInput style={s.input} placeholder="Device ID" placeholderTextColor="#64748b" value={cid} onChangeText={setCid} autoCapitalize="characters" />
          <TextInput style={s.input} placeholder="Device Key" placeholderTextColor="#64748b" value={ckey} onChangeText={setCkey} />
          <TextInput style={s.input} placeholder="Name (e.g. Overhead tank)" placeholderTextColor="#64748b" value={cname} onChangeText={setCname} />
          {!!msg && <Text style={s.msg}>{msg}</Text>}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable style={[s.btn, { flex: 1, backgroundColor: "#334155" }]} onPress={() => setShowClaim(false)}><Text style={s.btnT}>Cancel</Text></Pressable>
            <Pressable style={[s.btn, { flex: 1 }]} onPress={claim}><Text style={s.btnT}>Link device</Text></Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={s.btn} onPress={() => setShowClaim(true)}><Text style={s.btnT}>+ Add a device</Text></Pressable>
      )}
    </View>
  );
}

function summary(d: Device): string {
  if (d.type === "aquaguard") return `${d.state.level ?? "--"}% • pump ${d.state.pump ? "ON" : "off"}`;
  if (d.type === "home-hub") return `scene ${d.state.scene ?? "-"}`;
  return d.online ? "online" : "offline";
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0b1020", padding: 16 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, marginTop: 8 },
  h1: { color: "#fff", fontSize: 24, fontWeight: "800" },
  actions: { alignItems: "flex-end", gap: 6 },
  actionLink: { color: "#06b6d4", fontWeight: "700" },
  logout: { color: "#8b5cf6" },
  empty: { color: "#64748b", textAlign: "center", marginTop: 60 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#111827", borderColor: "#1f2937", borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 10 },
  name: { color: "#e5e7eb", fontSize: 16, fontWeight: "700" },
  type: { color: "#64748b", fontSize: 12, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 10 },
  state: { color: "#22d3ee", fontSize: 12 },
  input: { backgroundColor: "#0b1020", borderColor: "#334155", borderWidth: 1, borderRadius: 10, color: "#e5e7eb", padding: 12, marginBottom: 10 },
  claim: { backgroundColor: "#111827", borderRadius: 14, padding: 14, marginTop: 8 },
  btn: { backgroundColor: "#06b6d4", borderRadius: 12, padding: 14, alignItems: "center" },
  btnT: { color: "#fff", fontWeight: "700" },
  msg: { color: "#f59e0b", marginBottom: 8 },
});
