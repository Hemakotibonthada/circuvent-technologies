"use client";

// Customisable home-dashboard widgets.
//
// Every widget renders live control-plane data only — there is no sample or
// placeholder series here. Which widgets appear, and in what order, is a
// per-user preference persisted through /api/smarthome/prefs so the layout
// follows the account across browsers.

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bell,
  Check,
  Home,
  LayoutGrid,
  Plug,
  Settings2,
  Star,
  Wifi,
  Zap,
} from "lucide-react";
import { controlPlane, type AppEvent, type Device, type EnergyPoint, type EnergySummary, type Room, type Scene } from "@/lib/control-plane";
import { useUserPrefs } from "@/lib/smarthome-prefs";

export interface WidgetData {
  energy: EnergySummary | null;
  devices: Device[];
  favorites: Device[];
  scenes: Scene[];
  rooms: Room[];
  events: AppEvent[];
  unread: number;
}

type WidgetSize = "stat" | "panel" | "wide";

interface WidgetDef {
  id: string;
  title: string;
  description: string;
  size: WidgetSize;
  render: (d: WidgetData) => ReactNode;
}

const DEFAULT_LAYOUT = [
  "live-power",
  "today-energy",
  "devices-online",
  "rooms-count",
  "favorites-list",
  "scenes",
  "activity",
  "rooms-strip",
];

interface DashboardPrefs {
  enabled: string[];
}

// ------------------------------------------------------------ widget registry

const WIDGETS: WidgetDef[] = [
  {
    id: "live-power",
    title: "Live power",
    description: "Instantaneous whole-home draw reported by metered devices.",
    size: "stat",
    render: (d) => <Stat icon={<Zap className="h-5 w-5" />} label="Live power" value={`${Math.round(d.energy?.liveWatts ?? 0)} W`} />,
  },
  {
    id: "today-energy",
    title: "Energy today",
    description: "Kilowatt-hours integrated from today's telemetry.",
    size: "stat",
    render: (d) => <Stat icon={<Activity className="h-5 w-5" />} label="Today" value={`${(d.energy?.todayKwh ?? 0).toFixed(2)} kWh`} />,
  },
  {
    id: "devices-online",
    title: "Devices online",
    description: "How many of your devices are currently reachable.",
    size: "stat",
    render: (d) => {
      const online = d.devices.filter((x) => x.online).length;
      return (
        <Stat
          icon={<Wifi className="h-5 w-5" />}
          label="Online"
          value={`${online}/${d.devices.length}`}
          tone={d.devices.length && online < d.devices.length ? "warn" : "ok"}
        />
      );
    },
  },
  {
    id: "favorites-count",
    title: "Favorites count",
    description: "Number of starred devices.",
    size: "stat",
    render: (d) => <Stat icon={<Star className="h-5 w-5" />} label="Favorites" value={String(d.favorites.length)} />,
  },
  {
    id: "rooms-count",
    title: "Rooms",
    description: "Rooms configured on your account.",
    size: "stat",
    render: (d) => <Stat icon={<Home className="h-5 w-5" />} label="Rooms" value={String(d.rooms.length)} />,
  },
  {
    id: "alerts-count",
    title: "Unread alerts",
    description: "Events you have not acknowledged yet.",
    size: "stat",
    render: (d) => (
      <Stat
        icon={<Bell className="h-5 w-5" />}
        label="Unread alerts"
        value={String(d.unread)}
        tone={d.unread > 0 ? "warn" : "ok"}
      />
    ),
  },
  {
    id: "switches-on",
    title: "Switches on",
    description: "Total relay channels currently energised across the home.",
    size: "stat",
    render: (d) => {
      const fields = ["power", "power2", "power3", "power4", "g1", "g2", "g3", "pump", "relay"];
      let on = 0;
      let total = 0;
      for (const dev of d.devices) {
        for (const f of fields) {
          if (f in dev.state) {
            total += 1;
            if (dev.state[f]) on += 1;
          }
        }
      }
      return <Stat icon={<Plug className="h-5 w-5" />} label="Switches on" value={total ? `${on}/${total}` : "—"} />;
    },
  },
  {
    id: "favorites-list",
    title: "Favorites",
    description: "Quick links to your starred devices.",
    size: "panel",
    render: (d) => (
      <Panel title="Favorites" href="/smarthome">
        {d.favorites.length ? (
          d.favorites.slice(0, 5).map((x) => (
            <Link
              key={x.id}
              href={`/smarthome/device/${encodeURIComponent(x.id)}`}
              className="flex items-center justify-between gap-2 rounded-xl bg-black/20 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              <span className="truncate">{x.name || x.id}</span>
              <span className={`h-2 w-2 shrink-0 rounded-full ${x.online ? "bg-emerald-400" : "bg-slate-600"}`} />
            </Link>
          ))
        ) : (
          <EmptyMini text="Star devices to pin them here." />
        )}
      </Panel>
    ),
  },
  {
    id: "scenes",
    title: "Scene shortcuts",
    description: "One-tap activation for your favourite scenes.",
    size: "panel",
    render: (d) => (
      <Panel title="Scene shortcuts" href="/smarthome/scenes">
        {d.scenes.length ? (
          d.scenes.map((s) => (
            <button
              key={s.id}
              onClick={() => controlPlane.activateScene(s.id)}
              className="w-full rounded-xl bg-black/20 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10 active:scale-[0.98]"
            >
              <span className="mr-2">{s.icon}</span>
              {s.name}
            </button>
          ))
        ) : (
          <EmptyMini text="Favorite scenes become quick actions." />
        )}
      </Panel>
    ),
  },
  {
    id: "activity",
    title: "Recent activity",
    description: "Latest events recorded by the control plane.",
    size: "panel",
    render: (d) => (
      <Panel title="Recent activity" href="/smarthome/events">
        {d.events.length ? (
          d.events.map((e) => (
            <div key={e.id} className="rounded-xl bg-black/20 px-3 py-2 text-sm">
              <div className="flex items-center gap-1.5 text-slate-200">
                {(e.kind === "alert" || e.kind === "security") && (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                )}
                <span className="truncate">{e.title}</span>
              </div>
              <div className="truncate text-xs text-slate-500">{e.body}</div>
            </div>
          ))
        ) : (
          <EmptyMini text="No recent alerts." />
        )}
      </Panel>
    ),
  },
  {
    id: "top-consumers",
    title: "Top consumers",
    description: "Which devices are drawing the most power right now.",
    size: "panel",
    render: (d) => {
      const rows = (d.energy?.byDevice ?? []).filter((x) => Number(x.watts) > 0).slice(0, 5);
      const max = Math.max(1, ...rows.map((r) => Number(r.watts)));
      return (
        <Panel title="Top consumers" href="/smarthome/energy">
          {rows.length ? (
            rows.map((r) => (
              <div key={r.id} className="rounded-xl bg-black/20 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-slate-200">{r.name || r.id}</span>
                  <span className="shrink-0 font-semibold text-cyan-300">{Number(r.watts).toFixed(0)} W</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-cyan-400" style={{ width: `${(Number(r.watts) / max) * 100}%` }} />
                </div>
              </div>
            ))
          ) : (
            <EmptyMini text="No metered device is reporting load." />
          )}
        </Panel>
      );
    },
  },
  {
    id: "power-trend",
    title: "Power trend (24 h)",
    description: "Real hourly average draw from your highest-consuming meter.",
    size: "panel",
    render: (d) => <PowerTrend energy={d.energy} />,
  },
  {
    id: "rooms-strip",
    title: "Room shortcuts",
    description: "Horizontal strip of every room with its device count.",
    size: "wide",
    render: (d) =>
      d.rooms.length ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {d.rooms.map((r) => (
            <Link
              key={`${r.id}-${r.name}`}
              href="/smarthome/rooms"
              className="cv-card shrink-0 rounded-2xl px-4 py-3 text-sm text-slate-200 transition hover:bg-white/10"
            >
              <span className="mr-2">{r.icon}</span>
              {r.name}
              <span className="ml-2 text-slate-500">{r.count}</span>
            </Link>
          ))}
        </div>
      ) : null,
  },
];

const BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

// ------------------------------------------------------------------ component

export function DashboardWidgets(data: WidgetData) {
  const { value, update, error } = useUserPrefs<DashboardPrefs>("dashboard", { enabled: DEFAULT_LAYOUT });
  const [editing, setEditing] = useState(false);

  const enabled = useMemo(
    () => (value.enabled ?? DEFAULT_LAYOUT).map((id) => BY_ID.get(id)).filter((w): w is WidgetDef => !!w),
    [value.enabled]
  );

  const stats = enabled.filter((w) => w.size === "stat");
  const panels = enabled.filter((w) => w.size === "panel");
  const wides = enabled.filter((w) => w.size === "wide");

  const toggle = (id: string) =>
    update((prev) => {
      const list = prev.enabled ?? DEFAULT_LAYOUT;
      return { enabled: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
    });

  const move = (id: string, dir: -1 | 1) =>
    update((prev) => {
      const list = [...(prev.enabled ?? DEFAULT_LAYOUT)];
      const i = list.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return prev;
      [list[i], list[j]] = [list[j], list[i]];
      return { enabled: list };
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3">
        {error && <span className="text-xs text-amber-400">{error}</span>}
        <button
          onClick={() => setEditing((v) => !v)}
          aria-pressed={editing}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
            editing
              ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
              : "border-white/10 bg-white/5 text-slate-300 hover:text-white"
          }`}
        >
          {editing ? <Check className="h-3.5 w-3.5" /> : <Settings2 className="h-3.5 w-3.5" />}
          {editing ? "Done" : "Customize"}
        </button>
      </div>

      {editing && (
        <WidgetPicker
          enabled={value.enabled ?? DEFAULT_LAYOUT}
          onToggle={toggle}
          onMove={move}
          onReset={() => update(() => ({ enabled: DEFAULT_LAYOUT }))}
        />
      )}

      {stats.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((w) => (
            <div key={w.id}>{w.render(data)}</div>
          ))}
        </div>
      )}
      {panels.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          {panels.map((w) => (
            <div key={w.id}>{w.render(data)}</div>
          ))}
        </div>
      )}
      {wides.map((w) => (
        <div key={w.id}>{w.render(data)}</div>
      ))}
      {enabled.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-slate-400">
          No widgets selected. Tap <span className="font-semibold text-slate-200">Customize</span> to add some.
        </div>
      )}
    </div>
  );
}

function WidgetPicker({
  enabled,
  onToggle,
  onMove,
  onReset,
}: {
  enabled: string[];
  onToggle: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onReset: () => void;
}) {
  const ordered = [...WIDGETS].sort((a, b) => {
    const ia = enabled.indexOf(a.id);
    const ib = enabled.indexOf(b.id);
    if (ia === -1 && ib === -1) return a.title.localeCompare(b.title);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  return (
    <div className="cv-card rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold text-white">
          <LayoutGrid className="h-4 w-4 text-cyan-300" /> Dashboard widgets
        </h2>
        <button onClick={onReset} className="text-xs font-medium text-slate-400 transition hover:text-slate-200">
          Reset to default
        </button>
      </div>
      <ul className="space-y-2">
        {ordered.map((w) => {
          const on = enabled.includes(w.id);
          const idx = enabled.indexOf(w.id);
          return (
            <li
              key={w.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                on ? "border-cyan-400/30 bg-cyan-500/[0.07]" : "border-white/10 bg-black/20"
              }`}
            >
              <button
                onClick={() => onToggle(w.id)}
                role="switch"
                aria-checked={on}
                aria-label={`${on ? "Hide" : "Show"} ${w.title}`}
                className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                  on ? "border-cyan-300/50 bg-cyan-400" : "border-white/15 bg-white/10"
                }`}
              >
                <span
                  className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-all duration-150 ${
                    on ? "left-[calc(100%-1.25rem)]" : "left-1"
                  }`}
                />
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{w.title}</div>
                <div className="truncate text-xs text-slate-500">{w.description}</div>
              </div>
              {on && (
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => onMove(w.id, -1)}
                    disabled={idx <= 0}
                    aria-label={`Move ${w.title} up`}
                    className="rounded-lg border border-white/10 p-1.5 text-slate-300 transition hover:bg-white/10 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onMove(w.id, 1)}
                    disabled={idx === enabled.length - 1}
                    aria-label={`Move ${w.title} down`}
                    className="rounded-lg border border-white/10 p-1.5 text-slate-300 transition hover:bg-white/10 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * 24-hour draw for the device currently consuming the most power. Fetched from
 * the real telemetry endpoint; renders an honest empty state when that device
 * has no history yet rather than inventing a curve.
 */
function PowerTrend({ energy }: { energy: EnergySummary | null }) {
  const top = (energy?.byDevice ?? []).slice().sort((a, b) => Number(b.watts) - Number(a.watts))[0];
  const [series, setSeries] = useState<EnergyPoint[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready">("idle");

  useEffect(() => {
    if (!top?.id) return;
    let cancelled = false;
    setState("loading");
    controlPlane.deviceEnergy(top.id, 24, "watts").then((r) => {
      if (cancelled) return;
      setSeries(r.ok ? r.data.series ?? [] : []);
      setState("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [top?.id]);

  const pts = series.filter((p) => Number.isFinite(Number(p.avg)));
  const max = Math.max(1, ...pts.map((p) => Number(p.avg)));

  return (
    <Panel title="Power trend (24 h)" href="/smarthome/energy">
      {!top ? (
        <EmptyMini text="No metered device on this account yet." />
      ) : state === "loading" ? (
        <EmptyMini text="Loading history…" />
      ) : pts.length < 2 ? (
        <EmptyMini text={`${top.name || top.id} has not logged enough history yet.`} />
      ) : (
        <>
          <div className="mb-1 text-xs text-slate-500">{top.name || top.id}</div>
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-20 w-full" role="img" aria-label="24 hour power trend">
            <polyline
              points={pts
                .map((p, i) => `${(i / (pts.length - 1)) * 100},${32 - (Number(p.avg) / max) * 30}`)
                .join(" ")}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="flex justify-between text-xs text-slate-500">
            <span>24 h ago</span>
            <span>peak {max.toFixed(0)} W</span>
            <span>now</span>
          </div>
        </>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------- primitives

function Stat({
  icon,
  label,
  value,
  tone = "ok",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="cv-card rounded-2xl p-4">
      <div className={tone === "warn" ? "text-amber-400" : "text-cyan-300"}>{icon}</div>
      <div className="mt-3 text-2xl font-extrabold text-white">{value}</div>
      <div className="text-xs uppercase tracking-[0.15em] text-slate-500">{label}</div>
    </div>
  );
}

function Panel({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return (
    <div className="cv-card rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-bold text-white">{title}</h2>
        {href && (
          <Link href={href} className="text-xs font-medium text-cyan-300 transition hover:text-cyan-200">
            View all
          </Link>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return <div className="text-sm text-slate-500">{text}</div>;
}
