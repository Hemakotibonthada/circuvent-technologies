"use client";

/**
 * Alerts & event console.
 *
 * Every row here is real:
 *   • The feed is the control plane's own event log (`/admin/events`) — the same
 *     events the firmware and platform actually record (device offline/online,
 *     AquaGuard dry-run/overflow, SOS, motion, gate, scene activity). Severity is
 *     derived honestly from the real `kind`/`title`, not an invented taxonomy.
 *   • The live-alarm board is the current fleet (`/admin/devices`) filtered to the
 *     fault flags the firmware publishes (sos/leak/overflow/dryRun/tamper/fault).
 *   • Alert channels are notification-routing rules persisted by this console's
 *     own disk-backed config store (`/api/smarthome/admin/config`).
 *   • Actions call real endpoints: delete/clear an operator's own events,
 *     mark-read, and operator broadcast over MQTT.
 *
 * There is deliberately no MTTA/MTTR, on-call rota, escalation matrix or paging
 * history — the backend records none of those, so the fabricated versions were
 * deleted rather than faked.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BellRing, TriangleAlert, Activity, Cpu, WifiOff, RefreshCw, Trash2, Radio,
  Send, Plus, Inbox, CheckCheck, Bell, Mail, Webhook, MessageSquare, Smartphone,
  Pencil, Siren,
} from "lucide-react";
import { LineChart, Donut, HBar } from "../../charts";
import {
  useAdminEvents, useAdminDevices, useAdminConfig, useResource,
  activeFaults, deviceHealth, countBy, timeSeries, combine,
  type ConfigResource, type ConfigRecord, type DeviceHealth,
} from "../_lib/api";
import { controlPlane, type AdminEvent, type AdminDevice } from "@/lib/control-plane";
import { relativeTime, fmtDateTime, num } from "../_lib/format";
import {
  Panel, PageHeader, StatCard, Badge, Dot, Btn, Tabs, DataTable, SearchInput, Select,
  Modal, Field, Input, Toggle, EmptyState, ResourceGate, LoadingState, ErrorState,
  SectionTitle, StaggerGrid, StaggerItem, TONE, type Column, type Tone,
} from "../_ui";

// ------------------------------------------------------------------- types ---

type Tab = "feed" | "alarms" | "channels";
type WindowKey = "24h" | "7d" | "30d" | "all";
type Severity = "critical" | "security" | "warning" | "info" | "success" | "activity";

interface AdminMe {
  admin: boolean;
  uid: number;
  email: string;
}

type ChannelKind = "email" | "webhook" | "sms" | "push";

interface AlertChannel extends ConfigRecord {
  name: string;
  channel: ChannelKind;
  target: string;
  eventKinds: string[];
  enabled: boolean;
}

// ----------------------------------------------------------------- helpers ---

const SEV_TONE: Record<Severity, Tone> = {
  critical: "red", security: "violet", warning: "amber", info: "blue", success: "green", activity: "slate",
};

const HEALTH_RANK: Record<DeviceHealth, number> = { critical: 0, offline: 1, warning: 2, healthy: 3 };

const WINDOWS: { value: WindowKey; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All events" },
];

const KIND_CHOICES = ["alert", "security", "info", "success", "activity"];

const CHANNEL_TYPE_OPTIONS: { value: ChannelKind; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "webhook", label: "Webhook" },
  { value: "sms", label: "SMS" },
  { value: "push", label: "Push" },
];

const CHANNEL_META: Record<ChannelKind, { label: string; icon: ReactNode; tone: Tone }> = {
  email: { label: "Email", icon: <Mail className="h-4 w-4" />, tone: "blue" },
  webhook: { label: "Webhook", icon: <Webhook className="h-4 w-4" />, tone: "amber" },
  sms: { label: "SMS", icon: <MessageSquare className="h-4 w-4" />, tone: "green" },
  push: { label: "Push", icon: <Smartphone className="h-4 w-4" />, tone: "violet" },
};

/** Severity derived only from the real emitted kind/title (see api mqtt.ts). */
function severityOf(kind: string, title = ""): Severity {
  const k = kind.toLowerCase();
  const t = title.toLowerCase();
  if (t.includes("sos")) return "critical";
  if (k === "alert" || /overflow|dry-?run|leak|tamper|fault|error/.test(t)) return "critical";
  if (k === "security") return "security";
  if (t.includes("offline")) return "warning";
  if (k === "success" || /reconnect|restored|resolved/.test(t)) return "success";
  if (k === "activity") return "activity";
  return "info";
}

function windowMs(w: WindowKey): number {
  if (w === "24h") return 86400000;
  if (w === "7d") return 7 * 86400000;
  if (w === "30d") return 30 * 86400000;
  return Number.POSITIVE_INFINITY;
}

function chartSpec(w: WindowKey): { buckets: number; bucketMs: number; label: string } {
  if (w === "24h") return { buckets: 24, bucketMs: 3600000, label: "last 24 hours" };
  if (w === "7d") return { buckets: 7, bucketMs: 86400000, label: "last 7 days" };
  return { buckets: 30, bucketMs: 86400000, label: "last 30 days" };
}

/** Surface the control plane's real error, never a placeholder. */
function apiError(res: { status: number; data: unknown }): string {
  const d = res.data;
  const body = d && typeof d === "object" && "error" in d ? String((d as { error?: unknown }).error ?? "") : "";
  if (body) return body;
  if (res.status === 0) return "Cannot reach the control plane.";
  if (res.status === 401) return "Your operator session has expired — sign in again.";
  if (res.status === 403) return "This account is not an operator.";
  return `Control plane returned ${res.status}.`;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-2 text-sm text-red-200">
      <TriangleAlert className="h-4 w-4 shrink-0" /> {message}
    </div>
  );
}

// -------------------------------------------------------------------- page ---

export default function AlertsPage() {
  const eventsRes = useAdminEvents(500);
  const devicesRes = useAdminDevices();
  const channels = useAdminConfig<AlertChannel>("alert-channels");
  const meRes = useResource<AdminMe, AdminMe>(useCallback(() => controlPlane.adminMe(), []), (r) => r, 0);
  const unreadRes = useResource<{ count: number }, number>(useCallback(() => controlPlane.unreadCount(), []), (r) => r.count, 20000);

  const [tab, setTab] = useState<Tab>("feed");
  const [win, setWin] = useState<WindowKey>("24h");
  const [showBroadcast, setShowBroadcast] = useState(false);

  const events = useMemo(() => eventsRes.data ?? [], [eventsRes.data]);
  const devices = useMemo(() => devicesRes.data ?? [], [devicesRes.data]);

  const inWindow = useMemo(() => {
    const ms = windowMs(win);
    if (!Number.isFinite(ms)) return events;
    const min = Date.now() - ms;
    return events.filter((e) => {
      const t = Date.parse(e.ts);
      return !Number.isNaN(t) && t >= min;
    });
  }, [events, win]);

  const kpi = useMemo(() => {
    const dayMin = Date.now() - 86400000;
    const last24 = events.filter((e) => {
      const t = Date.parse(e.ts);
      return !Number.isNaN(t) && t >= dayMin;
    }).length;
    const distinctDevices = new Set(inWindow.map((e) => e.device_id).filter(Boolean)).size;
    const faulted = devices.filter((d) => activeFaults(d.state).length > 0).length;
    const offline = devices.filter((d) => !d.online).length;
    return { total: inWindow.length, last24, distinctDevices, faulted, offline };
  }, [events, inWindow, devices]);

  const faultedDevices = useMemo(
    () =>
      devices
        .map((d) => ({ d, faults: activeFaults(d.state), health: deviceHealth(d) }))
        .filter((x) => x.faults.length > 0)
        .sort((a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health]),
    [devices]
  );

  const page = combine(eventsRes, devicesRes);
  const reloadAll = () => {
    eventsRes.reload();
    devicesRes.reload();
    channels.reload();
    unreadRes.reload();
  };

  if (page.loading) {
    return (
      <div className="space-y-6">
        <LoadingState rows={2} label="Loading alert console…" />
        <LoadingState rows={4} />
      </div>
    );
  }
  if (page.error && !eventsRes.data && !devicesRes.data) {
    return <ErrorState message={page.error} unauthorized={page.unauthorized} onRetry={page.reload} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts & events"
        icon={<BellRing className="h-5 w-5" />}
        subtitle="The control plane's live event log, the fleet's active fault alarms, and notification-routing rules held by this console. No synthetic incidents, MTTR or on-call rota — only what the platform actually records."
        actions={
          <div className="flex items-center gap-2">
            <Select value={win} onChange={setWin} options={WINDOWS} />
            <Btn variant="subtle" onClick={reloadAll}><RefreshCw className="h-4 w-4" /> Refresh</Btn>
            <Btn variant="primary" onClick={() => setShowBroadcast(true)}><Radio className="h-4 w-4" /> Broadcast</Btn>
          </div>
        }
      />

      {page.error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-2.5 text-sm text-amber-200">
          <TriangleAlert className="h-4 w-4 shrink-0" /> {page.error}
        </div>
      )}

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StaggerItem><StatCard label={`Events · ${win === "all" ? "all" : win}`} value={num(kpi.total)} icon={<Activity className="h-4 w-4" />} tone="violet" sub="in window" /></StaggerItem>
        <StaggerItem><StatCard label="Events · 24h" value={num(kpi.last24)} icon={<Bell className="h-4 w-4" />} tone="blue" sub="last 24 hours" /></StaggerItem>
        <StaggerItem><StatCard label="Devices raising" value={num(kpi.distinctDevices)} icon={<Cpu className="h-4 w-4" />} tone="brand" sub="distinct in window" /></StaggerItem>
        <StaggerItem><StatCard label="In fault" value={num(kpi.faulted)} icon={<Siren className="h-4 w-4" />} tone={kpi.faulted ? "red" : "green"} sub="fault flag set" /></StaggerItem>
        <StaggerItem><StatCard label="Offline" value={num(kpi.offline)} icon={<WifiOff className="h-4 w-4" />} tone={kpi.offline ? "amber" : "green"} sub="not connected" /></StaggerItem>
      </StaggerGrid>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "feed", label: "Event log", icon: <Activity className="h-4 w-4" />, count: events.length || undefined },
          { value: "alarms", label: "Live alarms", icon: <Siren className="h-4 w-4" />, count: faultedDevices.length || undefined },
          { value: "channels", label: "Alert channels", icon: <Send className="h-4 w-4" />, count: channels.rows.length || undefined },
        ]}
      />

      {tab === "feed" && (
        <EventLogTab
          inWindow={inWindow}
          devices={devices}
          win={win}
          me={meRes.data}
          unread={unreadRes.data ?? 0}
          onReload={() => {
            eventsRes.reload();
            unreadRes.reload();
          }}
        />
      )}
      {tab === "alarms" && <LiveAlarmsTab faulted={faultedDevices} />}
      {tab === "channels" && <ChannelsTab channels={channels} />}

      <BroadcastModal open={showBroadcast} onClose={() => setShowBroadcast(false)} devices={devices} />
    </div>
  );
}

// --------------------------------------------------------------- event log ---

function EventLogTab({
  inWindow, devices, win, me, unread, onReload,
}: {
  inWindow: AdminEvent[];
  devices: AdminDevice[];
  win: WindowKey;
  me: AdminMe | null;
  unread: number;
  onReload: () => void;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [deviceId, setDeviceId] = useState("all");
  const [owner, setOwner] = useState("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);

  const deviceName = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of devices) m.set(d.id, d.name || d.id);
    return (id: string | null) => (id ? m.get(id) ?? id : "—");
  }, [devices]);

  const kindOptions = useMemo(
    () => [{ value: "all", label: "All kinds" }, ...countBy(inWindow, (e) => e.kind).map((b) => ({ value: b.name, label: `${b.name} (${b.value})` }))],
    [inWindow]
  );
  const deviceOptions = useMemo(
    () => [{ value: "all", label: "All devices" }, ...countBy(inWindow, (e) => e.device_id).map((b) => ({ value: b.name, label: `${deviceName(b.name)} (${b.value})` }))],
    [inWindow, deviceName]
  );
  const ownerOptions = useMemo(
    () => [{ value: "all", label: "All owners" }, ...countBy(inWindow, (e) => e.owner_email).map((b) => ({ value: b.name, label: `${b.name} (${b.value})` }))],
    [inWindow]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inWindow.filter((e) => {
      if (kind !== "all" && e.kind !== kind) return false;
      if (deviceId !== "all" && e.device_id !== deviceId) return false;
      if (owner !== "all" && e.owner_email !== owner) return false;
      if (needle) {
        const hay = `${e.title} ${e.body} ${e.kind} ${e.device_id ?? ""} ${e.owner_email ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [inWindow, q, kind, deviceId, owner]);

  const spec = chartSpec(win);
  const rate = useMemo(() => timeSeries(inWindow, (e) => e.ts, spec.buckets, spec.bucketMs), [inWindow, spec.buckets, spec.bucketMs]);
  const byKind = useMemo(() => countBy(inWindow, (e) => e.kind), [inWindow]);
  const topDevices = useMemo(
    () => countBy(inWindow, (e) => e.device_id).slice(0, 8).map((b) => ({ name: deviceName(b.name), value: b.value, color: TONE.brand.fg })),
    [inWindow, deviceName]
  );

  const del = useCallback(
    async (e: AdminEvent) => {
      setBusyId(e.id);
      setActionErr(null);
      const res = await controlPlane.deleteEvent(e.id);
      setBusyId(null);
      if (res.ok) onReload();
      else setActionErr(apiError(res));
    },
    [onReload]
  );

  const markRead = useCallback(async () => {
    setActionErr(null);
    const res = await controlPlane.markEventsRead();
    if (res.ok) onReload();
    else setActionErr(apiError(res));
  }, [onReload]);

  const clearMine = useCallback(async () => {
    setClearBusy(true);
    setActionErr(null);
    const res = await controlPlane.clearEvents();
    setClearBusy(false);
    if (res.ok) {
      setConfirmClear(false);
      onReload();
    } else {
      setActionErr(apiError(res));
    }
  }, [onReload]);

  const cols: Column<AdminEvent>[] = [
    {
      key: "sev", header: "Severity",
      render: (e) => {
        const s = severityOf(e.kind, e.title);
        return <Badge tone={SEV_TONE[s]}>{s}</Badge>;
      },
    },
    {
      key: "event", header: "Event",
      render: (e) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-white">{e.title}</div>
          {e.body && <div className="truncate text-[11px] ad-muted">{e.body}</div>}
        </div>
      ),
    },
    {
      key: "source", header: "Source",
      render: (e) => (
        <div className="min-w-0">
          <div className="truncate font-mono text-[11px] text-slate-300">{deviceName(e.device_id)}</div>
          <div className="truncate text-[11px] ad-muted">{e.owner_email ?? "—"}</div>
        </div>
      ),
    },
    { key: "kind", header: "Kind", render: (e) => <span className="font-mono text-[11px] text-slate-400">{e.kind}</span> },
    {
      key: "ts", header: "Time", align: "right",
      sort: (a, b) => Date.parse(a.ts) - Date.parse(b.ts),
      render: (e) => <span className="text-xs ad-muted" title={fmtDateTime(e.ts)}>{relativeTime(e.ts)}</span>,
    },
    {
      key: "act", header: "", align: "right",
      render: (e) =>
        me && e.owner_id === me.uid ? (
          <button
            onClick={() => del(e)}
            disabled={busyId === e.id}
            className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 transition hover:text-red-300 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> {busyId === e.id ? "…" : "Delete"}
          </button>
        ) : (
          <span className="text-[11px] text-slate-600" title="Only the account that owns an event can delete it.">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <SectionTitle right={<Badge tone={inWindow.length ? "green" : "slate"}><Dot tone={inWindow.length ? "green" : "slate"} pulse={inWindow.length > 0} /> {num(inWindow.length)}</Badge>}>
            Event rate · {spec.label}
          </SectionTitle>
          {inWindow.length === 0 ? (
            <EmptyState icon={<Inbox className="h-6 w-6" />} title="No events in this window" hint="Widen the window or wait for the fleet to report activity." />
          ) : (
            <LineChart data={rate.data} color="#22d3ee" height={220} />
          )}
        </Panel>
        <Panel>
          <SectionTitle>By kind</SectionTitle>
          {byKind.length === 0 ? (
            <p className="py-8 text-center text-sm ad-muted">No events to categorise.</p>
          ) : (
            <>
              <div className="flex justify-center py-2">
                <Donut size={168} segments={byKind.map((b) => ({ label: b.name, value: b.value, color: TONE[SEV_TONE[severityOf(b.name)]].fg }))} />
              </div>
              <div className="mt-2 space-y-1.5">
                {byKind.map((b) => (
                  <div key={b.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 capitalize"><Dot tone={SEV_TONE[severityOf(b.name)]} /> {b.name}</span>
                    <span className="tabular-nums font-semibold text-white">{num(b.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      {topDevices.length > 0 && (
        <Panel>
          <SectionTitle>Top devices by event count</SectionTitle>
          <HBar items={topDevices} />
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search events…" className="min-w-[200px] flex-1" />
        <Select value={kind} onChange={setKind} options={kindOptions} />
        <Select value={deviceId} onChange={setDeviceId} options={deviceOptions} />
        <Select value={owner} onChange={setOwner} options={ownerOptions} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm ad-muted">{num(filtered.length)} of {num(inWindow.length)} events</span>
        <div className="ml-auto flex items-center gap-2">
          <Btn variant="subtle" size="sm" onClick={markRead} title="Mark your own notification badge read">
            <CheckCheck className="h-4 w-4" /> Mark read{unread > 0 ? ` (${num(unread)})` : ""}
          </Btn>
          <Btn variant="danger" size="sm" onClick={() => { setConfirmClear(true); setActionErr(null); }}>
            <Trash2 className="h-4 w-4" /> Clear my events
          </Btn>
        </div>
      </div>

      {actionErr && <ErrorBanner message={actionErr} />}

      {filtered.length === 0 ? (
        <EmptyState icon={<Inbox className="h-6 w-6" />} title="No matching events" hint="Adjust the filters or search above." />
      ) : (
        <DataTable rows={filtered} columns={cols} rowKey={(e) => String(e.id)} />
      )}

      <p className="text-[11px] ad-muted">
        The log above is the platform-wide event stream and is read-only. Delete and “Clear my events” act only on events your own operator account owns; “Mark read” clears your personal notification badge.
      </p>

      <Modal open={confirmClear} onClose={() => { if (!clearBusy) setConfirmClear(false); }} title="Clear your events">
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            This permanently deletes every event owned by your operator account ({me?.email ?? "you"}). Events owned by other accounts are unaffected, and it cannot be undone.
          </p>
          {actionErr && <ErrorBanner message={actionErr} />}
          <div className="flex justify-end gap-2">
            <Btn variant="subtle" onClick={() => setConfirmClear(false)} disabled={clearBusy}>Cancel</Btn>
            <Btn variant="danger" onClick={clearMine} disabled={clearBusy}>{clearBusy ? "Clearing…" : "Clear my events"}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// -------------------------------------------------------------- live alarms ---

function LiveAlarmsTab({ faulted }: { faulted: { d: AdminDevice; faults: string[]; health: DeviceHealth }[] }) {
  if (faulted.length === 0) {
    return (
      <EmptyState
        icon={<Siren className="h-6 w-6" />}
        title="No active device alarms"
        hint="No device is currently reporting an SOS, leak, overflow, dry-run, tamper or fault flag."
      />
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm ad-muted">
        Devices whose firmware is currently asserting a fault flag. This is the live incident board — an entry clears the moment its device stops reporting the fault.
      </p>
      <StaggerGrid className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {faulted.map(({ d, faults, health }) => (
          <StaggerItem key={d.id}>
            <Panel className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: TONE.red.bg, color: TONE.red.fg }}><Siren className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-white">{d.name || d.id}</div>
                    <div className="truncate text-[11px] ad-muted">{d.type}{d.room ? ` · ${d.room}` : ""}</div>
                  </div>
                </div>
                <Badge tone={health === "offline" ? "slate" : "red"}>{health}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {faults.map((f) => <Badge key={f} tone="red"><TriangleAlert className="h-3 w-3" /> {f}</Badge>)}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-[11px] ad-muted">
                <span className="truncate">{d.owner_email ?? "unclaimed"}</span>
                <span className="shrink-0" title={fmtDateTime(d.last_seen)}>seen {relativeTime(d.last_seen)}</span>
              </div>
              <Link
                href={`/smarthome/admin/fleet?device=${encodeURIComponent(d.id)}`}
                className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
              >
                Manage device
              </Link>
            </Panel>
          </StaggerItem>
        ))}
      </StaggerGrid>
    </div>
  );
}

// ----------------------------------------------------------- alert channels ---

function ChannelsTab({ channels }: { channels: ConfigResource<AlertChannel> }) {
  const [edit, setEdit] = useState<AlertChannel | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toggle = useCallback(
    async (c: AlertChannel) => {
      setBusyId(c.id);
      setErr(null);
      const ok = await channels.update(c.id, { enabled: !c.enabled });
      setBusyId(null);
      if (!ok) setErr("Could not update the channel. Confirm you’re signed in as an operator and try again.");
    },
    [channels]
  );

  const remove = useCallback(
    async (c: AlertChannel) => {
      setBusyId(c.id);
      setErr(null);
      const ok = await channels.remove(c.id);
      setBusyId(null);
      if (!ok) setErr("Could not delete the channel. Confirm you’re signed in as an operator and try again.");
    },
    [channels]
  );

  const cols: Column<AlertChannel>[] = [
    {
      key: "name", header: "Channel",
      render: (c) => {
        const meta = CHANNEL_META[c.channel] ?? { label: c.channel, icon: <Send className="h-4 w-4" />, tone: "slate" as Tone };
        return (
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: TONE[meta.tone].bg, color: TONE[meta.tone].fg }}>{meta.icon}</span>
            <div className="min-w-0">
              <div className="truncate font-medium text-white">{c.name}</div>
              <div className="truncate font-mono text-[11px] ad-muted">{c.target}</div>
            </div>
          </div>
        );
      },
    },
    { key: "type", header: "Type", render: (c) => <Badge tone={(CHANNEL_META[c.channel] ?? { tone: "slate" as Tone }).tone}>{(CHANNEL_META[c.channel] ?? { label: c.channel }).label}</Badge> },
    {
      key: "kinds", header: "Event kinds",
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          {(c.eventKinds?.length ? c.eventKinds : ["all"]).map((k) => <span key={k} className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-slate-300">{k}</span>)}
        </div>
      ),
    },
    { key: "enabled", header: "Enabled", align: "center", render: (c) => <div className="flex justify-center"><Toggle checked={c.enabled} onChange={() => toggle(c)} disabled={busyId === c.id} /></div> },
    {
      key: "act", header: "", align: "right",
      render: (c) => (
        <div className="flex items-center justify-end gap-3">
          <button onClick={() => setEdit(c)} className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 transition hover:text-cyan-300"><Pencil className="h-3.5 w-3.5" /> Edit</button>
          <button onClick={() => remove(c)} disabled={busyId === c.id} className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 transition hover:text-red-300 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm ad-muted">
          Notification-routing rules stored by this console’s disk-backed config store. They record how you intend to route each platform event kind; the console persists and manages them here.
        </p>
        <Btn variant="primary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add channel</Btn>
      </div>

      {err && <ErrorBanner message={err} />}

      <ResourceGate
        loading={channels.loading}
        error={channels.error}
        unauthorized={channels.unauthorized}
        onRetry={channels.reload}
        isEmpty={channels.rows.length === 0}
        empty={
          <EmptyState
            icon={<Send className="h-6 w-6" />}
            title="No alert channels yet"
            hint="Add a routing rule to record where email, webhook, SMS or push notifications should go for each event kind."
            action={<Btn variant="primary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add channel</Btn>}
          />
        }
        skeletonRows={4}
      >
        <DataTable rows={channels.rows} columns={cols} rowKey={(c) => c.id} />
      </ResourceGate>

      <ChannelModal open={showCreate || !!edit} onClose={() => { setShowCreate(false); setEdit(null); }} channels={channels} existing={edit} />
    </div>
  );
}

function ChannelModal({
  open, onClose, channels, existing,
}: {
  open: boolean;
  onClose: () => void;
  channels: ConfigResource<AlertChannel>;
  existing: AlertChannel | null;
}) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<ChannelKind>("email");
  const [target, setTarget] = useState("");
  const [kinds, setKinds] = useState<string[]>(["alert", "security"]);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? "");
    setChannel(existing?.channel ?? "email");
    setTarget(existing?.target ?? "");
    setKinds(existing?.eventKinds ?? ["alert", "security"]);
    setEnabled(existing?.enabled ?? true);
    setErr(null);
    setBusy(false);
  }, [open, existing]);

  const toggleKind = (k: string) => setKinds((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const save = useCallback(async () => {
    if (!name.trim()) {
      setErr("Give the channel a name.");
      return;
    }
    if (!target.trim()) {
      setErr(channel === "webhook" ? "Enter the webhook URL." : channel === "email" ? "Enter the destination email." : "Enter the destination.");
      return;
    }
    setBusy(true);
    setErr(null);
    const body = { name: name.trim(), channel, target: target.trim(), eventKinds: kinds, enabled };
    const rec = existing ? await channels.update(existing.id, body) : await channels.create(body);
    setBusy(false);
    if (rec) onClose();
    else setErr("Could not save the channel. Confirm you’re signed in as an operator and try again.");
  }, [name, target, channel, kinds, enabled, existing, channels, onClose]);

  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} title={existing ? "Edit alert channel" : "Add alert channel"}>
      <div className="space-y-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ops email" /></Field>
        <Field label="Type"><Select value={channel} onChange={setChannel} options={CHANNEL_TYPE_OPTIONS} /></Field>
        <Field
          label="Target"
          hint={channel === "webhook" ? "HTTPS endpoint that will receive the event." : channel === "email" ? "Destination email address." : channel === "sms" ? "Destination phone number." : "Push topic or device token."}
        >
          <Input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={channel === "webhook" ? "https://…" : channel === "email" ? "ops@example.com" : channel === "sms" ? "+1…" : "topic"}
          />
        </Field>
        <Field label="Route these event kinds" hint="Which platform event kinds this channel should handle.">
          <div className="flex flex-wrap gap-2">
            {KIND_CHOICES.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium capitalize transition ${kinds.includes(k) ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-white/10 text-slate-400 hover:text-slate-200"}`}
              >
                {k}
              </button>
            ))}
          </div>
        </Field>
        <label className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
          <span className="text-sm text-slate-200">Enabled</span>
          <Toggle checked={enabled} onChange={setEnabled} />
        </label>
        {err && <ErrorBanner message={err} />}
        <Btn variant="primary" className="w-full" onClick={save} disabled={busy}>{busy ? "Saving…" : existing ? "Save changes" : "Add channel"}</Btn>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- broadcast ---

function BroadcastModal({ open, onClose, devices }: { open: boolean; onClose: () => void; devices: AdminDevice[] }) {
  const types = useMemo(() => countBy(devices, (d) => d.type).map((b) => b.name), [devices]);
  const [type, setType] = useState("all");
  const [onlineOnly, setOnlineOnly] = useState(true);
  const [json, setJson] = useState('{ "action": "set", "power": false }');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setType("all");
    setOnlineOnly(true);
    setJson('{ "action": "set", "power": false }');
    setErr(null);
    setBusy(false);
    setResult(null);
  }, [open]);

  const targetCount = useMemo(
    () => devices.filter((d) => (type === "all" || d.type === type) && (!onlineOnly || d.online)).length,
    [devices, type, onlineOnly]
  );

  const typeOptions = useMemo(() => [{ value: "all", label: "All device types" }, ...types.map((t) => ({ value: t, label: t }))], [types]);

  const send = useCallback(async () => {
    let command: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(json);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      command = parsed as Record<string, unknown>;
    } catch {
      setErr('Enter a valid JSON command object, e.g. { "action": "set", "power": false }.');
      return;
    }
    setBusy(true);
    setErr(null);
    setResult(null);
    const res = await controlPlane.adminBroadcast({
      type: type === "all" ? undefined : type,
      online: onlineOnly ? true : undefined,
      command,
    });
    setBusy(false);
    if (res.ok) setResult(res.data.sent);
    else setErr(apiError(res));
  }, [json, type, onlineOnly]);

  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} title="Broadcast a command">
      <div className="space-y-3">
        <p className="text-sm ad-muted">
          Publish a command over MQTT to every matching device via <span className="font-mono">/admin/broadcast</span>. The command is sent verbatim.
        </p>
        <Field label="Target type"><Select value={type} onChange={setType} options={typeOptions} /></Field>
        <label className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
          <span className="text-sm text-slate-200">Only devices that are online</span>
          <Toggle checked={onlineOnly} onChange={setOnlineOnly} />
        </label>
        <Field label="Command (JSON)" hint={`Matches ${num(targetCount)} device${targetCount === 1 ? "" : "s"} right now.`}>
          <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={3} spellCheck={false} className="ad-input resize-none font-mono text-xs" />
        </Field>
        {result !== null && (
          <div role="status" className="flex items-center gap-2 rounded-lg border border-green-500/25 bg-green-500/[0.08] px-3 py-2 text-sm text-green-200">
            <CheckCheck className="h-4 w-4 shrink-0" /> Sent to {num(result)} device{result === 1 ? "" : "s"}.
          </div>
        )}
        {err && <ErrorBanner message={err} />}
        <div className="flex justify-end gap-2">
          <Btn variant="subtle" onClick={onClose} disabled={busy}>{result !== null ? "Close" : "Cancel"}</Btn>
          <Btn variant="primary" onClick={send} disabled={busy}><Radio className="h-4 w-4" /> {busy ? "Broadcasting…" : "Broadcast"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
