"use client";

// ══════════════════════════════════════════════════════════════
// Intern Dashboard — Learning progress, assigned tasks
// ══════════════════════════════════════════════════════════════

import React from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui";

export default function InternDashboard() {
  const { user } = useAuth();
  const { data: goals } = useApi<any[]>("/hr/goals");
  const { data: training } = useApi<any[]>("/hr/portal/training");
  const { data: recognitions } = useApi<any>("/hr/recognition/my");
  const { data: events } = useApi<any[]>("/hr/calendar/events/my");

  const completedGoals = goals?.filter(g => g.status === "COMPLETED")?.length || 0;
  const completedTraining = training?.filter((t: any) => t.status === "COMPLETED")?.length || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${user?.firstName || "Intern"} 👋`}
        subtitle="Your internship dashboard — track progress and learning"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Goals" value={`${completedGoals}/${goals?.length || 0}`} icon="🎯" color="blue" />
        <StatCard title="Training" value={`${completedTraining}/${training?.length || 0}`} icon="📚" color="green" />
        <StatCard title="Recognition" value={recognitions?.totalPoints || 0} icon="🏆" color="amber" subtitle="Points earned" />
        <StatCard title="Events" value={events?.length || 0} icon="📅" color="purple" />
      </div>

      {/* Goals */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Your Goals</h3>
        <div className="space-y-2">
          {goals?.map((g: any) => (
            <div key={g.id} className="flex items-center gap-3 rounded-lg bg-slate-100 dark:bg-slate-800/50 px-4 py-3">
              <span className="text-lg">{g.status === "COMPLETED" ? "✅" : g.status === "IN_PROGRESS" ? "🔄" : "⬜"}</span>
              <div className="flex-1">
                <p className="text-sm text-slate-900 dark:text-white">{g.title}</p>
                <p className="text-xs text-slate-500">{g.description?.substring(0, 60) || "—"}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-16 rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${g.progress || 0}%` }} />
                </div>
                <span className="text-xs text-slate-400">{g.progress || 0}%</span>
              </div>
            </div>
          ))}
          {(!goals || goals.length === 0) && (
            <p className="py-6 text-center text-sm text-slate-500">No goals assigned yet</p>
          )}
        </div>
      </Card>

      {/* Training + Events */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Training Programs</h3>
          <div className="space-y-2">
            {training?.slice(0, 5).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                <div>
                  <p className="text-sm text-slate-900 dark:text-white">{t.program?.name || t.title || "Training"}</p>
                  <p className="text-xs text-slate-500">{t.program?.category || "General"}</p>
                </div>
                <Badge color={t.status === "COMPLETED" ? "green" : t.status === "IN_PROGRESS" ? "blue" : "slate"}>
                  {t.status || "ENROLLED"}
                </Badge>
              </div>
            ))}
            {(!training || training.length === 0) && (
              <p className="py-4 text-center text-sm text-slate-500">No training enrolled</p>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Upcoming Events</h3>
          <div className="space-y-2">
            {events?.slice(0, 5).map((e: any) => (
              <div key={e.id} className="flex items-center gap-3 rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                <span className="text-lg">📅</span>
                <div>
                  <p className="text-sm text-slate-900 dark:text-white">{e.title}</p>
                  <p className="text-xs text-slate-500">{new Date(e.startTime).toLocaleString("en-IN")}</p>
                </div>
              </div>
            ))}
            {(!events || events.length === 0) && (
              <p className="py-4 text-center text-sm text-slate-500">No upcoming events</p>
            )}
          </div>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { label: "My Goals", href: "/portal/goals", icon: "🎯" },
          { label: "Training", href: "/portal/training", icon: "📚" },
          { label: "Directory", href: "/portal/directory", icon: "👥" },
          { label: "Helpdesk", href: "/portal/helpdesk", icon: "🎫" },
        ].map((l) => (
          <a key={l.label} href={l.href} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7003 text-sm text-slate-600 dark:text-slate-300 hover:border-brand-500/50 hover:text-slate-900 dark:hover:text-white">
            <span>{l.icon}</span> {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}
