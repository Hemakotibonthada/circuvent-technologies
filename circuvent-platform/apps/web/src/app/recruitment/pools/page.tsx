"use client";
import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function TalentPoolsPage() {
  const { token } = useAuth();
  const { data: pools, loading, refetch } = useApi<any[]>("/recruitment/pools");
  const { data: poolHealth } = useApi<any>("/recruitment/pools/health/summary");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", category: "GENERAL", description: "" });

  const handleCreate = async () => {
    if (!form.name) return;
    await api.post("/recruitment/pools", form, token || undefined);
    setShowCreate(false);
    setForm({ name: "", category: "GENERAL", description: "" });
    refetch();
  };

  const categoryColors: Record<string, string> = {
    SILVER_MEDALIST: "text-slate-600 dark:text-slate-300", NICHE_AI_EXPERT: "text-purple-400", IOT_FIRMWARE: "text-cyan-400",
    FULL_STACK_PRO: "text-blue-400", DEVOPS_SRE: "text-amber-400", LEADERSHIP: "text-emerald-400",
    INTERN_PIPELINE: "text-pink-400", GENERAL: "text-slate-400",
  };

  const healthColors: Record<string, string> = {
    HEALTHY: "bg-emerald-900/50 text-emerald-400", GROWING: "bg-blue-900/50 text-blue-400", NEEDS_ATTENTION: "bg-red-900/50 text-red-400",
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/recruitment" className="text-sm text-brand-400 hover:text-brand-300">← Recruitment</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">🏊 Talent Pools</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg text-sm hover:bg-brand-700">+ New Pool</button>
      </div>

      {/* Pool Health Summary */}
      {poolHealth && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-brand-400">{poolHealth.totalPools}</p>
            <p className="text-xs text-slate-500">Total Pools</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-emerald-400">{poolHealth.activePools}</p>
            <p className="text-xs text-slate-500">Active</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-cyan-400">{poolHealth.totalMembers}</p>
            <p className="text-xs text-slate-500">Total Candidates</p>
          </div>
        </div>
      )}

      {/* Pools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? <div className="col-span-full text-center text-slate-500 py-12">Loading...</div> :
          !pools || pools.length === 0 ? <div className="col-span-full text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No talent pools created yet</div> :
          pools.map((pool: any) => {
            const health = poolHealth?.pools?.find((p: any) => p.name === pool.name);
            return (
              <div key={pool.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-slate-900 dark:text-white font-medium">{pool.name}</h3>
                    <span className={`text-xs ${categoryColors[pool.category] || "text-slate-400"}`}>{pool.category.replace("_", " ")}</span>
                  </div>
                  {health && <span className={`px-2 py-0.5 text-xs rounded ${healthColors[health.health] || "bg-slate-100 dark:bg-slate-700 text-slate-400"}`}>{health.health}</span>}
                </div>
                {pool.description && <p className="text-xs text-slate-400 mb-3">{pool.description}</p>}
                <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-2xl font-bold text-brand-400">{pool._count?.members || 0}</span>
                  <span className="text-xs text-slate-500">members</span>
                </div>
              </div>
            );
          })
        }
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create Talent Pool</h2>
            <div className="space-y-3">
              <input placeholder="Pool Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                <option value="GENERAL">General</option><option value="SILVER_MEDALIST">Silver Medalist</option>
                <option value="NICHE_AI_EXPERT">Niche AI Expert</option><option value="IOT_FIRMWARE">IoT Firmware</option>
                <option value="FULL_STACK_PRO">Full Stack Pro</option><option value="DEVOPS_SRE">DevOps/SRE</option>
                <option value="LEADERSHIP">Leadership</option><option value="INTERN_PIPELINE">Intern Pipeline</option>
              </select>
              <textarea placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" rows={3} />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
              <button onClick={handleCreate} disabled={!form.name} className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
