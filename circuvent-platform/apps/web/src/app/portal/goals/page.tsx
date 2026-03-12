"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function GoalsPage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [goals, setGoals] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", description: "", category: "PROFESSIONAL", priority: "MEDIUM", targetDate: "", quarter: "Q1-2026" });

  useEffect(() => { if (token) loadEmployee(); }, [token]);
  useEffect(() => { if (employee) loadGoals(); }, [employee]);

  const loadEmployee = async () => {
    const res = await api.get<any[]>("/hr/employees", token!);
    if (res.success && res.data) setEmployee(res.data.find((e: any) => e.user?.email === user?.email) || res.data[0]);
  };

  const loadGoals = async () => {
    if (!employee) return;
    setLoading(true);
    const [goalsRes, statsRes] = await Promise.all([
      api.get<any[]>(`/hr/goals?employeeId=${employee.id}`, token!),
      api.get<any>(`/hr/goals/dashboard/stats?employeeId=${employee.id}`, token!),
    ]);
    if (goalsRes.success) setGoals(goalsRes.data || []);
    if (statsRes.success) setStats(statsRes.data);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!employee || !form.title) return;
    await api.post("/hr/goals", { ...form, employeeId: employee.id, targetDate: form.targetDate || undefined }, token!);
    setShowCreate(false);
    setForm({ title: "", description: "", category: "PROFESSIONAL", priority: "MEDIUM", targetDate: "", quarter: "Q1-2026" });
    loadGoals();
  };

  const handleProgress = async (id: string, progress: number) => {
    await api.patch(`/hr/goals/${id}`, { progress, status: progress >= 100 ? "COMPLETED" : "IN_PROGRESS" }, token!);
    loadGoals();
  };

  const priorityColors: Record<string, string> = { LOW: "text-slate-400", MEDIUM: "text-blue-400", HIGH: "text-amber-400", CRITICAL: "text-red-400" };
  const statusColors: Record<string, string> = {
    NOT_STARTED: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300", IN_PROGRESS: "bg-blue-900/50 text-blue-400",
    COMPLETED: "bg-emerald-900/50 text-emerald-400", DEFERRED: "bg-amber-900/50 text-amber-400", CANCELLED: "bg-red-900/50 text-red-400",
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-400 hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">🎯 My Goals & OKRs</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm">+ New Goal</button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Total", value: stats.total, color: "slate" },
            { label: "Completed", value: stats.completed, color: "emerald" },
            { label: "In Progress", value: stats.inProgress, color: "blue" },
            { label: "Not Started", value: stats.notStarted, color: "amber" },
            { label: "Avg Progress", value: `${Math.round(stats.avgProgress)}%`, color: "cyan" },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold text-${s.color}-400`}>{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Goals List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center text-slate-500 py-12">Loading goals...</div>
        ) : goals.length === 0 ? (
          <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No goals set yet. Create your first goal!</div>
        ) : goals.map(goal => (
          <div key={goal.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-white font-medium">{goal.title}</h3>
                  <span className={`px-2 py-0.5 text-xs rounded ${statusColors[goal.status]}`}>{goal.status.replace("_", " ")}</span>
                  <span className={`text-xs ${priorityColors[goal.priority]}`}>● {goal.priority}</span>
                </div>
                {goal.description && <p className="text-sm text-slate-400 mb-2">{goal.description}</p>}
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>📁 {goal.category}</span>
                  {goal.quarter && <span>📅 {goal.quarter}</span>}
                  {goal.targetDate && <span>🎯 Due: {new Date(goal.targetDate).toLocaleDateString()}</span>}
                </div>
              </div>
              <div className="text-right min-w-[80px]">
                <p className="text-2xl font-bold text-brand-400">{goal.progress}%</p>
              </div>
            </div>
            {/* Progress Bar */}
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all ${goal.progress >= 100 ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${goal.progress}%` }} />
              </div>
              {goal.status !== "COMPLETED" && (
                <div className="flex gap-1">
                  {[25, 50, 75, 100].map(p => (
                    <button key={p} onClick={() => handleProgress(goal.id, p)}
                      className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-400 rounded hover:bg-slate-200 dark:bg-slate-700 hover:text-white transition-colors">{p}%</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create Goal Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create New Goal</h2>
            <div className="space-y-3">
              <input placeholder="Goal title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              <textarea placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" rows={3} />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                  <option value="PROFESSIONAL">Professional</option><option value="LEARNING">Learning</option><option value="PROJECT">Project</option>
                </select>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                  <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
                </select>
                <input type="date" value={form.targetDate} onChange={e => setForm({ ...form, targetDate: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm" />
                <select value={form.quarter} onChange={e => setForm({ ...form, quarter: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                  {["Q1-2026","Q2-2026","Q3-2026","Q4-2026"].map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
              <button onClick={handleCreate} disabled={!form.title} className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">Create Goal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
