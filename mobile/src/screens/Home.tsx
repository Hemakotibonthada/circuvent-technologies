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
  NeoRaised,
  Skeleton,
  CountUp,
  Stagger,
  useSafeArea,
  useAppActive,
} from "../ui";
import { Icon, eventIcon, weatherIcon, type IconName } from "../icons";
import { withAlpha } from "../neo";
import { useVisibleSections, HomeEditor } from "../home-editor";
import { Sheet } from "../overlays";
import type { HomeSection } from "../home-layout";
import { StaleNotice } from "../async";
import { deviceMeta, greeting, CATEGORY_TINTS, deviceCategory, RADIUS, SPACE, MOTION, TAP_SLOP } from "../theme";
import { Sparkline } from "../charts";
import { getLocalWeather, wmo, type WeatherBundle, type FallbackReason } from "../weather";

/** How many live-power readings to keep for the hero trend line. */
const WATT_HISTORY = 30;
const POLL_MS = 20000;
const GUTTER = 16;
const GAP = 12;

export default function Home({
  onOpenDevice,
  onOpenDevices,
  onOpenNotifications,
  onOpenSettings,
  onOpenAutomate,
  onOpenEnergy,
  onAddDevice,
  onOpenSearch,
  onOpenWeather,
}: {
  onOpenDevice: (d: Device) => void;
  /** The whole device list, from the Devices count. */
  onOpenDevices: () => void;
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
  const [syncError, setSyncError] = useState<string | null>(null);
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
    /*
     * Partial failure is fine on a dashboard -- three good panels beat none.
     * All four failing is not: that is the hub being unreachable, and the
     * screen would otherwise show a confident 0 W and an empty scene list,
     * which looks exactly like a quiet house.
     */
    setSyncError([s, r, e, a].every((x) => !x.ok) ? "Can't reach your hub. These figures are the last ones received." : null);
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
  const order = useVisibleSections();
  const [editing, setEditing] = useState(false);
  const roomNames = useMemo(() => ["All", ...rooms.map((r) => r.name)], [rooms]);
  const shownDevices = roomIdx === 0 ? devices : devices.filter((d) => d.room === roomNames[roomIdx]);

  // Direction of travel between the two most recent readings, so the hero says
  // something the raw number alone does not.
  const trend =
    wattHistory.length >= 2 ? wattHistory[wattHistory.length - 1] - wattHistory[wattHistory.length - 2] : 0;

  /*
   * Every section of the home screen, keyed.
   *
   * These used to be written out in source order, which made the file's layout
   * the user's layout. Keying them means the order on screen comes from the
   * user's saved arrangement, and hiding a section is dropping a key rather
   * than threading a boolean through nine conditionals.
   *
   * The header is not in here on purpose: the greeting, search and
   * notifications are how you get anywhere else, so they are not the user's to
   * move or remove.
   */
  const sections: Record<HomeSection, React.ReactNode> = {
    power: (
      <Pressable key="power" onPress={onOpenEnergy} accessibilityRole="button" accessibilityLabel="Live power. Open energy details">
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
    ),

    glance: (
      <View key="glance" style={s.glanceRow}>
        <GlanceTile icon="devices" value={devices.length} label="Devices" loading={loading} onPress={onOpenDevices} />
        <GlanceTile icon="rooms" value={rooms.length} label="Rooms" loading={loading} onPress={() => onOpenAutomate("rooms")} />
        <GlanceTile icon="scenes" value={scenes.length} label="Scenes" loading={loading} onPress={() => onOpenAutomate("scenes")} />
        <GlanceTile icon="alerts" value={unread} label="Alerts" tint={unread > 0 ? c.red : undefined} loading={loading} onPress={onOpenNotifications} />
      </View>
    ),

    quickActions: (
      <View key="quickActions" style={s.quickRow}>
        <QuickAction icon="scenes" label="Scenes" onPress={() => onOpenAutomate("scenes")} />
        <QuickAction icon="rooms" label="Rooms" onPress={() => onOpenAutomate("rooms")} />
        <QuickAction icon="rules" label="Rules" onPress={() => onOpenAutomate("automations")} />
        <QuickAction icon="add" label="Add" onPress={onAddDevice} />
      </View>
    ),

    weather: <WeatherStrip key="weather" onPress={onOpenWeather} />,

    scenes:
      favScenes.length > 0 ? (
        <View key="scenes">
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
        </View>
      ) : null,

    favorites:
      favorites.length > 0 ? (
        <View key="favorites">
          <SectionLabel>Favorites</SectionLabel>
          <View style={s.grid}>
            {favorites.map((d, i) => (
              <Stagger key={d.id} index={i}>
                <DeviceCard device={d} width={col} onOpen={onOpenDevice} onToggle={handleToggle} />
              </Stagger>
            ))}
          </View>
        </View>
      ) : null,

    devices:
      devices.length > 0 ? (
        <View key="devices">
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
        </View>
      ) : null,

    rooms:
      rooms.length > 0 ? (
        <View key="rooms">
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
        </View>
      ) : null,

    activity: (
      <View key="activity">
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
      </View>
    ),
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: GUTTER, paddingTop: insets.top + 12, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accentHi} onRefresh={onRefresh} />}
      >
        <StaleNotice error={syncError} onRetry={loadExtras} />
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
          {/*
            Customise sits on the home screen it customises. Burying it in
            Settings would mean leaving the thing you are arranging in order to
            arrange it, and then walking back to see the result.
          */}
          <HeaderButton
            icon="edit"
            label="Customise home screen"
            onPress={() => setEditing(true)}
            style={{ marginLeft: 8 }}
          />
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

        {/*
          The sections, in the order the user arranged them.
        
          Rendering from a list rather than writing them out here is what
          makes the layout theirs: a hidden section is a key that is not in
          the list, and reordering is reordering the list. It also means
          adding a section is one entry in the catalogue and one key here,
          rather than a decision about where in this file it belongs.
        */}
        {order.map((key) => sections[key])}
      </ScrollView>

      <Sheet visible={editing} onClose={() => setEditing(false)} maxHeightRatio={0.86}>
        <HomeEditor onClose={() => setEditing(false)} />
      </Sheet>
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

    const litFill = tint === CATEGORY_TINTS.neutral ? c.accent : tint;

    /*
     * Glass lights the tile rather than painting it.
     *
     * Filling a lit tile with solid category colour is right for neo and wrong
     * for a dark glass room: it produces a saturated block sitting on near-black
     * with nothing between them, which is the opposite of a pane you can see
     * through. Here the pane stays dark and the colour arrives as a wash from
     * within — the same information, carried by light instead of by paint, so
     * the text stays legible against a dark face and the tile still obviously
     * reads as on.
     */
    const glassLit = c.isGlass && lit;
    const face = glassLit ? withAlpha(litFill, 0.16) : lit ? litFill : c.isNeo ? c.surface : c.card;
    const edge = glassLit ? withAlpha(litFill, 0.42) : lit ? litFill : c.border;

    /* On a lit glass tile the face is dark, so the dark-on-light foreground
       that suits a painted tile would be unreadable. */
    const fgFinal = glassLit ? c.text : fg;
    const subFinal = glassLit ? c.textDim : sub;

    const body = (
      <View
        style={{
          borderRadius: RADIUS.tile,
          padding: SPACE.lg,
          minHeight: 124,
          justifyContent: "space-between",
          backgroundColor: face,
          borderWidth: c.isNeo ? 0 : 1,
          borderColor: edge,
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
                backgroundColor: glassLit ? withAlpha(litFill, 0.22) : lit ? "rgba(28,28,30,0.12)" : offline ? c.cardHi : `${tint}22`,
              }}
            >
              <Icon name={meta.icon} size={21} color={glassLit ? litFill : lit ? c.onAccent : offline ? c.faint : tint} />
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
            <Text style={{ color: fgFinal, fontWeight: "700", fontSize: 15, letterSpacing: -0.2 }} numberOfLines={1}>
              {d.name || d.id}
            </Text>
            <Text style={{ color: subFinal, fontSize: 13, marginTop: 1 }} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>
    );

    return (
      <Pressable
        onPress={() => onOpen(d)}
        accessibilityRole="button"
        accessibilityLabel={`${d.name || d.id}. ${subtitle}`}
        style={({ pressed }) => [{ width, minHeight: 124 }, pressed && { transform: [{ scale: MOTION.pressScale }] }]}
      >
        {c.isNeo ? (
          <NeoRaised radius={RADIUS.tile} c={c} surface={lit ? litFill : c.surface}>
            {body}
          </NeoRaised>
        ) : (
          body
        )}
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
  onPress,
}: {
  icon: IconName;
  value: number;
  label: string;
  tint?: string;
  loading?: boolean;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  /*
   * These read as buttons — a card with an icon, a count and a noun — so they
   * have to behave like buttons. They were four pieces of static text, and
   * tapping the one labelled "Alerts" while an alert was outstanding did
   * nothing at all.
   */
  return (
    <Card
      padded
      style={{ flex: 1, alignItems: "center", paddingVertical: 12 }}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `${value} ${label}` : undefined}
    >
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
  const [b, setB] = useState<(WeatherBundle & { fallbackReason?: FallbackReason }) | null>(null);
  const [asking, setAsking] = useState(false);

  const load = useCallback(async (ask: boolean) => {
    try {
      return await getLocalWeather({ ask });
    } catch {
      /* offline or lookup failed — the strip simply stays hidden */
      return null;
    }
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const bundle = await load(false);
      if (live && bundle) setB(bundle);
    })();
    return () => {
      live = false;
    };
  }, [load]);

  if (!b) return null;
  const w = wmo(b.current.weatherCode);
  const summary = `${Math.round(b.current.temperature)} degrees, ${w.label}, ${b.place.name}`;

  /*
   * Say when this is not their weather.
   *
   * The fallback city used to be presented in exactly the same shape as a real
   * answer, so somebody in Hyderabad saw "Bengaluru, Karnataka, India" with no
   * way to tell that their location had been declined rather than mistaken.
   * This is the one line that turns a confidently wrong answer into an honest
   * one, plus a way to fix it — previously the only prompt was at first run, so
   * a single early "deny" was permanent.
   */
  const guessing = !!b.fallbackReason;
  const note =
    b.fallbackReason === "denied"
      ? "Location is off — showing Bengaluru"
      : b.fallbackReason === "no-fix"
        ? "Waiting for a location fix — showing Bengaluru"
        : b.fallbackReason
          ? "Couldn't read your location — showing Bengaluru"
          : "";

  const grant = async () => {
    setAsking(true);
    const next = await load(true);
    if (next) setB(next);
    setAsking(false);
  };

  return (
    <Pressable
      onPress={onPress}
      style={{ marginBottom: 20 }}
      accessibilityRole="button"
      accessibilityLabel={`Weather: ${summary}${guessing ? `. ${note}` : ""}. Open forecast`}
    >
      <Card padded style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
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
        </View>

        {guessing && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ color: c.amber, fontSize: 12, flex: 1 }} numberOfLines={2}>
              {note}
            </Text>
            {b.fallbackReason === "denied" && (
              /*
               * Wrapped in a View that claims the touch, which is how the
               * device tiles keep their toggle from opening the device. The
               * note sits inside a card that is itself a button to the
               * forecast, so without this, tapping "Use my location" opens the
               * forecast instead of asking for permission.
               */
              <View onStartShouldSetResponder={() => true}>
                <Pressable
                  onPress={grant}
                  disabled={asking}
                  hitSlop={TAP_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel="Use my location for the weather"
                >
                  <Text style={{ color: c.accent, fontSize: 12, fontWeight: "800" }}>
                    {asking ? "Asking…" : "Use my location"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
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
