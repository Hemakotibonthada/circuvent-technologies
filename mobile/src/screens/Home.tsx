import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet, Switch } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { api, Scene, Room, EnergySummary, AppEvent, Device } from "../api";
import { useAuth } from "../auth";
import { useDevices, capabilities } from "../store";
import { Screen, Card, SectionLabel, useTheme } from "../ui";
import { GRAD, deviceMeta, greeting } from "../theme";
import { getSavedLocation, getWeather, getWeatherByQuery, wmo, type WeatherBundle } from "../weather";

export default function Home({
  onOpenDevice,
  onOpenNotifications,
  onOpenSettings,
  onOpenAutomate,
  onOpenEnergy,
  onAddDevice,
  onOpenSearch,
  onOpenWeather,
}: {
  onOpenDevice: (d: Device) => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onOpenAutomate: (tab?: "scenes" | "rooms" | "automations") => void;
  onOpenEnergy: () => void;
  onAddDevice: () => void;
  onOpenSearch: () => void;
  onOpenWeather: () => void;
}) {
  const { c } = useTheme();
  const { account } = useAuth();
  const { devices, unread, toggle, refresh } = useDevices();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [energy, setEnergy] = useState<EnergySummary | null>(null);
  const [activity, setActivity] = useState<AppEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadExtras = useCallback(async () => {
    const [s, r, e, a] = await Promise.all([api.scenes(), api.rooms(), api.energySummary(), api.events(6)]);
    if (s.ok) setScenes(s.data.scenes || []);
    if (r.ok) setRooms(r.data.rooms || []);
    if (e.ok) setEnergy(e.data);
    if (a.ok) setActivity(a.data.events || []);
  }, []);

  useEffect(() => {
    loadExtras();
    const t = setInterval(loadExtras, 20000);
    return () => clearInterval(t);
  }, [loadExtras]);

  const online = devices.filter((d) => d.online).length;
  const favorites = devices.filter((d) => d.favorite);
  const favScenes = scenes.filter((s) => s.favorite).concat(scenes.filter((s) => !s.favorite)).slice(0, 6);
  const firstName = (account?.name || "").trim().split(" ")[0];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accentHi} onRefresh={async () => { setRefreshing(true); await Promise.all([refresh(), loadExtras()]); setRefreshing(false); }} />}
      >
        {/* header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.textDim, fontSize: 14 }}>{greeting()}{firstName ? `, ${firstName}` : ""}</Text>
            <Text style={{ color: c.text, fontSize: 26, fontWeight: "800", marginTop: 2 }}>Home</Text>
          </View>
          <Pressable onPress={onOpenSearch} hitSlop={8} style={[s.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={{ fontSize: 17 }}>🔍</Text>
          </Pressable>
          <Pressable onPress={onOpenNotifications} hitSlop={8} style={[s.iconBtn, { backgroundColor: c.card, borderColor: c.border, marginLeft: 8 }]}>
            <Text style={{ fontSize: 17 }}>🔔</Text>
            {unread > 0 && <View style={[s.badge, { backgroundColor: c.red }]}><Text style={s.badgeT}>{unread > 9 ? "9+" : unread}</Text></View>}
          </Pressable>
          <Pressable onPress={onOpenSettings} hitSlop={8} style={[s.iconBtn, { backgroundColor: c.card, borderColor: c.border, marginLeft: 8 }]}>
            <Text style={{ fontSize: 17 }}>⚙️</Text>
          </Pressable>
        </View>

        {/* live power hero */}
        <Pressable onPress={onOpenEnergy}>
          <LinearGradient colors={c.accentGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
            <View style={{ flex: 1 }}>
              <Text style={s.heroLabel}>LIVE POWER</Text>
              <Text style={s.heroValue}>{energy ? energy.liveWatts.toFixed(0) : "—"} <Text style={s.heroUnit}>W</Text></Text>
              <Text style={s.heroSub}>{energy ? `${energy.todayKwh.toFixed(2)} kWh today` : "Tap for energy details"}</Text>
            </View>
            <View style={s.heroRight}>
              <Text style={s.heroStat}>{online}/{devices.length}</Text>
              <Text style={s.heroStatLabel}>online</Text>
            </View>
          </LinearGradient>
        </Pressable>

        {/* quick actions */}
        <View style={s.quickRow}>
          <QuickAction glyph="✨" label="Scenes" onPress={() => onOpenAutomate("scenes")} />
          <QuickAction glyph="🏠" label="Rooms" onPress={() => onOpenAutomate("rooms")} />
          <QuickAction glyph="⚡" label="Rules" onPress={() => onOpenAutomate("automations")} />
          <QuickAction glyph="＋" label="Add" onPress={onAddDevice} />
        </View>

        {/* weather */}
        <WeatherStrip onPress={onOpenWeather} />

        {/* scene shortcuts */}
        {favScenes.length > 0 && (
          <>
            <SectionLabel>SCENES</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 10 }}>
              {favScenes.map((sc) => (
                <Pressable key={sc.id} onPress={() => api.activateScene(sc.id)}>
                  <Card padded style={{ width: 130 }}>
                    <Text style={{ fontSize: 26 }}>{sc.icon}</Text>
                    <Text style={{ color: c.text, fontWeight: "700", marginTop: 8 }} numberOfLines={1}>{sc.name}</Text>
                    <Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }}>{sc.actions.length} action{sc.actions.length === 1 ? "" : "s"}</Text>
                  </Card>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* favorites */}
        {favorites.length > 0 && (
          <>
            <SectionLabel>FAVORITES</SectionLabel>
            <View style={s.grid}>
              {favorites.map((d) => {
                const meta = deviceMeta(d.type);
                const pf = capabilities(d.type).power?.field;
                const on = pf ? !!d.state[pf] : false;
                return (
                  <Pressable key={d.id} style={{ width: "48%" }} onPress={() => onOpenDevice(d)}>
                    <Card padded>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <LinearGradient colors={meta.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.pill}><Text style={{ fontSize: 20 }}>{meta.glyph}</Text></LinearGradient>
                        {pf ? (
                          <View onStartShouldSetResponder={() => true}>
                            <Switch value={on} onValueChange={(v) => toggle(d.id, pf, v)} trackColor={{ true: c.accent, false: c.border }} thumbColor="#fff" />
                          </View>
                        ) : (
                          <View style={[s.dot, { backgroundColor: d.online ? c.green : c.faint }]} />
                        )}
                      </View>
                      <Text style={{ color: c.text, fontWeight: "700", marginTop: 10 }} numberOfLines={1}>{d.name || d.id}</Text>
                      <Text style={{ color: c.faint, fontSize: 12 }}>{meta.label}{pf ? (on ? " · On" : " · Off") : ""}</Text>
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* rooms */}
        {rooms.length > 0 && (
          <>
            <SectionLabel>ROOMS</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 10 }}>
              {rooms.map((r) => (
                <Pressable key={r.name} onPress={() => onOpenAutomate("rooms")}>
                  <Card padded style={{ width: 120, alignItems: "flex-start" }}>
                    <Text style={{ fontSize: 24 }}>{r.icon}</Text>
                    <Text style={{ color: c.text, fontWeight: "700", marginTop: 8 }} numberOfLines={1}>{r.name}</Text>
                    <Text style={{ color: c.faint, fontSize: 12 }}>{r.count} device{r.count === 1 ? "" : "s"}</Text>
                  </Card>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* recent activity */}
        <SectionLabel>RECENT ACTIVITY</SectionLabel>
        <Card padded>
          {activity.length === 0 ? (
            <Text style={{ color: c.faint, fontSize: 13, paddingVertical: 6 }}>No activity yet.</Text>
          ) : (
            activity.map((e, i) => (
              <View key={e.id} style={[s.actRow, i < activity.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
                <Text style={{ fontSize: 16 }}>{kindGlyph(e.kind)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: "600", fontSize: 14 }} numberOfLines={1}>{e.title}</Text>
                  {!!e.body && <Text style={{ color: c.faint, fontSize: 12 }} numberOfLines={1}>{e.body}</Text>}
                </View>
                <Text style={{ color: c.faint, fontSize: 11 }}>{timeAgo(e.ts)}</Text>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function QuickAction({ glyph, label, onPress }: { glyph: string; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable style={{ flex: 1 }} onPress={onPress}>
      <Card padded style={{ alignItems: "center" }}>
        <Text style={{ fontSize: 22 }}>{glyph}</Text>
        <Text style={{ color: c.textDim, fontSize: 12, fontWeight: "600", marginTop: 6 }}>{label}</Text>
      </Card>
    </Pressable>
  );
}

function WeatherStrip({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  const [b, setB] = useState<WeatherBundle | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await getSavedLocation();
        const bundle = s ? await getWeather(s.lat, s.lon, s.name) : await getWeatherByQuery("Bengaluru");
        if (alive) setB(bundle);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, []);
  if (!b) return null;
  const w = wmo(b.current.weatherCode);
  return (
    <Pressable onPress={onPress} style={{ marginBottom: 20 }}>
      <Card padded style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ fontSize: 30 }}>{w.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: "800", fontSize: 16 }}>{Math.round(b.current.temperature)}° · {w.label}</Text>
          <Text style={{ color: c.faint, fontSize: 12 }} numberOfLines={1}>{b.place.name} · feels {Math.round(b.current.apparent)}° · H {Math.round(b.daily[0]?.tMax ?? 0)}° L {Math.round(b.daily[0]?.tMin ?? 0)}°</Text>
        </View>
        <Text style={{ color: c.faint, fontSize: 18 }}>›</Text>
      </Card>
    </Pressable>
  );
}

function kindGlyph(kind: string): string {
  return kind === "alert" ? "⚠️" : kind === "security" ? "🛡️" : kind === "success" ? "✅" : kind === "activity" ? "⚡" : "ℹ️";
}
export function timeAgo(ts: string): string {
  const d = Date.now() - new Date(ts).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeT: { color: "#fff", fontSize: 10, fontWeight: "800" },
  hero: { borderRadius: 20, padding: 20, flexDirection: "row", alignItems: "center", marginBottom: 18 },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  heroValue: { color: "#fff", fontSize: 40, fontWeight: "900", marginTop: 4 },
  heroUnit: { fontSize: 18, fontWeight: "700" },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 2 },
  heroRight: { alignItems: "center" },
  heroStat: { color: "#fff", fontSize: 22, fontWeight: "800" },
  heroStatLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12 },
  quickRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginBottom: 20 },
  pill: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  actRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
});
