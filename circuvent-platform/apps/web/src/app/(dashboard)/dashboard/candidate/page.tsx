"use client";

// ══════════════════════════════════════════════════════════════
// Candidate Dashboard — Job browsing & application tracking
// Candidates are external users who registered to apply for jobs.
// They should NOT see any admin/recruitment management tools.
// ══════════════════════════════════════════════════════════════

import React from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui";

export default function CandidateDashboard() {
  const { user } = useAuth();
  const { data: jobs } = useApi<any[]>("/recruitment/jobs");

  const openJobs = jobs?.filter((j: any) => j.status === "OPEN") || [];

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${user?.firstName || "there"}!`}
        subtitle="Browse open positions and track your applications"
      />

      {/* Welcome Banner */}
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-6 dark:border-brand-500/20 dark:bg-brand-500/5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-2xl dark:bg-brand-500/20">🚀</div>
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">Welcome to Circuvent Technologies</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Explore our open positions below and apply to the roles that match your skills. 
              You can track your application status from the <a href="/careers/my-applications" className="text-brand-600 hover:underline dark:text-brand-400">My Applications</a> page.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard title="Open Positions" value={openJobs.length} icon="📋" color="blue" subtitle="Currently hiring" />
        <StatCard title="Your Role" value="Candidate" icon="👤" color="cyan" subtitle="Job seeker" />
      </div>

      {/* Open Positions */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Open Positions ({openJobs.length})</h3>
          <a href="/careers" className="text-xs text-brand-600 hover:underline dark:text-brand-400">View all →</a>
        </div>
        <div className="space-y-3">
          {openJobs.slice(0, 8).map((job: any) => (
            <a key={job.id} href={`/careers?job=${job.id}`} className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-brand-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/30 dark:hover:border-brand-500/40 dark:hover:bg-slate-800/60">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-900 dark:text-white">{job.title}</h4>
                <Badge color="green">OPEN</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {job.department} · {job.location || "Remote"} · {job.employmentType || "Full-time"}
              </p>
              {job.description && (
                <p className="mt-2 text-xs text-slate-400 line-clamp-2 dark:text-slate-500">{job.description}</p>
              )}
            </a>
          ))}
          {openJobs.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-3xl">🔍</p>
              <p className="mt-2 text-sm text-slate-500">No open positions right now — check back soon!</p>
            </div>
          )}
        </div>
      </Card>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-3">
        <a href="/careers" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm transition-all hover:border-brand-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/30 dark:hover:border-brand-500/50">
          <span className="text-lg">💼</span>
          <div>
            <p className="font-medium text-slate-900 dark:text-white">Browse Jobs</p>
            <p className="text-xs text-slate-500">View all open positions</p>
          </div>
        </a>
        <a href="/careers/my-applications" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm transition-all hover:border-brand-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/30 dark:hover:border-brand-500/50">
          <span className="text-lg">📄</span>
          <div>
            <p className="font-medium text-slate-900 dark:text-white">My Applications</p>
            <p className="text-xs text-slate-500">Track application status</p>
          </div>
        </a>
      </div>
    </div>
  );
}
