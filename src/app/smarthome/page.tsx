"use client";

/**
 * Circuvent Console — Overview.
 *
 * The operations dashboard. It answers, in order: is the platform healthy, what
 * needs attention, what is it costing, and what do I most often touch. Anything
 * that is configuration rather than operations lives in a section instead.
 *
 * Every figure below is measured: device counts and states come from
 * `/devices` merged with the live websocket, power from `/energy/summary`,
 * history from the per-device rollups, alerts from `/events`, and the
 * round-trip time from an actual timed request.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BatteryCharging,
  Bell,
  CheckCircle2,
  Cpu,
  Gauge,
  Plus,
  Power,
  RefreshCw,
  Sofa,
  Timer,
  Zap,
} from "lucide-react";
import { useConsole } from "./ConsoleProvider";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  ErrorState,
  Kpi,
  KpiGrid,
  PageHeader,
  RelativeTime,
  SectionTitle,
  SEVERITY,
  SeverityBadge,
  Skeleton,
  StatusDot,
  Surface,
  formatEnergy,
  formatWatts,
} from "./_kit/primitives";
import { CHART_COLORS, LineChart, BarChart, Sparkline } from "./_kit/charts";
import { DeviceTile } from "./_kit/device";
import OverviewDiagnostics from "./OverviewDiagnostics";
import { DashboardCustomiser, useConsoleLayout } from "./DashboardCustomiser";
import type { ConsoleSection } from "@/lib/console-layout";
import { useEnergy, useEvents, useFleet, useHomeEnergyHistory, useRooms, useScenes, useControlPlaneProbe } from "./_data/hooks";

export default function OverviewPage() {
  const { user, liveStatus } = useConsole();
  /*
   * The user's panel arrangement, read once here and threaded through `panel`
   * below rather than by each section calling the hook — every call is its own
   * fetch, and eight of them for one document would be eight requests to say
   * the same thing.
   */
  const { layout: dashLayout } = useConsoleLayout();
  const panel = (key: ConsoleSection, node: React.ReactNode) =>
    dashLayout.hidden.includes(key) ? null : (
      /*
       * CSS `order` rather than sorting the JSX. The sections are large,
       * deeply nested trees with their own state; moving them in the markup
       * would remount them on every reorder, throwing away scroll position and
       * any open disclosure. `order` moves the boxes and leaves the React tree
       * alone.
       */
      <div key={key} style={{ order: dashLayout.order.indexOf(key) }}>
        {node}
      </div>
    );
  const fleet = useFleet();
  const energy = useEnergy();
  const events = useEvents(120);
  const { rooms } = useRooms();
  const { scenes, activate } = useScenes();
  const probe = useControlPlaneProbe(45_000);

  // Only devices that actually report power are worth charting.
  const meteredIds = useMemo(
    () => energy.byDevice.filter((d) => Number.isFinite(d.watts)).slice(0, 6).map((d) => d.id),
    [energy.byDevice]
  );
  const history = useHomeEnergyHistory(meteredIds, 24);

  const openAlerts = useMemo(
    () =>
      events.events
        .filter((e) => {
          const sev = events.severityOf(e);
          return sev === "critical" || sev === "warning";
        })
        .slice(0, 6),
    [events]
  );

  const favorites = useMemo(() => fleet.devices.filter((d) => d.favorite), [fleet.devices]);
  const quickControl = useMemo(() => (favorites.length ? favorites : fleet.devices.slice(0, 6)), [favorites, fleet.devices]);
  const favScenes = useMemo(() => scenes.filter((s) => s.favorite).slice(0, 6), [scenes]);

  const roomLoad = useMemo(() => {
    const byId = new Map(energy.byDevice.map((d) => [d.id, d.watts] as const));
    const acc = new Map<string, number>();
    for (const d of fleet.devices) {
      const w = byId.get(d.id);
      if (typeof w !== "number" || !Number.isFinite(w)) continue;
      const key = d.room || "Unassigned";
      acc.set(key, (acc.get(key) ?? 0) + w);
    }
    return Array.from(acc, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [fleet.devices, energy.byDevice]);

  const probeTone = probe.stats.p95 == null ? undefined : probe.stats.p95 < 300 ? "ok" : probe.stats.p95 < 900 ? "warning" : "critical";

  /**
   * One refresh fans out to four sources, and the energy one issues a request
   * per device — around eight requests per press. Measured in a browser: 30
   * clicks produced 236 requests and tripped the control plane's 240/minute
   * budget, surfacing a failure banner caused entirely by the clicking.
   *
   * Disabling the button for the duration of the fan-out is not enough on its
   * own, and I checked: the fan-out finishes in well under the interval between
   * impatient clicks, so the button re-enables in time for the next one and 29
   * of 30 clicks still landed. The limit is a *rate*, so the guard has to be a
   * rate too.
   *
   * The cooldown costs nothing real. A realtime channel already streams state
   * into this page and a poll timer backs it up, so manual refresh is a
   * reassurance control rather than the data path — pressing it four times a
   * second cannot surface anything that pressing it once would not.
   */
  const COOLDOWN_MS = 3000;
  const [refreshing, setRefreshing] = useState(false);
  const [cooling, setCooling] = useState(false);
  const refreshAll = useCallback(() => {
    if (refreshing || cooling) return;
    setRefreshing(true);
    setCooling(true);
    window.setTimeout(() => setCooling(false), COOLDOWN_MS);
    void Promise.all([fleet.refresh(), energy.refresh(), events.refresh(), probe.probe()])
      .finally(() => setRefreshing(false));
  }, [refreshing, cooling, fleet, energy, events, probe]);

  const firstName = user?.name?.split(" ")[0];
  const empty = !fleet.loading && fleet.devices.length === 0;

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title={firstName ? `Good to see you, ${firstName}` : "Overview"}
        subtitle={
          fleet.lastSync ? (
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <StatusDot online={liveStatus === "live"} />
              {liveStatus === "live" ? "Realtime channel connected" : liveStatus === "connecting" ? "Connecting to realtime channel" : "Realtime channel reconnecting"}
              <span aria-hidden>·</span>
              <span>
                synced <RelativeTime iso={new Date(fleet.lastSync).toISOString()} />
              </span>
            </span>
          ) : (
            "Loading fleet…"
          )
        }
        actions={
          <>
            <DashboardCustomiser />
            <Button icon={RefreshCw} onClick={refreshAll} busy={refreshing} disabled={cooling}>
              Refresh
            </Button>
            <Link href="/smarthome/devices?tab=onboarding">
              <Button variant="primary" icon={Plus}>
                Add device
              </Button>
            </Link>
          </>
        }
      />

      {fleet.error && (
        <div className="mb-5">
          <ErrorState message={fleet.error} onRetry={() => void fleet.refresh()} />
        </div>
      )}

      {empty ? (
        <EmptyState
          icon={Cpu}
          title="No devices claimed yet"
          body="Pair your first Circuvent controller to start monitoring and controlling your home. You'll need the device ID and pairing key printed on the label."
          action={
            <Link href="/smarthome/devices?tab=onboarding">
              <Button variant="primary" icon={Plus}>
                Claim a device
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col">
          {/* A flex column so the panels can be reordered with CSS `order`,
              which moves the boxes without remounting their React trees. */}
          {panel("health", (
            <>
          {/* ------------------------------------------------ health strip -- */}
          <Surface className="mb-6" padded={false}>
            <div className="grid grid-cols-2 divide-y sm:grid-cols-4 sm:divide-y-0" style={{ borderColor: "var(--cv-border)" }}>
              <HealthCell
                label="Realtime link"
                value={liveStatus === "live" ? "Connected" : liveStatus === "connecting" ? "Connecting" : "Reconnecting"}
                tone={liveStatus === "live" ? "ok" : liveStatus === "connecting" ? "warning" : "critical"}
                icon={Activity}
              />
              <HealthCell
                label="Control plane p95"
                value={probe.stats.p95 == null ? "measuring…" : `${probe.stats.p95} ms`}
                tone={probeTone}
                icon={Timer}
                detail={probe.stats.count ? `${probe.stats.count} samples · ${probe.stats.failures} failed` : undefined}
              />
              <HealthCell
                label="Devices reachable"
                value={`${fleet.online}/${fleet.devices.length}`}
                tone={fleet.devices.length === 0 ? undefined : fleet.offline === 0 ? "ok" : fleet.online === 0 ? "critical" : "warning"}
                icon={Cpu}
              />
              <HealthCell
                label="Open alerts"
                value={String(events.counts.critical + events.counts.warning)}
                tone={events.counts.critical > 0 ? "critical" : events.counts.warning > 0 ? "warning" : "ok"}
                icon={Bell}
                detail={events.counts.critical ? `${events.counts.critical} critical` : undefined}
              />
            </div>
          </Surface>
            </>
          ))}
          {panel("kpis", (
            <>
          {/* -------------------------------------------------------- KPIs -- */}
          <KpiGrid>
            <Kpi
              label="Online"
              value={fleet.online}
              unit={`/ ${fleet.devices.length}`}
              icon={Cpu}
              tone={fleet.offline === 0 ? "ok" : "warning"}
              hint={fleet.offline ? `${fleet.offline} offline` : "All reachable"}
            />
            <Kpi label="Powered on" value={fleet.poweredOn} unit="loads" icon={Power} hint={`${fleet.devices.length - fleet.poweredOn} idle`} />
            <Kpi
              label="Live draw"
              value={energy.liveWatts == null ? "—" : formatWatts(energy.liveWatts).split(" ")[0]}
              unit={energy.liveWatts == null ? "" : formatWatts(energy.liveWatts).split(" ")[1]}
              icon={Zap}
              hint={energy.liveWatts == null ? "No metered device reporting" : `${energy.byDevice.length} metered devices`}
            />
            <Kpi
              label="Energy today"
              value={energy.todayKwh == null ? "—" : energy.todayKwh.toFixed(2)}
              unit={energy.todayKwh == null ? "" : "kWh"}
              icon={BatteryCharging}
              hint={energy.todayKwh == null ? "Awaiting metering" : "Since local midnight"}
            />
          </KpiGrid>
            </>
          ))}
          {panel("alerts", (
            <>
          {/* ------------------------------------------- alerts + trend ----- */}
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <LineChart
                title="Whole-home power · last 24 h"
                unit=" W"
                height={230}
                series={
                  history.points.length
                    ? [{ name: "Measured draw", color: CHART_COLORS[0], points: history.points }]
                    : []
                }
                right={
                  <Link href="/smarthome/energy" className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--cv-accent-hi)" }}>
                    Energy <ArrowRight className="h-3 w-3" />
                  </Link>
                }
                footer={
                  meteredIds.length > 0 ? (
                    <p className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
                      Summed from server-side rollups for the {meteredIds.length} highest-draw metered devices.
                    </p>
                  ) : undefined
                }
              />
            </div>

            <Surface padded={false} className="flex flex-col">
              <div className="flex items-center justify-between gap-2 border-b px-4 py-3.5" style={{ borderColor: "var(--cv-border)" }}>
                <h3 className="text-[17px] font-semibold" style={{ color: "var(--cv-text)" }}>
                  Needs attention
                </h3>
                <Link href="/smarthome/security?tab=alerts" className="text-[13px] font-semibold" style={{ color: "var(--cv-accent-hi)" }}>
                  All alerts
                </Link>
              </div>
              <div className="min-h-0 flex-1 divide-y overflow-y-auto" style={{ borderColor: "var(--cv-border)", maxHeight: 260 }}>
                {events.loading && !events.events.length ? (
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                  </div>
                ) : openAlerts.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <CheckCircle2 className="h-8 w-8" style={{ color: SEVERITY.ok.fg }} />
                    <span className="text-sm font-semibold">Nothing needs attention</span>
                    <span className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
                      No critical or warning events in the last {events.events.length} records.
                    </span>
                  </div>
                ) : (
                  openAlerts.map((e) => (
                    <div key={e.id} className="px-4 py-3" style={{ borderColor: "var(--cv-border)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-sm font-semibold">{e.title}</span>
                        <SeverityBadge severity={events.severityOf(e)} />
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px]" style={{ color: "var(--cv-muted)" }}>
                        {e.body}
                      </p>
                      <div className="mt-1 text-[10px]" style={{ color: "var(--cv-muted)" }}>
                        <RelativeTime iso={e.ts} />
                        {e.device_id ? ` · ${fleet.byId.get(e.device_id)?.name ?? e.device_id}` : ""}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {events.unread > 0 && (
                <div className="border-t px-4 py-3" style={{ borderColor: "var(--cv-border)" }}>
                  <Button full onClick={() => void events.markRead()}>
                    Mark {events.unread} read
                  </Button>
                </div>
              )}
            </Surface>
          </div>
            </>
          ))}
          {panel("diagnostics", (
            <>
          {/* ---------------------------------------------- diagnostics ----- */}
          <OverviewDiagnostics />
            </>
          ))}
          {panel("scenes", (
            <>
          {/* --------------------------------------------------- scenes ----- */}
          {favScenes.length > 0 && (
            <>
              <SectionTitle
                right={
                  <Link href="/smarthome/automation?tab=scenes" className="text-[13px] font-semibold" style={{ color: "var(--cv-accent-hi)" }}>
                    Manage
                  </Link>
                }
              >
                Quick scenes
              </SectionTitle>
              <div className="flex flex-wrap gap-2">
                {favScenes.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => void activate(s.id)}
                    className="cv-card flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-95"
                  >
                    <Zap className="h-4 w-4" style={{ color: "var(--cv-accent-hi)" }} />
                    {s.name}
                  </button>
                ))}
              </div>
            </>
          )}
            </>
          ))}
          {panel("control", (
            <>
          {/* -------------------------------------------- live control ------ */}
          <SectionTitle
            right={
              <Link href="/smarthome/devices" className="text-[13px] font-semibold" style={{ color: "var(--cv-accent-hi)" }}>
                All {fleet.devices.length} devices
              </Link>
            }
          >
            {favorites.length ? "Favourites" : "Live control"}
          </SectionTitle>
          {fleet.loading && fleet.devices.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-32" rounded="rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {quickControl.map((d) => (
                <DeviceTile
                  key={d.id}
                  device={d}
                  status={fleet.cmd.statusOf(d.id)}
                  onSend={(cmd) => void fleet.cmd.send(d, cmd)}
                  onFavorite={() => void fleet.toggleFavorite(d)}
                />
              ))}
            </div>
          )}
          {favorites.length === 0 && fleet.devices.length > 6 && (
            <p className="mt-3 text-[11px]" style={{ color: "var(--cv-muted)" }}>
              Star a device to pin it here.
            </p>
          )}
            </>
          ))}
          {panel("rooms", (
            <>
          {/* ---------------------------------------------- load by room ---- */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {roomLoad.length > 0 ? (
              <BarChart
                title="Current draw by space"
                horizontal
                unit=" W"
                height={200}
                data={roomLoad.map((r, i) => ({ ...r, color: CHART_COLORS[i % CHART_COLORS.length] }))}
              />
            ) : (
              <Surface>
                <h3 className="mb-3 text-[17px] font-semibold" style={{ color: "var(--cv-text)" }}>
                  Current draw by space
                </h3>
                <Callout tone="info" title="No metered devices">
                  Power readings appear here once a smart plug, energy monitor or metering switchboard reports watts.
                </Callout>
              </Surface>
            )}

            <Surface>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[17px] font-semibold" style={{ color: "var(--cv-text)" }}>
                  Spaces
                </h3>
                <Link href="/smarthome/spaces" className="text-[13px] font-semibold" style={{ color: "var(--cv-accent-hi)" }}>
                  Manage
                </Link>
              </div>
              {rooms.length === 0 ? (
                <Callout tone="info" title="No rooms yet">
                  Group devices into rooms to control a whole space at once.
                </Callout>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {rooms.map((r) => {
                    const inRoom = fleet.devices.filter((d) => d.room === r.name);
                    const on = inRoom.filter((d) => d.online).length;
                    return (
                      <Link
                        key={r.name}
                        href={`/smarthome/spaces?tab=rooms&room=${encodeURIComponent(r.name)}`}
                        className="rounded-xl px-3 py-2.5 transition hover:brightness-110"
                        style={{ background: "var(--cv-card-hi)" }}
                      >
                        <div className="flex items-center gap-1.5 text-sm font-bold">
                          <Sofa className="h-3.5 w-3.5" style={{ color: "var(--cv-accent-hi)" }} />
                          <span className="min-w-0 truncate">{r.name}</span>
                        </div>
                        <div className="mt-0.5 text-[11px]" style={{ color: "var(--cv-muted)" }}>
                          {inRoom.length} device{inRoom.length === 1 ? "" : "s"} · {on} online
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Surface>
          </div>
            </>
          ))}
          {panel("latency", (
            <>
          {/* -------------------------------------------- latency footer ---- */}
          <SectionTitle
            right={
              <Link href="/smarthome/insights?tab=latency" className="text-[13px] font-semibold" style={{ color: "var(--cv-accent-hi)" }}>
                Latency lab
              </Link>
            }
          >
            Round-trip time to the control plane
          </SectionTitle>
          <Surface>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <Gauge className="h-5 w-5" style={{ color: "var(--cv-accent-hi)" }} />
                <div>
                  <div className="text-2xl font-extrabold tabular-nums" style={{ color: probeTone ? SEVERITY[probeTone].fg : "var(--cv-text)" }}>
                    {probe.stats.last?.ms ?? "—"}
                    <span className="ml-1 text-sm font-semibold" style={{ color: "var(--cv-muted)" }}>
                      ms
                    </span>
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
                    last measured request
                  </div>
                </div>
              </div>
              <Sparkline points={probe.samples.map((s) => s.ms ?? 0)} color={probeTone ? SEVERITY[probeTone].fg : "var(--cv-accent)"} width={180} height={40} />
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px]" style={{ color: "var(--cv-muted)" }}>
                <span>
                  p50 <b style={{ color: "var(--cv-text)" }}>{probe.stats.p50 ?? "—"} ms</b>
                </span>
                <span>
                  p95 <b style={{ color: "var(--cv-text)" }}>{probe.stats.p95 ?? "—"} ms</b>
                </span>
                <span>
                  worst <b style={{ color: "var(--cv-text)" }}>{probe.stats.max ?? "—"} ms</b>
                </span>
                {probe.stats.failures > 0 && (
                  <Badge tone="warning">{probe.stats.failures} failed</Badge>
                )}
              </div>
            </div>
          </Surface>
            </>
          ))}
        </div>
      )}
    </div>
  );
}

function HealthCell({
  label,
  value,
  tone,
  icon: Icon,
  detail,
}: {
  label: string;
  value: string;
  tone?: "critical" | "warning" | "info" | "ok";
  icon: typeof Activity;
  detail?: string;
}) {
  const color = tone ? SEVERITY[tone].fg : "var(--cv-text)";
  return (
    <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderColor: "var(--cv-border)" }}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: tone ? SEVERITY[tone].dim : "var(--cv-card-hi)" }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold" style={{ color: "var(--cv-muted)" }}>
          {label}
        </div>
        <div className="truncate text-sm font-bold tabular-nums" style={{ color }}>
          {value}
        </div>
        {detail && (
          <div className="truncate text-[10px]" style={{ color: "var(--cv-muted)" }}>
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}
