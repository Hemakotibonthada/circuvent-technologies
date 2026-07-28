"use client";

/**
 * Control-plane overview.
 *
 * Every number on this page is read live from the Circuvent control plane —
 * `/admin/stats`, `/admin/health`, `/admin/devices` and `/admin/events`. There is
 * no seeded fleet, no synthetic growth curve and no fabricated billing: if the
 * plane is unreachable we say so, and if it has no devices yet we say that too.
 */

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import {
  Cpu, Wifi, TriangleAlert, Activity, Users, Radar, ArrowRight,
  RefreshCw, Zap, Database, Radio, ServerCog, Inbox, PlugZap,
} from "lucide-react";
import { LineChart, Donut, HBar } from "../charts";
import {
  useAdminStats, useAdminHealth, useAdminDevices, useAdminEvents,
  useFleetInsights, deviceHealth, activeFaults, timeSeries, sumStateMetric,
  combine, type DeviceHealth,
} from "./_lib/api";
import { abbrNum, num, relativeTime, uptime } from "./_lib/format";
import {
  Panel, StatCard, Badge, Dot, Btn, SectionTitle, StaggerGrid, StaggerItem,
  Progress, ErrorState, LoadingState, EmptyState, TONE, type Tone,
} from "./_ui";

const HEALTH_TONE: Record<DeviceHealth, Tone> = { healthy: "green", warning: "amber", critical: "red", offline: "slate" };
const BAR_COLORS = ["#06b6d4", "#8b5cf6", "#22c55e", "#f59e0b", "#3b82f6", "#ec4899", "#14b8a6", "#f97316"];

export default function AdminOverview() {
  const statsRes = useAdminStats();
  const healthRes = useAdminHealth();
  const devicesRes = useAdminDevices();
  const eventsRes = useAdminEvents(200);

  const page = combine(statsRes, healthRes, devicesRes, eventsRes);
  const stats = statsRes.data;
  const health = healthRes.data;
  const devices = useMemo(() => devicesRes.data ?? [], [devicesRes.data]);
  const events = useMemo(() => eventsRes.data ?? [], [eventsRes.data]);
  const fleet = useFleetInsights(devicesRes.data);

  // Real 24h event rate, bucketed hourly from the actual event log.
  const eventRate = useMemo(() => timeSeries(events, (e) => e.ts, 24, 3600000), [events]);

  // Real live power, summed from whatever the fleet is currently publishing.
  const power = useMemo(() => sumStateMetric(devices, ["watts", "power", "activePower"]), [devices]);

  // Devices that genuinely need an operator: offline, faulted, or stale.
  const attention = useMemo(
    () =>
      devices
        .map((d) => ({ d, h: deviceHealth(d), faults: activeFaults(d.state) }))
        .filter((x) => x.h !== "healthy")
        .sort((a, b) => rank(a.h) - rank(b.h))
        .slice(0, 6),
    [devices]
  );

  const onlineRate = stats && stats.devices ? (stats.online / stats.devices) * 100 : 0;
  const typeBuckets = stats?.byType?.length
    ? stats.byType.map((t) => ({ name: t.type, value: t.count }))
    : fleet.byType;

  if (page.loading) {
    return (
      <div className="space-y-6">
        <LoadingState rows={2} label="Loading control plane overview…" />
        <LoadingState rows={4} />
      </div>
    );
  }

  if (page.error && !stats) {
    return <ErrorState message={page.error} unauthorized={page.unauthorized} onRetry={page.reload} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400">
            <Radar className="h-4 w-4" /> Control Plane Overview
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Fleet command center</h1>
          <p className="mt-1 text-sm ad-muted">
            Live from the Circuvent control plane
            {statsRes.updatedAt > 0 && <> · updated {relativeTime(statsRes.updatedAt)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="subtle" onClick={page.reload} title="Refresh all panels">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Btn>
          <Link href="/smarthome/admin/fleet"><Btn variant="primary">Open fleet <ArrowRight className="h-4 w-4" /></Btn></Link>
        </div>
      </div>

      {page.error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-2.5 text-sm text-amber-200">
          <TriangleAlert className="h-4 w-4 shrink-0" /> {page.error}
        </div>
      )}

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StaggerItem>
          <StatCard label="Managed devices" value={num(stats?.devices ?? 0)} icon={<Cpu className="h-4 w-4" />} tone="brand" sub="registered" />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Online now" value={num(stats?.online ?? 0)} icon={<Wifi className="h-4 w-4" />}
            tone={onlineRate >= 80 ? "green" : onlineRate >= 50 ? "amber" : "red"}
            sub={stats?.devices ? `${onlineRate.toFixed(1)}% of fleet` : "no devices yet"}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Accounts" value={num(stats?.users ?? 0)} icon={<Users className="h-4 w-4" />} tone="blue" sub="control-plane users" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Events · 7d" value={abbrNum(stats?.events7d ?? 0)} icon={<Activity className="h-4 w-4" />} tone="violet" sub="logged" />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Needs attention" value={num(fleet.health.warning + fleet.health.critical + fleet.health.offline)}
            icon={<TriangleAlert className="h-4 w-4" />}
            tone={fleet.health.critical > 0 ? "red" : fleet.health.warning + fleet.health.offline > 0 ? "amber" : "green"}
            sub={fleet.health.critical > 0 ? `${fleet.health.critical} critical` : "offline + degraded"}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Live load" value={power.reporting ? `${num(power.total)} W` : "—"}
            icon={<Zap className="h-4 w-4" />} tone="amber"
            sub={power.reporting ? `${power.reporting} metering` : "no meters reporting"}
          />
        </StaggerItem>
      </StaggerGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <SectionTitle right={<Badge tone={events.length ? "green" : "slate"}><Dot tone={events.length ? "green" : "slate"} pulse={events.length > 0} /> {num(events.length)} events</Badge>}>
            Event activity · last 24 hours
          </SectionTitle>
          {events.length === 0 ? (
            <EmptyState icon={<Inbox className="h-6 w-6" />} title="No events recorded" hint="Device events will appear here as soon as the fleet reports activity." />
          ) : (
            <LineChart data={eventRate.data} color="#22d3ee" height={240} />
          )}
        </Panel>

        <Panel>
          <SectionTitle>Fleet health</SectionTitle>
          {fleet.total === 0 ? (
            <EmptyState icon={<Cpu className="h-6 w-6" />} title="No devices provisioned" hint="Provision a device to populate the fleet." />
          ) : (
            <>
              <div className="flex items-center justify-center py-2">
                <Donut
                  size={168}
                  segments={(["healthy", "warning", "critical", "offline"] as DeviceHealth[]).map((h) => ({
                    label: h, value: fleet.health[h], color: TONE[HEALTH_TONE[h]].fg,
                  }))}
                />
              </div>
              <div className="mt-3 space-y-2">
                {(["healthy", "warning", "critical", "offline"] as DeviceHealth[]).map((h) => (
                  <div key={h} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 capitalize"><Dot tone={HEALTH_TONE[h]} /> {h}</span>
                    <span className="font-semibold text-white tabular-nums">{fleet.health[h]}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle>Devices by type</SectionTitle>
          {typeBuckets.length === 0 ? (
            <p className="py-8 text-center text-sm ad-muted">No devices registered.</p>
          ) : (
            <HBar items={typeBuckets.map((t, i) => ({ name: t.name, value: t.value, color: BAR_COLORS[i % BAR_COLORS.length] }))} />
          )}
        </Panel>
        <Panel>
          <SectionTitle>Devices by room</SectionTitle>
          {fleet.byRoom.length === 0 ? (
            <p className="py-8 text-center text-sm ad-muted">No rooms assigned.</p>
          ) : (
            <HBar items={fleet.byRoom.slice(0, 8).map((r, i) => ({ name: r.name, value: r.value, color: BAR_COLORS[i % BAR_COLORS.length] }))} />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <SectionTitle right={<Link href="/smarthome/admin/fleet" className="text-xs text-cyan-400 hover:text-cyan-300">View fleet</Link>}>
            Needs attention
          </SectionTitle>
          <div className="space-y-2">
            {attention.length === 0 ? (
              <p className="py-6 text-center text-sm ad-muted">
                {fleet.total === 0 ? "No devices to monitor." : "All clear — every device is healthy."}
              </p>
            ) : (
              attention.map(({ d, h, faults }) => (
                <Link
                  key={d.id}
                  href={`/smarthome/admin/fleet?device=${encodeURIComponent(d.id)}`}
                  className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 transition hover:border-white/15"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: TONE[HEALTH_TONE[h]].bg, color: TONE[HEALTH_TONE[h]].fg }}>
                    <TriangleAlert className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{d.name || d.id}</div>
                    <div className="truncate text-xs ad-muted">
                      {faults.length ? faults.join(", ") : h === "offline" ? "no connection" : "stale telemetry"} · seen {relativeTime(d.last_seen)}
                    </div>
                  </div>
                  <Badge tone={HEALTH_TONE[h]}>{h}</Badge>
                </Link>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <SectionTitle right={<Link href="/smarthome/admin/ota" className="text-xs text-cyan-400 hover:text-cyan-300">OTA</Link>}>
            Firmware in the field
          </SectionTitle>
          <div className="space-y-3">
            {fleet.byFirmware.length === 0 ? (
              <p className="py-6 text-center text-sm ad-muted">No firmware versions reported.</p>
            ) : (
              fleet.byFirmware.slice(0, 5).map((f) => {
                const share = fleet.total ? (f.value / fleet.total) * 100 : 0;
                return (
                  <div key={f.name} className="rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-medium text-white">
                        <ServerCog className="h-4 w-4 text-cyan-400" /> {f.name}
                      </span>
                      <span className="text-xs ad-muted tabular-nums">{num(f.value)} device{f.value === 1 ? "" : "s"}</span>
                    </div>
                    <Progress value={share} tone="brand" />
                    <div className="mt-1.5 text-[11px] ad-muted tabular-nums">{share.toFixed(0)}% of fleet</div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        <Panel>
          <SectionTitle right={<Link href="/smarthome/admin/platform" className="text-xs text-cyan-400 hover:text-cyan-300">Platform</Link>}>
            Platform health
          </SectionTitle>
          {healthRes.error ? (
            <p className="py-6 text-center text-sm text-red-300">{healthRes.error}</p>
          ) : (
            <div className="space-y-1.5">
              <HealthRow icon={<Radio className="h-4 w-4" />} name="MQTT broker" ok={health?.mqtt === true} detail={health ? (health.mqtt ? "connected" : "down") : "unknown"} />
              <HealthRow icon={<Database className="h-4 w-4" />} name="Database" ok={health?.db === true} detail={health ? (health.db ? "up" : "down") : "unknown"} />
              <HealthRow icon={<Activity className="h-4 w-4" />} name="API uptime" ok detail={health ? uptime(health.uptimeSec) : "—"} />
              <HealthRow icon={<ServerCog className="h-4 w-4" />} name="Runtime" ok detail={health?.node ?? "—"} />
              <HealthRow
                icon={<PlugZap className="h-4 w-4" />} name="Pending signups"
                ok={(stats?.pendingSignups ?? 0) === 0}
                detail={num(stats?.pendingSignups ?? 0)}
              />
            </div>
          )}
        </Panel>
      </div>

      <Panel>
        <SectionTitle right={<Link href="/smarthome/admin/alerts" className="text-xs text-cyan-400 hover:text-cyan-300">All events</Link>}>
          Recent activity
        </SectionTitle>
        {events.length === 0 ? (
          <p className="py-6 text-center text-sm ad-muted">No activity logged yet.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {events.slice(0, 10).map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Dot tone={kindTone(e.kind)} />
                <span className="min-w-0 truncate text-slate-200">
                  <span className="font-semibold text-white">{e.title}</span>
                  {e.body && <span className="ad-muted"> — {e.body}</span>}
                </span>
                <span className="ml-auto shrink-0 text-xs ad-muted">{e.owner_email ?? e.device_id ?? ""}</span>
                <span className="shrink-0 text-xs ad-muted">{relativeTime(e.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function HealthRow({ icon, name, ok, detail }: { icon: ReactNode; name: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
      <span style={{ color: ok ? "#4ade80" : "#f87171" }}>{icon}</span>
      <span className="flex-1 truncate text-sm text-slate-200">{name}</span>
      <span className="text-xs ad-muted tabular-nums">{detail}</span>
      <Dot tone={ok ? "green" : "red"} />
    </div>
  );
}

function rank(h: DeviceHealth): number {
  return h === "critical" ? 0 : h === "offline" ? 1 : h === "warning" ? 2 : 3;
}

function kindTone(kind: string): Tone {
  const k = kind.toLowerCase();
  if (k.includes("alert") || k.includes("sos") || k.includes("fault") || k.includes("error")) return "red";
  if (k.includes("warn") || k.includes("offline")) return "amber";
  if (k.includes("secur") || k.includes("auth")) return "violet";
  return "brand";
}
