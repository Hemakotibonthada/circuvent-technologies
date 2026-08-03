import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from "react-native";
import { api, AppEvent } from "../api";
import { useDevices } from "../store";
import { Screen, Card, useTheme, BackButton } from "../ui";
import { timeAgo } from "./Home";

export default function Notifications({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const { refreshUnread } = useDevices();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const r = await api.events(200);
    if (r.ok) setEvents(r.data.events || []);
  }, []);

  useEffect(() => {
    load();
    // Mark all read on open so the badge clears.
    api.markEventsRead().then(() => refreshUnread());
  }, [load, refreshUnread]);

  const remove = async (id: number) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    await api.deleteEvent(id);
  };
  const clearAll = async () => {
    setEvents([]);
    await api.clearEvents();
  };

  return (
    <Screen>
      <View style={s.top}>
        <BackButton onPress={onBack} />
        <Text style={{ color: c.text, fontSize: 18, fontWeight: "800" }}>Notifications</Text>
        <Pressable
          onPress={clearAll}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Clear all notifications"
          style={{ minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" }}
        >
          <Text style={{ color: c.faint, fontSize: 13 }}>Clear</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accentHi} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {events.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <Text style={{ fontSize: 40 }}>🔕</Text>
            <Text style={{ color: c.textDim, marginTop: 12 }}>No notifications</Text>
          </View>
        ) : (
          events.map((e) => (
            <Card key={e.id} padded style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={[s.iconWrap, { backgroundColor: kindColor(e.kind, c) + "22" }]}>
                  <Text style={{ fontSize: 18 }}>{kindGlyph(e.kind)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: "700", fontSize: 15 }}>{e.title}</Text>
                  {!!e.body && <Text style={{ color: c.textDim, fontSize: 13, marginTop: 2 }}>{e.body}</Text>}
                  <Text style={{ color: c.faint, fontSize: 11, marginTop: 4 }}>{timeAgo(e.ts)} ago</Text>
                </View>
                <Pressable onPress={() => remove(e.id)} hitSlop={8}><Text style={{ color: c.faint, fontSize: 18 }}>✕</Text></Pressable>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function kindGlyph(kind: string): string {
  return kind === "alert" ? "⚠️" : kind === "security" ? "🛡️" : kind === "success" ? "✅" : kind === "activity" ? "⚡" : "ℹ️";
}
function kindColor(kind: string, c: any): string {
  return kind === "alert" ? c.amber : kind === "security" ? c.red : kind === "success" ? c.green : c.accent;
}

const s = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
