"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, X, Zap } from "lucide-react";
import { controlPlane, type Device, type Scene } from "@/lib/control-plane";
import { listActions, createAction, deleteAction, type QuickAction } from "@/lib/smarthome-quick-actions";
import { Card } from "../ui";

const ICONS = ["⚡", "💡", "🔒", "🌙", "☀️", "🎬", "🚿", "🔔"];

export default function QuickActionsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [actions, setActions] = useState<QuickAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [firing, setFiring] = useState<string | null>(null);
  const [form, setForm] = useState<{ label: string; icon: string; kind: "scene" | "command"; sceneId: string; deviceId: string; power: boolean } | null>(null);

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([controlPlane.devices(), controlPlane.scenes()]);
    if (d.ok) setDevices(d.data.devices ?? []);
    if (s.ok) setScenes(s.data.scenes ?? []);
    setActions(listActions());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fire = async (a: QuickAction) => {
    setFiring(a.id);
    if (a.target.kind === "scene") await controlPlane.activateScene(a.target.sceneId);
    else await controlPlane.command(a.target.deviceId, a.target.command);
    setFiring(null);
  };

  const save = () => {
    if (!form?.label) return;
    if (form.kind === "scene" && form.sceneId) {
      createAction({ label: form.label, icon: form.icon, target: { kind: "scene", sceneId: Number(form.sceneId) } });
    } else if (form.kind === "command" && form.deviceId) {
      createAction({ label: form.label, icon: form.icon, target: { kind: "command", deviceId: form.deviceId, command: { action: "set", power: form.power } } });
    }
    setForm(null);
    setActions(listActions());
  };

  const remove = (id: string) => {
    deleteAction(id);
    setActions(listActions());
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
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Zap className="h-6 w-6" /> Quick actions</h1>
          <p className="text-sm text-slate-400 mt-1">One-tap shortcuts for the things you do most.</p>
        </div>
        <button onClick={() => setForm({ label: "", icon: ICONS[0], kind: "scene", sceneId: "", deviceId: "", power: true })} className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
          <Plus className="h-4 w-4" /> New shortcut
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {actions.map((a) => (
          <Card key={a.id} className="p-4 relative group">
            <button onClick={() => remove(a.id)} className="absolute top-2 right-2 text-slate-600 hover:text-red-300 opacity-0 group-hover:opacity-100 transition"><Trash2 className="h-3.5 w-3.5" /></button>
            <button onClick={() => fire(a)} disabled={firing === a.id} className="w-full flex flex-col items-center gap-2 py-2">
              <span className="text-3xl">{a.icon}</span>
              <span className="text-sm font-semibold text-white text-center">{firing === a.id ? "…" : a.label}</span>
            </button>
          </Card>
        ))}
        {actions.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-16 text-center px-6">
            <Zap className="mx-auto h-8 w-8 text-slate-500" />
            <p className="text-white font-bold mt-3">No shortcuts yet</p>
          </div>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1629] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">New shortcut</h2>
              <button onClick={() => setForm(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Label" className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3" />
            <div className="flex flex-wrap gap-2 mb-3">
              {ICONS.map((i) => <button key={i} onClick={() => setForm({ ...form, icon: i })} className={`h-9 w-9 rounded-lg text-lg ${form.icon === i ? "bg-white/15" : "bg-white/5"}`}>{i}</button>)}
            </div>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setForm({ ...form, kind: "scene" })} className={`flex-1 rounded-xl py-2 text-sm ${form.kind === "scene" ? "bg-white/15 text-white" : "bg-white/5 text-slate-400"}`}>Activate scene</button>
              <button onClick={() => setForm({ ...form, kind: "command" })} className={`flex-1 rounded-xl py-2 text-sm ${form.kind === "command" ? "bg-white/15 text-white" : "bg-white/5 text-slate-400"}`}>Send command</button>
            </div>
            {form.kind === "scene" ? (
              <select value={form.sceneId} onChange={(e) => setForm({ ...form, sceneId: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-4">
                <option value="">Select a scene…</option>
                {scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (
              <>
                <select value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3">
                  <option value="">Select a device…</option>
                  {devices.map((d) => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}
                </select>
                <div className="flex gap-2 mb-4">
                  <button onClick={() => setForm({ ...form, power: true })} className={`flex-1 rounded-xl py-2 text-sm ${form.power ? "bg-white/15 text-white" : "bg-white/5 text-slate-400"}`}>Turn on</button>
                  <button onClick={() => setForm({ ...form, power: false })} className={`flex-1 rounded-xl py-2 text-sm ${!form.power ? "bg-white/15 text-white" : "bg-white/5 text-slate-400"}`}>Turn off</button>
                </div>
              </>
            )}
            <button onClick={save} className="w-full rounded-xl py-2.5 font-semibold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>Save shortcut</button>
          </div>
        </div>
      )}
    </div>
  );
}
