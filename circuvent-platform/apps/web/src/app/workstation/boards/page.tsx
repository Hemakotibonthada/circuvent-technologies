"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

/* ── Types ──────────────────────────────────────────────── */

interface Column {
  id: string;
  name: string;
  color: string;
  wipLimit: number;
  order: number;
  taskIds: string[];
}

interface Board {
  id: string;
  name: string;
  description: string;
  projectId: string | null;
  columns: Column[];
  createdAt: string;
  createdBy: string;
}

interface Task {
  id: string;
  taskCode: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  storyPoints: number;
  assigneeId: string | null;
  labels: string[];
  columnId: string;
  boardId: string;
  completedAt: string | null;
  createdAt: string;
}

interface BoardMetrics {
  tasksPerColumn: Record<string, number>;
  totalTasks: number;
  completedTasks: number;
  avgCycleTimeDays: number;
  wipViolations: Array<{ columnId: string; columnName: string; current: number; limit: number }>;
  storyPointsCompleted: number;
  storyPointsRemaining: number;
}

/* ── Color Maps ─────────────────────────────────────────── */

const priorityColors: Record<string, string> = {
  CRITICAL: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  HIGH: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400",
  MEDIUM: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  LOW: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
};

const typeIcons: Record<string, string> = { BUG: "🐛", STORY: "📖", TASK: "✅", EPIC: "⚡" };

/* ── Component ──────────────────────────────────────────── */

export default function BoardsPage() {
  const { token } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [metrics, setMetrics] = useState<BoardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [boardForm, setBoardForm] = useState({ name: "", description: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", type: "TASK", priority: "MEDIUM", storyPoints: 0 });
  const [view, setView] = useState<"list" | "board">("list");

  const loadBoards = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await api.get<Board[]>("/hr/workstation/boards", token);
    if (res.success && res.data) setBoards(res.data);
    setLoading(false);
  }, [token]);

  useEffect(() => { loadBoards(); }, [loadBoards]);

  const loadBoardDetail = useCallback(async (boardId: string) => {
    if (!token) return;
    const [boardRes, tasksRes, metricsRes] = await Promise.all([
      api.get<Board>(`/hr/workstation/boards/${boardId}`, token),
      api.get<Task[]>(`/hr/workstation/boards/${boardId}/tasks`, token),
      api.get<BoardMetrics>(`/hr/workstation/boards/${boardId}/metrics`, token),
    ]);
    if (boardRes.success && boardRes.data) setSelectedBoard(boardRes.data);
    if (tasksRes.success && tasksRes.data) setTasks(tasksRes.data);
    if (metricsRes.success && metricsRes.data) setMetrics(metricsRes.data);
    setView("board");
  }, [token]);

  const createBoard = async () => {
    if (!token || !boardForm.name) return;
    await api.post("/hr/workstation/boards", {
      name: boardForm.name,
      description: boardForm.description,
      columns: [
        { name: "Backlog", color: "#6366f1", wipLimit: 0 },
        { name: "To Do", color: "#3b82f6", wipLimit: 5 },
        { name: "In Progress", color: "#f59e0b", wipLimit: 3 },
        { name: "In Review", color: "#8b5cf6", wipLimit: 3 },
        { name: "Done", color: "#10b981", wipLimit: 0 },
      ],
    }, token);
    setBoardForm({ name: "", description: "" });
    setShowCreateBoard(false);
    loadBoards();
  };

  const createTask = async () => {
    if (!token || !selectedBoard || !activeColumnId || !taskForm.title) return;
    await api.post(`/hr/workstation/boards/${selectedBoard.id}/tasks`, {
      columnId: activeColumnId,
      ...taskForm,
    }, token);
    setTaskForm({ title: "", description: "", type: "TASK", priority: "MEDIUM", storyPoints: 0 });
    setShowCreateTask(false);
    loadBoardDetail(selectedBoard.id);
  };

  const deleteBoard = async (boardId: string) => {
    if (!token) return;
    await api.delete(`/hr/workstation/boards/${boardId}`, token);
    if (selectedBoard?.id === boardId) {
      setSelectedBoard(null);
      setView("list");
    }
    loadBoards();
  };

  const getColumnTasks = (columnId: string): Task[] =>
    tasks.filter((t) => t.columnId === columnId);

  /* ── Render ──────────────────────────────────────── */

  if (loading) {
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">📋 Kanban Boards</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage tasks with drag-and-drop boards</p>
        </div>
        <div className="flex gap-2">
          {selectedBoard && (
            <button onClick={() => { setSelectedBoard(null); setView("list"); }} className="px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 text-sm">
              All Boards
            </button>
          )}
          <button onClick={() => setShowCreateBoard(true)} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm">
            + New Board
          </button>
        </div>
      </div>

      {/* Board List View */}
      {view === "list" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {boards.length === 0 ? (
            <div className="col-span-full text-center py-20">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-lg text-slate-500 dark:text-slate-400">No boards yet</p>
              <button onClick={() => setShowCreateBoard(true)} className="mt-3 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm">
                Create your first board
              </button>
            </div>
          ) : (
            boards.map((board) => (
              <div key={board.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => loadBoardDetail(board.id)}>
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{board.name}</h3>
                  <button onClick={(e) => { e.stopPropagation(); deleteBoard(board.id); }} className="text-slate-400 hover:text-red-500 text-sm">✕</button>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">{board.description || "No description"}</p>

                {/* Column Preview */}
                <div className="flex gap-1 mb-3">
                  {board.columns.map((col) => (
                    <div key={col.id} className="flex-1 h-2 rounded-full" style={{ backgroundColor: col.color, opacity: 0.6 }} title={`${col.name}: ${col.taskIds.length} tasks`} />
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{board.columns.length} columns</span>
                  <span>{board.columns.reduce((s, c) => s + c.taskIds.length, 0)} tasks</span>
                  <span>{new Date(board.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Board Detail View */}
      {view === "board" && selectedBoard && (
        <div>
          {/* Board Header */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selectedBoard.name}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{selectedBoard.description}</p>
              </div>
              <div className="flex gap-2">
                {metrics && (
                  <div className="flex gap-3 text-xs">
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">{metrics.totalTasks} tasks</span>
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">{metrics.completedTasks} done</span>
                    <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded">{metrics.storyPointsCompleted} SP done</span>
                    {metrics.avgCycleTimeDays > 0 && (
                      <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">{metrics.avgCycleTimeDays}d avg cycle</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* WIP Violations */}
            {metrics && metrics.wipViolations.length > 0 && (
              <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-xs font-medium text-red-700 dark:text-red-400">⚠️ WIP Limit Violations:</p>
                {metrics.wipViolations.map((v) => (
                  <p key={v.columnId} className="text-xs text-red-600 dark:text-red-400 ml-4">
                    {v.columnName}: {v.current}/{v.limit} tasks
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Kanban Columns */}
          <div className="flex gap-3 overflow-x-auto pb-4">
            {selectedBoard.columns
              .sort((a, b) => a.order - b.order)
              .map((column) => {
                const colTasks = getColumnTasks(column.id);
                const isOverWip = column.wipLimit > 0 && colTasks.length > column.wipLimit;

                return (
                  <div key={column.id} className={`flex-shrink-0 w-72 bg-slate-100 dark:bg-slate-800/50 rounded-xl p-3 ${isOverWip ? "ring-2 ring-red-500" : ""}`}>
                    {/* Column Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{column.name}</span>
                        <span className="text-xs px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full">
                          {colTasks.length}{column.wipLimit > 0 ? `/${column.wipLimit}` : ""}
                        </span>
                      </div>
                      <button onClick={() => { setActiveColumnId(column.id); setShowCreateTask(true); }} className="text-slate-400 hover:text-brand-600 text-lg" title="Add task">+</button>
                    </div>

                    {/* Tasks */}
                    <div className="space-y-2 min-h-[100px]">
                      {colTasks.map((task) => (
                        <div key={task.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                          <div className="flex items-start justify-between mb-1">
                            <span className="text-[10px] text-slate-400 font-mono">{task.taskCode}</span>
                            <span className="text-xs">{typeIcons[task.type] ?? "📌"}</span>
                          </div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white mb-2 line-clamp-2">{task.title}</p>
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${priorityColors[task.priority] ?? ""}`}>
                              {task.priority}
                            </span>
                            <div className="flex items-center gap-2">
                              {task.storyPoints > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded">{task.storyPoints} SP</span>
                              )}
                              {task.labels.length > 0 && (
                                <span className="text-[10px] text-slate-400">🏷️{task.labels.length}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Create Board Modal */}
      {showCreateBoard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Create New Board</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Board Name</label>
                <input value={boardForm.name} onChange={(e) => setBoardForm({ ...boardForm, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm" placeholder="Sprint Board" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <textarea value={boardForm.description} onChange={(e) => setBoardForm({ ...boardForm, description: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm" rows={3} placeholder="Board description..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCreateBoard(false)} className="px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">Cancel</button>
              <button onClick={createBoard} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm">Create Board</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Create Task</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title</label>
                <input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm" placeholder="Task title" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <textarea value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm" rows={2} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Type</label>
                  <select value={taskForm.type} onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value })} className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm">
                    <option value="TASK">Task</option>
                    <option value="BUG">Bug</option>
                    <option value="STORY">Story</option>
                    <option value="EPIC">Epic</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Priority</label>
                  <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })} className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm">
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Story Points</label>
                  <input type="number" value={taskForm.storyPoints} onChange={(e) => setTaskForm({ ...taskForm, storyPoints: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm" min="0" max="21" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCreateTask(false)} className="px-3 py-2 text-sm text-slate-600 dark:text-slate-400">Cancel</button>
              <button onClick={createTask} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm">Create Task</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
