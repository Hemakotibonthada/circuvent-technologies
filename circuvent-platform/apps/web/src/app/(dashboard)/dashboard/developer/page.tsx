"use client";

// ══════════════════════════════════════════════════════════════
// Developer / Engineer Dashboard — Sprint progress, code metrics
// ══════════════════════════════════════════════════════════════

import React from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui";

export default function DeveloperDashboard() {
  const { user } = useAuth();
  const { data: projects } = useApi<any[]>("/projects");
  const { data: currentTimesheet } = useApi<any>("/hr/timesheets/current");
  const { data: myGoals } = useApi<any[]>("/hr/goals");
  const { data: myRecognitions } = useApi<any>("/hr/recognition/my");
  const { data: myShifts } = useApi<any[]>("/hr/shifts/schedules/my");
  const { data: myEvents } = useApi<any[]>("/hr/calendar/events/my");

  const todayHours = currentTimesheet?.entries?.filter((e: any) => {
    const d = new Date(e.date);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).reduce((s: number, e: any) => s + e.hours, 0) || 0;

  const weekHours = currentTimesheet?.totalHours || 0;
  const activeProjects = projects?.filter(p => p.status === "ACTIVE")?.length || 0;
  const completedGoals = myGoals?.filter(g => g.status === "COMPLETED")?.length || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Dev Dashboard`}
        subtitle={`Welcome, ${user?.firstName || "Developer"} — Here's your coding day`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Today's Hours" value={`${todayHours}h`} icon="⏱️" color="blue" />
        <StatCard title="Week Total" value={`${weekHours}h`} icon="📊" color="green" subtitle={currentTimesheet?.status === "DRAFT" ? "Draft" : currentTimesheet?.status} />
        <StatCard title="Active Projects" value={activeProjects} icon="💻" color="purple" />
        <StatCard title="Recognition Points" value={myRecognitions?.totalPoints || 0} icon="🏆" color="amber" />
      </div>

      {/* Current Sprint / Timesheet */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">This Week&apos;s Timesheet</h3>
          {currentTimesheet?.entries?.length > 0 ? (
            <div className="space-y-2">
              {currentTimesheet.entries.map((entry: any) => (
                <div key={entry.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm text-slate-900 dark:text-white">{entry.description || entry.category}</p>
                    <p className="text-xs text-slate-500">{new Date(entry.date).toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color={entry.billable ? "green" : "slate"}>{entry.billable ? "Billable" : "Non-bill"}</Badge>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{entry.hours}h</span>
                  </div>
                </div>
              ))}
              <div className="mt-3 flex items-center justify-between rounded-lg border border-brand-500/30 bg-brand-500/5 p-3">
                <span className="text-sm font-medium text-brand-400">Week Total</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white">{weekHours}h</span>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-4xl">📝</p>
              <p className="mt-2 text-sm text-slate-400">No timesheet entries yet this week</p>
              <a href="/portal/timesheets" className="mt-3 inline-block rounded bg-brand-600 px-4 py-1.5 text-xs text-slate-900 dark:text-white hover:bg-brand-700">
                Log Time
              </a>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">My Projects</h3>
          <div className="space-y-3">
            {projects?.slice(0, 5).map((p: any) => (
              <a key={p.id} href={`/projects/${p.id}`} className="block rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50 hover:bg-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</span>
                  <Badge color={p.status === "ACTIVE" ? "green" : "slate"}>{p.status}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${p.progress || 0}%` }} />
                  </div>
                  <span className="text-xs text-slate-400">{p.progress || 0}%</span>
                </div>
              </a>
            ))}
            {(!projects || projects.length === 0) && (
              <p className="py-4 text-center text-sm text-slate-500">No projects assigned</p>
            )}
          </div>
        </Card>
      </div>

      {/* Goals + Upcoming Events */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">My Goals ({completedGoals}/{myGoals?.length || 0} completed)</h3>
          <div className="space-y-2">
            {myGoals?.slice(0, 6).map((g: any) => (
              <div key={g.id} className="flex items-center gap-3 rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                <span className={`text-lg ${g.status === "COMPLETED" ? "" : "opacity-30"}`}>
                  {g.status === "COMPLETED" ? "✅" : "⬜"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`truncate text-sm ${g.status === "COMPLETED" ? "text-slate-500 line-through" : "text-slate-900 dark:text-white"}`}>{g.title}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${g.progress || 0}%` }} />
                  </div>
                  <span className="text-xs text-slate-400">{g.progress || 0}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Upcoming Events & Shifts</h3>
          <div className="space-y-2">
            {myShifts?.slice(0, 3).map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                <span className="text-lg">⏰</span>
                <div>
                  <p className="text-sm text-slate-900 dark:text-white">{s.shift?.name || "Shift"}</p>
                  <p className="text-xs text-slate-500">{new Date(s.date).toLocaleDateString("en-IN")}</p>
                </div>
                <Badge color={s.status === "COMPLETED" ? "green" : s.status === "CHECKED_IN" ? "blue" : "slate"}>
                  {s.status}
                </Badge>
              </div>
            ))}
            {myEvents?.slice(0, 3).map((e: any) => (
              <div key={e.id} className="flex items-center gap-3 rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                <span className="text-lg">📅</span>
                <div>
                  <p className="text-sm text-slate-900 dark:text-white">{e.title}</p>
                  <p className="text-xs text-slate-500">{new Date(e.startTime).toLocaleString("en-IN")}</p>
                </div>
              </div>
            ))}
            {(!myShifts?.length && !myEvents?.length) && (
              <p className="py-4 text-center text-sm text-slate-500">No upcoming events</p>
            )}
          </div>
        </Card>
      </div>

      {/* Recognition */}
      {myRecognitions && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Recent Recognitions Received</h3>
          <div className="space-y-2">
            {myRecognitions.received?.slice(0, 5).map((r: any) => (
              <div key={r.id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                <div className="flex items-center gap-2">
                  <Badge color={r.type === "KUDOS" ? "green" : r.type === "AWARD" ? "amber" : "blue"}>{r.type}</Badge>
                  <span className="text-xs text-slate-400">{r.category}</span>
                  <span className="ml-auto text-xs text-brand-400">+{r.points} pts</span>
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{r.message}</p>
              </div>
            ))}
            {(!myRecognitions.received || myRecognitions.received.length === 0) && (
              <p className="py-4 text-center text-sm text-slate-500">No recognitions yet</p>
            )}
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { label: "Log Time", href: "/portal/timesheets", icon: "⏱️" },
          { label: "Apply Leave", href: "/portal/leaves", icon: "🏖️" },
          { label: "My Profile", href: "/portal/profile", icon: "👤" },
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
