"use client";

import React, { useState, useMemo } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, StatCard, Badge, Button,
  Modal, Input, Textarea, Tabs, EmptyState,
} from "@/components/ui";
import { formatDate, timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

/* ── Types ──────────────────────────────────────────────── */

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

interface Task {
  id: string;
  taskCode: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  assigneeId: string | null;
  assigneeName?: string;
  sprintId: string | null;
  sprintName?: string;
  storyPoints: number;
  labels: string[];
  columnId: string;
  estimatedHours?: number;
  loggedHours?: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  subtasks?: Subtask[];
  timeLogs?: TimeLog[];
  comments?: TaskComment[];
}

interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

interface TimeLog {
  id: string;
  userId: string;
  userName: string;
  hours: number;
  description: string;
  date: string;
  createdAt: string;
}

interface TaskComment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

interface BoardInfo {
  id: string;
  name: string;
}

interface SprintInfo {
  id: string;
  name: string;
  status: string;
}

/* ── Color maps ─────────────────────────────────────────── */

const priorityColors: Record<string, BadgeColor> = { CRITICAL: "red", HIGH: "orange", MEDIUM: "amber", LOW: "green" };
const typeColors: Record<string, BadgeColor> = { BUG: "red", STORY: "green", TASK: "blue", EPIC: "purple" };
const typeIcons: Record<string, string> = { BUG: "🐛", STORY: "📖", TASK: "✅", EPIC: "⚡" };
const statusColors: Record<string, BadgeColor> = { TODO: "slate", IN_PROGRESS: "blue", IN_REVIEW: "amber", DONE: "green", BACKLOG: "purple", BLOCKED: "red" };
const STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"];
const TYPES = ["BUG", "STORY", "TASK", "EPIC"];
const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

/* ── Component ──────────────────────────────────────────── */

export default function TasksPage() {
  const { token, user } = useAuth();
  const { data: boards } = useApi<BoardInfo[]>("/hr/workstation/boards");
  const { data: sprints } = useApi<SprintInfo[]>("/hr/workstation/sprints");

  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* Filters */
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSprint, setFilterSprint] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  /* Detail tab */
  const [detailTab, setDetailTab] = useState("details");

  /* Create form */
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newType, setNewType] = useState("TASK");
  const [newPriority, setNewPriority] = useState("MEDIUM");
  const [newStoryPoints, setNewStoryPoints] = useState("0");
  const [newLabels, setNewLabels] = useState("");
  const [newEstimatedHours, setNewEstimatedHours] = useState("");

  /* Time log form */
  const [logHours, setLogHours] = useState("");
  const [logDescription, setLogDescription] = useState("");
  const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0]);

  /* Comment form */
  const [commentText, setCommentText] = useState("");

  /* Task List */
  const { data: tasks, refetch: refetchTasks } = useApi<Task[]>(
    selectedBoardId ? `/hr/workstation/boards/${selectedBoardId}/tasks` : "/hr/workstation/backlog",
  );

  /* Select first board */
  React.useEffect(() => {
    if (boards && boards.length > 0 && !selectedBoardId) {
      setSelectedBoardId(boards[0].id);
    }
  }, [boards, selectedBoardId]);

  /* ── Filtered tasks ────────────────────────────────────── */

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    let result = [...tasks];

    if (filterAssignee === "me") result = result.filter((t) => t.assigneeId === user?.id);
    else if (filterAssignee === "unassigned") result = result.filter((t) => !t.assigneeId);
    if (filterType) result = result.filter((t) => t.type === filterType);
    if (filterPriority) result = result.filter((t) => t.priority === filterPriority);
    if (filterStatus) result = result.filter((t) => t.status === filterStatus);
    if (filterSprint) result = result.filter((t) => t.sprintId === filterSprint);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) => t.title.toLowerCase().includes(q) || t.taskCode.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q),
      );
    }

    return result;
  }, [tasks, filterAssignee, filterType, filterPriority, filterStatus, filterSprint, searchQuery, user?.id]);

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
      estimatedHours: newEstimatedHours ? Number(newEstimatedHours) : undefined,
      labels: newLabels ? newLabels.split(",").map((s) => s.trim()) : [],
      boardId: selectedBoardId,
      userId: user?.id,
    }, token || undefined);
    setShowCreateModal(false);
    setNewTitle(""); setNewDescription(""); setNewType("TASK"); setNewPriority("MEDIUM"); setNewStoryPoints("0"); setNewLabels(""); setNewEstimatedHours("");
    setSubmitting(false);
    refetchTasks();
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    await api.put(`/hr/workstation/tasks/${taskId}/status`, { status: newStatus }, token || undefined);
    refetchTasks();
    if (selectedTask?.id === taskId) {
      setSelectedTask({ ...selectedTask, status: newStatus });
    }
  };

  const handleLogTime = async () => {
    if (!selectedTask || !logHours) return;
    setSubmitting(true);
    await api.post(`/hr/workstation/tasks/${selectedTask.id}/time-log`, {
      hours: Number(logHours),
      description: logDescription,
      date: logDate,
      userId: user?.id,
      userName: user?.firstName || "User",
    }, token || undefined);
    setLogHours(""); setLogDescription("");
    setSubmitting(false);
    const res = await api.get(`/hr/workstation/tasks/${selectedTask.id}`, token || undefined);
    if (res.success) setSelectedTask(res.data as any);
  };

  const handleAddComment = async () => {
    if (!selectedTask || !commentText) return;
    setSubmitting(true);
    await api.post(`/hr/workstation/tasks/${selectedTask.id}/comments`, {
      content: commentText,
      userId: user?.id,
      userName: user?.firstName || "User",
    }, token || undefined);
    setCommentText("");
    setSubmitting(false);
    const res = await api.get(`/hr/workstation/tasks/${selectedTask.id}`, token || undefined);
    if (res.success) setSelectedTask(res.data as any);
  };

  const handleViewTask = async (task: Task) => {
    const res = await api.get(`/hr/workstation/tasks/${task.id}`, token || undefined);
    if (res.success) setSelectedTask(res.data as any);
    else setSelectedTask(task);
    setDetailTab("details");
  };

  /* ── Task Stats ────────────────────────────────────────── */

  const taskStats = useMemo(() => {
    if (!tasks) return null;
    return {
      total: tasks.length,
      todo: tasks.filter((t) => t.status === "TODO").length,
      inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
      done: tasks.filter((t) => t.status === "DONE").length,
      bugs: tasks.filter((t) => t.type === "BUG").length,
      totalPoints: tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0),
    };
  }, [tasks]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Tasks"
        subtitle="Task list and detail view"
        actions={<Button onClick={() => setShowCreateModal(true)}>+ Create Task</Button>}
      />

      {/* Stats */}
      {taskStats && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <StatCard title="Total" value={taskStats.total} color="blue" />
          <StatCard title="To Do" value={taskStats.todo} color="slate" />
          <StatCard title="In Progress" value={taskStats.inProgress} color="blue" />
          <StatCard title="Done" value={taskStats.done} color="green" />
          <StatCard title="Bugs" value={taskStats.bugs} color="red" />
          <StatCard title="Story Points" value={taskStats.totalPoints} color="purple" />
        </div>
      )}

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-center">
          <Input placeholder="Search tasks..." value={searchQuery} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)} className="w-56" />
          <select className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white" value={selectedBoardId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedBoardId(e.target.value)}>
            <option value="">All Boards</option>
            {boards?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white" value={filterAssignee} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterAssignee(e.target.value)}>
            <option value="">All Assignees</option>
            <option value="me">Assigned to Me</option>
            <option value="unassigned">Unassigned</option>
          </select>
          <select className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white" value={filterType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {TYPES.map((t) => <option key={t} value={t}>{typeIcons[t]} {t}</option>)}
          </select>
          <select className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white" value={filterPriority} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterPriority(e.target.value)}>
            <option value="">All Priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white" value={filterStatus} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          {sprints && sprints.length > 0 && (
            <select className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white" value={filterSprint} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterSprint(e.target.value)}>
              <option value="">All Sprints</option>
              {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task List */}
        <div className="lg:col-span-2 space-y-2">
          {filteredTasks.length > 0 ? (
            filteredTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => handleViewTask(task)}
                className={`cursor-pointer hover:shadow-md transition-shadow rounded-xl border p-6 bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 ${selectedTask?.id === task.id ? "ring-2 ring-blue-500" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{typeIcons[task.type] || "📋"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{task.taskCode}</span>
                      <h4 className="font-medium text-sm text-slate-900 dark:text-white truncate">{task.title}</h4>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge color={priorityColors[task.priority] || "slate"}>{task.priority}</Badge>
                      <Badge color={statusColors[task.status] || "slate"}>{task.status.replace(/_/g, " ")}</Badge>
                      {task.storyPoints > 0 && <span className="text-xs text-slate-500 dark:text-slate-400">⭐ {task.storyPoints}</span>}
                      {task.assigneeName && <span className="text-xs text-slate-500 dark:text-slate-400">👤 {task.assigneeName}</span>}
                    </div>
                  </div>
                  {/* Status change dropdown */}
                  <select
                    value={task.status}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { e.stopPropagation(); handleStatusChange(task.id, e.target.value); }}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    className="text-xs border border-slate-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="No tasks found" description="Create a task or adjust filters" />
          )}
        </div>

        {/* Task Detail Panel */}
        <div className="space-y-4">
          {selectedTask ? (
            <>
              <Card>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{typeIcons[selectedTask.type] || "📋"}</span>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{selectedTask.taskCode}</span>
                    <Badge color={typeColors[selectedTask.type] || "slate"}>{selectedTask.type}</Badge>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedTask.title}</h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge color={priorityColors[selectedTask.priority] || "slate"}>{selectedTask.priority}</Badge>
                    <Badge color={statusColors[selectedTask.status] || "slate"}>{selectedTask.status.replace(/_/g, " ")}</Badge>
                    {selectedTask.storyPoints > 0 && <Badge color="purple">⭐ {selectedTask.storyPoints} pts</Badge>}
                  </div>

                  {/* Labels */}
                  {selectedTask.labels && selectedTask.labels.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {selectedTask.labels.map((l) => (
                        <span key={l} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs rounded">{l}</span>
                      ))}
                    </div>
                  )}

                  <Tabs
                    tabs={[
                      { id: "details", label: "Details" },
                      { id: "timelog", label: "Time Log" },
                      { id: "comments", label: "Comments" },
                    ]}
                    activeTab={detailTab}
                    onChange={setDetailTab}
                  />
                </div>
              </Card>

              {/* Detail tab content */}
              {detailTab === "details" && (
                <Card>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Description</h4>
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {selectedTask.description || "No description"}
                  </p>

                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Assignee</span>
                      <span className="text-slate-900 dark:text-white">{selectedTask.assigneeName || "Unassigned"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sprint</span>
                      <span className="text-slate-900 dark:text-white">{selectedTask.sprintName || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Estimated</span>
                      <span className="text-slate-900 dark:text-white">{selectedTask.estimatedHours ? `${selectedTask.estimatedHours}h` : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Logged</span>
                      <span className="text-slate-900 dark:text-white">{selectedTask.loggedHours ? `${selectedTask.loggedHours}h` : "0h"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Created</span>
                      <span className="text-slate-900 dark:text-white">{formatDate(selectedTask.createdAt)}</span>
                    </div>
                  </div>

                  {/* Subtasks */}
                  {selectedTask.subtasks && selectedTask.subtasks.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Subtasks</h4>
                      {selectedTask.subtasks.map((st) => (
                        <div key={st.id} className="flex items-center gap-2 py-1">
                          <input type="checkbox" checked={st.completed} readOnly className="rounded" />
                          <span className={`text-sm ${st.completed ? "line-through text-slate-400" : "text-slate-700 dark:text-slate-300"}`}>{st.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* Time log tab */}
              {detailTab === "timelog" && (
                <Card>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Log Time</h4>
                  <div className="flex gap-2 mb-4">
                    <Input type="number" placeholder="Hours" value={logHours} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLogHours(e.target.value)} className="w-20" />
                    <Input type="date" value={logDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLogDate(e.target.value)} className="w-36" />
                    <Input placeholder="Description" value={logDescription} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLogDescription(e.target.value)} className="flex-1" />
                    <Button onClick={handleLogTime} disabled={!logHours || submitting}>Log</Button>
                  </div>

                  {selectedTask.timeLogs && selectedTask.timeLogs.length > 0 ? (
                    <div className="space-y-2">
                      {selectedTask.timeLogs.map((log) => (
                        <div key={log.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                          <div>
                            <span className="text-sm font-medium text-slate-900 dark:text-white">{log.hours}h</span>
                            <span className="text-sm text-slate-500 ml-2">{log.description}</span>
                          </div>
                          <div className="text-xs text-slate-500">
                            {log.userName} • {formatDate(log.date)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No time logged yet</p>
                  )}
                </Card>
              )}

              {/* Comments tab */}
              {detailTab === "comments" && (
                <Card>
                  <div className="flex gap-2 mb-4">
                    <Input placeholder="Add a comment..." value={commentText} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCommentText(e.target.value)} className="flex-1" />
                    <Button onClick={handleAddComment} disabled={!commentText || submitting}>Post</Button>
                  </div>

                  {selectedTask.comments && selectedTask.comments.length > 0 ? (
                    <div className="space-y-3">
                      {selectedTask.comments.map((c) => (
                        <div key={c.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-slate-900 dark:text-white">{c.userName}</span>
                            <span className="text-slate-500">{timeAgo(c.createdAt)}</span>
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{c.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No comments yet</p>
                  )}
                </Card>
              )}
            </>
          ) : (
            <Card>
              <div className="text-center py-8">
                <p className="text-slate-500 dark:text-slate-400">Select a task to view details</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ── Create Task Modal ──────────────────────────────── */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Task">
        <div className="space-y-4">
          <Input label="Title" value={newTitle} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTitle(e.target.value)} placeholder="Task title" />
          <Textarea label="Description" value={newDescription} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewDescription(e.target.value)} rows={4} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Type</label>
              <select
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                value={newType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewType(e.target.value)}
              >
                {TYPES.map((t) => <option key={t} value={t}>{typeIcons[t]} {t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Priority</label>
              <select
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                value={newPriority}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewPriority(e.target.value)}
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Story Points" type="number" value={newStoryPoints} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewStoryPoints(e.target.value)} />
            <Input label="Estimated Hours" type="number" value={newEstimatedHours} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEstimatedHours(e.target.value)} />
          </div>
          <Input label="Labels" value={newLabels} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLabels(e.target.value)} placeholder="Comma-separated labels" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreateTask} disabled={!newTitle || submitting}>Create Task</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
