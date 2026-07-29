import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Switch } from "react-native";
import { api, Device, Scene, Room } from "../api";
import { useDevices, capabilities } from "../store";
import { Screen, Card, SectionLabel, useTheme } from "../ui";
import { deviceMeta } from "../theme";
import { Icon } from "../icons";

type Seg = "scenes" | "rooms" | "automations";
const row = { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, paddingVertical: 12, paddingHorizontal: 14 };

/** App-wide command palette: fuzzy-search devices, scenes, rooms and jump-to
 * destinations, with inline power toggles for controllable devices. */
export default function CommandPalette({
  onClose, onOpenDevice, onOpenAutomate, onOpenEnergy, onOpenDevices, onOpenSettings, onAddDevice,
}: {
  onClose: () => void;
  onOpenDevice: (d: Device) => void;
  onOpenAutomate: (seg?: Seg) => void;
  onOpenEnergy: () => void;
  onOpenDevices: () => void;
  onOpenSettings: () => void;
  onAddDevice: () => void;
}) {
  const { c } = useTheme();
  const { devices, toggle } = useDevices();
  const [q, setQ] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    api.scenes().then((r) => { if (r.ok) setScenes(r.data.scenes || []); });
    api.rooms().then((r) => { if (r.ok) setRooms(r.data.rooms || []); });
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const ql = q.trim().toLowerCase();
  const match = (s: string) => !ql || s.toLowerCase().includes(ql);

  const navItems = useMemo(() => ([
    { key: "energy", glyph: "⚡", label: "Energy", hint: "Live power & history", run: () => onOpenEnergy() },
    { key: "devices", glyph: "📟", label: "All devices", hint: "Browse & control", run: () => onOpenDevices() },
    { key: "scenes", glyph: "✨", label: "Scenes", hint: "One-tap routines", run: () => onOpenAutomate("scenes") },
    { key: "rooms", glyph: "🏠", label: "Rooms", hint: "Grouped by room", run: () => onOpenAutomate("rooms") },
    { key: "automations", glyph: "🔗", label: "Automations", hint: "Rules & triggers", run: () => onOpenAutomate("automations") },
    { key: "add", glyph: "＋", label: "Add a device", hint: "Onboard new hardware", run: () => onAddDevice() },
    { key: "settings", glyph: "⚙️", label: "Settings", hint: "Preferences & account", run: () => onOpenSettings() },
  ]), [onOpenEnergy, onOpenDevices, onOpenAutomate, onAddDevice, onOpenSettings]);

  const fNav = navItems.filter((n) => match(n.label) || match(n.hint));
  const fDevices = devices.filter((d) => match(d.name || d.id) || match(d.room || "") || match(d.type));
  const fScenes = scenes.filter((s) => match(s.name));
  const fRooms = rooms.filter((r) => match(r.name));
  const empty = !fDevices.length && !fScenes.length && !fRooms.length && !fNav.length;

  return (
    <Screen>
      <View style={{ flex: 1, paddingTop: 52 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, marginBottom: 12 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, height: 46 }}>
            <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
            <TextInput ref={inputRef} value={q} onChangeText={setQ} placeholder="Search devices, scenes, rooms…" placeholderTextColor={c.faint} style={{ flex: 1, color: c.text, fontSize: 16 }} returnKeyType="search" autoCapitalize="none" />
            {q.length > 0 && <Pressable onPress={() => setQ("")} hitSlop={8}><Text style={{ color: c.faint, fontSize: 16 }}>✕</Text></Pressable>}
          </View>
          <Pressable onPress={onClose} hitSlop={8}><Text style={{ color: c.accent, fontWeight: "700", fontSize: 15 }}>Cancel</Text></Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40 }}>
          {fDevices.length > 0 && (
            <>
              <SectionLabel>DEVICES</SectionLabel>
              <Card padded={false} style={{ marginBottom: 16, overflow: "hidden" }}>
                {fDevices.slice(0, 24).map((d, i) => {
                  const meta = deviceMeta(d.type);
                  const pf = capabilities(d.type).power?.field;
                  const on = pf ? !!d.state[pf] : false;
                  return (
                    <Pressable key={d.id} onPress={() => onOpenDevice(d)} style={[row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                      <Icon name={meta.icon} size={18} color={meta.accent} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: c.text, fontWeight: "600" }} numberOfLines={1}>{d.name || d.id}</Text>
                        <Text style={{ color: c.faint, fontSize: 12 }} numberOfLines={1}>{[d.room, meta.label].filter(Boolean).join(" · ")}{d.online ? "" : " · offline"}</Text>
                      </View>
                      {pf ? (
                        <View onStartShouldSetResponder={() => true}>
                          <Switch value={on} onValueChange={(v) => toggle(d.id, pf, v)} trackColor={{ true: c.accent, false: c.border }} thumbColor="#fff" />
                        </View>
                      ) : <Text style={{ color: c.faint, fontSize: 18 }}>›</Text>}
                    </Pressable>
                  );
                })}
              </Card>
            </>
          )}

          {fScenes.length > 0 && (
            <>
              <SectionLabel>SCENES</SectionLabel>
              <Card padded={false} style={{ marginBottom: 16, overflow: "hidden" }}>
                {fScenes.map((sc, i) => (
                  <Pressable key={sc.id} onPress={() => { api.activateScene(sc.id); onClose(); }} style={[row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                    <Text style={{ fontSize: 18 }}>{sc.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontWeight: "600" }}>{sc.name}</Text>
                      <Text style={{ color: c.faint, fontSize: 12 }}>{sc.actions.length} action{sc.actions.length === 1 ? "" : "s"}</Text>
                    </View>
                    <Text style={{ color: c.accent, fontWeight: "700", fontSize: 13 }}>Run</Text>
                  </Pressable>
                ))}
              </Card>
            </>
          )}

          {fRooms.length > 0 && (
            <>
              <SectionLabel>ROOMS</SectionLabel>
              <Card padded={false} style={{ marginBottom: 16, overflow: "hidden" }}>
                {fRooms.map((r, i) => (
                  <Pressable key={r.name} onPress={() => onOpenAutomate("rooms")} style={[row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                    <Text style={{ fontSize: 18 }}>{r.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontWeight: "600" }}>{r.name}</Text>
                      <Text style={{ color: c.faint, fontSize: 12 }}>{r.count} device{r.count === 1 ? "" : "s"}</Text>
                    </View>
                    <Text style={{ color: c.faint, fontSize: 18 }}>›</Text>
                  </Pressable>
                ))}
              </Card>
            </>
          )}

          {fNav.length > 0 && (
            <>
              <SectionLabel>GO TO</SectionLabel>
              <Card padded={false} style={{ overflow: "hidden" }}>
                {fNav.map((n, i) => (
                  <Pressable key={n.key} onPress={n.run} style={[row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                    <Text style={{ fontSize: 18 }}>{n.glyph}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontWeight: "600" }}>{n.label}</Text>
                      <Text style={{ color: c.faint, fontSize: 12 }}>{n.hint}</Text>
                    </View>
                    <Text style={{ color: c.faint, fontSize: 18 }}>›</Text>
                  </Pressable>
                ))}
              </Card>
            </>
          )}

          {empty && <Text style={{ color: c.faint, textAlign: "center", marginTop: 40 }}>No matches for “{q}”.</Text>}
        </ScrollView>
      </View>
    </Screen>
  );
}
