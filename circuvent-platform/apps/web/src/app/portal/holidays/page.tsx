"use client";
import React, { useState } from "react";
import { useApi } from "@/hooks/use-auth";
import Link from "next/link";

export default function HolidaysPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: holidays, loading } = useApi<any[]>(`/hr/portal/holidays?year=${year}`);
  const typeColors: Record<string, string> = {
    NATIONAL: "bg-red-900/50 text-red-600 dark:text-red-400", REGIONAL: "bg-blue-900/50 text-blue-600 dark:text-blue-400",
    OPTIONAL: "bg-purple-900/50 text-purple-600 dark:text-purple-400", COMPANY: "bg-emerald-900/50 text-emerald-600 dark:text-emerald-400",
    RESTRICTED: "bg-amber-900/50 text-amber-600 dark:text-amber-400",
  };
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const grouped: Record<string, any[]> = {};
  holidays?.forEach((h: any) => {
    const m = new Date(h.date).getMonth();
    const key = months[m];
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(h);
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">🎉 Holiday Calendar {year}</h1>
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? <div className="text-center text-slate-500 py-12">Loading...</div> :
        !holidays || holidays.length === 0 ? (
          <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No holidays configured for {year}</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([month, items]) => (
              <div key={month}>
                <h2 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wider">{month}</h2>
                <div className="space-y-2">
                  {items.map((h: any) => {
                    const date = new Date(h.date);
                    const isPast = date < new Date(new Date().setHours(0,0,0,0));
                    return (
                      <div key={h.id} className={`flex items-center gap-4 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl p-4 ${isPast ? "opacity-50" : ""}`}>
                        <div className="text-center min-w-[50px]">
                          <p className="text-2xl font-bold text-slate-900 dark:text-white">{date.getDate()}</p>
                          <p className="text-xs text-slate-500">{date.toLocaleDateString("en-IN", { weekday: "short" })}</p>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-slate-900 dark:text-white font-medium">{h.name}</h3>
                          {h.description && <p className="text-xs text-slate-400 mt-0.5">{h.description}</p>}
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-0.5 text-xs rounded ${typeColors[h.type] || "bg-slate-100 dark:bg-slate-700 text-slate-400"}`}>{h.type}</span>
                            {h.isOptional && <span className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-400 rounded">Optional</span>}
                            {h.region && h.region !== "ALL" && <span className="text-xs text-slate-500">📍 {h.region}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
