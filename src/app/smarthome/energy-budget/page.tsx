"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BatteryCharging, Loader2, Save } from "lucide-react";
import { controlPlane, type EnergySummary } from "@/lib/control-plane";
import { getSettings, saveSettings, computeSlabCost, type EnergyBudgetSettings } from "@/lib/smarthome-energy-budget";
import { Card } from "../ui";

export default function EnergyBudgetPage() {
  const [summary, setSummary] = useState<EnergySummary | null>(null);
  const [settings, setSettings] = useState<EnergyBudgetSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const r = await controlPlane.energySummary();
    if (r.ok) setSummary(r.data);
    setSettings(getSettings());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Estimate month-to-date kWh from today's figure (simple, transparent projection).
  const dayOfMonth = new Date().getDate();
  const projectedMonthKwh = useMemo(() => (summary ? summary.todayKwh * dayOfMonth : 0), [summary, dayOfMonth]);
  const pctOfBudget = settings ? Math.min(999, Math.round((projectedMonthKwh / settings.monthlyBudgetKwh) * 100)) : 0;
  const estimatedCost = settings ? computeSlabCost(projectedMonthKwh, settings.slabs) : 0;
  const overThreshold = settings ? pctOfBudget >= settings.alertThresholdPct : false;

  const update = (patch: Partial<EnergyBudgetSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaved(false);
  };

  const updateSlab = (index: number, patch: Partial<{ uptoKwh: number; ratePerKwh: number }>) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const slabs = prev.slabs.map((s, i) => (i === index ? { ...s, ...patch } : s));
      return { ...prev, slabs };
    });
    setSaved(false);
  };

  const save = () => {
    if (!settings) return;
    saveSettings(settings);
    setSaved(true);
  };

  if (loading || !settings) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><BatteryCharging className="h-6 w-6" /> Energy budgets & tariffs</h1>
        <p className="text-sm text-slate-400 mt-1">Set a monthly usage budget and your real tariff slabs to see projected cost, not just watts.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card className="p-4">
          <div className="text-xs text-slate-500">Projected this month</div>
          <div className="text-2xl font-extrabold text-white mt-1">{projectedMonthKwh.toFixed(1)} kWh</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">% of budget</div>
          <div className={`text-2xl font-extrabold mt-1 ${overThreshold ? "text-red-400" : "text-white"}`}>{pctOfBudget}%</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">Estimated cost</div>
          <div className="text-2xl font-extrabold text-white mt-1">₹{estimatedCost.toLocaleString("en-IN")}</div>
        </Card>
      </div>

      {overThreshold && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 flex items-center gap-2 text-red-300 text-sm mb-6">
          <AlertTriangle className="h-4 w-4 shrink-0" /> You&apos;re projected to pass {settings.alertThresholdPct}% of your monthly budget.
        </div>
      )}

      <Card className="p-5 mb-4">
        <h2 className="font-bold text-white mb-4">Monthly budget</h2>
        <label className="block text-xs text-slate-400 mb-1">Budget (kWh / month)</label>
        <input type="number" value={settings.monthlyBudgetKwh} onChange={(e) => update({ monthlyBudgetKwh: Number(e.target.value) })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3" />
        <label className="block text-xs text-slate-400 mb-1">Alert threshold (%)</label>
        <input type="number" value={settings.alertThresholdPct} onChange={(e) => update({ alertThresholdPct: Number(e.target.value) })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none" />
      </Card>

      <Card className="p-5">
        <h2 className="font-bold text-white mb-4">Tariff slabs</h2>
        <div className="space-y-2">
          {settings.slabs.map((s, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Up to (kWh)</label>
                <input type="number" value={s.uptoKwh} onChange={(e) => updateSlab(i, { uptoKwh: Number(e.target.value) })} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none" />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">₹ / kWh</label>
                <input type="number" value={s.ratePerKwh} onChange={(e) => updateSlab(i, { ratePerKwh: Number(e.target.value) })} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none" />
              </div>
            </div>
          ))}
        </div>
        <button onClick={save} className="mt-4 flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white" style={{ background: "var(--cv-gradient)" }}>
          <Save className="h-4 w-4" /> {saved ? "Saved" : "Save settings"}
        </button>
      </Card>
    </div>
  );
}
