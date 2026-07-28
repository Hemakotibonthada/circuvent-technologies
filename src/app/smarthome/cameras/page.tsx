"use client";

import { useEffect, useState } from "react";
import { Camera, Plus, Trash2, Video, X } from "lucide-react";
import { listCameras, addCamera, deleteCamera, type CameraEntry, type CameraKind } from "@/lib/smarthome-cameras";
import { Card } from "../ui";

export default function CamerasPage() {
  const [cameras, setCameras] = useState<CameraEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ name: string; streamUrl: string; kind: CameraKind; roomName: string }>({ name: "", streamUrl: "", kind: "hls", roomName: "" });

  useEffect(() => {
    setCameras(listCameras());
  }, []);

  const save = () => {
    if (!form.name.trim() || !form.streamUrl.trim()) return;
    addCamera(form);
    setCameras(listCameras());
    setShowForm(false);
    setForm({ name: "", streamUrl: "", kind: "hls", roomName: "" });
  };

  const remove = (id: string) => {
    deleteCamera(id);
    setCameras(listCameras());
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Video className="h-6 w-6" /> Cameras</h1>
          <p className="text-sm text-slate-400 mt-1">Register a stream URL for any camera you already own — HLS, MJPEG or a snapshot image.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
          <Plus className="h-4 w-4" /> Add camera
        </button>
      </div>

      {cameras.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-16 text-center px-6">
          <Camera className="mx-auto h-8 w-8 text-slate-500" />
          <p className="text-white font-bold mt-3">No cameras yet</p>
          <p className="text-slate-400 text-sm mt-1">The current Circuvent device line doesn&apos;t include a camera yet — register any existing IP camera&apos;s stream URL here as a placeholder viewer.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {cameras.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-white">{c.name}</span>
                <button onClick={() => remove(c.id)} className="text-slate-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="aspect-video rounded-xl bg-black/40 flex items-center justify-center overflow-hidden">
                {c.kind === "snapshot" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.streamUrl} alt={c.name} className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                ) : c.kind === "hls" ? (
                  <video src={c.streamUrl} className="h-full w-full object-cover" controls muted playsInline />
                ) : (
                  <p className="text-xs text-slate-500 px-4 text-center">MJPEG streams need a &lt;img&gt; proxy — open the stream URL directly for now.</p>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-2">{c.kind.toUpperCase()}{c.roomName ? ` · ${c.roomName}` : ""}</div>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1629] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">Add camera</h2>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Camera name" className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3" />
            <input value={form.streamUrl} onChange={(e) => setForm({ ...form, streamUrl: e.target.value })} placeholder="Stream URL" className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3" />
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CameraKind })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3">
              <option value="hls">HLS video (.m3u8)</option>
              <option value="mjpeg">MJPEG</option>
              <option value="snapshot">Still snapshot (image URL)</option>
            </select>
            <input value={form.roomName} onChange={(e) => setForm({ ...form, roomName: e.target.value })} placeholder="Room (optional)" className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-4" />
            <button onClick={save} className="w-full rounded-xl py-2.5 font-semibold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>Add camera</button>
          </div>
        </div>
      )}
    </div>
  );
}
