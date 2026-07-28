"use client";

import { useCallback, useEffect, useState } from "react";
import { Building, Loader2, Plus, Trash2, X } from "lucide-react";
import { controlPlane, type Room } from "@/lib/control-plane";
import { listProperties, createProperty, deleteProperty, getActivePropertyId, setActivePropertyId, type Property } from "@/lib/smarthome-properties";
import { Card } from "../ui";

export default function PropertiesPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const r = await controlPlane.rooms();
    if (r.ok) setRooms(r.data.rooms ?? []);
    setProperties(listProperties());
    setActive(getActivePropertyId());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRoom = (roomName: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(roomName)) next.delete(roomName);
      else next.add(roomName);
      return next;
    });
  };

  const save = () => {
    if (!name.trim()) return;
    createProperty(name.trim(), address.trim(), Array.from(picked));
    setShowForm(false);
    setName("");
    setAddress("");
    setPicked(new Set());
    setProperties(listProperties());
  };

  const remove = (id: string) => {
    deleteProperty(id);
    setProperties(listProperties());
  };

  const selectActive = (id: string | null) => {
    setActivePropertyId(id);
    setActive(id);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Building className="h-6 w-6" /> Properties</h1>
          <p className="text-sm text-slate-400 mt-1">Manage more than one home or site by grouping rooms together.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white" style={{ background: "var(--cv-gradient)" }}>
          <Plus className="h-4 w-4" /> New property
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <button onClick={() => selectActive(null)} className={`text-left rounded-2xl p-5 border transition ${active === null ? "border-cyan-400/60 bg-white/10" : "border-white/10 bg-black/10"}`}>
          <div className="font-bold text-white">All properties</div>
          <div className="text-xs text-slate-500 mt-1">No filtering — show everything.</div>
        </button>
        {properties.map((p) => (
          <Card key={p.id} className={`p-5 ${active === p.id ? "ring-1 ring-cyan-400/50" : ""}`}>
            <div className="flex items-center justify-between">
              <button onClick={() => selectActive(p.id)} className="text-left">
                <div className="font-bold text-white">{p.name}</div>
                {p.address && <div className="text-xs text-slate-500">{p.address}</div>}
              </button>
              <button onClick={() => remove(p.id)} className="text-slate-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {p.roomNames.map((r) => <span key={r} className="text-xs rounded-lg bg-black/20 px-2 py-1 text-slate-300">{r}</span>)}
              {p.roomNames.length === 0 && <span className="text-xs text-slate-500">No rooms assigned</span>}
            </div>
          </Card>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1629] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">New property</h2>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Property name (e.g. Beach House)" className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3" />
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address (optional)" className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3" />
            <p className="text-xs text-slate-400 mb-2">Assign rooms:</p>
            <div className="space-y-1.5 mb-4 max-h-48 overflow-y-auto">
              {rooms.map((r) => (
                <label key={r.name} className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-sm text-slate-200">
                  <input type="checkbox" checked={picked.has(r.name)} onChange={() => toggleRoom(r.name)} />
                  {r.icon} {r.name}
                </label>
              ))}
              {rooms.length === 0 && <p className="text-xs text-slate-500">No rooms yet.</p>}
            </div>
            <button onClick={save} className="w-full rounded-xl py-2.5 font-semibold text-white" style={{ background: "var(--cv-gradient)" }}>Create property</button>
          </div>
        </div>
      )}
    </div>
  );
}
