"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  BatteryCharging,
  Eye,
  EyeOff,
  Layers,
  LayoutGrid,
  Loader2,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  Zap,
} from "lucide-react";
import { controlPlane, type AppEvent, type Device, type EnergySummary, type Scene } from "@/lib/control-plane";
import { getLayout, toggleWidget, moveWidget, resetLayout, WIDGET_META, type WidgetConfig, type WidgetKind } from "@/lib/smarthome-dashboard";
import { getSettings as getBudgetSettings, computeSlabCost } from "@/lib/smarthome-energy-budget";
import { listGroups, type DeviceGroup } from "@/lib/smarthome-groups";
import { getThresholds as getDiagThresholds, healthScore } from "@/lib/smarthome-diagnostics";
import { RECIPES } from "@/lib/smarthome-recipes";
import { useOptimisticCommands } from "@/lib/smarthome-realtime";
import { masterPower } from "@/lib/smarthome-command-map";
import { useConsole } from "../ConsoleProvider";
import WeatherCard from "@/components/weather/WeatherCard";

const SECURITY_TYPES = new Set(["motion-sensor", "guardian", "smart-lock", "facedoor", "rfid-gate"]);

const WIDGET_ACCENT: Record<WidgetKind, string> = {
  energy: "#f59e0b",
  budget: "#22c55e",
  favorites: "#eab308",
  scenes: "#8b5cf6",
  security: "#ef4444",
  diagnostics: "#06b6d4",
  groups: "#3b82f6",
  recipes: "#ec4899",
  activity: "#14b8a6",
  weather: "#38bdf8",
};

export default function CommandCenterPage() {
  const { subscribe } = useConsole();
  const [layout, setLayout] = useState<WidgetConfig[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [energy, setEnergy] = useState<EnergySummary | null>(null);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const cmd = useOptimisticCommands(devices);

  const load = useCallback(async () => {
    const [d, s, en, ev] = await Promise.all([controlPlane.devices(), controlPlane.scenes(), controlPlane.energySummary(), controlPlane.events(8)]);
    if (d.ok) setDevices(d.data.devices ?? []);
    if (s.ok) setScenes(s.data.scenes ?? []);
    if (en.ok) setEnergy(en.data);
    if (ev.ok) setEvents(ev.data.events ?? []);
    setGroups(listGroups());
    setLayout(getLayout());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return subscribe((u) => {
      setDevices((prev) =>
        prev.map((d) => {
          if (d.id !== u.deviceId) return d;
          if (u.kind === "status") return { ...d, online: !!(u.payload as { online?: boolean }).online };
          if (u.kind === "state") return { ...d, online: true, state: { ...d.state, ...u.payload } };
          return d;
        })
      );
    });
  }, [subscribe]);

  const favorites = useMemo(() => devices.filter((d) => d.favorite), [devices]);
  const favScenes = useMemo(() => scenes.filter((s) => s.favorite).slice(0, 4), [scenes]);
  const security = useMemo(() => devices.filter((d) => SECURITY_TYPES.has(d.type)), [devices]);
  const alerts = security.filter((d) => {
    const s = d.state as Record<string, unknown>;
    return !!s.sos || !!s.dryRun || !!s.overflow;
  });
  const diagThresholds = getDiagThresholds();
  const needsAttention = useMemo(() => devices.map((d) => healthScore(d, diagThresholds)).filter((h) => h.level !== "good").length, [devices, diagThresholds]);
  const budgetSettings = getBudgetSettings();
  const dayOfMonth = new Date().getDate();
  const projectedKwh = energy ? energy.todayKwh * dayOfMonth : 0;
  const projectedCost = computeSlabCost(projectedKwh, budgetSettings.slabs);
  const budgetPct = Math.min(999, Math.round((projectedKwh / budgetSettings.monthlyBudgetKwh) * 100));

  const visible = layout.filter((w) => w.visible);
  const hidden = layout.filter((w) => !w.visible);

  const doToggle = (id: string) => setLayout(toggleWidget(layout, id));
  const doMove = (id: string, dir: "up" | "down") => setLayout(moveWidget(layout, id, dir));
  const doReset = () => setLayout(resetLayout());

  const bulkGroupPower = async (group: DeviceGroup, on: boolean) => {
    // Route through the firmware-aware master-power map so multi-gang devices
    // (home-hub, touchboard, smart-switch) actually switch every output, and so
    // the projected state lands immediately instead of waiting for the echo.
    await Promise.all(
      group.deviceIds.map((id) => {
        const dev = devices.find((d) => d.id === id);
        if (!dev) return controlPlane.command(id, { action: "set", power: on });
        const mp = masterPower(dev);
        return cmd.send(dev, mp ? mp.cmd(on) : { power: on });
      })
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="cc-root relative -mx-4 md:-mx-8 -mt-6 px-4 md:px-8 pt-6 pb-4">
      <div className="cc-glow cc-glow-a" />
      <div className="cc-glow cc-glow-b" />

      <div className="relative flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: "var(--cv-accent-hi)" }}>
            Command Center
          </div>
          <h1 className="text-3xl font-extrabold text-white mt-1">Your home, at a glance</h1>
        </div>
        <button
          onClick={() => setEditMode((v) => !v)}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-sm transition ${editMode ? "text-white" : "text-slate-200 bg-white/5 border border-white/10"}`}
          style={editMode ? { background: "var(--cv-gradient)" } : undefined}
        >
          <Settings2 className="h-4 w-4" /> {editMode ? "Done customizing" : "Customize"}
        </button>
      </div>

      {editMode && (
        <div className="relative mb-6 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-slate-300">Reorder, hide or bring back widgets.</p>
            <button onClick={doReset} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
              <RotateCcw className="h-3.5 w-3.5" /> Reset layout
            </button>
          </div>
          {hidden.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {hidden.map((w) => (
                <button key={w.id} onClick={() => doToggle(w.id)} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10">
                  <Eye className="h-3.5 w-3.5" /> Show {WIDGET_META[w.kind].label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((w, i) => (
          <div key={w.id} className={`cc-tile ${WIDGET_META[w.kind].span === "2" ? "sm:col-span-2" : ""}`} style={{ ["--tile-accent" as string]: WIDGET_ACCENT[w.kind] }}>
            {editMode && (
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
                <button onClick={() => doMove(w.id, "up")} disabled={i === 0} className="h-7 w-7 rounded-lg bg-black/40 flex items-center justify-center text-slate-300 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => doMove(w.id, "down")} disabled={i === visible.length - 1} className="h-7 w-7 rounded-lg bg-black/40 flex items-center justify-center text-slate-300 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button onClick={() => doToggle(w.id)} className="h-7 w-7 rounded-lg bg-black/40 flex items-center justify-center text-slate-300"><EyeOff className="h-3.5 w-3.5" /></button>
              </div>
            )}
            <WidgetBody
              kind={w.kind}
              devices={devices}
              favorites={favorites}
              favScenes={favScenes}
              security={security}
              alerts={alerts}
              needsAttention={needsAttention}
              groups={groups}
              energy={energy}
              projectedKwh={projectedKwh}
              projectedCost={projectedCost}
              budgetPct={budgetPct}
              monthlyBudgetKwh={budgetSettings.monthlyBudgetKwh}
              events={events}
              onBulkPower={bulkGroupPower}
            />
          </div>
        ))}
      </div>

      <style jsx global>{`
        .cc-root { overflow: hidden; }
        .cc-glow { position: absolute; border-radius: 9999px; filter: blur(90px); opacity: 0.35; pointer-events: none; z-index: 0; }
        .cc-glow-a { width: 420px; height: 420px; top: -160px; right: -120px; background: radial-gradient(circle, #8b5cf6, transparent 70%); }
        .cc-glow-b { width: 380px; height: 380px; bottom: -160px; left: -100px; background: radial-gradient(circle, #06b6d4, transparent 70%); }
        .cc-tile {
          position: relative;
          border-radius: 1.25rem;
          padding: 1.25rem;
          background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
          border: 1px solid rgba(255,255,255,0.08);
          border-top: 2px solid var(--tile-accent, #06b6d4);
          backdrop-filter: blur(12px);
        }
      `}</style>
    </div>
  );
}

function WidgetBody({
  kind,
  favorites,
  favScenes,
  security,
  alerts,
  needsAttention,
  groups,
  energy,
  projectedKwh,
  projectedCost,
  budgetPct,
  monthlyBudgetKwh,
  events,
  onBulkPower,
}: {
  kind: WidgetKind;
  devices: Device[];
  favorites: Device[];
  favScenes: Scene[];
  security: Device[];
  alerts: Device[];
  needsAttention: number;
  groups: DeviceGroup[];
  energy: EnergySummary | null;
  projectedKwh: number;
  projectedCost: number;
  budgetPct: number;
  monthlyBudgetKwh: number;
  events: AppEvent[];
  onBulkPower: (group: DeviceGroup, on: boolean) => void;
}) {
  const meta = WIDGET_META[kind];

  switch (kind) {
    case "energy":
      return (
        <Header icon={<Zap className="h-4 w-4" />} title={meta.label}>
          <div className="text-3xl font-extrabold text-white">{Math.round(energy?.liveWatts ?? 0)} <span className="text-sm text-slate-400">W now</span></div>
          <div className="text-sm text-slate-400 mt-1">{(energy?.todayKwh ?? 0).toFixed(2)} kWh today</div>
          <Link href="/smarthome/energy" className="inline-block mt-3 text-xs text-cyan-300">View energy →</Link>
        </Header>
      );
    case "budget":
      return (
        <Header icon={<BatteryCharging className="h-4 w-4" />} title={meta.label}>
          <div className="text-3xl font-extrabold text-white">{budgetPct}%</div>
          <div className="text-sm text-slate-400 mt-1">{projectedKwh.toFixed(0)} / {monthlyBudgetKwh} kWh projected · ₹{projectedCost.toLocaleString("en-IN")}</div>
          <Link href="/smarthome/energy-budget" className="inline-block mt-3 text-xs text-cyan-300">Manage budget →</Link>
        </Header>
      );
    case "favorites":
      return (
        <Header icon={<Star className="h-4 w-4" />} title={meta.label}>
          {favorites.length ? (
            <div className="space-y-1.5 mt-1">
              {favorites.slice(0, 4).map((d) => (
                <Link key={d.id} href={`/smarthome/device/${encodeURIComponent(d.id)}`} className="block rounded-lg bg-black/20 px-3 py-1.5 text-sm text-slate-200 truncate">{d.name || d.id}</Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 mt-1">Star devices to pin them here.</p>
          )}
        </Header>
      );
    case "scenes":
      return (
        <Header icon={<Sparkles className="h-4 w-4" />} title={meta.label}>
          {favScenes.length ? (
            <div className="grid grid-cols-2 gap-2 mt-1">
              {favScenes.map((s) => (
                <button key={s.id} onClick={() => controlPlane.activateScene(s.id)} className="rounded-lg bg-black/20 px-3 py-2 text-left text-sm text-slate-200 truncate">{s.icon} {s.name}</button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 mt-1">Favorite scenes become quick actions.</p>
          )}
        </Header>
      );
    case "security": {
      const locked = security.filter((d) => (d.type === "smart-lock" || d.type === "facedoor") && (d.state as { locked?: boolean }).locked).length;
      return (
        <Header icon={<ShieldCheck className="h-4 w-4" />} title={meta.label}>
          <div className="text-3xl font-extrabold text-white">{alerts.length}</div>
          <div className="text-sm text-slate-400 mt-1">active alert{alerts.length === 1 ? "" : "s"} · {locked} locked</div>
          <Link href="/smarthome/security" className="inline-block mt-3 text-xs text-cyan-300">Open security center →</Link>
        </Header>
      );
    }
    case "diagnostics":
      return (
        <Header icon={<Stethoscope className="h-4 w-4" />} title={meta.label}>
          <div className="text-3xl font-extrabold text-white">{needsAttention}</div>
          <div className="text-sm text-slate-400 mt-1">device{needsAttention === 1 ? "" : "s"} need attention</div>
          <Link href="/smarthome/diagnostics" className="inline-block mt-3 text-xs text-cyan-300">Run diagnostics →</Link>
        </Header>
      );
    case "groups":
      return (
        <Header icon={<Layers className="h-4 w-4" />} title={meta.label}>
          {groups.length ? (
            <div className="space-y-2 mt-1">
              {groups.slice(0, 2).map((g) => (
                <div key={g.id} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
                  <span className="text-sm text-slate-200 truncate">{g.icon} {g.name}</span>
                  <div className="flex gap-1">
                    <button onClick={() => onBulkPower(g, true)} className="text-[10px] rounded bg-white/10 px-2 py-1 text-white">ON</button>
                    <button onClick={() => onBulkPower(g, false)} className="text-[10px] rounded bg-white/5 px-2 py-1 text-slate-300">OFF</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 mt-1">Create a group to control several devices at once.</p>
          )}
          <Link href="/smarthome/groups" className="inline-block mt-3 text-xs text-cyan-300">Manage groups →</Link>
        </Header>
      );
    case "recipes":
      return (
        <Header icon={<Sparkles className="h-4 w-4" />} title={meta.label}>
          <p className="text-sm text-slate-400 mt-1">{RECIPES[0]?.title}</p>
          <Link href="/smarthome/recipes" className="inline-block mt-3 text-xs text-cyan-300">Browse recipes →</Link>
        </Header>
      );
    case "activity":
      return (
        <Header icon={<LayoutGrid className="h-4 w-4" />} title={meta.label}>
          {events.length ? (
            <div className="grid sm:grid-cols-2 gap-2 mt-1">
              {events.slice(0, 6).map((e) => (
                <div key={e.id} className="rounded-lg bg-black/20 px-3 py-2 text-sm">
                  <div className="text-slate-200 truncate">{e.title}</div>
                  <div className="text-xs text-slate-500 truncate">{e.body}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 mt-1">No recent activity.</p>
          )}
        </Header>
      );
    case "weather":
      return (
        <Header icon={<Zap className="h-4 w-4" />} title={meta.label}>
          <div className="mt-1 -mx-1"><WeatherCard className="cc-weather-embed" /></div>
        </Header>
      );
    default:
      return null;
  }
}

function Header({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-slate-300 text-sm font-semibold">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}
