"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Download, Loader2, Upload } from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import { listHistory, recordBackup, downloadJson, type BackupBundle, type BackupRecord } from "@/lib/smarthome-backup";
import { Card } from "../ui";

export default function BackupPage() {
  const [history, setHistory] = useState<BackupRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHistory(listHistory());
  }, []);

  const exportBackup = async () => {
    setBusy(true);
    const [rooms, scenes, automations] = await Promise.all([controlPlane.rooms(), controlPlane.scenes(), controlPlane.automations()]);
    const bundle: BackupBundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      rooms: (rooms.ok ? rooms.data.rooms : []).map((r) => ({ name: r.name, icon: r.icon })),
      scenes: (scenes.ok ? scenes.data.scenes : []).map((s) => ({ name: s.name, icon: s.icon, actions: s.actions })),
      automations: (automations.ok ? automations.data.automations : []).map((a) => ({ name: a.name, enabled: a.enabled, trigger: a.trigger, action: a.action })),
    };
    downloadJson(`circuvent-backup-${Date.now()}.json`, bundle);
    recordBackup({ roomsCount: bundle.rooms.length, scenesCount: bundle.scenes.length, automationsCount: bundle.automations.length });
    setHistory(listHistory());
    setBusy(false);
  };

  const restoreFile = (file: File) => {
    setBusy(true);
    setMessage("");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const bundle = JSON.parse(String(reader.result || "{}")) as BackupBundle;
        let created = 0;
        for (const r of bundle.rooms || []) {
          const res = await controlPlane.createRoom(r.name, r.icon);
          if (res.ok) created++;
        }
        for (const s of bundle.scenes || []) {
          const res = await controlPlane.createScene({ name: s.name, icon: s.icon, actions: s.actions });
          if (res.ok) created++;
        }
        for (const a of bundle.automations || []) {
          const res = await controlPlane.createAutomation({ name: a.name, enabled: a.enabled, trigger: a.trigger, action: a.action });
          if (res.ok) created++;
        }
        setMessage(`Restored ${created} item(s) from backup.`);
      } catch {
        setMessage("Could not read that backup file.");
      }
      setBusy(false);
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Archive className="h-6 w-6" /> Backup & restore</h1>
        <p className="text-sm text-slate-400 mt-1">Export your rooms, scenes and automations as a portable JSON file — and restore them any time.</p>
      </div>

      <Card className="p-5 mb-4">
        <div className="flex flex-wrap gap-3">
          <button onClick={exportBackup} disabled={busy} className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white disabled:opacity-50" style={{ background: "var(--cv-gradient)" }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export backup
          </button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && restoreFile(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-slate-200 bg-white/5 border border-white/10">
            <Upload className="h-4 w-4" /> Restore from file
          </button>
        </div>
        {message && <p className="text-sm text-cyan-300 mt-3">{message}</p>}
      </Card>

      <Card className="p-5">
        <h2 className="font-bold text-white mb-4">Backup history</h2>
        <div className="space-y-2">
          {history.map((h) => (
            <div key={h.id} className="flex justify-between text-sm rounded-xl bg-black/20 px-4 py-2.5">
              <span className="text-slate-300">{h.roomsCount} rooms · {h.scenesCount} scenes · {h.automationsCount} automations</span>
              <span className="text-slate-500 text-xs">{new Date(h.at).toLocaleString()}</span>
            </div>
          ))}
          {history.length === 0 && <p className="text-sm text-slate-500">No backups taken yet.</p>}
        </div>
      </Card>
    </div>
  );
}
