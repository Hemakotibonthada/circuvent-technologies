"use client";
import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function AIModelsPage() {
  const { token } = useAuth();
  const { data: resources } = useApi<any[]>("/ai/resources");
  const { data: training } = useApi<any[]>("/ai/training");
  const { data: dashboard } = useApi<any>("/ai/resources/dashboard");
  const [tab, setTab] = useState<"resources" | "training" | "models">("resources");

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">🧠 AI Model Registry</h1>
          <p className="text-slate-400 text-sm mt-1">ML model lifecycle, training jobs, and GPU resource management</p>
        </div>
      </div>

      {/* Stats */}
      {dashboard && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total GPUs", value: dashboard.totalGPUs || 0, color: "purple" },
            { label: "GPU Utilization", value: `${dashboard.utilization || 0}%`, color: "cyan" },
            { label: "Active Jobs", value: dashboard.activeJobs || 0, color: "amber" },
            { label: "Models Trained", value: dashboard.totalModels || 0, color: "emerald" },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold text-${s.color}-400`}>{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[{ id: "resources" as const, label: "GPU Resources" }, { id: "training" as const, label: "Training Jobs" }, { id: "models" as const, label: "Model Registry" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm ${tab === t.id ? "bg-brand-600 text-slate-900 dark:text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-400"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "resources" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">🖥️ Compute Resources</h2>
          </div>
          {!resources || resources.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No compute resources registered</div>
          ) : (
            <table className="w-full">
              <thead><tr className="border-b border-slate-200 dark:border-slate-800"><th className="px-4 py-2 text-xs text-slate-500 text-left">Name</th><th className="px-4 py-2 text-xs text-slate-500 text-left">Type</th><th className="px-4 py-2 text-xs text-slate-500 text-left">Status</th><th className="px-4 py-2 text-xs text-slate-500 text-right">VRAM</th><th className="px-4 py-2 text-xs text-slate-500 text-right">Utilization</th></tr></thead>
              <tbody>
                {resources.map((r: any) => (
                  <tr key={r.id} className="border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-4 py-2 text-sm text-slate-900 dark:text-white">{r.name}</td>
                    <td className="px-4 py-2 text-sm text-slate-400">{r.gpuType || r.type}</td>
                    <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded ${r.status === "AVAILABLE" ? "bg-emerald-900/50 text-emerald-400" : r.status === "IN_USE" ? "bg-amber-900/50 text-amber-400" : "bg-slate-100 dark:bg-slate-700 text-slate-400"}`}>{r.status}</span></td>
                    <td className="px-4 py-2 text-sm text-right text-slate-600 dark:text-slate-300">{r.vramGB || r.memoryGB || "—"} GB</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5"><div className="h-1.5 rounded-full bg-purple-500" style={{ width: `${r.utilization || 0}%` }} /></div>
                        <span className="text-xs text-slate-400">{r.utilization || 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "training" && (
        <div className="space-y-3">
          {!training || training.length === 0 ? (
            <div className="p-8 text-center text-slate-500 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No training jobs</div>
          ) : training.map((job: any) => (
            <div key={job.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-500 font-mono">{job.jobCode}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${job.status === "RUNNING" ? "bg-blue-900/50 text-blue-400" : job.status === "COMPLETED" ? "bg-emerald-900/50 text-emerald-400" : job.status === "FAILED" ? "bg-red-900/50 text-red-400" : "bg-slate-100 dark:bg-slate-700 text-slate-400"}`}>{job.status}</span>
                  </div>
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white">{job.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">{job.framework} &middot; {job.modelType || job.type}</p>
                </div>
                {job.progress !== undefined && (
                  <div className="text-right">
                    <p className="text-lg font-bold text-brand-400">{job.progress}%</p>
                    {job.currentEpoch && <p className="text-xs text-slate-500">Epoch {job.currentEpoch}/{job.totalEpochs}</p>}
                  </div>
                )}
              </div>
              {job.progress !== undefined && (
                <div className="mt-3 bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                  <div className={`h-2 rounded-full ${job.status === "COMPLETED" ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${job.progress}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "models" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-center py-12">
          <span className="text-4xl block mb-3">🧠</span>
          <h3 className="text-slate-900 dark:text-white font-semibold mb-1">Model Registry</h3>
          <p className="text-slate-400 text-sm">Track model versions across Development → Staging → Production pipeline</p>
          <p className="text-slate-500 text-xs mt-4">Upload trained models, compare metrics, and promote best versions</p>
        </div>
      )}

      {/* Quick Nav */}
      <div className="grid grid-cols-4 gap-3 mt-6">
        {[
          { label: "Orchestrator", href: "/ai", icon: "🤖" },
          { label: "Scheduler", href: "/ai/scheduler", icon: "⚡" },
          { label: "Training", href: "/ai", icon: "🏋️" },
          { label: "Inference", href: "/ai", icon: "🔮" },
        ].map(n => (
          <Link key={n.label} href={n.href}>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center hover:border-brand-500/50 transition-colors">
              <span className="text-xl block mb-1">{n.icon}</span>
              <span className="text-xs text-slate-600 dark:text-slate-300">{n.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
