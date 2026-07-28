"use client";

import { useCallback, useEffect, useState } from "react";
import { Layers, Loader2, Plus, Power, Trash2, X } from "lucide-react";
import { controlPlane, type Device } from "@/lib/control-plane";
import { listGroups, createGroup, deleteGroup, type DeviceGroup } from "@/lib/smarthome-groups";
import { useOptimisticCommands } from "@/lib/smarthome-realtime";
import { masterPower } from "@/lib/smarthome-command-map";
import { useConsole } from "../ConsoleProvider";
import { deviceMeta } from "../DeviceControls";
import { Card } from "../ui";

const ICONS = ["💡", "🔌", "🚪", "🌡️", "🛡️", "🌿", "🏠"];

export default function GroupsPage() {
  const { subscribe } = useConsole();
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const cmd = useOptimisticCommands(devices);

  const load = useCallback(async () => {
    const r = await controlPlane.devices();
    if (r.ok) setDevices(r.data.devices ?? []);
    setGroups(listGroups());
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

  const toggleDevicePicked = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = () => {
    if (!name.trim() || picked.size === 0) return;
    createGroup(name.trim(), icon, Array.from(picked));
    setShowForm(false);
    setName("");
    setPicked(new Set());
    setGroups(listGroups());
  };

  const remove = (id: string) => {
    if (!confirm("Delete this group?")) return;
    deleteGroup(id);
    setGroups(listGroups());
  };

  const bulkPower = async (group: DeviceGroup, on: boolean) => {
    setBusyGroup(group.id);
    // Each device gets the command shape its firmware actually parses — a bare
    // {power} is a no-op on touchboards and only hits relay 1 on a home-hub.
    // Sending through `cmd.send` also projects the expected state immediately,
    // so every tile in the group flips on the tap frame.
    await Promise.all(
      group.deviceIds.map((id) => {
        const dev = devices.find((d) => d.id === id);
        if (!dev) return controlPlane.command(id, { action: "set", power: on });
        const mp = masterPower(dev);
        return cmd.send(dev, mp ? mp.cmd(on) : { power: on });
      })
    );
    setBusyGroup(null);
  };

  const deviceName = (id: string) => devices.find((d) => d.id === id)?.name || id;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Layers className="h-6 w-6" /> Device groups</h1>
          <p className="text-sm text-slate-400 mt-1">Organize devices and control several at once.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white" style={{ background: "var(--cv-gradient)" }}>
          <Plus className="h-4 w-4" /> New group
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-24 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-16 text-center px-6">
          <Layers className="mx-auto h-8 w-8 text-slate-500" />
          <p className="text-white font-bold mt-3">No groups yet</p>
          <p className="text-slate-400 text-sm mt-1">Group devices like &ldquo;Downstairs lights&rdquo; to control them together.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.id} className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{g.icon}</span>
                  <span className="font-bold text-white">{g.name}</span>
                </div>
                <button onClick={() => remove(g.id)} className="text-slate-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {g.deviceIds.map((id) => (
                  <span key={id} className="text-xs rounded-lg bg-black/20 px-2 py-1 text-slate-300">{deviceName(id)}</span>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => bulkPower(g, true)} disabled={busyGroup === g.id} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold text-white" style={{ background: "var(--cv-gradient)" }}>
                  {busyGroup === g.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} All on
                </button>
                <button onClick={() => bulkPower(g, false)} disabled={busyGroup === g.id} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold text-slate-200 bg-white/5 border border-white/10">
                  <Power className="h-4 w-4" /> All off
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0f1629] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">New group</h2>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3" />
            <div className="flex flex-wrap gap-2 mb-4">
              {ICONS.map((i) => (
                <button key={i} onClick={() => setIcon(i)} className={`h-9 w-9 rounded-lg text-lg ${icon === i ? "bg-white/15" : "bg-white/5"}`}>{i}</button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mb-2">Select devices:</p>
            <div className="space-y-1.5 mb-4">
              {devices.map((d) => {
                const meta = deviceMeta(d.type);
                return (
                  <label key={d.id} className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-sm text-slate-200">
                    <input type="checkbox" checked={picked.has(d.id)} onChange={() => toggleDevicePicked(d.id)} />
                    {d.name || d.id} <span className="text-xs text-slate-500">({meta.label})</span>
                  </label>
                );
              })}
              {devices.length === 0 && <p className="text-xs text-slate-500">No devices yet.</p>}
            </div>
            <button onClick={save} className="w-full rounded-xl py-2.5 font-semibold text-white" style={{ background: "var(--cv-gradient)" }}>Create group</button>
          </div>
        </div>
      )}
    </div>
  );
}
