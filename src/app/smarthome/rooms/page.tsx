"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { controlPlane, type Device, type Room } from "@/lib/control-plane";
import { Toggle } from "../ui";

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏠");

  const load = useCallback(async () => {
    const [r, d] = await Promise.all([controlPlane.rooms(), controlPlane.devices()]);
    if (r.ok) setRooms(r.data.rooms ?? []);
    if (d.ok) setDevices(d.data.devices ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const current = useMemo(() => rooms.find((r) => r.name === selected) ?? rooms[0], [rooms, selected]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const r = await controlPlane.createRoom(name.trim(), icon.trim() || "🏠");
    if (r.ok) {
      setName("");
      setIcon("🏠");
      await load();
      setSelected(r.data.room.name);
    }
  };

  const rename = async (room: Room) => {
    if (room.id == null) return;
    const next = prompt("Room name", room.name)?.trim();
    if (!next) return;
    await controlPlane.updateRoom(room.id, { name: next, icon: room.icon });
    setSelected(next);
    load();
  };

  const remove = async (room: Room) => {
    if (room.id == null || !confirm(`Delete room "${room.name}"? Devices will be unassigned.`)) return;
    await controlPlane.deleteRoom(room.id);
    setSelected(null);
    load();
  };

  const assign = async (device: Device, on: boolean) => {
    const room = on ? current?.name : "";
    setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, room } : d)));
    await controlPlane.patchDevice(device.id, { room });
    load();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white">Rooms</h1>
        <p className="text-sm text-slate-400 mt-1">Group devices by room and assign them quickly.</p>
      </div>

      <form onSubmit={create} className="rounded-2xl cv-card p-4 mb-5 grid gap-3 sm:grid-cols-[80px_1fr_auto]">
        <input className="cv-input text-center" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} aria-label="Room icon" />
        <input className="cv-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Living room" />
        <button className="rounded-xl px-4 py-2.5 font-semibold text-white cv-gradient flex items-center justify-center gap-2">
          <Plus className="h-4 w-4" /> Create room
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-24 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            {rooms.map((r) => (
              <button
                key={`${r.id}-${r.name}`}
                onClick={() => setSelected(r.name)}
                className={`w-full rounded-2xl border p-4 text-left transition ${current?.name === r.name ? "border-cyan-400/70 bg-white/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{r.icon || "🏠"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white truncate">{r.name || "Unassigned"}</div>
                    <div className="text-xs text-slate-500">{devices.filter((d) => (d.room || "") === r.name).length || r.count} devices</div>
                  </div>
                  {r.id != null && (
                    <span className="flex gap-1">
                      <span onClick={(e) => { e.stopPropagation(); rename(r); }} className="rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/10">Edit</span>
                      <span onClick={(e) => { e.stopPropagation(); remove(r); }} className="rounded-lg p-1 text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></span>
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-2xl cv-card p-5">
            <h2 className="font-bold text-white">{current?.icon} {current?.name || "Select a room"}</h2>
            <p className="text-sm text-slate-400 mt-1 mb-4">Toggle devices that belong in this room.</p>
            <div className="space-y-2">
              {devices.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3">
                  <div>
                    <div className="font-semibold text-white">{d.name || d.id}</div>
                    <div className="text-xs text-slate-500">{d.room || "Unassigned"}</div>
                  </div>
                  <Toggle checked={!!current && (d.room || "") === current.name} onChange={(v) => assign(d, v)} label={`Assign ${d.name}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
