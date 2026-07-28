// Ops / Scheduled Jobs Dashboard — a registry of scheduled/cron-style jobs
// (seeded with the two real Vercel Cron endpoints already defined in
// vercel.json) plus a run-history log. The dashboard triggers jobs by having
// the browser call the job's own endpoint directly with the admin's existing
// session token (those endpoints already accept `adminFromRequest` auth per
// their `authorized()` checks) — this module only stores definitions and
// records the outcome that the client reports back, so it never has to touch
// or duplicate the target endpoints' logic.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";

export interface JobDefinition {
  id: string;
  name: string;
  endpoint: string;
  method: "GET" | "POST";
  scheduleDescription: string;
  managedByVercelCron: boolean;
  enabled: boolean;
  createdAt: string;
}

export interface JobRun {
  id: string;
  jobId: string;
  jobName: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
  at: string;
}

interface JobsDB {
  jobs: JobDefinition[];
  runs: JobRun[];
}

function seed(): JobsDB {
  const now = new Date().toISOString();
  return {
    jobs: [
      {
        id: "job_alerts_digest",
        name: "Alerts digest email",
        endpoint: "/api/admin/alerts/run",
        method: "POST",
        scheduleDescription: "Daily 08:00 UTC (vercel.json cron)",
        managedByVercelCron: true,
        enabled: true,
        createdAt: now,
      },
      {
        id: "job_performance_report",
        name: "Daily performance report",
        endpoint: "/api/admin/reports/send",
        method: "POST",
        scheduleDescription: "Daily 04:00 UTC (vercel.json cron)",
        managedByVercelCron: true,
        enabled: true,
        createdAt: now,
      },
    ],
    runs: [],
  };
}

const store = createFileStore<JobsDB>("admin-jobs.json", seed);

export function listJobs(): JobDefinition[] {
  return store.read().jobs;
}

export function addCustomJob(input: { name: string; endpoint: string; method: "GET" | "POST"; scheduleDescription: string }): JobDefinition {
  return store.mutate((db) => {
    const job: JobDefinition = { id: shortId("job"), ...input, managedByVercelCron: false, enabled: true, createdAt: new Date().toISOString() };
    db.jobs.push(job);
    return job;
  });
}

export function toggleJob(id: string, enabled: boolean): boolean {
  return store.mutate((db) => {
    const j = db.jobs.find((x) => x.id === id);
    if (!j) return false;
    j.enabled = enabled;
    return true;
  });
}

export function removeJob(id: string): boolean {
  return store.mutate((db) => {
    const j = db.jobs.find((x) => x.id === id);
    if (!j || j.managedByVercelCron) return false; // built-in crons can be disabled but not deleted
    db.jobs = db.jobs.filter((x) => x.id !== id);
    return true;
  });
}

export function recordRun(jobId: string, jobName: string, ok: boolean, durationMs: number, detail?: string): JobRun {
  return store.mutate((db) => {
    const run: JobRun = { id: shortId("run"), jobId, jobName, ok, durationMs, detail, at: new Date().toISOString() };
    db.runs.unshift(run);
    db.runs = db.runs.slice(0, 300);
    return run;
  });
}

export function listRuns(jobId?: string, limit = 50): JobRun[] {
  const rows = store.read().runs;
  return (jobId ? rows.filter((r) => r.jobId === jobId) : rows).slice(0, limit);
}

export function jobsStats(): { totalJobs: number; enabled: number; runsToday: number; failuresToday: number } {
  const db = store.read();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = db.runs.filter((r) => new Date(r.at).getTime() >= startOfDay.getTime());
  return {
    totalJobs: db.jobs.length,
    enabled: db.jobs.filter((j) => j.enabled).length,
    runsToday: today.length,
    failuresToday: today.filter((r) => !r.ok).length,
  };
}
