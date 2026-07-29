import React, { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api, type AdminEvent } from "../../../api";
import { Card, ToastHost, useTheme, useToast } from "../../../ui";
import { BottomSheet, CodeBlock, DataGrid, EventTimeline, FilterBar, MetricRow, SearchField, SeverityBadge, Pill } from "../../../enterprise-ui";
import { BarChart, HBars } from "../../../charts";
import { bucketSeries, countBy, formatDateTime, formatDuration, formatRelative, severityOf, toCsv, type Severity } from "../../../enterprise";
import { unwrap, useAdminResource } from "./useAdmin";
import { AdminScreenFrame, ScreenGate, SectionTitle, SourceNote, ownerLabel } from "./parts";
import { getLocalAudit, type LocalAuditEntry } from "./auditLog";

type UnifiedRecord = {
  id: string;
  source: "server" | "local";
  kind: string;
  title: string;
  body: string;
  ts: string;
  actor: string;
  deviceId?: string | null;
  severity: Severity;
  raw: unknown;
};

type Filter = "all" | `sev:${Severity}` | `kind:${string}` | "source:server" | "source:local";

async function loadAudit(): Promise<{ server: AdminEvent[]; local: LocalAuditEntry[] }> {
  const [server, local] = await Promise.all([
    unwrap(api.adminEvents(200), "Unable to load server events."),
    getLocalAudit(),
  ]);
  return { server: server.events, local };
}

export default function AuditTrail({ onBack }: { onBack: () => void }) {
  const loader = useCallback(() => loadAudit(), []);
  const { state, refresh } = useAdminResource(loader);
  return (
    <ScreenGate state={state} onBack={onBack} onRetry={refresh}>
      {(data) => <AuditReady data={data} refreshing={state.refreshing} onRefresh={refresh} onBack={onBack} />}
    </ScreenGate>
  );
}

function AuditReady({ data, refreshing, onRefresh, onBack }: { data: { server: AdminEvent[]; local: LocalAuditEntry[] }; refreshing: boolean; onRefresh: () => void; onBack: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<UnifiedRecord | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const records = useMemo<UnifiedRecord[]>(() => {
    const server = data.server.map((e) => ({ id: `server-${e.id}`, source: "server" as const, kind: e.kind, title: e.title, body: e.body, ts: e.ts, actor: ownerLabel(e.owner_email, e.owner_id), deviceId: e.device_id, severity: severityOf(e.kind), raw: e }));
    const local = data.local.map((e) => ({ id: `local-${e.id}`, source: "local" as const, kind: e.action, title: e.title, body: e.body, ts: e.ts, actor: e.actorEmail || (e.actorUid != null ? `User ${e.actorUid}` : "This device"), deviceId: e.targetId, severity: e.severity, raw: e }));
    return [...server, ...local].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [data]);

  const kindCounts = useMemo(() => countBy(records, (r) => r.kind).slice(0, 6), [records]);
  const filterOptions = useMemo(() => ([
    { value: "all" as Filter, label: "All", icon: "audit" as const },
    { value: "source:server" as Filter, label: "Server events", icon: "system" as const },
    { value: "source:local" as Filter, label: "Local actions", icon: "storage" as const },
    { value: "sev:critical" as Filter, label: "Critical", icon: "alert" as const, color: c.red },
    { value: "sev:warning" as Filter, label: "Warning", icon: "warning" as const, color: c.amber },
    { value: "sev:info" as Filter, label: "Info", icon: "info" as const, color: c.cyan },
    { value: "sev:success" as Filter, label: "Success", icon: "success" as const, color: c.green },
    ...kindCounts.map((k) => ({ value: `kind:${k.key}` as Filter, label: k.key, icon: "topic" as const })),
  ]), [c, kindCounts]);

  const counts = useMemo(() => {
    const out: Partial<Record<Filter, number>> = { all: records.length, "source:server": records.filter((r) => r.source === "server").length, "source:local": records.filter((r) => r.source === "local").length };
    (["critical", "warning", "info", "success"] as Severity[]).forEach((s) => { out[`sev:${s}`] = records.filter((r) => r.severity === s).length; });
    kindCounts.forEach((k) => { out[`kind:${k.key}`] = k.count; });
    return out;
  }, [kindCounts, records]);

  const visible = useMemo(() => records.filter((r) => {
    const q = query.trim().toLowerCase();
    const matchesQ = !q || `${r.title} ${r.body} ${r.actor} ${r.kind} ${r.deviceId || ""}`.toLowerCase().includes(q);
    const matchesFilter = filter === "all" || (filter === "source:server" && r.source === "server") || (filter === "source:local" && r.source === "local") || (filter.startsWith("sev:") && r.severity === filter.slice(4)) || (filter.startsWith("kind:") && r.kind === filter.slice(5));
    return matchesQ && matchesFilter;
  }), [filter, query, records]);

  const buckets = useMemo(() => bucketSeries(visible.map((r) => ({ t: new Date(r.ts).getTime(), v: 1 })).filter((p) => Number.isFinite(p.t)), 8), [visible]);
  const csv = useMemo(() => toCsv(visible.map((r) => ({ source: r.source, kind: r.kind, severity: r.severity, title: r.title, actor: r.actor, device_id: r.deviceId, ts: r.ts }))), [visible]);
  const actorBars = countBy(visible, (r) => r.actor).slice(0, 5).map((x) => ({ name: x.key, value: x.count, color: c.accent }));
  const kindBars = countBy(visible, (r) => r.kind).slice(0, 5).map((x) => ({ name: x.key, value: x.count, color: c.cyan }));
  const times = visible.map((r) => new Date(r.ts).getTime()).filter(Number.isFinite);
  const span = times.length ? formatDuration((Math.max(...times) - Math.min(...times)) / 1000 || 1) : "no observed span";

  return (
    <AdminScreenFrame title="Audit Trail" subtitle="Real server events and local admin actions" onBack={onBack} refreshing={refreshing} onRefresh={onRefresh} actions={[{ icon: "exportFile", label: "Export visible audit rows", onPress: () => setExportOpen(true) }]}>
      <SourceNote text="The platform has no server-side audit-log endpoint. The first section below is /admin/events?limit=200 system/device events; the second is this device's local record of successful admin actions performed through this app." />
      <SearchField value={query} onChange={setQuery} placeholder="Search audit rows" />
      <FilterBar<Filter> options={filterOptions} value={filter} onChange={setFilter} counts={counts} />

      <SectionTitle icon="system" title="Server system/device events" subtitle="Source: /admin/events?limit=200; not a privileged audit ledger" />
      <EventTimeline items={visible.filter((r) => r.source === "server").slice(0, 40).map((r) => ({ id: r.id, title: r.title, body: `${r.kind} • ${r.actor}${r.deviceId ? ` • ${r.deviceId}` : ""}`, time: formatRelative(r.ts), severity: r.severity }))} />

      <SectionTitle icon="storage" title="Device-local administrative actions" subtitle="Written only after matching API calls succeed" />
      <EventTimeline items={visible.filter((r) => r.source === "local").slice(0, 40).map((r) => ({ id: r.id, title: r.title, body: `${r.kind} • ${r.actor}`, time: formatRelative(r.ts), severity: r.severity }))} />

      <SectionTitle icon="charts" title="Visible activity" subtitle={`Bucketed over ${span}; filtered rows only`} />
      <Card style={{ marginBottom: 14 }}><BarChart data={buckets.map((b) => b.v)} color={c.accentHi} /><SourceNote text={`Rows: ${visible.length}. Window is bounded by fetched server rows plus local records, not all-time platform history.`} /></Card>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Card style={{ flex: 1, minWidth: 260 }}><SectionTitle icon="users" title="Top actors" /><HBars items={actorBars} /></Card>
        <Card style={{ flex: 1, minWidth: 260 }}><SectionTitle icon="topic" title="Top kinds" /><HBars items={kindBars} /></Card>
      </View>

      <SectionTitle icon="table" title="Rows" subtitle="Tap a row to inspect the raw record" />
      <DataGrid rows={visible} keyOf={(r) => r.id} onRowPress={setSelected} columns={[
        { key: "time", header: "Time", width: 130, render: (r) => <Text style={{ color: c.textDim }}>{formatRelative(r.ts)}</Text>, sortValue: (r) => new Date(r.ts).getTime() },
        { key: "source", header: "Source", width: 110, render: (r) => <Pill label={r.source} icon={r.source === "server" ? "system" : "storage"} /> },
        { key: "severity", header: "Severity", width: 120, render: (r) => <SeverityBadge severity={r.severity} /> },
        { key: "title", header: "Title", width: 260, render: (r) => <Text style={{ color: c.text }} numberOfLines={2}>{r.title}</Text>, sortValue: (r) => r.title },
        { key: "actor", header: "Actor", width: 220, render: (r) => <Text style={{ color: c.textDim }} numberOfLines={1}>{r.actor}</Text>, sortValue: (r) => r.actor },
      ]} emptyText="No audit rows match the current filters." />

      <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title="Audit record">
        {selected ? <>
          <MetricRow label="Source" value={selected.source} icon={selected.source === "server" ? "system" : "storage"} />
          <MetricRow label="Kind" value={selected.kind} icon="topic" />
          <MetricRow label="Severity" value={<SeverityBadge severity={selected.severity} />} icon="alert" />
          <MetricRow label="Actor" value={selected.actor} icon="profile" />
          <MetricRow label="Time" value={formatDateTime(selected.ts)} icon="clock" last />
          <CodeBlock text={JSON.stringify(selected.raw, null, 2)} label="Raw record" maxHeight={420} />
        </> : null}
      </BottomSheet>
      <BottomSheet visible={exportOpen} onClose={() => setExportOpen(false)} title="Visible audit CSV"><CodeBlock text={csv} label="audit.csv" maxHeight={420} /></BottomSheet>
      <ToastHost toast={toast.toast} onHide={toast.hide} />
    </AdminScreenFrame>
  );
}
