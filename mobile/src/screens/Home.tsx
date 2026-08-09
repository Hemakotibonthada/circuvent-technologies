import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { api, Scene, Room, EnergySummary, AppEvent, Device } from "../api";
import { useAuth } from "../auth";
import { useDevices, capabilities } from "../store";
import {
  Screen,
  Card,
  SectionLabel,
  useTheme,
  Avatar,
  PillToggle,
  RoomChips,
  Skeleton,
  CountUp,
  Stagger,
  useSafeArea,
  useAppActive,
} from "../ui";
import { Icon, eventIcon, weatherIcon, type IconName } from "../icons";
import { deviceMeta, greeting, CATEGORY_TINTS, deviceCategory, RADIUS, SPACE, MOTION } from "../theme";
import { Sparkline } from "../charts";
import { getSavedLocation, getWeather, getWeatherByQuery, wmo, type WeatherBundle } from "../weather";

/** How many live-power readings to keep for the hero trend line. */
const WATT_HISTORY = 30;
const POLL_MS = 20000;
const GUTTER = 16;
const GAP = 12;

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
  const insets = useSafeArea();
  const appActive = useAppActive();
  const { width: winW } = useWindowDimensions();
  const { account } = useAuth();
  const { devices, unread, toggle, refresh } = useDevices();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [energy, setEnergy] = useState<EnergySummary | null>(null);
  const [activity, setActivity] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [roomIdx, setRoomIdx] = useState(0);
  // Observed live-power readings. The API exposes a point-in-time summary with
  // no history, so the trend line is built from readings this session actually
  // saw — never from synthesised points.
  const [wattHistory, setWattHistory] = useState<number[]>([]);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadExtras = useCallback(async () => {
    const [s, r, e, a] = await Promise.all([api.scenes(), api.rooms(), api.energySummary(), api.events(6)]);
    if (!alive.current) return;
    if (s.ok) setScenes(s.data.scenes || []);
    if (r.ok) setRooms(r.data.rooms || []);
    if (e.ok) {
      setEnergy(e.data);
      const w = e.data.liveWatts;
      if (Number.isFinite(w)) setWattHistory((h) => [...h, w].slice(-WATT_HISTORY));
    }
    if (a.ok) setActivity(a.data.events || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadExtras();
    // Polling while backgrounded burns battery and data to refresh a screen
    // nobody is looking at, and the numbers are stale on return regardless.
    if (!appActive) return;
    const t = setInterval(loadExtras, POLL_MS);
    return () => clearInterval(t);
  }, [loadExtras, appActive]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), loadExtras()]);
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, [refresh, loadExtras]);

  const handleToggle = useCallback((id: string, field: string, v: boolean) => toggle(id, field, v), [toggle]);

  const col = Math.floor((winW - GUTTER * 2 - GAP) / 2);
  const online = devices.filter((d) => d.online).length;
  const favorites = devices.filter((d) => d.favorite);
  const favScenes = useMemo(
    () => scenes.filter((x) => x.favorite).concat(scenes.filter((x) => !x.favorite)).slice(0, 6),
    [scenes],
  );
  const firstName = (account?.name || "").trim().split(" ")[0];
  const roomNames = useMemo(() => ["All", ...rooms.map((r) => r.name)], [rooms]);
  const shownDevices = roomIdx === 0 ? devices : devices.filter((d) => d.room === roomNames[roomIdx]);

  // Direction of travel between the two most recent readings, so the hero says
  // something the raw number alone does not.
  const trend =
    wattHistory.length >= 2 ? wattHistory[wattHistory.length - 1] - wattHistory[wattHistory.length - 2] : 0;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: GUTTER, paddingTop: insets.top + 12, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accentHi} onRefresh={onRefresh} />}
      >
        {/* header */}
        <View style={s.header}>
          <Pressable onPress={onOpenSettings} hitSlop={8} accessibilityRole="button" accessibilityLabel="Account and settings">
            <Avatar name={account?.name} size={46} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: c.textDim, fontSize: 13 }}>
              {greeting()}
              {firstName ? "," : ""}
            </Text>
            <Text style={{ color: c.text, fontSize: 21, fontWeight: "800", marginTop: 1 }} numberOfLines={1}>
              {firstName || "Welcome home"}
            </Text>
          </View>
          <HeaderButton icon="search" label="Search devices and scenes" onPress={onOpenSearch} />
          <HeaderButton
            icon="bell"
            label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
            onPress={onOpenNotifications}
            style={{ marginLeft: 8 }}
          >
            {unread > 0 && (
              <View style={[s.badge, { backgroundColor: c.red, borderColor: c.bg }]}>
                <Text style={s.badgeT}>{unread > 9 ? "9+" : unread}</Text>
              </View>
            )}
          </HeaderButton>
        </View>

        {/* live power hero */}
        <Pressable onPress={onOpenEnergy} accessibilityRole="button" accessibilityLabel="Live power. Open energy details">
          <LinearGradient colors={c.accentGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
            <View style={{ flex: 1 }}>
              <Text style={s.heroLabel}>LIVE POWER</Text>
              {energy ? (
                <View style={s.heroValueRow}>
                  <CountUp value={energy.liveWatts} style={s.heroValue} />
                  <Text style={s.heroUnit}> W</Text>
                  {Math.abs(trend) >= 1 && (
                    <View style={s.trendChip}>
                      <Icon name={trend > 0 ? "trendUp" : "trendDown"} size={12} color="#fff" />
                      <Text style={s.trendT}>{Math.abs(Math.round(trend))}</Text>
                    </View>
                  )}
                </View>
              ) : (
                <Skeleton width={140} height={40} radius={10} style={{ marginTop: 6, opacity: 0.4 }} />
              )}
              <Text style={s.heroSub} numberOfLines={1}>
                {energy ? `${energy.todayKwh.toFixed(2)} kWh today` : "Reading meter…"}
              </Text>
            </View>
            <View style={s.heroRight}>
              {wattHistory.length >= 3 && (
                <Sparkline data={wattHistory} color="rgba(255,255,255,0.9)" width={72} height={26} />
              )}
              <Text style={s.heroStat}>
                {online}/{devices.length}
              </Text>
              <Text style={s.heroStatLabel}>online</Text>
            </View>
          </LinearGradient>
        </Pressable>

        {/* at-a-glance */}
        <View style={s.glanceRow}>
          <GlanceTile icon="devices" value={devices.length} label="Devices" loading={loading} />
          <GlanceTile icon="rooms" value={rooms.length} label="Rooms" loading={loading} />
          <GlanceTile icon="scenes" value={scenes.length} label="Scenes" loading={loading} />
          <GlanceTile icon="alerts" value={unread} label="Alerts" tint={unread > 0 ? c.red : undefined} loading={loading} />
        </View>

        {/* quick actions */}
        <View style={s.quickRow}>
          <QuickAction icon="scenes" label="Scenes" onPress={() => onOpenAutomate("scenes")} />
          <QuickAction icon="rooms" label="Rooms" onPress={() => onOpenAutomate("rooms")} />
          <QuickAction icon="rules" label="Rules" onPress={() => onOpenAutomate("automations")} />
          <QuickAction icon="add" label="Add" onPress={onAddDevice} />
        </View>

        {/* weather */}
        <WeatherStrip onPress={onOpenWeather} />

        {/* scene shortcuts */}
        {favScenes.length > 0 && (
          <>
            <SectionLabel>Scenes</SectionLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 20 }}
              contentContainerStyle={{ gap: 10 }}
            >
              {favScenes.map((sc) => (
                <Pressable
                  key={sc.id}
                  onPress={() => api.activateScene(sc.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Activate scene ${sc.name}`}
                >
                  <Card padded style={{ width: 130 }}>
                    <Text style={{ fontSize: 26 }}>{sc.icon}</Text>
                    <Text style={{ color: c.text, fontWeight: "700", marginTop: 8 }} numberOfLines={1}>
                      {sc.name}
                    </Text>
                    <Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }}>
                      {sc.actions.length} action{sc.actions.length === 1 ? "" : "s"}
                    </Text>
                  </Card>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* favorites */}
        {favorites.length > 0 && (
          <>
            <SectionLabel>Favorites</SectionLabel>
            <View style={s.grid}>
              {favorites.map((d, i) => (
                <Stagger key={d.id} index={i}>
                  <DeviceCard device={d} width={col} onOpen={onOpenDevice} onToggle={handleToggle} />
                </Stagger>
              ))}
            </View>
          </>
        )}

        {/* room filter + device grid */}
        {devices.length > 0 && (
          <>
            <SectionLabel>Your devices</SectionLabel>
            <RoomChips options={roomNames} value={roomIdx} onChange={setRoomIdx} style={{ marginBottom: 14 }} />
            {shownDevices.length === 0 ? (
              <Card padded>
                <Text style={{ color: c.faint, fontSize: 13 }}>No devices in this room yet.</Text>
              </Card>
            ) : (
              <View style={s.grid}>
                {shownDevices.map((d, i) => (
                  <Stagger key={d.id} index={i}>
                    <DeviceCard device={d} width={col} onOpen={onOpenDevice} onToggle={handleToggle} showRoom />
                  </Stagger>
                ))}
              </View>
            )}
          </>
        )}

        {/* rooms */}
        {rooms.length > 0 && (
          <>
            <SectionLabel>Rooms</SectionLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 20 }}
              contentContainerStyle={{ gap: 10 }}
            >
              {rooms.map((r) => (
                <Pressable
                  key={r.name}
                  onPress={() => onOpenAutomate("rooms")}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.name}, ${r.count} devices`}
                >
                  <Card padded style={{ width: 120, alignItems: "flex-start" }}>
                    <Text style={{ fontSize: 24 }}>{r.icon}</Text>
                    <Text style={{ color: c.text, fontWeight: "700", marginTop: 8 }} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={{ color: c.faint, fontSize: 12 }}>
                      {r.count} device{r.count === 1 ? "" : "s"}
                    </Text>
                  </Card>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* recent activity */}
        <SectionLabel>Recent activity</SectionLabel>
        <Card padded>
          {loading && activity.length === 0 ? (
            <View style={{ gap: 12, paddingVertical: 4 }}>
              <Skeleton height={14} />
              <Skeleton height={14} width="80%" />
              <Skeleton height={14} width="60%" />
            </View>
          ) : activity.length === 0 ? (
            <Text style={{ color: c.faint, fontSize: 13, paddingVertical: 6 }}>No activity yet.</Text>
          ) : (
            activity.map((e, i) => (
              <View
                key={e.id}
                style={[s.actRow, i < activity.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}
              >
                <Icon name={eventIcon(e.kind)} size={17} color={kindColor(e.kind, c)} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: "600", fontSize: 14 }} numberOfLines={1}>
                    {e.title}
                  </Text>
                  {!!e.body && (
                    <Text style={{ color: c.faint, fontSize: 12 }} numberOfLines={1}>
                      {e.body}
                    </Text>
                  )}
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

/* ---------------------------------------------------------------- pieces -- */

function HeaderButton({
  icon,
  label,
  onPress,
  style,
  children,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  style?: object;
  children?: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: c.borderHi, borderless: true, radius: 24 }}
      style={({ pressed }) => [
        s.iconBtn,
        { backgroundColor: c.card, borderColor: c.border },
        style,
        pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] },
      ]}
    >
      <Icon name={icon} size={19} color={c.text} />
      {children}
    </Pressable>
  );
}

interface DeviceCardProps {
  device: Device;
  width: number;
  onOpen: (d: Device) => void;
  onToggle: (id: string, field: string, v: boolean) => void;
  showRoom?: boolean;
}

/**
 * One tile in the device grid.
 *
 * Modelled on a physical accessory button: when the device is ON the tile
 * inverts to a bright category-tinted fill with dark text, so the state of the
 * whole home is readable at a glance without reading a single label.
 *
 * Offline is rendered as its own state ("No response") rather than falling back
 * to the OFF styling — a dark tile that actually means "unreachable" is the
 * single most misleading thing a smart-home dashboard can show.
 *
 * Memoised on the fields actually rendered rather than on object identity: the
 * 20s poll replaces every Device object, so a shallow compare would re-render
 * the whole grid on every tick even when nothing visibly changed.
 */
const DeviceCard = React.memo(
  function DeviceCard({ device: d, width, onOpen, onToggle, showRoom }: DeviceCardProps) {
    const { c } = useTheme();
    const meta = deviceMeta(d.type);
    const pf = capabilities(d.type).power?.field;
    const on = pf ? !!d.state[pf] : false;
    const offline = !d.online;
    const tint = CATEGORY_TINTS[deviceCategory(d.type)];
    const lit = on && !offline;

    const statusLine = offline ? "No response" : pf ? (on ? "On" : "Off") : meta.label;
    const subtitle = showRoom && d.room ? `${d.room} · ${statusLine}` : statusLine;

    const fg = lit ? c.onAccent : offline ? c.faint : c.text;
    const sub = lit ? "rgba(28,28,30,0.62)" : c.faint;

    return (
      <Pressable
        onPress={() => onOpen(d)}
        accessibilityRole="button"
        accessibilityLabel={`${d.name || d.id}. ${subtitle}`}
        style={({ pressed }) => [{ width }, pressed && { transform: [{ scale: MOTION.pressScale }] }]}
      >
        <View
          style={{
            borderRadius: RADIUS.tile,
            padding: SPACE.lg,
            minHeight: 124,
            justifyContent: "space-between",
            backgroundColor: lit ? tint : c.card,
            borderWidth: 1,
            borderColor: lit ? tint : c.border,
            opacity: offline ? 0.62 : 1,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: RADIUS.control,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: lit ? "rgba(28,28,30,0.12)" : offline ? c.cardHi : `${tint}22`,
              }}
            >
              <Icon name={meta.icon} size={21} color={lit ? c.onAccent : offline ? c.faint : tint} />
            </View>
            {pf && !offline ? (
              <View onStartShouldSetResponder={() => true}>
                <PillToggle value={on} onChange={(v) => onToggle(d.id, pf, v)} size="sm" />
              </View>
            ) : (
              <View style={[s.dot, { backgroundColor: offline ? c.faint : c.green }]} />
            )}
          </View>
          <View style={{ marginTop: SPACE.md }}>
            <Text style={{ color: fg, fontWeight: "700", fontSize: 15, letterSpacing: -0.2 }} numberOfLines={1}>
              {d.name || d.id}
            </Text>
            <Text style={{ color: sub, fontSize: 13, marginTop: 1 }} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  },
  (a, b) => {
    const x = a.device;
    const y = b.device;
    if (a.width !== b.width || a.showRoom !== b.showRoom || a.onOpen !== b.onOpen || a.onToggle !== b.onToggle) return false;
    if (x.id !== y.id || x.name !== y.name || x.room !== y.room || x.type !== y.type || x.online !== y.online) return false;
    const pf = capabilities(x.type).power?.field;
    return pf ? x.state[pf] === y.state[pf] : true;
  },
);

function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Card padded style={{ alignItems: "center", minHeight: 76, justifyContent: "center" }}>
        <Icon name={icon} size={22} color={c.accentHi} />
        <Text style={{ color: c.textDim, fontSize: 12, fontWeight: "600", marginTop: 6 }}>{label}</Text>
      </Card>
    </Pressable>
  );
}

function GlanceTile({
  icon,
  value,
  label,
  tint,
  loading,
}: {
  icon: IconName;
  value: number;
  label: string;
  tint?: string;
  loading?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Card padded style={{ flex: 1, alignItems: "center", paddingVertical: 12 }}>
      <Icon name={icon} size={18} color={tint || c.textDim} />
      {loading ? (
        <Skeleton width={24} height={20} radius={6} style={{ marginTop: 4 }} />
      ) : (
        <Text
          style={{ color: tint || c.text, fontSize: 20, fontWeight: "900", marginTop: 4 }}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {value}
        </Text>
      )}
      <Text style={{ color: c.faint, fontSize: 11 }}>{label}</Text>
    </Card>
  );
}

function WeatherStrip({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  const [b, setB] = useState<WeatherBundle | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const saved = await getSavedLocation();
        const bundle = saved ? await getWeather(saved.lat, saved.lon, saved.name) : await getWeatherByQuery("Bengaluru");
        if (live) setB(bundle);
      } catch {
        /* offline or lookup failed — the strip simply stays hidden */
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  if (!b) return null;
  const w = wmo(b.current.weatherCode);
  const summary = `${Math.round(b.current.temperature)} degrees, ${w.label}, ${b.place.name}`;
  return (
    <Pressable
      onPress={onPress}
      style={{ marginBottom: 20 }}
      accessibilityRole="button"
      accessibilityLabel={`Weather: ${summary}. Open forecast`}
    >
      <Card padded style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Icon name={weatherIcon(w.group)} size={30} color={c.accentHi} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: "800", fontSize: 16 }}>
            {Math.round(b.current.temperature)}° · {w.label}
          </Text>
          <Text style={{ color: c.faint, fontSize: 12 }} numberOfLines={1}>
            {b.place.name} · feels {Math.round(b.current.apparent)}° · H {Math.round(b.daily[0]?.tMax ?? 0)}° L{" "}
            {Math.round(b.daily[0]?.tMin ?? 0)}°
          </Text>
        </View>
        <Icon name="chevron" size={18} color={c.faint} />
      </Card>
    </Pressable>
  );
}

function kindColor(kind: string, c: { red: string; green: string; amber: string; accentHi: string; faint: string }): string {
  switch (kind) {
    case "alert":
      return c.red;
    case "security":
      return c.amber;
    case "success":
      return c.green;
    case "activity":
      return c.accentHi;
    default:
      return c.faint;
  }
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
  iconBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeT: { color: "#fff", fontSize: 10, fontWeight: "800" },
  hero: { borderRadius: 20, padding: 20, flexDirection: "row", alignItems: "center", marginBottom: 18 },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  heroValueRow: { flexDirection: "row", alignItems: "baseline", marginTop: 4 },
  heroValue: { color: "#fff", fontSize: 40, fontWeight: "900" },
  heroUnit: { color: "#fff", fontSize: 18, fontWeight: "700" },
  trendChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
    alignSelf: "center",
  },
  trendT: { color: "#fff", fontSize: 11, fontWeight: "800" },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 2 },
  heroRight: { alignItems: "center", gap: 2 },
  heroStat: { color: "#fff", fontSize: 22, fontWeight: "800" },
  heroStatLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12 },
  quickRow: { flexDirection: "row", gap: GAP, marginBottom: 20 },
  glanceRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, marginBottom: 20 },
  pill: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  actRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
});
