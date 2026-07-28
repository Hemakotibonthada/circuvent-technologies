"use client";

import { useCallback, useEffect, useState } from "react";
import { Gauge, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import { getHomeSize, setHomeSize, compareToAverage, HOME_SIZE_LABELS, type HomeSize } from "@/lib/smarthome-benchmark";
import { Card } from "../ui";

export default function BenchmarkPage() {
  const [todayKwh, setTodayKwh] = useState(0);
  const [size, setSize] = useState<HomeSize>("2bhk");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await controlPlane.energySummary();
    if (r.ok) setTodayKwh(r.data.todayKwh);
    setSize(getHomeSize());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeSize = (next: HomeSize) => {
    setHomeSize(next);
    setSize(next);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const comparison = compareToAverage(todayKwh, size);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Gauge className="h-6 w-6" /> Energy benchmark</h1>
        <p className="text-sm text-slate-400 mt-1">See how your usage compares to similar homes (estimates, for guidance only).</p>
      </div>

      <Card className="p-5 mb-4">
        <label className="block text-xs text-slate-400 mb-2">Your home size</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.keys(HOME_SIZE_LABELS) as HomeSize[]).map((s) => (
            <button key={s} onClick={() => changeSize(s)} className={`rounded-xl px-3 py-2 text-sm border ${size === s ? "border-cyan-400/60 bg-white/10 text-white" : "border-white/10 bg-black/10 text-slate-300"}`}>
              {HOME_SIZE_LABELS[s]}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-6 flex items-center justify-around gap-6 flex-wrap">
        <div className="text-center">
          <div className="text-3xl font-extrabold text-white">{comparison.yourKwh.toFixed(1)}</div>
          <div className="text-xs text-slate-500">your kWh today</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-extrabold text-slate-400">{comparison.averageKwh}</div>
          <div className="text-xs text-slate-500">average for {HOME_SIZE_LABELS[size]}</div>
        </div>
        <div className="text-center">
          <div className={`flex items-center justify-center gap-1 text-3xl font-extrabold ${comparison.betterThanAverage ? "text-emerald-400" : "text-amber-400"}`}>
            {comparison.betterThanAverage ? <TrendingDown className="h-6 w-6" /> : <TrendingUp className="h-6 w-6" />}
            {Math.abs(comparison.diffPct)}%
          </div>
          <div className="text-xs text-slate-500">{comparison.betterThanAverage ? "less than average" : "more than average"}</div>
        </div>
      </Card>
    </div>
  );
}
