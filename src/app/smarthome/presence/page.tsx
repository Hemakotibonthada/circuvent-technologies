"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Play, Plus, Square, Trash2, X } from "lucide-react";
import { controlPlane, type Scene } from "@/lib/control-plane";
import { listZones, createZone, updateZone, deleteZone, haversineMeters, type GeoZone } from "@/lib/smarthome-geofencing";
import { Card } from "../ui";

export default function PresencePage() {
  const [zones, setZones] = useState<GeoZone[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [monitoring, setMonitoring] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ name: string; lat: string; lng: string; radiusMeters: number; sceneOnArriveId?: number; sceneOnLeaveId?: number } | null>(null);
  const watchId = useRef<number | null>(null);

  const load = useCallback(async () => {
    const s = await controlPlane.scenes();
    if (s.ok) setScenes(s.data.scenes ?? []);
    setZones(listZones());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (watchId.current !== null && typeof navigator !== "undefined") navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setForm((prev) => (prev ? { ...prev, lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) } : prev));
    });
  };

  const save = () => {
    if (!form?.name || !form.lat || !form.lng) return;
    createZone({ name: form.name, lat: Number(form.lat), lng: Number(form.lng), radiusMeters: form.radiusMeters, sceneOnArriveId: form.sceneOnArriveId, sceneOnLeaveId: form.sceneOnLeaveId });
    setShowForm(false);
    setForm(null);
    setZones(listZones());
  };

  const remove = (id: string) => {
    deleteZone(id);
    setZones(listZones());
  };

  const toggleMonitoring = () => {
    if (monitoring) {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setMonitoring(false);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition(async (pos) => {
      const current = listZones();
      for (const zone of current) {
        const distance = haversineMeters(pos.coords.latitude, pos.coords.longitude, zone.lat, zone.lng);
        const nowIn = distance <= zone.radiusMeters ? "in" : "out";
        if (zone.lastState !== nowIn) {
          updateZone(zone.id, { lastState: nowIn });
          const sceneId = nowIn === "in" ? zone.sceneOnArriveId : zone.sceneOnLeaveId;
          if (sceneId) await controlPlane.activateScene(sceneId);
          setZones(listZones());
        }
      }
    });
    setMonitoring(true);
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
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><MapPin className="h-6 w-6" /> Geofencing & presence</h1>
          <p className="text-sm text-slate-400 mt-1">Trigger scenes automatically when you arrive or leave.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={toggleMonitoring} className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white" style={{ background: monitoring ? "#ef4444" : "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
            {monitoring ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />} {monitoring ? "Stop monitoring" : "Start monitoring"}
          </button>
          <button onClick={() => { setForm({ name: "", lat: "", lng: "", radiusMeters: 150 }); setShowForm(true); }} className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-slate-200 bg-white/5 border border-white/10">
            <Plus className="h-4 w-4" /> New zone
          </button>
        </div>
      </div>

      {zones.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-16 text-center px-6">
          <MapPin className="mx-auto h-8 w-8 text-slate-500" />
          <p className="text-white font-bold mt-3">No zones yet</p>
          <p className="text-slate-400 text-sm mt-1">Add a "Home" zone so a scene activates automatically on arrival or departure.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {zones.map((z) => (
            <Card key={z.id} className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white">{z.name}</span>
                <button onClick={() => remove(z.id)} className="text-slate-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="text-xs text-slate-500">{z.radiusMeters}m radius · {z.lat.toFixed(4)}, {z.lng.toFixed(4)}</div>
              <div className="text-xs text-slate-500 mt-1">
                Arrive → {scenes.find((s) => s.id === z.sceneOnArriveId)?.name || "none"} · Leave → {scenes.find((s) => s.id === z.sceneOnLeaveId)?.name || "none"}
              </div>
              {z.lastState && (
                <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${z.lastState === "in" ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"}`}>
                  Currently {z.lastState === "in" ? "inside" : "outside"}
                </span>
              )}
            </Card>
          ))}
        </div>
      )}

      {showForm && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1629] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">New zone</h2>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Zone name (e.g. Home)" className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3" />
            <div className="grid grid-cols-2 gap-2 mb-3">
              <input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="Latitude" className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none" />
              <input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="Longitude" className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none" />
            </div>
            <button onClick={useMyLocation} className="text-xs text-cyan-400 mb-3">Use my current location</button>
            <label className="block text-xs text-slate-400 mb-1">Radius (meters)</label>
            <input type="number" value={form.radiusMeters} onChange={(e) => setForm({ ...form, radiusMeters: Number(e.target.value) })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3" />
            <label className="block text-xs text-slate-400 mb-1">On arrive, activate</label>
            <select value={form.sceneOnArriveId ?? ""} onChange={(e) => setForm({ ...form, sceneOnArriveId: e.target.value ? Number(e.target.value) : undefined })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3">
              <option value="">None</option>
              {scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <label className="block text-xs text-slate-400 mb-1">On leave, activate</label>
            <select value={form.sceneOnLeaveId ?? ""} onChange={(e) => setForm({ ...form, sceneOnLeaveId: e.target.value ? Number(e.target.value) : undefined })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-4">
              <option value="">None</option>
              {scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={save} className="w-full rounded-xl py-2.5 font-semibold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>Save zone</button>
          </div>
        </div>
      )}
    </div>
  );
}
