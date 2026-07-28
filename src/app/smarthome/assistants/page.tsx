"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Mic, Plus, Trash2 } from "lucide-react";
import { CONTROL_PLANE_URL, controlPlane, type Scene } from "@/lib/control-plane";
import { listAliases, addAlias, deleteAlias, type VoiceAlias } from "@/lib/smarthome-assistants";
import { Card } from "../ui";

export default function AssistantsPage() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [aliases, setAliases] = useState<VoiceAlias[]>([]);
  const [phrase, setPhrase] = useState("");
  const [sceneId, setSceneId] = useState<number | "">("");

  const load = useCallback(async () => {
    const r = await controlPlane.scenes();
    if (r.ok) setScenes(r.data.scenes ?? []);
    setAliases(listAliases());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = () => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!phrase.trim() || !scene) return;
    addAlias(phrase.trim(), scene.id, scene.name);
    setAliases(listAliases());
    setPhrase("");
  };

  const remove = (id: string) => {
    deleteAlias(id);
    setAliases(listAliases());
  };

  const copy = (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => undefined);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Mic className="h-6 w-6" /> Voice & assistants</h1>
        <p className="text-sm text-slate-400 mt-1">Link Google Home / Alexa, and keep a cheat-sheet of your favorite phrases.</p>
      </div>

      <Card className="p-5 mb-4">
        <h2 className="font-bold text-white mb-3">Link an assistant</h2>
        <p className="text-sm text-slate-400 mb-3">Circuvent publishes one Google Home Action and one Alexa skill — link your account from within the Google Home or Amazon Alexa app, or start here:</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-2.5">
            <span className="text-sm font-mono text-slate-300 truncate">{CONTROL_PLANE_URL}/smarthome/google</span>
            <button onClick={() => copy(`${CONTROL_PLANE_URL}/smarthome/google`)} className="text-slate-400 hover:text-white"><Copy className="h-4 w-4" /></button>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-2.5">
            <span className="text-sm font-mono text-slate-300 truncate">{CONTROL_PLANE_URL}/smarthome/alexa</span>
            <button onClick={() => copy(`${CONTROL_PLANE_URL}/smarthome/alexa`)} className="text-slate-400 hover:text-white"><Copy className="h-4 w-4" /></button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-bold text-white mb-3">Voice phrase cheat-sheet</h2>
        <p className="text-xs text-slate-500 mb-3">Purely a memory aid — map a phrase you like to one of your scenes.</p>
        <div className="flex flex-wrap gap-2 mb-4">
          <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder='e.g. "Good night"' className="flex-1 min-w-[140px] bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none" />
          <select value={sceneId} onChange={(e) => setSceneId(e.target.value ? Number(e.target.value) : "")} className="bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none">
            <option value="">Scene…</option>
            {scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={add} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 font-semibold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        <div className="space-y-2">
          {aliases.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-2.5">
              <span className="text-sm text-slate-200">&ldquo;{a.phrase}&rdquo; → {a.sceneName}</span>
              <button onClick={() => remove(a.id)} className="text-slate-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {aliases.length === 0 && <p className="text-sm text-slate-500">No phrases saved yet.</p>}
        </div>
      </Card>
    </div>
  );
}
