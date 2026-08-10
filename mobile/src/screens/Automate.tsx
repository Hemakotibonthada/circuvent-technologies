import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Screen, useTheme } from "../ui";
import Scenes from "./Scenes";
import Rooms from "./Rooms";
import Automations from "./Automations";
import Schedules from "./more/Schedules";

type Seg = "scenes" | "rooms" | "timers" | "automations";

export default function Automate({ initial = "scenes" }: { initial?: Seg }) {
  const { c } = useTheme();
  const [seg, setSeg] = useState<Seg>(initial);

  /*
   * Timers belong here.
   *
   * They existed all along, three taps deep under More > Tools > Switch timers,
   * which is why this tab looked like it was missing the one feature people
   * come to an "Automate" tab for. Nothing was built to fix this — the screen
   * was already written and simply filed somewhere nobody would look.
   */
  const segs: { key: Seg; label: string }[] = [
    { key: "scenes", label: "Scenes" },
    { key: "rooms", label: "Rooms" },
    { key: "timers", label: "Timers" },
    { key: "automations", label: "Rules" },
  ];

  return (
    <Screen>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text style={{ color: c.text, fontSize: 26, fontWeight: "800", marginBottom: 14 }}>Automate</Text>
        <View style={[s.segBar, { backgroundColor: c.card, borderColor: c.border }]}>
          {segs.map((x) => (
            <Pressable key={x.key} onPress={() => setSeg(x.key)} style={[s.seg, seg === x.key && { backgroundColor: c.accent }]}>
              <Text style={{ color: seg === x.key ? c.onAccent : c.textDim, fontWeight: "700", fontSize: 14 }}>{x.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {seg === "scenes" && <Scenes />}
      {seg === "rooms" && <Rooms />}
      {seg === "timers" && <Schedules onBack={() => setSeg("scenes")} embedded />}
      {seg === "automations" && <Automations onBack={() => setSeg("scenes")} embedded />}
    </Screen>
  );
}

const s = StyleSheet.create({
  segBar: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 4, gap: 4 },
  seg: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
});
