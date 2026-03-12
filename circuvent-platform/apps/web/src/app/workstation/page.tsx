"use client";

import React, { useState, useMemo } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, CardHeader, StatCard, Badge, Button,
  Modal, Input, Textarea, EmptyState,
} from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { api } from "@/lib/api-client";

/* ── Types ──────────────────────────────────────────────── */

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

interface Board {
  id: string;
  name: string;
  description: string;
  columns: Column[];
  createdAt: string;
}

interface Column {
  id: string;
  name: string;
  order: number;
  tasks: Task[];
}

interface Task {
  id: string;
  name: string;
  taskCode: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  assigneeId: string | null;
  sprintId: string | null;
  storyPoints: number;
  labels: string[];
  columnId: string;
  createdAt: string;
  completedAt: string | null;
}

interface SprintData {
  id: string;
  name: string;
  goal: string;
  status: string;
  startDate: string;
  endDate: string;
  velocity: number;
  createdAt: string;
}

interface DashboardData {
  totalBoards: number;
  totalTasks: number;
  tasksByStatus: Record<string, number>;
  tasksByPriority: Record<string, number>;
  tasksByType: Record<string, number>;
  teamWorkload: Record<string, number>;
  avgVelocity: number;
  velocityData: Array<{ sprint: string; velocity: number }>;
  activeSprints: number;
}

/* ── Color maps ─────────────────────────────────────────── */

const priorityColors: Record<string, BadgeColor> = { CRITICAL: "red", HIGH: "orange", MEDIUM: "amber", LOW: "green" };
const typeIcons: Record<string, string> = { BUG: "🐛", STORY: "📖", TASK: "✅", EPIC: "⚡" };

/* ── Component ──────────────────────────────────────────── */

export default function WorkstationPage() {
  const { token, user } = useAuth();
  const { data: boards } = useApi<Array<{ id: string; name: string }>>("/hr/workstation/boards");
  const { data: sprints } = useApi<SprintData[]>("/hr/workstation/sprints");
  const { data: dashboardData } = useApi<DashboardData>("/hr/workstation/dashboard");
  const { data: backlogTasks, refetch: refetchBacklog } = useApi<Task[]>("/hr/workstation/backlog");

  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* Quick filters */
  const [filterMyTasks, setFilterMyTasks] = useState(false);
  const [filterHighPriority, setFilterHighPriority] = useState(false);
  const [filterType, setFilterType] = useState<string>("");

  /* Board detail */
  const { data: boardDetail, refetch: refetchBoard } = useApi<Board>(
    selectedBoardId ? `/hr/workstation/boards/${selectedBoardId}` : null,
  );

  /* Task creation form */
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newType, setNewType] = useState("TASK");
  const [newPriority, setNewPriority] = useState("MEDIUM");
  const [newStoryPoints, setNewStoryPoints] = useState("0");
  const [newLabels, setNewLabels] = useState("");

  /* Sprint creation form */
  const [sprintName, setSprintName] = useState("");
  const [sprintGoal, setSprintGoal] = useState("");
  const [sprintStart, setSprintStart] = useState("");
  const [sprintEnd, setSprintEnd] = useState("");

  /* Select first board on load */
  React.useEffect(() => {
    if (boards && boards.length > 0 && !selectedBoardId) {
      setSelectedBoardId(boards[0].id);
    }
  }, [boards, selectedBoardId]);

  /* ── Filtered columns/tasks ────────────────────────────── */

  const filteredBoard = useMemo(() => {
    if (!boardDetail) return null;
    const cols = boardDetail.columns.map((col) => {
      let tasks = [...col.tasks];
      if (filterMyTasks) tasks = tasks.filter((t) => t.assigneeId === user?.id);
      if (filterHighPriority) tasks = tasks.filter((t) => t.priority === "HIGH" || t.priority === "CRITICAL");
      if (filterType) tasks = tasks.filter((t) => t.type === filterType);
      return { ...col, tasks };
    });
    return { ...boardDetail, columns: cols };
  }, [boardDetail, filterMyTasks, filterHighPriority, filterType, user?.id]);

  /* ── Handlers ──────────────────────────────────────────── */

  const handleCreateTask = async () => {
    if (!newTitle) return;
    setSubmitting(true);
    await api.post("/hr/workstation/tasks", {
      title: newTitle,
      description: newDescription,
      type: newType,
      priority: newPriority,
      storyPoints: Number(newStoryPoints),
      labels: newLabels ? newLabels.split(",").map((s) => s.trim()) : [],
      boardId: selectedBoardId,
      userId: user?.id,
    }, token || undefined);
    setShowCreateTask(false);
    setNewTitle(""); setNewDescription(""); setNewType("TASK"); setNewPriority("MEDIUM"); setNewStoryPoints("0"); setNewLabels("");
    setSubmitting(false);
    refetchBoard();
    refetchBacklog();
  };

  const handleCreateSprint = async () => {
    if (!sprintName || !sprintStart || !sprintEnd) return;
    setSubmitting(true);
    await api.post("/hr/workstation/sprints", {
      name: sprintName,
      goal: sprintGoal,
      startDate: sprintStart,
      endDate: sprintEnd,
      boardId: selectedBoardId,
      userId: user?.id,
    }, token || undefined);
    setShowCreateSprint(false);
    setSprintName(""); setSprintGoal(""); setSprintStart(""); setSprintEnd("");
    setSubmitting(false);
  };

  const handleMoveTask = async (taskId: string, targetColumnId: string) => {
    await api.post(`/hr/workstation/tasks/${taskId}/move`, { targetColumnId }, token || undefined);
    refetchBoard();
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("text/plain", taskId);
  };

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) handleMoveTask(taskId, columnId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  /* ── Active Sprint ─────────────────────────────────────── */

  const activeSprint = sprints?.find((s) => s.status === "ACTIVE");

  /* ── Render ────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      <PageHeader
        title="WorkStation"
        subtitle="Boards, sprints, tasks — project management at your fingertips"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard title="Total Tasks" value={dashboardData?.totalTasks ?? "—"} color="blue" />
        <StatCard title="Boards" value={dashboardData?.totalBoards ?? "—"} color="purple" />
        <StatCard title="Active Sprints" value={dashboardData?.activeSprints ?? "—"} color="amber" />
        <StatCard title="Avg Velocity" value={dashboardData?.avgVelocity ?? "—"} color="green" />
        <StatCard title="In Progress" value={dashboardData?.tasksByStatus?.IN_PROGRESS ?? "—"} color="cyan" />
      </div>

      {/* Board selector + quick filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-center">
          <select
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
            value={selectedBoardId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedBoardId(e.target.value)}
          >
            <option value="">Select Board</option>
            {(boards || []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => setFilterMyTasks(!filterMyTasks)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                filterMyTasks
                  ? "bg-brand-100 dark:bg-brand-900 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300"
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              My Tasks
            </button>
            <button
              onClick={() => setFilterHighPriority(!filterHighPriority)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                filterHighPriority
                  ? "bg-red-100 dark:bg-red-900 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              High Priority
            </button>
            {["BUG", "STORY", "TASK", "EPIC"].map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(filterType === t ? "" : t)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  filterType === t
                    ? "bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                {typeIcons[t]} {t}
              </button>
            ))}
          </div>

          <Button onClick={() => setShowCreateTask(true)}>+ Task</Button>
          <Button onClick={() => setShowCreateSprint(true)}>+ Sprint</Button>
        </div>
      </Card>

      {/* Kanban Board */}
      {filteredBoard ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {filteredBoard.columns.map((col) => (
            <div
              key={col.id}
              className="min-w-[280px] max-w-[320px] flex-shrink-0 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
              onDrop={(e) => handleDrop(e, col.id)}
              onDragOver={handleDragOver}
            >
              {/* Column header */}
              <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{col.name}</h3>
                <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-full px-2 py-0.5">
                  {col.tasks.length}
                </span>
              </div>

              {/* Tasks */}
              <div className="p-2 space-y-2 min-h-[100px]">
                {col.tasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3 cursor-grab active:cursor-grabbing hover:shadow-md dark:hover:shadow-slate-700/30 transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-sm">{typeIcons[task.type] || "✅"}</span>
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{task.taskCode}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{task.title || task.name}</p>
                      </div>
                      <Badge color={priorityColors[task.priority] || "slate"}>{task.priority?.[0]}</Badge>
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex gap-1 flex-wrap">
                        {(task.labels || []).slice(0, 2).map((l) => (
                          <span key={l} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded px-1.5 py-0.5">{l}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        {task.storyPoints > 0 && (
                          <span className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full px-1.5 py-0.5 font-medium">
                            {task.storyPoints}
                          </span>
                        )}
                        {task.assigneeId && (
                          <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-[10px] font-bold text-brand-700 dark:text-brand-300">
                            {task.assigneeId.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No board selected" description="Select or create a board to get started." />
      )}

      {/* Active Sprint Panel */}
      {activeSprint && (
        <Card>
          <CardHeader title={`Active Sprint: ${activeSprint.name}`} />
          <div className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <span className="text-xs text-slate-400 dark:text-slate-500">Goal</span>
                <p className="text-sm text-slate-700 dark:text-slate-300">{activeSprint.goal || "None"}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400 dark:text-slate-500">Start</span>
                <p className="text-sm text-slate-700 dark:text-slate-300">{formatDate(activeSprint.startDate)}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400 dark:text-slate-500">End</span>
                <p className="text-sm text-slate-700 dark:text-slate-300">{formatDate(activeSprint.endDate)}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400 dark:text-slate-500">Status</span>
                <Badge color="green">{activeSprint.status}</Badge>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Velocity Chart (simple bar) */}
      {dashboardData && dashboardData.velocityData.length > 0 && (
        <Card>
          <CardHeader title="Sprint Velocity" />
          <div>
            <div className="flex items-end gap-3 h-40">
              {dashboardData.velocityData.map((v, i) => {
                const max = Math.max(...dashboardData.velocityData.map((d) => d.velocity), 1);
                const height = (v.velocity / max) * 100;
                return (
                  <div key={i} className="flex flex-col items-center flex-1">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{v.velocity}</span>
                    <div
                      className="w-full bg-brand-500 dark:bg-brand-400 rounded-t-md transition-all"
                      style={{ height: `${height}%`, minHeight: "4px" }}
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 truncate max-w-full">{v.sprint}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">
              Average velocity: <span className="font-semibold text-slate-700 dark:text-slate-300">{dashboardData.avgVelocity}</span> pts/sprint
            </p>
          </div>
        </Card>
      )}

      {/* Backlog */}
      <Card>
        <CardHeader title={`Backlog (${backlogTasks?.length ?? 0} items)`} />
        {backlogTasks && backlogTasks.length > 0 ? (
          <div className="space-y-2">
            {backlogTasks.slice(0, 15).map((task) => (
              <div key={task.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800">
                <span>{typeIcons[task.type] || "✅"}</span>
                <span className="text-xs font-mono text-slate-400 dark:text-slate-500">{task.taskCode}</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white flex-1 truncate">{task.title || task.name}</span>
                <Badge color={priorityColors[task.priority] || "slate"}>{task.priority}</Badge>
                {task.storyPoints > 0 && (
                  <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full px-2 py-0.5">{task.storyPoints}</span>
                )}
              </div>
            ))}
            {backlogTasks.length > 15 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 text-center pt-2">+{backlogTasks.length - 15} more items</p>
            )}
          </div>
        ) : (
          <div className="text-center text-slate-400 dark:text-slate-500 text-sm py-4">Backlog is empty</div>
        )}
      </Card>

      {/* Create Task Modal */}
      <Modal open={showCreateTask} onClose={() => setShowCreateTask(false)} title="Create Task">
        <div className="space-y-4">
          <Input label="Title" value={newTitle} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTitle(e.target.value)} placeholder="Task title" />
          <Textarea label="Description" value={newDescription} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewDescription(e.target.value)} rows={3} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Type</label>
              <select
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                value={newType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewType(e.target.value)}
              >
                <option value="TASK">Task</option>
                <option value="BUG">Bug</option>
                <option value="STORY">Story</option>
                <option value="EPIC">Epic</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Priority</label>
              <select
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                value={newPriority}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewPriority(e.target.value)}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Story Points" type="number" value={newStoryPoints} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewStoryPoints(e.target.value)} />
            <Input label="Labels (comma-separated)" value={newLabels} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLabels(e.target.value)} placeholder="frontend, api" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreateTask(false)}>Cancel</Button>
            <Button onClick={handleCreateTask} disabled={submitting || !newTitle}>{submitting ? "Creating…" : "Create"}</Button>
          </div>
        </div>
      </Modal>

      {/* Create Sprint Modal */}
      <Modal open={showCreateSprint} onClose={() => setShowCreateSprint(false)} title="Create Sprint">
        <div className="space-y-4">
          <Input label="Sprint Name" value={sprintName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSprintName(e.target.value)} placeholder="Sprint 1" />
          <Textarea label="Goal" value={sprintGoal} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSprintGoal(e.target.value)} rows={2} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" type="date" value={sprintStart} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSprintStart(e.target.value)} />
            <Input label="End Date" type="date" value={sprintEnd} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSprintEnd(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreateSprint(false)}>Cancel</Button>
            <Button onClick={handleCreateSprint} disabled={submitting || !sprintName || !sprintStart || !sprintEnd}>
              {submitting ? "Creating…" : "Create Sprint"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
