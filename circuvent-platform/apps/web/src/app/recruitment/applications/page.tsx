"use client";
import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function ApplicationsPage() {
  const { token } = useAuth();
  const [statusFilter, setStatusFilter] = useState("");
  const { data: applications, loading, refetch } = useApi<any[]>(`/recruitment/applications${statusFilter ? `?status=${statusFilter}` : ""}`);
  const { data: pipeline } = useApi<any[]>("/recruitment/applications/pipeline/summary");

  const statusColors: Record<string, string> = {
    APPLIED: "bg-blue-900/50 text-blue-400", SCREENING: "bg-cyan-900/50 text-cyan-400",
    SHORTLISTED: "bg-emerald-900/50 text-emerald-400", TECHNICAL_ROUND: "bg-purple-900/50 text-purple-400",
    HR_ROUND: "bg-pink-900/50 text-pink-400", FINAL_ROUND: "bg-amber-900/50 text-amber-400",
    OFFER_EXTENDED: "bg-orange-900/50 text-orange-400", OFFER_ACCEPTED: "bg-emerald-900/50 text-emerald-400",
    HIRED: "bg-emerald-800 text-emerald-300", REJECTED: "bg-red-900/50 text-red-400",
    WITHDRAWN: "bg-slate-100 dark:bg-slate-700 text-slate-400", ON_HOLD: "bg-amber-900/50 text-amber-400",
  };

  const stages = ["APPLIED", "SCREENING", "SHORTLISTED", "TECHNICAL_ROUND", "HR_ROUND", "FINAL_ROUND", "OFFER_EXTENDED", "HIRED", "REJECTED"];

  const handleStageTransition = async (appId: string, newStatus: string) => {
    await api.patch(`/recruitment/applications/${appId}/stage`, { newStatus }, token || undefined);
    refetch();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/recruitment" className="text-sm text-brand-400 hover:text-brand-300">← Recruitment</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">📩 Applications Pipeline</h1>
        </div>
      </div>

      {/* Pipeline Summary */}
      {pipeline && (
        <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
          <button onClick={() => setStatusFilter("")} className={`px-3 py-1.5 rounded text-xs whitespace-nowrap ${!statusFilter ? "bg-brand-600 text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-400"}`}>All</button>
          {stages.map(stage => {
            const entry = pipeline.find((p: any) => p.stage === stage);
            return (
              <button key={stage} onClick={() => setStatusFilter(stage)}
                className={`px-3 py-1.5 rounded text-xs whitespace-nowrap flex items-center gap-1 ${statusFilter === stage ? "bg-brand-600 text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-400"}`}>
                {stage.replace(/_/g, " ")} {entry && <span className="bg-slate-100 dark:bg-slate-700 px-1.5 rounded text-xs">{entry.count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Applications List */}
      <div className="space-y-3">
        {loading ? <div className="text-center text-slate-500 py-12">Loading...</div> :
          !applications || applications.length === 0 ? <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No applications found</div> :
          applications.map((app: any) => (
            <div key={app.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-500 font-mono">{app.applicationCode}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${statusColors[app.status] || "bg-slate-100 dark:bg-slate-700 text-slate-400"}`}>{app.status.replace(/_/g, " ")}</span>
                  </div>
                  <h3 className="text-sm font-medium text-white">
                    {app.candidate?.firstName} {app.candidate?.lastName}
                    <span className="text-slate-500 ml-2">→ {app.job?.title}</span>
                  </h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>📧 {app.candidate?.email}</span>
                    <span>📋 {app.job?.jobCode}</span>
                    <span>📅 {new Date(app.appliedAt).toLocaleDateString()}</span>
                    {app._count?.reviews > 0 && <span>💬 {app._count.reviews} reviews</span>}
                    {app._count?.interviews > 0 && <span>🎙️ {app._count.interviews} interviews</span>}
                  </div>
                  {app.candidate?.tags?.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {app.candidate.tags.map((t: string) => <span key={t} className="px-1.5 py-0.5 text-xs bg-brand-900/50 text-brand-400 rounded">{t}</span>)}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  {app.matchScore && (
                    <div>
                      <span className={`text-lg font-bold ${Number(app.matchScore) >= 70 ? "text-emerald-400" : Number(app.matchScore) >= 50 ? "text-amber-400" : "text-red-400"}`}>
                        {Number(app.matchScore).toFixed(0)}
                      </span>
                      <span className="text-xs text-slate-500">/100</span>
                    </div>
                  )}
                  {/* Quick action buttons */}
                  {app.status !== "HIRED" && app.status !== "REJECTED" && app.status !== "WITHDRAWN" && (
                    <div className="flex gap-1 mt-2">
                      {app.status === "APPLIED" && <button onClick={() => handleStageTransition(app.id, "SCREENING")} className="px-2 py-1 text-xs bg-cyan-600 text-slate-900 dark:text-white rounded hover:bg-cyan-700">Screen</button>}
                      {app.status === "SCREENING" && <button onClick={() => handleStageTransition(app.id, "SHORTLISTED")} className="px-2 py-1 text-xs bg-emerald-600 text-slate-900 dark:text-white rounded hover:bg-emerald-700">Shortlist</button>}
                      {app.status === "SHORTLISTED" && <button onClick={() => handleStageTransition(app.id, "TECHNICAL_ROUND")} className="px-2 py-1 text-xs bg-purple-600 text-slate-900 dark:text-white rounded hover:bg-purple-700">Tech Round</button>}
                      <button onClick={() => handleStageTransition(app.id, "REJECTED")} className="px-2 py-1 text-xs bg-red-600/50 text-red-300 rounded hover:bg-red-700">Reject</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
