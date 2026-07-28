"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, Play, Plus, Server, ToggleLeft, ToggleRight, Trash2, X } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface JobDefinition {
  id: string;
  name: string;
  endpoint: string;
  method: "GET" | "POST";
  scheduleDescription: string;
  managedByVercelCron: boolean;
  enabled: boolean;
}
interface JobRun {
  id: string;
  jobId: string;
  jobName: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
  at: string;
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

export default function JobsPanel() {
  const [jobs, setJobs] = useState<JobDefinition[]>([]);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [stats, setStats] = useState<{ totalJobs: number; enabled: number; runsToday: number; failuresToday: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; endpoint: string; method: "GET" | "POST"; scheduleDescription: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/jobs", { headers: { "x-admin-token": tok() } });
    if (res.ok) {
      const d = await res.json();
      setJobs(d.jobs || []);
      setRuns(d.runs || []);
      setStats(d.stats || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runNow = async (job: JobDefinition) => {
    setRunning(job.id);
    const started = Date.now();
    let ok = false;
    let detail = "";
    try {
      const res = await fetch(job.endpoint, { method: job.method, headers: { "x-admin-token": tok() } });
      ok = res.ok;
      const d = await res.json().catch(() => ({}));
      detail = JSON.stringify(d).slice(0, 200);
    } catch (e) {
      detail = e instanceof Error ? e.message : "Network error";
    }
    await fetch("/api/admin/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "run-result", jobId: job.id, jobName: job.name, ok, durationMs: Date.now() - started, detail }),
    });
    setRunning(null);
    load();
  };

  const toggle = async (job: JobDefinition) => {
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, enabled: !j.enabled } : j)));
    await fetch("/api/admin/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id: job.id, enabled: !job.enabled }),
    });
  };

  const remove = async (id: string) => {
    await fetch(`/api/admin/jobs?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  const addJob = async () => {
    if (!form?.name || !form.endpoint) return;
    await fetch("/api/admin/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify(form),
    });
    setForm(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Server className="w-5 h-5" /> Ops & Scheduled Jobs
          </h2>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Scheduled task registry, manual triggers and run history.</p>
        </div>
        <button onClick={() => setForm({ name: "", endpoint: "", method: "POST", scheduleDescription: "Manual trigger only" })} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
          <Plus className="w-4 h-4" /> Add job
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Jobs", value: stats.totalJobs },
            { label: "Enabled", value: stats.enabled, color: "#22c55e" },
            { label: "Runs today", value: stats.runsToday },
            { label: "Failures today", value: stats.failuresToday, color: stats.failuresToday ? "#ef4444" : undefined },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3" style={card}>
              <div className="text-2xl font-extrabold" style={{ color: s.color || "var(--text-primary)" }}>{s.value}</div>
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <>
          <div className="space-y-2">
            {jobs.map((j) => (
              <div key={j.id} className="rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap" style={card}>
                <div>
                  <div className="font-medium" style={{ color: "var(--text-primary)" }}>{j.name}</div>
                  <div className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>{j.method} {j.endpoint}</div>
                  <div className="text-xs flex items-center gap-1 mt-0.5" style={{ color: "var(--text-tertiary)" }}><Clock className="w-3 h-3" /> {j.scheduleDescription}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => runNow(j)} disabled={running === j.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
                    {running === j.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run now
                  </button>
                  <button onClick={() => toggle(j)}>{j.enabled ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6 text-slate-500" />}</button>
                  {!j.managedByVercelCron && <button onClick={() => remove(j.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-red-400"><Trash2 className="w-4 h-4" /></button>}
                </div>
              </div>
            ))}
          </div>

          {runs.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Recent runs</h3>
              <div className="space-y-1.5">
                {runs.slice(0, 15).map((r) => (
                  <div key={r.id} className="text-xs flex justify-between rounded-lg px-3 py-1.5" style={{ background: "var(--bg-glass)" }}>
                    <span style={{ color: r.ok ? "#22c55e" : "#ef4444" }}>{r.jobName} — {r.ok ? "success" : "failed"}</span>
                    <span style={{ color: "var(--text-tertiary)" }}>{r.durationMs}ms · {new Date(r.at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>Add custom job</h3>
              <button onClick={() => setForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button>
            </div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="/api/admin/…" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} />
              <select className={field} style={inputStyle} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as "GET" | "POST" })}>
                <option value="POST">POST</option>
                <option value="GET">GET</option>
              </select>
              <input className={field} style={inputStyle} placeholder="Schedule note" value={form.scheduleDescription} onChange={(e) => setForm({ ...form, scheduleDescription: e.target.value })} />
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Custom jobs are triggered manually from here. To run on a real schedule, add a matching entry to vercel.json crons.</p>
              <button onClick={addJob} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Add job</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
