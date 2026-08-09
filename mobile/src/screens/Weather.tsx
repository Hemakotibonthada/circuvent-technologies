import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TextInput, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { Screen, Card, SectionLabel, useTheme, IconButton, useToast, ToastHost } from "../ui";
import { useDevices } from "../store";
import { TAP_SLOP } from "../theme";
import {
  getWeather, getWeatherByQuery, geocode, getSavedLocation, setSavedLocation,
  wmo, aqiCategory, weatherTips, type WeatherBundle, type GeoPlace, type WeatherAction,
} from "../weather";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hourLabel = (t: string) => { const h = new Date(t).getHours(); return `${h % 12 || 12}${h < 12 ? "a" : "p"}`; };
const clock = (t: string) => { const d = new Date(t); const h = d.getHours(); return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const dayLabel = (t: string, i: number) => (i === 0 ? "Today" : WD[new Date(t).getDay()]);

export default function Weather({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const { devices, command } = useDevices();
  const toast = useToast();
  const [bundle, setBundle] = useState<WeatherBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<GeoPlace[]>([]);

  const load = useCallback(async (lat: number, lon: number, name?: string) => {
    setErr(null);
    try { const b = await getWeather(lat, lon, name); setBundle(b); setSavedLocation({ lat, lon, name: name || b.place.name }); }
    catch { setErr("Couldn't load weather. Pull to retry."); }
    finally { setLoading(false); }
  }, []);
  const loadQuery = useCallback(async (query: string) => {
    setErr(null);
    try { const b = await getWeatherByQuery(query); setBundle(b); setSavedLocation({ lat: b.place.latitude, lon: b.place.longitude, name: b.place.name }); }
    catch { setErr("City not found."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { (async () => { const s = await getSavedLocation(); if (s) load(s.lat, s.lon, s.name); else loadQuery("Bengaluru"); })(); }, [load, loadQuery]);

  useEffect(() => {
    if (!q.trim()) { setPlaces([]); return; }
    const t = setTimeout(async () => { try { setPlaces(await geocode(q)); } catch { /* ignore */ } }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (p: GeoPlace) => { setShowSearch(false); setQ(""); setPlaces([]); setLoading(true); load(p.latitude, p.longitude, [p.name, p.admin1, p.country].filter(Boolean).join(", ")); };

  const applyAction = (action: WeatherAction) => {
    let ids: string[] = []; let cmd: Record<string, unknown> = {};
    if (action === "close-curtains") { ids = devices.filter((d) => d.type === "curtain").map((d) => d.id); cmd = { action: "set", position: 0 }; }
    else if (action === "turn-on-ac") { ids = devices.filter((d) => d.type === "thermostat" || d.type === "ac").map((d) => d.id); cmd = { action: "set", power: true }; }
    else if (action === "turn-off-ac") { ids = devices.filter((d) => d.type === "thermostat" || d.type === "ac").map((d) => d.id); cmd = { action: "set", power: false }; }
    else if (action === "turn-on-fan") { ids = devices.filter((d) => ["smart-fan", "fan", "ceiling-fan"].includes(d.type)).map((d) => d.id); cmd = { action: "set", power: true }; }
    else { toast.show("Noted — stay prepared!", "info"); return; }
    if (!ids.length) { toast.show("No matching devices to control", "info"); return; }
    ids.forEach((id) => command(id, cmd));
    toast.show(`Applied to ${ids.length} device${ids.length === 1 ? "" : "s"}`, "success");
  };

  const cur = bundle?.current;
  const w = cur ? wmo(cur.weatherCode) : null;
  const aqi = bundle?.air ? aqiCategory(bundle.air.usAqi) : null;
  const tips = bundle ? weatherTips(bundle) : [];
  const weekMax = bundle ? Math.max(1, ...bundle.daily.map((d) => d.tMax)) : 1;
  const weekMin = bundle ? Math.min(0, ...bundle.daily.map((d) => d.tMin)) : 0;
  const span = weekMax - weekMin || 1;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 52, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accentHi} onRefresh={async () => { setRefreshing(true); if (bundle) await load(bundle.place.latitude, bundle.place.longitude, bundle.place.name); setRefreshing(false); }} />}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <IconButton glyph="‹" onPress={onBack} />
          <Text style={{ color: c.text, fontSize: 24, fontWeight: "800", flex: 1 }} numberOfLines={1}>{bundle?.place.name ?? "Weather"}</Text>
          <IconButton glyph="🔍" onPress={() => setShowSearch((v) => !v)} />
        </View>

        {showSearch && (
          <Card padded style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.cardHi, borderRadius: 10, paddingHorizontal: 10, height: 42 }}>
              <Text style={{ fontSize: 15 }}>🔍</Text>
              <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Search city…" placeholderTextColor={c.faint} style={{ flex: 1, color: c.text, fontSize: 15 }} autoCapitalize="words" />
              {q.length > 0 && <Pressable onPress={() => setQ("")} hitSlop={8}><Text style={{ color: c.faint }}>✕</Text></Pressable>}
            </View>
            {places.map((p) => (
              <Pressable hitSlop={TAP_SLOP} key={p.id} onPress={() => pick(p)} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border }}>
                <Text style={{ color: c.text }}>{p.name}<Text style={{ color: c.faint }}>{[p.admin1, p.country].filter(Boolean).length ? ` · ${[p.admin1, p.country].filter(Boolean).join(", ")}` : ""}</Text></Text>
              </Pressable>
            ))}
          </Card>
        )}

        {loading && !bundle ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}><ActivityIndicator color={c.accentHi} /></View>
        ) : err && !bundle ? (
          <Text style={{ color: c.red, textAlign: "center", marginTop: 40 }}>{err}</Text>
        ) : bundle && cur && w ? (
          <>
            <Card padded style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Text style={{ fontSize: 52 }}>{w.icon}</Text>
                  <View>
                    <Text style={{ color: c.text, fontSize: 44, fontWeight: "900", lineHeight: 48 }}>{Math.round(cur.temperature)}°</Text>
                    <Text style={{ color: c.textDim, fontSize: 14 }}>{w.label}</Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: c.faint, fontSize: 13 }}>Feels {Math.round(cur.apparent)}°</Text>
                  {bundle.daily[0] && <Text style={{ color: c.faint, fontSize: 13 }}>H {Math.round(bundle.daily[0].tMax)}° · L {Math.round(bundle.daily[0].tMin)}°</Text>}
                </View>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                <Stat label="Humidity" value={`${Math.round(cur.humidity)}%`} />
                <Stat label="Wind" value={`${Math.round(cur.windSpeed)} km/h`} />
                <Stat label="UV max" value={`${Math.round(bundle.daily[0]?.uvIndexMax ?? 0)}`} />
                {aqi && <Stat label="AQI" value={bundle.air?.usAqi != null ? String(Math.round(bundle.air.usAqi)) : "—"} color={aqi.color} />}
              </View>
              {bundle.daily[0] && <Text style={{ color: c.faint, fontSize: 12, marginTop: 10 }}>☀️ {clock(bundle.daily[0].sunrise)}  ·  🌙 {clock(bundle.daily[0].sunset)}{aqi ? `  ·  Air: ${aqi.label}` : ""}</Text>}
            </Card>

            <SectionLabel>Hourly</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
              {bundle.hourly.slice(0, 16).map((h, i) => {
                const hw = wmo(h.weatherCode);
                return (
                  <Card key={h.time} padded style={{ alignItems: "center", width: 62, paddingHorizontal: 6 }}>
                    <Text style={{ color: c.faint, fontSize: 11 }}>{i === 0 ? "Now" : hourLabel(h.time)}</Text>
                    <Text style={{ fontSize: 20, marginVertical: 2 }}>{hw.icon}</Text>
                    <Text style={{ color: c.text, fontWeight: "700" }}>{Math.round(h.temperature)}°</Text>
                    <Text style={{ color: c.cyan, fontSize: 10 }}>{Math.round(h.precipitationProb)}%</Text>
                  </Card>
                );
              })}
            </ScrollView>

            <SectionLabel>7-day forecast</SectionLabel>
            <Card padded style={{ marginBottom: 14 }}>
              {bundle.daily.map((d, i) => {
                const dw = wmo(d.weatherCode);
                const left = ((d.tMin - weekMin) / span) * 100;
                const width = ((d.tMax - d.tMin) / span) * 100;
                return (
                  <View key={d.date} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
                    <Text style={{ color: c.textDim, width: 44, fontSize: 13 }}>{dayLabel(d.date, i)}</Text>
                    <Text style={{ width: 24, textAlign: "center" }}>{dw.icon}</Text>
                    <Text style={{ color: c.cyan, width: 34, textAlign: "right", fontSize: 11 }}>{Math.round(d.precipProbMax)}%</Text>
                    <Text style={{ color: c.faint, width: 30, textAlign: "right", fontSize: 13 }}>{Math.round(d.tMin)}°</Text>
                    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.border, overflow: "hidden" }}>
                      <View style={{ position: "absolute", left: `${left}%`, width: `${Math.max(6, width)}%`, height: 6, borderRadius: 3, backgroundColor: c.accent }} />
                    </View>
                    <Text style={{ color: c.text, width: 30, fontSize: 13 }}>{Math.round(d.tMax)}°</Text>
                  </View>
                );
              })}
            </Card>

            <SectionLabel>Smart-home tips</SectionLabel>
            {tips.map((t) => (
              <Card key={t.id} padded style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Text style={{ fontSize: 22 }}>{t.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: "700" }}>{t.title}</Text>
                  <Text style={{ color: c.faint, fontSize: 12 }}>{t.body}</Text>
                </View>
                {t.action && (t.action === "close-curtains" || t.action === "turn-on-ac" || t.action === "turn-off-ac" || t.action === "turn-on-fan") && (
                  <Pressable hitSlop={TAP_SLOP} onPress={() => applyAction(t.action!)} style={{ backgroundColor: c.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ color: c.onAccent, fontWeight: "800", fontSize: 13 }}>Apply</Text>
                  </Pressable>
                )}
              </Card>
            ))}

            <Text style={{ color: c.faint, fontSize: 11, textAlign: "center", marginTop: 6 }}>Updated {clock(bundle.fetchedAt)} · Open-Meteo</Text>
          </>
        ) : null}
      </ScrollView>
      <ToastHost toast={toast.toast} onHide={toast.hide} />
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ backgroundColor: c.cardHi, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, minWidth: 74, alignItems: "center", flexGrow: 1 }}>
      <Text style={{ color: color || c.text, fontWeight: "800", fontSize: 15 }}>{value}</Text>
      <Text style={{ color: c.faint, fontSize: 11 }}>{label}</Text>
    </View>
  );
}
