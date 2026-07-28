"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Loader2, Plus, Trash2, Wrench, X } from "lucide-react";
import { controlPlane, type Device } from "@/lib/control-plane";
import { listTasks, createTask, markDone, deleteTask, computeNextDue, type MaintenanceTask } from "@/lib/smarthome-maintenance";
import { Card } from "../ui";

export default function MaintenancePage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ title: string; deviceId: string; intervalDays: number } | null>(null);

  const load = useCallback(async () => {
    const r = await controlPlane.devices();
    if (r.ok) setDevices(r.data.devices ?? []);
    setTasks(listTasks());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = () => {
    if (!form?.title || !form.intervalDays) return;
    createTask({ title: form.title, deviceId: form.deviceId || undefined, intervalDays: form.intervalDays });
    setForm(null);
    setTasks(listTasks());
  };

  const done = (id: string) => {
    markDone(id);
    setTasks(listTasks());
  };

  const remove = (id: string) => {
    deleteTask(id);
    setTasks(listTasks());
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
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Wrench className="h-6 w-6" /> Maintenance reminders</h1>
          <p className="text-sm text-slate-400 mt-1">Recurring upkeep — filters, batteries, cleaning — never forgotten.</p>
        </div>
        <button onClick={() => setForm({ title: "", deviceId: "", intervalDays: 90 })} className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
          <Plus className="h-4 w-4" /> New reminder
        </button>
      </div>

      <div className="space-y-3">
        {tasks.map((t) => {
          const due = computeNextDue(t);
          return (
            <Card key={t.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="font-bold text-white">{t.title}</div>
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {due.overdue ? <span className="text-red-400">Overdue by {Math.abs(due.daysLeft)}d</span> : <span>Due in {due.daysLeft}d</span>}
                  {t.deviceId && ` · ${devices.find((d) => d.id === t.deviceId)?.name || t.deviceId}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => done(t.id)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark done
                </button>
                <button onClick={() => remove(t.id)} className="text-slate-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
              </div>
            </Card>
          );
        })}
        {tasks.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-16 text-center px-6">
            <Wrench className="mx-auto h-8 w-8 text-slate-500" />
            <p className="text-white font-bold mt-3">No reminders yet</p>
            <p className="text-slate-400 text-sm mt-1">e.g. &ldquo;Replace AquaGuard filter&rdquo; every 90 days.</p>
          </div>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1629] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">New reminder</h2>
              <button onClick={() => setForm(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Task (e.g. Replace filter)" className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3" />
            <select value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3">
              <option value="">No specific device</option>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}
            </select>
            <label className="block text-xs text-slate-400 mb-1">Repeat every (days)</label>
            <input type="number" value={form.intervalDays} onChange={(e) => setForm({ ...form, intervalDays: Number(e.target.value) })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-4" />
            <button onClick={save} className="w-full rounded-xl py-2.5 font-semibold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>Save reminder</button>
          </div>
        </div>
      )}
    </div>
  );
}
