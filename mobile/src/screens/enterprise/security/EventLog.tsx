import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../../../api";
import type { AppEvent } from "../../../api";
import { useAppActive, useTheme } from "../../../ui";
import { BottomSheet, Callout, CodeBlock, ConfirmDialog, EventTimeline, FilterBar, Kpi, KpiGrid, SearchField, ActionButton, SeverityBadge } from "../../../enterprise-ui";
import { bucketSeries, countBy, formatDateTime, formatRelative, severityOf, toCsv, type Severity } from "../../../enterprise";
import { BarChart, HBars } from "../../../charts";
import { useSecurityData } from "./useSecurity";
import { DetailRows, EventCard, HonestEmpty, rawJson, SecurityScaffold } from "./parts";
import { eventDeviceName } from "./zones";

type Filter = "all" | "critical" | "warning" | "info" | "unread";

export function EventLog({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const active = useAppActive();
  const data = useSecurityData(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<AppEvent | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => data.reload(), 20000);
    return () => clearInterval(id);
  }, [active, data.reload]);

  const counts = useMemo(() => ({
    all: data.events.length,
    critical: data.events.filter((e) => severityOf(e.kind) === "critical").length,
    warning: data.events.filter((e) => severityOf(e.kind) === "warning").length,
    info: data.events.filter((e) => severityOf(e.kind) === "info").length,
    unread: data.events.filter((e) => !e.read).length,
  }), [data.events]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.events.filter((e) => {
      const sev = severityOf(e.kind);
      const f = filter === "all" || (filter === "unread" ? !e.read : sev === filter);
      if (!f) return false;
      if (!needle) return true;
      return `${e.title} ${e.body} ${e.kind} ${eventDeviceName(e, data.devices)}`.toLowerCase().includes(needle);
    });
  }, [data.events, data.devices, filter, q]);

  const byKind = useMemo(() => countBy(filtered, (e) => e.kind).slice(0, 10), [filtered]);
  const hourly = useMemo(() => {
    const groups = new Map<number, number>();
    for (const e of filtered) {
      const t = new Date(e.ts).getTime();
      if (!Number.isFinite(t)) continue;
      const h = Math.floor(t / 3600000) * 3600000;
      groups.set(h, (groups.get(h) ?? 0) + 1);
    }
    const pts = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v }));
    return bucketSeries(pts, 24).map((p) => p.v);
  }, [filtered]);

  const csv = useMemo(() => toCsv(filtered.map((e) => ({ id: e.id, ts: e.ts, kind: e.kind, severity: severityOf(e.kind), title: e.title, body: e.body, read: e.read, device: eventDeviceName(e, data.devices) }))), [filtered, data.devices]);

  async function mark(ids?: number[]) {
    setBusy(true);
    await api.markEventsRead(ids);
    setBusy(false);
    setSelected(null);
    data.reload();
  }
  async function del(id: number) {
    setBusy(true);
    await api.deleteEvent(id);
    setBusy(false);
    setSelected(null);
    data.reload();
  }
  async function clearAll() {
    setBusy(true);
    await api.clearEvents();
    setBusy(false);
    setClearOpen(false);
    data.reload();
  }

  return <SecurityScaffold title="Security Event Log" subtitle="Audit trail from api.events(200)" onBack={onBack} loading={data.loading} error={data.error} onRetry={data.reload} onRefresh={data.reload} refreshing={data.refreshing}>
    <KpiGrid><Kpi icon="alerts" label="Events" value={counts.all} /><Kpi icon="alert" label="Critical" value={counts.critical} tint={c.red} /><Kpi icon="warning" label="Warnings" value={counts.warning} tint={c.amber} /><Kpi icon="bell" label="Unread" value={counts.unread} tint={c.accentHi} /></KpiGrid>
    <FilterBar options={[{ value: "all", label: "All", icon: "list" }, { value: "critical", label: "Critical", icon: "alert", color: c.red }, { value: "warning", label: "Warning", icon: "warning", color: c.amber }, { value: "info", label: "Info", icon: "info", color: c.cyan }, { value: "unread", label: "Unread", icon: "bell", color: c.accentHi }]} value={filter} onChange={setFilter} counts={counts} />
    <SearchField value={q} onChange={setQ} placeholder="Search title, body, kind or device" />
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}><View style={{ flex: 1 }}><ActionButton label="Mark visible read" icon="check" outline onPress={() => mark(filtered.map((e) => e.id))} disabled={!filtered.some((e) => !e.read)} busy={busy} /></View><View style={{ flex: 1 }}><ActionButton label="CSV" icon="exportFile" outline onPress={() => setCsvOpen(true)} disabled={!filtered.length} /></View></View>
    <Callout kind="info" text="CSV is shown here because no file-share or clipboard library is installed in this build." icon="exportFile" />
    <View style={{ marginBottom: 16 }}><Text style={{ color: c.text, fontWeight: "900", marginBottom: 8 }}>Activity over time (hour buckets)</Text><BarChart data={hourly} color={c.accentHi} /></View>
    <View style={{ marginBottom: 16 }}><Text style={{ color: c.text, fontWeight: "900", marginBottom: 8 }}>Breakdown by kind</Text>{byKind.length ? <HBars items={byKind.map((x) => ({ name: x.key, value: x.count, color: c.cyan }))} /> : <HonestEmpty title="No kind breakdown" subtitle="No real events match the current filter." icon="history" />}</View>
    <EventTimeline items={filtered.slice(0, 8).map((e) => ({ id: String(e.id), title: e.title, body: `${eventDeviceName(e, data.devices)} · ${e.body}`, time: formatRelative(e.ts), severity: severityOf(e.kind), icon: "security" }))} />
    <Text style={{ color: c.faint, fontSize: 12, marginTop: 8, marginBottom: 8 }}>Tap an event below for full detail.</Text>
    {filtered.length ? filtered.map((e) => <EventCard key={e.id} event={e} devices={data.devices} onPress={() => setSelected(e)} />) : <HonestEmpty title="No matching events" subtitle="The API returned no events for this filter and search." icon="history" />}
    <View style={{ marginTop: 8 }}><ActionButton label="Clear all events" icon="trash" tone={c.red} outline onPress={() => setClearOpen(true)} disabled={!data.events.length} /></View>

    <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? "Event detail"} footer={selected ? <View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><ActionButton label="Mark read" icon="check" onPress={() => mark([selected.id])} disabled={selected.read} busy={busy} /></View><View style={{ flex: 1 }}><ActionButton label="Delete" icon="trash" tone={c.red} onPress={() => del(selected.id)} busy={busy} /></View></View> : null}>
      {selected ? <><SeverityBadge severity={severityOf(selected.kind)} /><DetailRows rows={[{ label: "Kind", value: selected.kind, icon: "topic" }, { label: "Device", value: eventDeviceName(selected, data.devices), icon: "device" }, { label: "When", value: formatDateTime(selected.ts), icon: "clock" }, { label: "Read", value: selected.read ? "Read" : "Unread", icon: selected.read ? "check" : "bell" }]} /><CodeBlock label="Raw event" text={rawJson(selected)} /></> : null}
    </BottomSheet>
    <BottomSheet visible={csvOpen} onClose={() => setCsvOpen(false)} title="CSV export"><CodeBlock label="security-events.csv" text={csv || "No rows"} maxHeight={420} /></BottomSheet>
    <ConfirmDialog visible={clearOpen} title="Clear all events?" message="This calls the real clear-events API and cannot be undone." confirmLabel="Clear all" destructive busy={busy} onConfirm={clearAll} onCancel={() => setClearOpen(false)} />
  </SecurityScaffold>;
}
