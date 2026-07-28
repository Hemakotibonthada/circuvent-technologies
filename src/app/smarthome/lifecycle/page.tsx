"use client";

import { useCallback, useEffect, useState } from "react";
import { Battery, Loader2, Plus, Trash2, X } from "lucide-react";
import { controlPlane, type Device } from "@/lib/control-plane";
import { listEntries, setEntry, removeEntry, computeStatus, type LifecycleEntry } from "@/lib/smarthome-lifecycle";
import { Card } from "../ui";

const STATUS_COLOR: Record<string, string> = { new: "#22c55e", aging: "#f59e0b", "replace-soon": "#ef4444", overdue: "#ef4444" };
const STATUS_LABEL: Record<string, string> = { new: "Like new", aging: "Aging", "replace-soon": "Replace soon", overdue: "Overdue" };

export default function LifecyclePage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [entries, setEntries] = useState<LifecycleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ deviceId: string; purchaseDate: string; years: number } | null>(null);

  const load = useCallback(async () => {
    const r = await controlPlane.devices();
    if (r.ok) setDevices(r.data.devices ?? []);
    setEntries(listEntries());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = () => {
    if (!form?.deviceId || !form.purchaseDate) return;
    setEntry(form.deviceId, form.purchaseDate, form.years);
    setEntries(listEntries());
    setForm(null);
  };

  const remove = (deviceId: string) => {
    removeEntry(deviceId);
    setEntries(listEntries());
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
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Battery className="h-6 w-6" /> Device lifecycle</h1>
          <p className="text-sm text-slate-400 mt-1">Track age vs expected lifespan so nothing fails without warning.</p>
        </div>
        <button onClick={() => setForm({ deviceId: "", purchaseDate: new Date().toISOString().slice(0, 10), years: 5 })} className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white" style={{ background: "var(--cv-gradient)" }}>
          <Plus className="h-4 w-4" /> Track a device
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {entries.map((e) => {
          const status = computeStatus(e);
          const device = devices.find((d) => d.id === e.deviceId);
          return (
            <Card key={e.deviceId} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white">{device?.name || e.deviceId}</span>
                <button onClick={() => remove(e.deviceId)} className="text-slate-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="h-2 rounded-full bg-black/30 overflow-hidden mb-2">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, status.pctUsed)}%`, background: STATUS_COLOR[status.status] }} />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{status.ageYears}y old of {e.expectedLifespanYears}y</span>
                <span style={{ color: STATUS_COLOR[status.status] }}>{STATUS_LABEL[status.status]}</span>
              </div>
            </Card>
          );
        })}
        {entries.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-16 text-center px-6">
            <Battery className="mx-auto h-8 w-8 text-slate-500" />
            <p className="text-white font-bold mt-3">No devices tracked yet</p>
          </div>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1629] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">Track a device</h2>
              <button onClick={() => setForm(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <select value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3">
              <option value="">Select a device…</option>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}
            </select>
            <label className="block text-xs text-slate-400 mb-1">Purchase date</label>
            <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3" />
            <label className="block text-xs text-slate-400 mb-1">Expected lifespan (years)</label>
            <input type="number" value={form.years} onChange={(e) => setForm({ ...form, years: Number(e.target.value) })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-4" />
            <button onClick={save} className="w-full rounded-xl py-2.5 font-semibold text-white" style={{ background: "var(--cv-gradient)" }}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
