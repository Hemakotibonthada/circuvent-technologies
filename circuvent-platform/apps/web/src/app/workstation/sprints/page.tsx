"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

/* ── Types ──────────────────────────────────────────────── */

interface Sprint {
  id: string;
  boardId: string;
  name: string;
  goal: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startDate: string;
  endDate: string;
  taskIds: string[];
  velocity: number | null;
  scopeChanges: Array<{ taskId: string; action: string; changedAt: string }>;
  createdAt: string;
}

interface BurndownEntry {
  date: string;
  remainingPoints: number;
  idealRemaining: number;
  completedPoints: number;
}

interface VelocityEntry {
  sprintId: string;
  sprintName: string;
  completedPoints: number;
  committedPoints: number;
  completionRate: number;
}

interface SprintReport {
  sprint: Sprint;
  completedTasks: TaskInfo[];
  remainingTasks: TaskInfo[];
  totalCommitted: number;
  totalCompleted: number;
  completionRate: number;
  avgCycleTimeDays: number;
}

interface TaskInfo {
  id: string;
  title: string;
  taskCode: string;
  status: string;
  storyPoints: number;
  assigneeId: string | null;
}

interface Board {
  id: string;
  name: string;
}

/* ── Color Maps ─────────────────────────────────────────── */

const statusColors: Record<string, string> = {
  PLANNED: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
  ACTIVE: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  COMPLETED: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  CANCELLED: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
};

/* ── Component ──────────────────────────────────────────── */

export default function SprintsPage() {
  const { token } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [currentSprint, setCurrentSprint] = useState<Sprint | null>(null);
  const [burndown, setBurndown] = useState<BurndownEntry[]>([]);
  const [velocity, setVelocity] = useState<VelocityEntry[]>([]);
  const [report, setReport] = useState<SprintReport | null>(null);
  const [backlog, setBacklog] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"current" | "planning" | "history" | "report">("current");
  const [showCreate, setShowCreate] = useState(false);
  const [sprintForm, setSprintForm] = useState({ name: "", goal: "", startDate: "", endDate: "" });

  const loadBoards = useCallback(async () => {
    if (!token) return;
    const res = await api.get<Board[]>("/hr/workstation/boards", token);
    if (res.success && res.data && res.data.length > 0) {
      setBoards(res.data);
      setSelectedBoardId(res.data[0].id);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { loadBoards(); }, [loadBoards]);

  const loadSprintData = useCallback(async () => {
    if (!token || !selectedBoardId) return;
    setLoading(true);
    const [sprintsRes, currentRes, velocityRes, backlogRes] = await Promise.all([
      api.get<Sprint[]>(`/hr/workstation/boards/${selectedBoardId}/sprints`, token),
      api.get<Sprint>(`/hr/workstation/boards/${selectedBoardId}/sprints/current`, token),
      api.get<VelocityEntry[]>(`/hr/workstation/boards/${selectedBoardId}/velocity`, token),
      api.get<TaskInfo[]>(`/hr/workstation/boards/${selectedBoardId}/backlog`, token),
    ]);
    if (sprintsRes.success) setSprints(sprintsRes.data ?? []);
    if (currentRes.success && currentRes.data) {
      setCurrentSprint(currentRes.data);
      const bdRes = await api.get<BurndownEntry[]>(`/hr/workstation/sprints/${currentRes.data.id}/burndown`, token);
      if (bdRes.success) setBurndown(bdRes.data ?? []);
    } else {
      setCurrentSprint(null);
      setBurndown([]);
    }
    if (velocityRes.success) setVelocity(velocityRes.data ?? []);
    if (backlogRes.success) setBacklog(backlogRes.data ?? []);
    setLoading(false);
  }, [token, selectedBoardId]);

  useEffect(() => { if (selectedBoardId) loadSprintData(); }, [selectedBoardId, loadSprintData]);

  const loadReport = async (sprintId: string) => {
    if (!token) return;
    const res = await api.get<SprintReport>(`/hr/workstation/sprints/${sprintId}/report`, token);
    if (res.success && res.data) {
      setReport(res.data);
      setTab("report");
    }
  };

  const createSprint = async () => {
    if (!token || !selectedBoardId || !sprintForm.name || !sprintForm.startDate || !sprintForm.endDate) return;
    await api.post(`/hr/workstation/boards/${selectedBoardId}/sprints`, sprintForm, token);
    setSprintForm({ name: "", goal: "", startDate: "", endDate: "" });
    setShowCreate(false);
    loadSprintData();
  };

  const startSprint = async (sprintId: string) => {
    if (!token) return;
    await api.post(`/hr/workstation/sprints/${sprintId}/start`, {}, token);
    loadSprintData();
  };

  const completeSprint = async (sprintId: string) => {
    if (!token) return;
    await api.post(`/hr/workstation/sprints/${sprintId}/complete`, { moveUnfinishedTo: null }, token);
    loadSprintData();
  };

  const avgVelocity = useMemo(() => {
    if (velocity.length === 0) return 0;
    return Math.round(velocity.reduce((s, v) => s + v.completedPoints, 0) / velocity.length);
  }, [velocity]);

  /* ── Render ──────────────────────────────────────── */

  if (loading && boards.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/workstation" className="text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Back to WorkStation</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">🏃 Sprint Management</h1>
        </div>
        <div className="flex gap-2 items-center">
          <select value={selectedBoardId} onChange={(e) => setSelectedBoardId(e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm">
            {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm">+ New Sprint</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Sprints", value: sprints.length, icon: "📊" },
          { label: "Current Sprint", value: currentSprint?.name ?? "None", icon: "🏃" },
          { label: "Avg Velocity", value: `${avgVelocity} SP`, icon: "⚡" },
          { label: "Backlog Items", value: backlog.length, icon: "📋" },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-2xl mb-1">{s.icon}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{s.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
        {(["current", "planning", "history", "report"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 text-sm rounded-lg ${tab === t ? "bg-brand-600 text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
            {t === "current" ? "Current Sprint" : t === "planning" ? "Sprint Planning" : t === "history" ? "History & Velocity" : "Sprint Report"}
          </button>
        ))}
      </div>

      {/* Current Sprint Tab */}
      {tab === "current" && (
        <div>
          {!currentSprint ? (
            <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              <p className="text-4xl mb-3">🏃</p>
              <p className="text-lg text-slate-500 dark:text-slate-400">No active sprint</p>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Start a planned sprint or create a new one</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Sprint Info */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{currentSprint.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{currentSprint.goal}</p>
                  </div>
                  <div className="flex gap-2">
                    <span className={`px-2 py-1 rounded text-xs ${statusColors[currentSprint.status]}`}>{currentSprint.status}</span>
                    <button onClick={() => completeSprint(currentSprint.id)} className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700">Complete Sprint</button>
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                  <span>📅 {new Date(currentSprint.startDate).toLocaleDateString()} — {new Date(currentSprint.endDate).toLocaleDateString()}</span>
                  <span>📋 {currentSprint.taskIds.length} tasks</span>
                  <span>🔄 {currentSprint.scopeChanges.length} scope changes</span>
                </div>
              </div>

              {/* Burndown Chart (text-based) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">📉 Sprint Burndown</h3>
                {burndown.length > 0 ? (
                  <div className="space-y-1">
                    {burndown.map((entry) => {
                      const maxPoints = burndown[0]?.remainingPoints || 1;
                      const actualWidth = Math.max(0, (entry.remainingPoints / maxPoints) * 100);
                      const idealWidth = Math.max(0, (entry.idealRemaining / maxPoints) * 100);
                      return (
                        <div key={entry.date} className="flex items-center gap-2 text-xs">
                          <span className="w-20 text-slate-500 dark:text-slate-400 flex-shrink-0">{entry.date.slice(5)}</span>
                          <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-700 rounded relative overflow-hidden">
                            <div className="absolute h-full bg-blue-200 dark:bg-blue-800 rounded" style={{ width: `${idealWidth}%` }} />
                            <div className="absolute h-full bg-brand-500 rounded" style={{ width: `${actualWidth}%` }} />
                          </div>
                          <span className="w-12 text-right text-slate-500 dark:text-slate-400">{entry.remainingPoints}</span>
                        </div>
                      );
                    })}
                    <div className="flex gap-4 mt-2 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1"><span className="w-3 h-2 bg-brand-500 rounded" /> Actual</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-200 dark:bg-blue-800 rounded" /> Ideal</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No burndown data yet</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Planning Tab */}
      {tab === "planning" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Planned Sprints */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">📋 Planned Sprints</h3>
            <div className="space-y-2">
              {sprints.filter((s) => s.status === "PLANNED").length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No planned sprints</p>
              ) : (
                sprints.filter((s) => s.status === "PLANNED").map((sprint) => (
                  <div key={sprint.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{sprint.name}</span>
                      <button onClick={() => startSprint(sprint.id)} className="px-2 py-1 bg-brand-600 text-white rounded text-xs hover:bg-brand-700">Start</button>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{sprint.goal || "No goal set"}</p>
                    <p className="text-xs text-slate-400 mt-1">{sprint.taskIds.length} tasks | {new Date(sprint.startDate).toLocaleDateString()} — {new Date(sprint.endDate).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Backlog */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">📦 Backlog ({backlog.length})</h3>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {backlog.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">Backlog is empty</p>
              ) : (
                backlog.map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded">
                    <div className="flex-1">
                      <span className="text-[10px] text-slate-400 font-mono mr-2">{task.taskCode}</span>
                      <span className="text-sm text-slate-900 dark:text-white">{task.title}</span>
                    </div>
                    {task.storyPoints > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-400 rounded">{task.storyPoints} SP</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* History & Velocity Tab */}
      {tab === "history" && (
        <div className="space-y-4">
          {/* Velocity Chart */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">⚡ Velocity Chart</h3>
            {velocity.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No completed sprints yet</p>
            ) : (
              <div className="space-y-2">
                {velocity.map((v) => {
                  const maxPts = Math.max(...velocity.map((e) => Math.max(e.completedPoints, e.committedPoints)), 1);
                  return (
                    <div key={v.sprintId} className="flex items-center gap-2">
                      <span className="w-28 text-xs text-slate-500 dark:text-slate-400 truncate">{v.sprintName}</span>
                      <div className="flex-1 space-y-0.5">
                        <div className="h-3 bg-green-500 rounded" style={{ width: `${(v.completedPoints / maxPts) * 100}%` }} title={`Completed: ${v.completedPoints}`} />
                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded" style={{ width: `${(v.committedPoints / maxPts) * 100}%` }} title={`Committed: ${v.committedPoints}`} />
                      </div>
                      <span className="w-16 text-right text-xs text-slate-500 dark:text-slate-400">{v.completedPoints}/{v.committedPoints}</span>
                      <span className="w-12 text-right text-xs text-slate-400">{v.completionRate}%</span>
                    </div>
                  );
                })}
                <div className="flex gap-4 mt-2 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-green-500 rounded" /> Completed</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-slate-200 dark:bg-slate-700 rounded" /> Committed</span>
                </div>
              </div>
            )}
          </div>

          {/* Sprint History */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">📜 Sprint History</h3>
            <div className="space-y-2">
              {sprints.filter((s) => s.status === "COMPLETED").length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No completed sprints</p>
              ) : (
                sprints.filter((s) => s.status === "COMPLETED").map((sprint) => (
                  <div key={sprint.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div>
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{sprint.name}</span>
                      <p className="text-xs text-slate-400">{new Date(sprint.startDate).toLocaleDateString()} — {new Date(sprint.endDate).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">{sprint.velocity ?? 0} SP</span>
                      <button onClick={() => loadReport(sprint.id)} className="px-2 py-1 text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400">View Report</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sprint Report Tab */}
      {tab === "report" && (
        <div>
          {!report ? (
            <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              <p className="text-4xl mb-3">📊</p>
              <p className="text-lg text-slate-500 dark:text-slate-400">Select a sprint from History to view its report</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{report.sprint.name} — Report</h3>
                <div className="grid grid-cols-4 gap-4 mt-4">
                  <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{report.totalCompleted}</p>
                    <p className="text-xs text-slate-400">Points Completed</p>
                  </div>
                  <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{report.totalCommitted}</p>
                    <p className="text-xs text-slate-400">Points Committed</p>
                  </div>
                  <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-2xl font-bold text-brand-600">{report.completionRate}%</p>
                    <p className="text-xs text-slate-400">Completion Rate</p>
                  </div>
                  <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-2xl font-bold text-amber-600">{report.avgCycleTimeDays}d</p>
                    <p className="text-xs text-slate-400">Avg Cycle Time</p>
                  </div>
                </div>
              </div>

              {/* Completed & Remaining */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2">✅ Completed ({report.completedTasks.length})</h4>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {report.completedTasks.map((t) => (
                      <div key={t.id} className="flex justify-between text-sm p-1">
                        <span className="text-slate-900 dark:text-white">{t.taskCode} {t.title}</span>
                        <span className="text-xs text-slate-400">{t.storyPoints} SP</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">⏳ Remaining ({report.remainingTasks.length})</h4>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {report.remainingTasks.map((t) => (
                      <div key={t.id} className="flex justify-between text-sm p-1">
                        <span className="text-slate-900 dark:text-white">{t.taskCode} {t.title}</span>
                        <span className="text-xs text-slate-400">{t.storyPoints} SP</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Sprint Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Create Sprint</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Sprint Name</label>
                <input value={sprintForm.name} onChange={(e) => setSprintForm({ ...sprintForm, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm" placeholder="Sprint 1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Sprint Goal</label>
                <textarea value={sprintForm.goal} onChange={(e) => setSprintForm({ ...sprintForm, goal: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm" rows={2} placeholder="What we want to achieve..." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date</label>
                  <input type="date" value={sprintForm.startDate} onChange={(e) => setSprintForm({ ...sprintForm, startDate: e.target.value })} className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">End Date</label>
                  <input type="date" value={sprintForm.endDate} onChange={(e) => setSprintForm({ ...sprintForm, endDate: e.target.value })} className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm text-slate-600 dark:text-slate-400">Cancel</button>
              <button onClick={createSprint} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm">Create Sprint</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
