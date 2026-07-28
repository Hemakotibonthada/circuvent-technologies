"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sun, Trash2 } from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import { listEntries, logEntry, deleteEntry, computeOffset } from "@/lib/smarthome-solar";
import { Card } from "../ui";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SolarPage() {
  const [entries, setEntries] = useState(listEntries());
  const [consumedKwh, setConsumedKwh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(today());
  const [produced, setProduced] = useState("");

  const load = useCallback(async () => {
    const r = await controlPlane.energySummary();
    if (r.ok) setConsumedKwh(r.data.todayKwh);
    setEntries(listEntries());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = () => {
    if (!produced) return;
    logEntry(date, Number(produced));
    setEntries(listEntries());
    setProduced("");
  };

  const remove = (d: string) => {
    deleteEntry(d);
    setEntries(listEntries());
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const todayEntry = entries.find((e) => e.date === today());
  const offset = computeOffset(todayEntry?.producedKwh ?? 0, consumedKwh);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Sun className="h-6 w-6" /> Solar & renewable offset</h1>
        <p className="text-sm text-slate-400 mt-1">Log your inverter's daily production and see how much of your usage it offsets.</p>
      </div>

      <Card className="p-6 flex items-center justify-around gap-6 flex-wrap mb-6">
        <div className="text-center">
          <div className="text-3xl font-extrabold text-amber-400">{offset.producedKwh.toFixed(1)}</div>
          <div className="text-xs text-slate-500">kWh produced today</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-extrabold text-white">{offset.consumedKwh.toFixed(1)}</div>
          <div className="text-xs text-slate-500">kWh consumed today</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-extrabold text-emerald-400">{offset.offsetPct}%</div>
          <div className="text-xs text-slate-500">offset by solar</div>
        </div>
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="font-bold text-white mb-3">Log production</h2>
        <div className="flex gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none" />
          <input type="number" value={produced} onChange={(e) => setProduced(e.target.value)} placeholder="kWh produced" className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none" />
          <button onClick={save} className="rounded-xl px-4 py-2.5 font-semibold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>Save</button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-bold text-white mb-3">History</h2>
        <div className="space-y-1.5">
          {entries.map((e) => (
            <div key={e.date} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-sm">
              <span className="text-slate-200">{e.date} — {e.producedKwh} kWh</span>
              <button onClick={() => remove(e.date)} className="text-slate-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {entries.length === 0 && <p className="text-sm text-slate-500">No entries yet.</p>}
        </div>
      </Card>
    </div>
  );
}
