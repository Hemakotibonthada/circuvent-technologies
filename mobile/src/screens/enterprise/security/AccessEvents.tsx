import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { AppEvent } from "../../../api";
import { useTheme } from "../../../ui";
import { BottomSheet, CodeBlock, FilterBar, Kpi, KpiGrid, SeverityBadge } from "../../../enterprise-ui";
import { CalendarHeatmap, HBars } from "../../../charts";
import { countBy, formatDateTime, formatRelative, groupBy, severityOf } from "../../../enterprise";
import { useSecurityData } from "./useSecurity";
import { dayKey, DetailRows, EventCard, HonestEmpty, hourLabel, rawJson, SecurityScaffold, Section } from "./parts";
import { eventDeviceName, isAccessEvent } from "./zones";

export function AccessEvents({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const data = useSecurityData(false);
  const [kind, setKind] = useState("all");
  const [selected, setSelected] = useState<AppEvent | null>(null);

  const access = useMemo(() => data.events.filter(isAccessEvent), [data.events]);
  const kinds = useMemo(() => countBy(access, (e) => e.kind), [access]);
  const filtered = useMemo(() => kind === "all" ? access : access.filter((e) => e.kind === kind), [access, kind]);
  const byDay = useMemo(() => groupBy(filtered, (e) => dayKey(e.ts)), [filtered]);
  const days = useMemo(() => {
    const end = new Date();
    const out: { date: string; value: number }[] = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date(end); d.setDate(end.getDate() - i);
      const k = d.toISOString().slice(0, 10);
      out.push({ date: k, value: byDay[k]?.length ?? 0 });
    }
    return out;
  }, [byDay]);
  const byDevice = useMemo(() => countBy(filtered, (e) => eventDeviceName(e, data.devices)).slice(0, 10), [filtered, data.devices]);
  const byHour = useMemo(() => countBy(filtered, (e) => hourLabel(e.ts)).sort((a, b) => Number(a.key.slice(0, 2)) - Number(b.key.slice(0, 2))), [filtered]);
  const grouped = useMemo(() => Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])), [byDay]);

  const filterOptions = [{ value: "all", label: "All real kinds", icon: "filter" as const }, ...kinds.map((k) => ({ value: k.key, label: k.key, icon: "topic" as const }))];
  const filterCounts: Record<string, number> = { all: access.length };
  for (const k of kinds) filterCounts[k.key] = k.count;

  return <SecurityScaffold title="Access Events" subtitle="Door, gate, RFID, face and keypad activity from real events" onBack={onBack} loading={data.loading} error={data.error} onRetry={data.reload} onRefresh={data.reload} refreshing={data.refreshing}>
    <KpiGrid><Kpi icon="gate" label="Access events" value={access.length} /><Kpi icon="topic" label="Kinds seen" value={kinds.length} /><Kpi icon="devices" label="Devices" value={byDevice.length} /></KpiGrid>
    {kinds.length ? <FilterBar options={filterOptions} value={kind} onChange={setKind} counts={filterCounts} /> : null}
    <Section title="Observed access kinds" subtitle="Filters are built from kind values actually returned by the API" icon="filter">
      {kinds.length ? <HBars items={kinds.map((x) => ({ name: x.key, value: x.count, color: c.accentHi }))} /> : <HonestEmpty icon="history" title="No access events" subtitle="No real event kind/title/body currently mentions access, lock, door, face, RFID, keypad or gate." />}
    </Section>
    <Section title="Calendar heatmap" subtitle="Counts per day from real event timestamps" icon="calendar"><CalendarHeatmap days={days} /></Section>
    <Section title="Per-device breakdown" icon="devices">{byDevice.length ? <HBars items={byDevice.map((x) => ({ name: x.key, value: x.count, color: c.cyan }))} /> : <HonestEmpty icon="devices" title="No device breakdown" subtitle="No access events match this filter." />}</Section>
    <Section title="Busiest hours" icon="clock">{byHour.length ? <HBars items={byHour.map((x) => ({ name: x.key, value: x.count, color: c.violet }))} /> : <HonestEmpty icon="clock" title="No hourly data" subtitle="No access events match this filter." />}</Section>
    <Section title="Access timeline" icon="history">
      {grouped.length ? grouped.map(([day, rows]) => <View key={day} style={{ marginBottom: 12 }}><Text style={{ color: c.text, fontWeight: "900", marginBottom: 8 }}>{day} · {rows.length}</Text>{rows.map((e) => <EventCard key={e.id} event={e} devices={data.devices} onPress={() => setSelected(e)} />)}</View>) : <HonestEmpty icon="history" title="No matching access events" subtitle="Try a different observed kind filter." />}
    </Section>
    <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? "Access event"}>
      {selected ? <><SeverityBadge severity={severityOf(selected.kind)} /><DetailRows rows={[{ label: "Kind", value: selected.kind, icon: "topic" }, { label: "Device", value: eventDeviceName(selected, data.devices), icon: "device" }, { label: "When", value: `${formatDateTime(selected.ts)} (${formatRelative(selected.ts)})`, icon: "clock" }]} /><CodeBlock label="Raw event payload" text={rawJson(selected)} maxHeight={420} /></> : null}
    </BottomSheet>
  </SecurityScaffold>;
}
