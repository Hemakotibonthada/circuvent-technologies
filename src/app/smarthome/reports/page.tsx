"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import { listConfigs, saveConfig, deleteConfig, devicesToCsv, eventsToCsv, downloadCsv, type SavedReportConfig } from "@/lib/smarthome-reports";
import { Card, Toggle } from "../ui";

export default function ReportsPage() {
  const [configs, setConfigs] = useState<SavedReportConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [includeDevices, setIncludeDevices] = useState(true);
  const [includeEvents, setIncludeEvents] = useState(true);
  const [includeEnergy, setIncludeEnergy] = useState(false);

  useEffect(() => {
    setConfigs(listConfigs());
    setLoading(false);
  }, []);

  const exportNow = async () => {
    setBusy(true);
    if (includeDevices) {
      const r = await controlPlane.devices();
      if (r.ok) downloadCsv("devices.csv", devicesToCsv(r.data.devices ?? []));
    }
    if (includeEvents) {
      const r = await controlPlane.events(500);
      if (r.ok) downloadCsv("events.csv", eventsToCsv(r.data.events ?? []));
    }
    if (includeEnergy) {
      const r = await controlPlane.energySummary();
      if (r.ok) {
        const rows = r.data.byDevice.map((d) => `${d.id},${d.name},${d.type},${d.watts}`).join("\n");
        downloadCsv("energy.csv", `id,name,type,watts\n${rows}`);
      }
    }
    setBusy(false);
  };

  const save = () => {
    if (!name.trim()) return;
    saveConfig({ name, includeDevices, includeEvents, includeEnergy });
    setConfigs(listConfigs());
    setName("");
  };

  const remove = (id: string) => {
    deleteConfig(id);
    setConfigs(listConfigs());
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
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><FileText className="h-6 w-6" /> Data export & reports</h1>
        <p className="text-sm text-slate-400 mt-1">Download your device, event and energy data as CSV, any time.</p>
      </div>

      <Card className="p-5 mb-4">
        <h2 className="font-bold text-white mb-4">Build an export</h2>
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3"><span className="text-sm text-slate-200">Devices</span><Toggle checked={includeDevices} onChange={setIncludeDevices} /></div>
          <div className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3"><span className="text-sm text-slate-200">Activity events</span><Toggle checked={includeEvents} onChange={setIncludeEvents} /></div>
          <div className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3"><span className="text-sm text-slate-200">Energy by device</span><Toggle checked={includeEnergy} onChange={setIncludeEnergy} /></div>
        </div>
        <button onClick={exportNow} disabled={busy} className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export now
        </button>
      </Card>

      <Card className="p-5">
        <h2 className="font-bold text-white mb-4">Saved report configs</h2>
        <div className="flex gap-2 mb-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Config name (e.g. Weekly export)" className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none" />
          <button onClick={save} className="rounded-xl px-4 py-2.5 font-semibold text-slate-200 bg-white/5 border border-white/10">Save</button>
        </div>
        <div className="space-y-2">
          {configs.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3">
              <div>
                <div className="text-sm text-white">{c.name}</div>
                <div className="text-xs text-slate-500">
                  {[c.includeDevices && "devices", c.includeEvents && "events", c.includeEnergy && "energy"].filter(Boolean).join(", ")}
                </div>
              </div>
              <button onClick={() => remove(c.id)} className="text-xs text-red-400">Remove</button>
            </div>
          ))}
          {configs.length === 0 && <p className="text-sm text-slate-500">No saved configs yet.</p>}
        </div>
      </Card>
    </div>
  );
}
