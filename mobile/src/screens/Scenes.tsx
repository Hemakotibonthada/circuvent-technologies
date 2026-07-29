import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, Alert } from "react-native";
import { api, Scene, SceneAction } from "../api";
import { useDevices, capabilities } from "../store";
import { Card, SectionLabel, PrimaryButton, GhostButton, useTheme } from "../ui";
import { deviceMeta } from "../theme";
import { Icon } from "../icons";

const ICONS = ["✨", "🌙", "🌅", "🎬", "🍿", "🛋️", "🚪", "🏠", "💤", "☕", "🎉", "🔒"];

export default function Scenes() {
  const { c } = useTheme();
  const { devices } = useDevices();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [editing, setEditing] = useState<Scene | "new" | null>(null);

  const load = useCallback(async () => {
    const r = await api.scenes();
    if (r.ok) setScenes(r.data.scenes || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const activate = async (sc: Scene) => {
    const r = await api.activateScene(sc.id);
    if (r.ok) Alert.alert("Scene activated", `${sc.name} — ${r.data.sent} device${r.data.sent === 1 ? "" : "s"}.`);
  };

  if (editing) return <SceneEditor scene={editing === "new" ? null : editing} onDone={() => { setEditing(null); load(); }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
      {scenes.length === 0 && <Text style={{ color: c.faint, marginBottom: 12 }}>No scenes yet. Create one to control many devices with a tap.</Text>}
      {scenes.map((sc) => (
        <Card key={sc.id} padded style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable onPress={() => activate(sc)} style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
              <Text style={{ fontSize: 26 }}>{sc.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: "800", fontSize: 16 }}>{sc.name}</Text>
                <Text style={{ color: c.faint, fontSize: 12 }}>{sc.actions.length} action{sc.actions.length === 1 ? "" : "s"} · tap to run</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => setEditing(sc)} hitSlop={8}><Text style={{ color: c.textDim, fontSize: 18 }}>✎</Text></Pressable>
          </View>
        </Card>
      ))}
      <PrimaryButton label="Create scene" icon="＋" onPress={() => setEditing("new")} style={{ marginTop: 8 }} />
    </ScrollView>
  );
}

type Sel = "skip" | "on" | "off";

function SceneEditor({ scene, onDone }: { scene: Scene | null; onDone: () => void }) {
  const { c } = useTheme();
  const { devices } = useDevices();
  const [name, setName] = useState(scene?.name ?? "");
  const [icon, setIcon] = useState(scene?.icon ?? "✨");
  const [favorite, setFavorite] = useState(scene?.favorite ?? false);
  const [busy, setBusy] = useState(false);

  const initialSel: Record<string, Sel> = {};
  for (const a of scene?.actions ?? []) {
    const field = Object.keys(a.command).find((k) => k !== "action");
    if (field) initialSel[a.deviceId] = a.command[field] ? "on" : "off";
  }
  const [sel, setSel] = useState<Record<string, Sel>>(initialSel);

  const controllable = devices.filter((d) => capabilities(d.type).power);

  const save = async () => {
    if (!name.trim()) { Alert.alert("Name required", "Give your scene a name."); return; }
    const actions: SceneAction[] = [];
    for (const d of controllable) {
      const s = sel[d.id];
      if (!s || s === "skip") continue;
      const field = capabilities(d.type).power!.field;
      actions.push({ deviceId: d.id, command: { action: "set", [field]: s === "on" } });
    }
    setBusy(true);
    const body = { name: name.trim(), icon, favorite, actions };
    const r = scene ? await api.updateScene(scene.id, body) : await api.createScene(body);
    setBusy(false);
    if (r.ok) onDone();
    else Alert.alert("Couldn't save", "Please try again.");
  };

  const del = async () => {
    if (!scene) return;
    Alert.alert("Delete scene?", scene.name, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await api.deleteScene(scene.id); onDone(); } },
    ]);
  };

  const cycle = (id: string) => setSel((p) => ({ ...p, [id]: p[id] === "on" ? "off" : p[id] === "off" ? "skip" : "on" }));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
      <View style={s.top}>
        <Pressable onPress={onDone} hitSlop={10}><Text style={{ color: c.textDim, fontSize: 16 }}>‹ Cancel</Text></Pressable>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: "800" }}>{scene ? "Edit scene" : "New scene"}</Text>
        {scene ? <Pressable onPress={del} hitSlop={10}><Text style={{ color: c.red, fontSize: 13 }}>Delete</Text></Pressable> : <View style={{ width: 44 }} />}
      </View>

      <TextInput value={name} onChangeText={setName} placeholder="Scene name" placeholderTextColor={c.faint} style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]} />

      <SectionLabel>Icon</SectionLabel>
      <View style={s.iconGrid}>
        {ICONS.map((ic) => (
          <Pressable key={ic} onPress={() => setIcon(ic)} style={[s.iconChip, { backgroundColor: icon === ic ? c.accent : c.card, borderColor: icon === ic ? c.accent : c.border }]}>
            <Text style={{ fontSize: 20 }}>{ic}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={() => setFavorite((f) => !f)} style={{ marginBottom: 8 }}>
        <Card padded>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: c.text, fontWeight: "600" }}>⭐ Pin to Home</Text>
            <View style={[s.check, { borderColor: favorite ? c.accent : c.border, backgroundColor: favorite ? c.accent : "transparent" }]}>
              {favorite && <Text style={{ color: c.onAccent, fontSize: 12 }}>✓</Text>}
            </View>
          </View>
        </Card>
      </Pressable>

      <SectionLabel>When activated</SectionLabel>
      {controllable.length === 0 && <Text style={{ color: c.faint }}>No controllable devices yet.</Text>}
      {controllable.map((d) => {
        const meta = deviceMeta(d.type);
        const st = sel[d.id] ?? "skip";
        return (
          <Pressable key={d.id} onPress={() => cycle(d.id)}>
            <Card padded style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Icon name={meta.icon} size={20} color={meta.accent} />
                <Text style={{ color: c.text, fontWeight: "600", flex: 1 }} numberOfLines={1}>{d.name || d.id}</Text>
                <View style={[s.stateTag, { backgroundColor: st === "on" ? c.green + "22" : st === "off" ? c.red + "22" : c.border }]}>
                  <Text style={{ color: st === "on" ? c.green : st === "off" ? c.red : c.faint, fontWeight: "700", fontSize: 13 }}>
                    {st === "on" ? "Turn ON" : st === "off" ? "Turn OFF" : "— skip"}
                  </Text>
                </View>
              </View>
            </Card>
          </Pressable>
        );
      })}

      <PrimaryButton label={scene ? "Save scene" : "Create scene"} busy={busy} onPress={save} style={{ marginTop: 12 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 16, marginBottom: 8 },
  iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  iconChip: { width: 46, height: 46, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  stateTag: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
});
