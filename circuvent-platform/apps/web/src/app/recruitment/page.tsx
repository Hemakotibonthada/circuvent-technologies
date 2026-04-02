"use client";
import React from "react";
import { useApi } from "@/hooks/use-auth";
import Link from "next/link";

export default function RecruitmentDashboardPage() {
  const { data: dashboard, loading } = useApi<any>("/recruitment/dashboard");

  if (loading) return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center"><div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;

  const d = dashboard?.overview || {};
  const pipeline = dashboard?.pipeline || [];
  const sources = dashboard?.sourceEfficacy || [];

  const stageOrder = ["APPLIED", "SCREENING", "SHORTLISTED", "TECHNICAL_ROUND", "HR_ROUND", "FINAL_ROUND", "OFFER_EXTENDED", "OFFER_ACCEPTED", "HIRED"];
  const stageColors: Record<string, string> = {
    APPLIED: "bg-blue-500", SCREENING: "bg-cyan-500", SHORTLISTED: "bg-emerald-500",
    TECHNICAL_ROUND: "bg-purple-500", HR_ROUND: "bg-pink-500", FINAL_ROUND: "bg-amber-500",
    OFFER_EXTENDED: "bg-orange-500", OFFER_ACCEPTED: "bg-emerald-600", HIRED: "bg-emerald-700",
    REJECTED: "bg-red-500", WITHDRAWN: "bg-slate-500",
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">🎯 Recruitment Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Hiring pipeline, source analytics, and talent pool health</p>
        </div>
        <div className="flex gap-2">
          <Link href="/recruitment/jobs"><button className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">+ Post Job</button></Link>
          <Link href="/recruitment/candidates"><button className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600">Candidates</button></Link>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {[
          { label: "Open Jobs", value: d.openJobs || 0, icon: "📋", color: "blue" },
          { label: "Total Candidates", value: d.totalCandidates || 0, icon: "👤", color: "cyan" },
          { label: "New (30d)", value: d.newCandidates30d || 0, icon: "🆕", color: "emerald" },
          { label: "Applications", value: d.totalApplications || 0, icon: "📩", color: "purple" },
          { label: "Active", value: d.activeApplications || 0, icon: "⏳", color: "amber" },
          { label: "Hired", value: d.totalHired || 0, icon: "🎉", color: "emerald" },
          { label: "Avg Days to Hire", value: d.avgTimeToHireDays || "—", icon: "⏱️", color: "cyan" },
          { label: "Offer Accept %", value: `${d.offerAcceptanceRate || 0}%`, icon: "✅", color: "brand" },
        ].map(m => (
          <div key={m.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-lg">{m.icon}</span>
              <span className={`text-lg font-bold text-${m.color}-400`}>{m.value}</span>
            </div>
            <p className="text-xs text-slate-500">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hiring Pipeline */}
        <div className="lg:col-span-2 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">📊 Hiring Pipeline</h2>
          <div className="space-y-2">
            {stageOrder.map(stage => {
              const entry = pipeline.find((p: any) => p.stage === stage);
              const count = entry?.count || 0;
              const maxCount = Math.max(...pipeline.map((p: any) => p.count), 1);
              return (
                <div key={stage} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-28 text-right">{stage.replace(/_/g, " ")}</span>
                  <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-5 relative">
                    <div className={`h-5 rounded-full ${stageColors[stage] || "bg-slate-600"} transition-all flex items-center px-2`}
                      style={{ width: `${Math.max(5, (count / maxCount) * 100)}%` }}>
                      <span className="text-xs text-slate-900 dark:text-white font-semibold">{count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Source Efficacy */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">📡 Candidate Sources</h2>
          <div className="space-y-2">
            {sources.map((s: any) => (
              <div key={s.source} className="flex items-center justify-between bg-slate-100 dark:bg-slate-800/50 rounded-lg p-2">
                <span className="text-sm text-slate-600 dark:text-slate-300">{s.source}</span>
                <span className="text-sm font-bold text-brand-600 dark:text-brand-400">{s.count}</span>
              </div>
            ))}
            {sources.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No data yet</p>}
          </div>
        </div>
      </div>

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
        {[
          { label: "Job Postings", icon: "📋", href: "/recruitment/jobs" },
          { label: "Candidates", icon: "👤", href: "/recruitment/candidates" },
          { label: "Applications", icon: "📩", href: "/recruitment/applications" },
          { label: "Talent Pools", icon: "🏊", href: "/recruitment/pools" },
          { label: "Interviews", icon: "🎙️", href: "/recruitment/interviews" },
        ].map(item => (
          <Link key={item.label} href={item.href}>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center hover:border-brand-300 dark:hover:border-brand-500/50 transition-colors cursor-pointer">
              <span className="text-2xl block mb-1">{item.icon}</span>
              <span className="text-xs text-slate-600 dark:text-slate-300">{item.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
