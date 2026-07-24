"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Plus, Loader2, X, ChevronRight, Cpu, Search, Star, Zap, Home, Activity } from "lucide-react";
import { controlPlane, type AppEvent, type Device, type EnergySummary, type Room, type Scene } from "@/lib/control-plane";
import { useConsole } from "./ConsoleProvider";
import { deviceMeta } from "./DeviceControls";

export default function DevicesPage() {
  const { user, subscribe } = useConsole();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [energy, setEnergy] = useState<EnergySummary | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);

  const load = useCallback(async () => {
    const r = await controlPlane.devices();
    if (r.ok) {
      setDevices(r.data.devices ?? []);
      setError(null);
    } else if (r.status === 0) {
      setError("Can't reach the control plane. Check your connection.");
    } else {
      setError("Failed to load devices.");
    }
    const [en, ro, sc, ev] = await Promise.all([
      controlPlane.energySummary(),
      controlPlane.rooms(),
      controlPlane.scenes(),
      controlPlane.events(5),
    ]);
    if (en.ok) setEnergy(en.data);
    if (ro.ok) setRooms(ro.data.rooms ?? []);
    if (sc.ok) setScenes(sc.data.scenes ?? []);
    if (ev.ok) setEvents(ev.data.events ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  // Live merge: update online/state as pushes arrive.
  useEffect(() => {
    return subscribe((u) => {
      setDevices((prev) =>
        prev.map((d) => {
          if (d.id !== u.deviceId) return d;
          if (u.kind === "status") return { ...d, online: !!(u.payload as { online?: boolean }).online };
          if (u.kind === "state") return { ...d, online: true, state: { ...d.state, ...u.payload } };
          return { ...d, online: true };
        })
      );
    });
  }, [subscribe]);

  const filtered = devices.filter((d) => `${d.name} ${d.id} ${d.type} ${d.room ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const favorites = devices.filter((d) => d.favorite);
  const favScenes = scenes.filter((s) => s.favorite).slice(0, 4);

  const patchFavorite = async (device: Device) => {
    setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, favorite: !d.favorite } : d)));
    await controlPlane.patchDevice(device.id, { favorite: !device.favorite });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Home dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            {user?.name ? `Welcome back, ${user.name.split(" ")[0]}. ` : ""}
            {devices.length} {devices.length === 1 ? "device" : "devices"} connected.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white transition"
          style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
        >
          <Plus className="h-4 w-4" /> Add device
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-300 text-sm">{error}</div>
      ) : devices.length === 0 ? (
        <EmptyState onAdd={() => setShowAdd(true)} />
      ) : (
        <>
          <DashboardWidgets energy={energy} favorites={favorites} scenes={favScenes} rooms={rooms} events={events} />
          <div className="mt-6 mb-4 flex items-center gap-3 rounded-2xl cv-card px-4 py-3">
            <Search className="h-5 w-5 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search devices, rooms or types"
              className="w-full bg-transparent text-white outline-none placeholder:text-slate-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((d) => (
              <DeviceCard key={d.id} device={d} onFavorite={() => patchFavorite(d)} />
            ))}
          </div>
        </>
      )}

      {showAdd && (
        <AddDeviceModal
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            setLoading(true);
            load();
          }}
        />
      )}
    </div>
  );
}

function DashboardWidgets({
  energy,
  favorites,
  scenes,
  rooms,
  events,
}: {
  energy: EnergySummary | null;
  favorites: Device[];
  scenes: Scene[];
  rooms: Room[];
  events: AppEvent[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Widget icon={<Zap className="h-5 w-5" />} label="Live power" value={`${Math.round(energy?.liveWatts ?? 0)} W`} />
        <Widget icon={<Activity className="h-5 w-5" />} label="Today" value={`${(energy?.todayKwh ?? 0).toFixed(2)} kWh`} />
        <Widget icon={<Star className="h-5 w-5" />} label="Favorites" value={String(favorites.length)} />
        <Widget icon={<Home className="h-5 w-5" />} label="Rooms" value={String(rooms.length)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Favorites">
          {favorites.length ? favorites.slice(0, 5).map((d) => <Link key={d.id} href={`/console/device/${encodeURIComponent(d.id)}`} className="block rounded-xl bg-black/20 px-3 py-2 text-sm text-slate-200">{d.name || d.id}</Link>) : <EmptyMini text="Star devices to pin them here." />}
        </Panel>
        <Panel title="Scene shortcuts">
          {scenes.length ? scenes.map((s) => <button key={s.id} onClick={() => controlPlane.activateScene(s.id)} className="w-full rounded-xl bg-black/20 px-3 py-2 text-left text-sm text-slate-200">{s.icon} {s.name}</button>) : <EmptyMini text="Favorite scenes become quick actions." />}
        </Panel>
        <Panel title="Recent activity">
          {events.length ? events.map((e) => <div key={e.id} className="rounded-xl bg-black/20 px-3 py-2 text-sm"><div className="text-slate-200">{e.title}</div><div className="text-xs text-slate-500 truncate">{e.body}</div></div>) : <EmptyMini text="No recent alerts." />}
        </Panel>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {rooms.map((r) => (
          <Link key={`${r.id}-${r.name}`} href="/console/rooms" className="shrink-0 rounded-2xl cv-card px-4 py-3 text-sm text-slate-200">
            <span className="mr-2">{r.icon}</span>{r.name}<span className="ml-2 text-slate-500">{r.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Widget({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl cv-card p-4"><div className="text-cyan-300">{icon}</div><div className="mt-3 text-2xl font-extrabold text-white">{value}</div><div className="text-xs uppercase tracking-[0.15em] text-slate-500">{label}</div></div>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-2xl cv-card p-4"><h2 className="font-bold text-white mb-3">{title}</h2><div className="space-y-2">{children}</div></div>;
}

function EmptyMini({ text }: { text: string }) {
  return <div className="text-sm text-slate-500">{text}</div>;
}

function metric(d: Device): string {
  switch (d.type) {
    case "aquaguard":
      return `${Number(d.state.level ?? 0)}%`;
    case "smart-plug":
    case "energy-monitor":
      return `${Number(d.state.watts ?? 0).toFixed(0)} W`;
    case "guardian":
      return d.state.sos ? "SOS" : d.state.armed ? "Armed" : "Disarmed";
    case "motion-sensor":
      return d.state.motion ? "Motion" : d.state.armed ? "Armed" : "Clear";
    case "smart-switch":
      return `${[d.state.power, d.state.power2].filter(Boolean).length}/2 on`;
    case "home-hub":
      return `${[d.state.power, d.state.power2, d.state.power3, d.state.power4].filter(Boolean).length}/4 on`;
    case "agri-starter":
      return d.state.pump ? "Pump on" : "Pump off";
    default:
      return "";
  }
}

function DeviceCard({ device, onFavorite }: { device: Device; onFavorite: () => void }) {
  const meta = deviceMeta(device.type);
  const Icon = meta.icon;
  const m = metric(device);
  return (
    <Link
      href={`/console/device/${encodeURIComponent(device.id)}`}
      className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-white/20 hover:bg-white/[0.05] transition"
    >
      <div className="flex items-start justify-between">
        <div
          className="h-11 w-11 rounded-xl flex items-center justify-center"
          style={{ background: `${meta.accent}1a`, color: meta.accent }}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.preventDefault();
              onFavorite();
            }}
            className="rounded-lg p-1 text-slate-500 hover:text-yellow-300"
            aria-label="Toggle favorite"
          >
            <Star className={`h-4 w-4 ${device.favorite ? "fill-yellow-300 text-yellow-300" : ""}`} />
          </button>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: device.online ? "#22c55e" : "#64748b" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: device.online ? "#22c55e" : "#64748b" }} />
            {device.online ? "Online" : "Offline"}
          </span>
        </div>
      </div>
      <div className="mt-4">
        <div className="font-bold text-white truncate">{device.name || device.id}</div>
        <div className="text-slate-500 text-xs">{meta.label}{device.room ? ` · ${device.room}` : ""}</div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-lg font-extrabold" style={{ color: meta.accent }}>
          {m}
        </span>
        <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-300 transition" />
      </div>
    </Link>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-16 flex flex-col items-center text-center px-6">
      <div className="h-14 w-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
        <Cpu className="h-7 w-7 text-slate-400" />
      </div>
      <h2 className="text-white font-bold text-lg">No devices yet</h2>
      <p className="text-slate-400 text-sm mt-1 max-w-sm">
        Power on a Circuvent device, then add it using the device ID and claim key printed on the label.
      </p>
      <button
        onClick={onAdd}
        className="mt-5 flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white"
        style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
      >
        <Plus className="h-4 w-4" /> Add your first device
      </button>
    </div>
  );
}

function AddDeviceModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [id, setId] = useState("");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await controlPlane.claim(id.trim(), key.trim(), name.trim() || id.trim());
    setBusy(false);
    if (r.ok && r.data?.success) onAdded();
    else setError(r.data?.error || "Could not claim this device. Check the ID and key.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f1629] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-lg">Add a device</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <ModalField label="Device ID">
            <input className="cv-modal-input" value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. hub-a1b2c3" required />
          </ModalField>
          <ModalField label="Claim key">
            <input className="cv-modal-input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Key from the device label" required />
          </ModalField>
          <ModalField label="Name (optional)">
            <input className="cv-modal-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Living Room Hub" />
          </ModalField>
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl py-3 font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Claim device
          </button>
        </form>
      </div>
      <style jsx global>{`
        .cv-modal-input {
          width: 100%;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 12px 14px;
          color: #fff;
          font-size: 15px;
          outline: none;
        }
        .cv-modal-input:focus {
          border-color: rgba(6, 182, 212, 0.5);
        }
        .cv-modal-input::placeholder {
          color: #64748b;
        }
      `}</style>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400 mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
