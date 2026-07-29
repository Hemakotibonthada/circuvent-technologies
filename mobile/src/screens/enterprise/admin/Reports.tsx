import React, { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api, type AdminDevice, type AdminEvent, type AdminStats, type AdminUser } from "../../../api";
import { Card, useTheme } from "../../../ui";
import { ActionButton, CodeBlock, Kpi, KpiGrid, SelectField, Stepper, ToggleField } from "../../../enterprise-ui";
import { Donut, HBars } from "../../../charts";
import { countBy, formatDateTime, formatRelative, toCsv } from "../../../enterprise";
import { unwrap, useAdminResource } from "./useAdmin";
import { AdminScreenFrame, ScreenGate, SectionTitle, SourceNote, ownerLabel, timestampLine } from "./parts";

type ReportSection = "inventory" | "users" | "types" | "events" | "firmware" | "ownership";
type OutputMode = "json" | "csv";

interface ReportData { stats: AdminStats; users: AdminUser[]; devices: AdminDevice[]; events: AdminEvent[] }
const SECTION_LABEL: Record<ReportSection, string> = { inventory: "Fleet inventory", users: "User roster", types: "Device-type distribution", events: "Event summary", firmware: "Firmware version spread", ownership: "Ownership map" };

async function loadReports(): Promise<ReportData> {
  const [stats, users, devices, events] = await Promise.all([
    unwrap(api.adminStats(), "Unable to load stats."),
    unwrap(api.adminUsers(), "Unable to load users."),
    unwrap(api.adminDevices(), "Unable to load devices."),
    unwrap(api.adminEvents(200), "Unable to load events."),
  ]);
  return { stats, users: users.users, devices: devices.devices, events: events.events };
}

export default function Reports({ onBack }: { onBack: () => void }) {
  const loader = useCallback(() => loadReports(), []);
  const { state, refresh } = useAdminResource(loader);
  return <ScreenGate state={state} onBack={onBack} onRetry={refresh}>{(data) => <ReportsReady data={data} refreshing={state.refreshing} onRefresh={refresh} onBack={onBack} />}</ScreenGate>;
}

function ReportsReady({ data, refreshing, onRefresh, onBack }: { data: ReportData; refreshing: boolean; onRefresh: () => void; onBack: () => void }) {
  const { c } = useTheme();
  const [sections, setSections] = useState<Record<ReportSection, boolean>>({ inventory: true, users: true, types: true, events: true, firmware: true, ownership: true });
  const [limit, setLimit] = useState(50);
  const [mode, setMode] = useState<OutputMode>("json");
  const [generated, setGenerated] = useState(new Date().toISOString());
  const palette = [c.accent, c.cyan, c.violet, c.green, c.amber, c.red];
  const enabled = (Object.keys(sections) as ReportSection[]).filter((k) => sections[k]);

  const reportJson = useMemo(() => {
    const out: Record<string, unknown> = { generated_at: generated, note: "On-screen and copyable report. No PDF, file-share, or download library is installed.", sections: {} };
    const body = out.sections as Record<string, unknown>;
    if (sections.inventory) body.inventory = { source: "/admin/devices", generated_at: generated, rows: data.devices.slice(0, limit) };
    if (sections.users) body.users = { source: "/admin/users", generated_at: generated, rows: data.users.slice(0, limit) };
    if (sections.types) body.device_types = { source: "/admin/stats.byType", generated_at: generated, rows: data.stats.byType };
    if (sections.events) body.events = { source: "/admin/events?limit=200", generated_at: generated, window: "Latest fetched 200 rows", rows: data.events.slice(0, limit) };
    if (sections.firmware) body.firmware = { source: "/admin/devices.fw_version", generated_at: generated, rows: countBy(data.devices, (d) => d.fw_version || "unknown") };
    if (sections.ownership) body.ownership = { source: "/admin/devices owner_id/owner_email", generated_at: generated, rows: data.devices.slice(0, limit).map((d) => ({ id: d.id, name: d.name, owner_id: d.owner_id, owner_email: d.owner_email })) };
    return out;
  }, [data, generated, limit, sections]);

  const csvText = useMemo(() => {
    const rows: Record<string, unknown>[] = [];
    if (sections.inventory) rows.push(...data.devices.slice(0, limit).map((d) => ({ section: "inventory", id: d.id, name: d.name, type: d.type, room: d.room, online: d.online, firmware: d.fw_version, owner: ownerLabel(d.owner_email, d.owner_id) })));
    if (sections.users) rows.push(...data.users.slice(0, limit).map((u) => ({ section: "users", id: u.id, name: u.name, email: u.email, is_admin: u.is_admin, devices: u.devices })));
    if (sections.types) rows.push(...data.stats.byType.map((t) => ({ section: "device_types", type: t.type, count: t.count })));
    if (sections.events) rows.push(...data.events.slice(0, limit).map((e) => ({ section: "events", id: e.id, kind: e.kind, title: e.title, owner: ownerLabel(e.owner_email, e.owner_id), device_id: e.device_id, ts: e.ts })));
    if (sections.firmware) rows.push(...countBy(data.devices, (d) => d.fw_version || "unknown").map((f) => ({ section: "firmware", version: f.key, count: f.count })));
    if (sections.ownership) rows.push(...data.devices.slice(0, limit).map((d) => ({ section: "ownership", device_id: d.id, device: d.name, owner_id: d.owner_id, owner_email: d.owner_email })));
    return toCsv(rows);
  }, [data, limit, sections]);

  const textOut = mode === "json" ? JSON.stringify(reportJson, null, 2) : csvText;
  const typeSegments = data.stats.byType.map((x, i) => ({ label: x.type || "unknown", value: x.count, color: palette[i % palette.length] }));
  const firmwareBars = countBy(data.devices, (d) => d.fw_version || "unknown").slice(0, 8).map((x, i) => ({ name: x.key, value: x.count, color: palette[i % palette.length] }));
  const ownerBars = countBy(data.devices, (d) => ownerLabel(d.owner_email, d.owner_id)).slice(0, 8).map((x, i) => ({ name: x.key, value: x.count, color: palette[i % palette.length] }));
  const eventBars = countBy(data.events, (e) => e.kind).slice(0, 8).map((x, i) => ({ name: x.key, value: x.count, color: palette[i % palette.length] }));

  return (
    <AdminScreenFrame title="Reports" subtitle="Composable real-data report builder" onBack={onBack} refreshing={refreshing} onRefresh={onRefresh} actions={[{ icon: "refresh", label: "Regenerate timestamp", onPress: () => setGenerated(new Date().toISOString()) }]}>
      <SourceNote text="Reports are rendered on-screen and as copyable text. No PDF, file-share, or download library is installed, so this screen does not imply a file export." />
      <Card style={{ marginBottom: 14 }}>
        {(Object.keys(SECTION_LABEL) as ReportSection[]).map((s) => <ToggleField key={s} label={SECTION_LABEL[s]} value={sections[s]} onChange={(v) => setSections((old) => ({ ...old, [s]: v }))} icon="report" help="Included only when selected; rows come from live API responses." />)}
        <Stepper label="Row limit per row-based section" value={limit} onChange={setLimit} min={5} max={200} step={5} unit="rows" help="Limits rendered rows; aggregate charts still use all fetched rows." />
        <SelectField<OutputMode> label="Copyable output format" value={mode} onChange={setMode} options={[{ value: "json", label: "JSON", icon: "debug" }, { value: "csv", label: "CSV", icon: "table" }]} />
        <ActionButton label="Refresh report timestamp" icon="sync" onPress={() => setGenerated(new Date().toISOString())} />
      </Card>

      <KpiGrid>
        <Kpi icon="users" label="Users" value={data.stats.users} />
        <Kpi icon="devices" label="Devices" value={data.stats.devices} />
        <Kpi icon="online" label="Online" value={data.stats.online} tint={c.green} />
        <Kpi icon="history" label="Fetched events" value={data.events.length} footnote="adminEvents(200)" />
      </KpiGrid>

      <SectionTitle icon="report" title="Generated report" subtitle={`${enabled.length} section(s), generated ${formatDateTime(generated)}`} />
      {sections.inventory ? <ReportBlock title="Fleet inventory" note={timestampLine("Source: /admin/devices", `first ${Math.min(limit, data.devices.length)} of ${data.devices.length} rows`)}><Rows rows={data.devices.slice(0, limit).map((d) => `${d.name || d.id} • ${d.type} • ${d.online ? "online" : "offline"} • ${d.fw_version || "unknown firmware"}`)} /></ReportBlock> : null}
      {sections.users ? <ReportBlock title="User roster" note={timestampLine("Source: /admin/users", `first ${Math.min(limit, data.users.length)} of ${data.users.length} rows`)}><Rows rows={data.users.slice(0, limit).map((u) => `${u.name || u.email} • ${u.email} • ${u.is_admin ? "is_admin" : "standard"} • ${u.devices} devices`)} /></ReportBlock> : null}
      {sections.types ? <ReportBlock title="Device-type distribution" note={timestampLine("Source: /admin/stats.byType", "current stats snapshot")}><Donut segments={typeSegments} size={145} /></ReportBlock> : null}
      {sections.events ? <ReportBlock title="Event summary" note={timestampLine("Source: /admin/events?limit=200", `latest ${data.events.length} fetched rows`)}><HBars items={eventBars} /><Rows rows={data.events.slice(0, Math.min(limit, 8)).map((e) => `${formatRelative(e.ts)} • ${e.kind} • ${e.title}`)} /></ReportBlock> : null}
      {sections.firmware ? <ReportBlock title="Firmware version spread" note={timestampLine("Source: /admin/devices.fw_version", "current device inventory")}><HBars items={firmwareBars} /></ReportBlock> : null}
      {sections.ownership ? <ReportBlock title="Ownership map" note={timestampLine("Source: /admin/devices owner fields", `first ${Math.min(limit, data.devices.length)} of ${data.devices.length} rows`)}><HBars items={ownerBars} /><Rows rows={data.devices.slice(0, limit).map((d) => `${d.name || d.id} → ${ownerLabel(d.owner_email, d.owner_id)}`)} /></ReportBlock> : null}

      <SectionTitle icon="copy" title="Copyable report payload" subtitle={mode.toUpperCase()} />
      <CodeBlock text={textOut} label={mode === "json" ? "report.json" : "report.csv"} maxHeight={520} />
    </AdminScreenFrame>
  );
}

function ReportBlock({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return <Card style={{ marginBottom: 12 }}><SectionTitle title={title} /><SourceNote text={note} />{children}</Card>;
}

function Rows({ rows }: { rows: string[] }) {
  const { c } = useTheme();
  if (!rows.length) return <Text style={{ color: c.faint }}>No rows returned for this section.</Text>;
  return <View style={{ marginTop: 10, gap: 6 }}>{rows.map((r, i) => <Text key={`${r}-${i}`} style={{ color: c.textDim, fontSize: 12, lineHeight: 18 }}>{r}</Text>)}</View>;
}
