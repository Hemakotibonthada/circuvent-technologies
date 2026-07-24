"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Play, Plus, Star, Trash2, X } from "lucide-react";
import { controlPlane, type Device, type Scene, type SceneAction } from "@/lib/control-plane";
import { primaryPowerField } from "../DeviceControls";
import { Toggle } from "../ui";

type Choice = "skip" | "on" | "off";

export default function ScenesPage() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Scene | null | "new">(null);

  const load = useCallback(async () => {
    const [s, d] = await Promise.all([controlPlane.scenes(), controlPlane.devices()]);
    if (s.ok) setScenes(s.data.scenes ?? []);
    if (d.ok) setDevices(d.data.devices ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activate = async (scene: Scene) => {
    await controlPlane.activateScene(scene.id);
  };

  const remove = async (scene: Scene) => {
    if (!confirm(`Delete scene "${scene.name}"?`)) return;
    setScenes((prev) => prev.filter((s) => s.id !== scene.id));
    await controlPlane.deleteScene(scene.id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Scenes</h1>
          <p className="text-sm text-slate-400 mt-1">One tap routines built from each device’s primary power field.</p>
        </div>
        <button onClick={() => setEditing("new")} className="rounded-xl px-4 py-2.5 font-semibold text-white cv-gradient inline-flex gap-2">
          <Plus className="h-4 w-4" /> New scene
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-24 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : scenes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-16 text-center">
          <div className="text-4xl">🎬</div>
          <div className="mt-3 font-bold text-white">No scenes yet</div>
          <button onClick={() => setEditing("new")} className="mt-4 rounded-xl px-4 py-2.5 font-semibold text-white cv-gradient">Create your first scene</button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scenes.map((s) => (
            <div key={s.id} className="rounded-2xl cv-card p-5">
              <div className="flex items-start justify-between">
                <div className="text-4xl">{s.icon || "🎬"}</div>
                {s.favorite && <Star className="h-5 w-5 fill-yellow-300 text-yellow-300" />}
              </div>
              <div className="mt-4 font-bold text-white">{s.name}</div>
              <div className="text-xs text-slate-500">{s.actions.length} actions</div>
              <div className="mt-5 flex gap-2">
                <button onClick={() => activate(s)} className="flex-1 rounded-xl px-3 py-2 font-semibold text-white cv-gradient inline-flex justify-center gap-2">
                  <Play className="h-4 w-4" /> Activate
                </button>
                <button onClick={() => setEditing(s)} className="rounded-xl border border-white/10 px-3 py-2 text-slate-300">Edit</button>
                <button onClick={() => remove(s)} className="rounded-xl border border-red-500/20 px-3 py-2 text-red-300"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <SceneForm scene={editing === "new" ? null : editing} devices={devices} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function SceneForm({ scene, devices, onClose, onSaved }: { scene: Scene | null; devices: Device[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(scene?.name ?? "");
  const [icon, setIcon] = useState(scene?.icon ?? "🎬");
  const [favorite, setFavorite] = useState(scene?.favorite ?? false);
  const [busy, setBusy] = useState(false);
  const initial = useMemo(() => {
    const m = new Map<string, Choice>();
    scene?.actions.forEach((a) => {
      const field = Object.keys(a.command).find((k) => k !== "action");
      const value = field ? a.command[field] : undefined;
      if (typeof value === "boolean") m.set(a.deviceId, value ? "on" : "off");
    });
    return m;
  }, [scene]);
  const [choices, setChoices] = useState<Map<string, Choice>>(initial);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const actions: SceneAction[] = devices.flatMap((d) => {
      const c = choices.get(d.id) ?? "skip";
      if (c === "skip") return [];
      return [{ deviceId: d.id, command: { action: "set", [primaryPowerField(d.type)]: c === "on" } }];
    });
    setBusy(true);
    const body = { name: name.trim() || "Scene", icon: icon.trim() || "🎬", favorite, actions };
    const r = scene ? await controlPlane.updateScene(scene.id, body) : await controlPlane.createScene(body);
    setBusy(false);
    if (r.ok) onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8 overflow-y-auto">
      <form onSubmit={save} className="w-full max-w-xl rounded-2xl cv-card p-6 my-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white">{scene ? "Edit scene" : "New scene"}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-3">
          <input className="cv-input text-center" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} />
          <input className="cv-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Movie night" />
        </div>
        <label className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3 text-slate-200">
          Favorite shortcut <Toggle checked={favorite} onChange={setFavorite} label="Favorite scene" />
        </label>
        <div className="mt-5 space-y-2">
          {devices.map((d) => {
            const choice = choices.get(d.id) ?? "skip";
            return (
              <div key={d.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="font-semibold text-white">{d.name || d.id}</div>
                <div className="mt-2 inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
                  {(["skip", "on", "off"] as Choice[]).map((c) => (
                    <button key={c} type="button" onClick={() => setChoices((prev) => new Map(prev).set(d.id, c))} className={`rounded-lg px-3 py-1.5 text-sm capitalize ${choice === c ? "text-white cv-gradient" : "text-slate-400"}`}>{c}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <button disabled={busy} className="mt-5 w-full rounded-xl py-3 font-semibold text-white cv-gradient disabled:opacity-60">
          {busy ? "Saving…" : "Save scene"}
        </button>
      </form>
    </div>
  );
}
