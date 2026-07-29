import React, { useEffect, useMemo } from "react";
import { View, Text } from "react-native";
import { Card, useAppActive, useTheme } from "../../../ui";
import { Kpi, KpiGrid, MetricRow, Callout, HealthStrip } from "../../../enterprise-ui";
import { formatRelative } from "../../../enterprise";
import { useZones, devicesForRoom } from "./useZones";
import { asNumber, fieldText } from "./fields";
import { ModuleScaffold, HonestEmpty } from "./parts";

export function ZoneOverview({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const active = useAppActive();
  const z = useZones();
  useEffect(() => { if (!active) return; const id = setInterval(z.refresh, 20000); return () => clearInterval(id); }, [active, z.refresh]);
  const model = z.data;
  const rooms = useMemo(() => {
    if (!model) return [];
    const known = model.rooms.length ? model.rooms : [{ id: null, name: "Unassigned", icon: "rooms", sort: 0, count: 0 }];
    const extras = [...new Set(model.devices.map((d) => d.room || "Unassigned"))].filter((name) => !known.some((r) => r.name === name));
    return [...known, ...extras.map((name, i) => ({ id: null, name, icon: "rooms", sort: 1000 + i, count: 0 }))].sort((a, b) => a.sort - b.sort);
  }, [model]);
  const roomStats = useMemo(() => rooms.map((r) => {
    const ds = model ? devicesForRoom(model.devices, r) : [];
    const fs = ds.map((d) => model!.fieldMap[d.id]);
    const temps = fs.map((f) => asNumber(f.temperature)).filter((n): n is number => n != null);
    const hums = fs.map((f) => asNumber(f.humidity)).filter((n): n is number => n != null);
    const aqis = fs.flatMap((f) => f.pollutants).filter((p) => p.label === "AQI").map((p) => p.numeric).filter((n): n is number => n != null);
    return { room: r, devices: ds, online: ds.filter((d) => d.online).length, temp: temps.length ? Math.max(...temps) : undefined, humidity: hums.length ? Math.max(...hums) : undefined, aqi: aqis.length ? Math.max(...aqis) : undefined, contributors: { temp: temps.length, humidity: hums.length, aqi: aqis.length } };
  }), [rooms, model]);
  const kpis = useMemo(() => {
    const warm = roomStats.filter((r) => r.temp != null).sort((a,b)=>(b.temp! - a.temp!))[0];
    const humid = roomStats.filter((r) => r.humidity != null).sort((a,b)=>(b.humidity! - a.humidity!))[0];
    const air = roomStats.filter((r) => r.aqi != null).sort((a,b)=>(b.aqi! - a.aqi!))[0];
    return { warm, humid, air };
  }, [roomStats]);
  const breaches = useMemo(() => {
    if (!model) return [] as { title: string; text: string }[];
    const out: { title: string; text: string }[] = [];
    for (const d of model.devices) {
      const f = model.fieldMap[d.id];
      const h = asNumber(f.humidity); if (h != null && h > model.settings.climate.humidity + 10) out.push({ title: "Humidity threshold breach", text: `${d.name} reports ${h}% humidity, above your ${model.settings.climate.humidity}% comfort target.` });
      const t = asNumber(f.temperature); if (t != null && Math.abs(t - model.settings.climate.temperature) > 5) out.push({ title: "Temperature outside target", text: `${d.name} reports ${t}°C; target is ${model.settings.climate.temperature}°C.` });
      for (const p of f.pollutants) { const threshold = (model.settings.air as any)[p.field] ?? (p.label === "AQI" ? model.settings.air.aqi : undefined); if (p.numeric != null && threshold != null && p.numeric >= threshold) out.push({ title: "Air threshold breach", text: `${d.name} reports ${p.label} ${fieldText(p, 1)}, at or above ${threshold}.` }); }
    }
    return out.slice(0, 5);
  }, [model]);
  return <ModuleScaffold title="Zone overview" subtitle="Rooms and real environmental readings" icon="dashboard" onBack={onBack} loading={z.loading} error={z.error} onRetry={z.reload} refreshing={z.refreshing} onRefresh={z.refresh}>
    {!model || !model.devices.length ? <HonestEmpty icon="rooms" title="No devices yet" subtitle="Rooms will show environmental readings only after real devices report state or telemetry." /> : <>
      <KpiGrid>
        <Kpi icon="temperature" label="Warmest reporting room" value={kpis.warm?.temp?.toFixed(1) ?? "no reading"} unit={kpis.warm ? "°C" : undefined} footnote={kpis.warm ? `${kpis.warm.room.name}; ${roomStats.filter(r=>r.temp!=null).length} rooms contributed` : "No temperature field reported"} tint={c.amber}/>
        <Kpi icon="humidity" label="Highest humidity" value={kpis.humid?.humidity?.toFixed(0) ?? "no reading"} unit={kpis.humid ? "%" : undefined} footnote={kpis.humid ? `${kpis.humid.room.name}; ${roomStats.filter(r=>r.humidity!=null).length} rooms contributed` : "No humidity field reported"} tint={c.cyan}/>
        <Kpi icon="airQuality" label="Highest AQI" value={kpis.air?.aqi?.toFixed(0) ?? "no reading"} footnote={kpis.air ? `${kpis.air.room.name}; ${roomStats.filter(r=>r.aqi!=null).length} rooms contributed` : "No AQI field reported"} tint={c.violet}/>
      </KpiGrid>
      {breaches.map((b, i) => <Callout key={i} kind="warning" title={b.title} text={b.text} icon="warning" />)}
      {roomStats.map((r) => <Card key={r.room.name} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}><Text style={{ color: c.text, fontWeight: "900", fontSize: 17, flex: 1 }}>{r.room.name}</Text><Text style={{ color: c.faint }}>{r.online}/{r.devices.length} online</Text></View>
        <HealthStrip items={[{ label: "Devices online", ok: r.online === r.devices.length && r.devices.length > 0, detail: `${r.online}/${r.devices.length}` }, { label: "Environmental coverage", ok: r.contributors.temp + r.contributors.humidity + r.contributors.aqi > 0, detail: `${r.contributors.temp + r.contributors.humidity + r.contributors.aqi} readings` }]} />
        <MetricRow icon="temperature" label="Temperature" value={r.temp == null ? "not reported" : `${r.temp.toFixed(1)} °C from ${r.contributors.temp} device(s)`} />
        <MetricRow icon="humidity" label="Humidity" value={r.humidity == null ? "not reported" : `${r.humidity.toFixed(0)}% from ${r.contributors.humidity} device(s)`} />
        <MetricRow icon="airQuality" label="AQI" value={r.aqi == null ? "not reported" : `${r.aqi.toFixed(0)} from ${r.contributors.aqi} device(s)`} />
        {r.devices.slice(0,4).map((d)=><MetricRow key={d.id} icon="device" label={d.name} value={`${d.type} · ${d.last_seen ? formatRelative(d.last_seen) : "never seen"}`} />)}
      </Card>)}
    </>}
  </ModuleScaffold>;
}
