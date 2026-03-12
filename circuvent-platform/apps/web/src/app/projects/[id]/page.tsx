"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, Badge, Button, StatCard, DataTable, Modal, Input, Select, Textarea, Tabs, EmptyState } from "@/components/ui";
import { projectStatusColors, sprintStatusColors, taskStatusColors, taskPriorityColors, revisionStatusColors } from "@/lib/status-colors";
import { formatDate, formatCurrency, timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface ProjectDetail {
  id: string; name: string; code: string; description: string | null;
  type: string; status: string; isRnD: boolean; budget: number | null; budgetCurrency: string;
  startDate: string | null; endDate: string | null; rnDCategory: string | null; createdAt: string;
  members: { id: string; role: string; user: { id: string; firstName: string; lastName: string; email: string } }[];
  sprints: { id: string; name: string; sprintNumber: number; status: string; startDate: string; endDate: string; velocity: number | null; _count: { tasks: number }; tasks: any[] }[];
  hardwareRevisions: { id: string; revisionCode: string; title: string; status: string; _count: { bomItems: number }; createdAt: string }[];
  devices: any[];
  _count: { sprints: number; hardwareRevisions: number; devices: number };
}

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const { token } = useAuth();
  const { data: project, loading, refetch } = useApi<ProjectDetail>(`/projects/${params.id}`);
  const [activeTab, setActiveTab] = useState("sprints");

  // Sprint creation
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [sprintForm, setSprintForm] = useState({ name: "", goal: "", startDate: "", endDate: "" });

  // Task creation
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskSprintId, setTaskSprintId] = useState("");
  const [taskForm, setTaskForm] = useState({ title: "", description: "", priority: "MEDIUM", storyPoints: "", assigneeId: "" });

  // Revision creation
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionForm, setRevisionForm] = useState({ revisionCode: "", title: "", description: "", isRnDRelated: false });

  const [submitting, setSubmitting] = useState(false);

  const handleCreateSprint = async () => {
    setSubmitting(true);
    await api.post("/projects/sprints", { ...sprintForm, projectId: params.id }, token || undefined);
    setShowSprintModal(false);
    setSprintForm({ name: "", goal: "", startDate: "", endDate: "" });
    setSubmitting(false);
    refetch();
  };

  const handleCreateTask = async () => {
    setSubmitting(true);
    await api.post(`/projects/sprints/${taskSprintId}/tasks`, {
      ...taskForm,
      storyPoints: taskForm.storyPoints ? Number(taskForm.storyPoints) : undefined,
    }, token || undefined);
    setShowTaskModal(false);
    setTaskForm({ title: "", description: "", priority: "MEDIUM", storyPoints: "", assigneeId: "" });
    setSubmitting(false);
    refetch();
  };

  const handleUpdateTaskStatus = async (taskId: string, status: string) => {
    await api.patch(`/projects/sprints/tasks/${taskId}`, { status }, token || undefined);
    refetch();
  };

  const handleCreateRevision = async () => {
    setSubmitting(true);
    await api.post("/projects/hardware/revisions", { ...revisionForm, projectId: params.id }, token || undefined);
    setShowRevisionModal(false);
    setRevisionForm({ revisionCode: "", title: "", description: "", isRnDRelated: false });
    setSubmitting(false);
    refetch();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div>;
  if (!project) return <div className="py-20 text-center text-slate-400">Project not found</div>;

  const tabs = [
    { id: "sprints", label: "Sprints", count: project._count.sprints }, { key: "hardware", label: "Hardware BOM", count: project._count.hardwareRevisions }, { key: "devices", label: "IoT Devices", count: project._count.devices }, { key: "members", label: "Team", count: project.members.length },
  ];

  const typeColors: Record<string, any> = { SOFTWARE: "blue", HARDWARE: "amber", HYBRID: "purple" };

  return (
    <div className="space-y-6">
      <PageHeader
        title={project.name}
        subtitle={`${project.code} · ${project.type} Project`}
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project.name }]}
        actions={
          <div className="flex gap-2">
            <Badge color={typeColors[project.type]}>{project.type}</Badge>
            <Badge color={projectStatusColors[project.status]}>{project.status}</Badge>
            {project.isRnD && <Badge color="emerald">R&D</Badge>}
          </div>
        }
      />

      {/* Project Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard title="Sprints" value={project._count.sprints} color="blue" />
        <StatCard title="HW Revisions" value={project._count.hardwareRevisions} color="amber" />
        <StatCard title="IoT Devices" value={project._count.devices} color="cyan" />
        <StatCard title="Team Size" value={project.members.length} color="purple" />
        <StatCard title="Budget" value={project.budget ? formatCurrency(Number(project.budget), project.budgetCurrency) : "—"} color="green" />
      </div>

      {/* Tabs Content */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── SPRINTS TAB ── */}
      {activeTab === "sprints" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowSprintModal(true)} size="sm">+ New Sprint</Button>
          </div>

          {project.sprints.length === 0 ? (
            <EmptyState title="No Sprints" subtitle="Create your first sprint to start tracking work." actions={<Button onClick={() => setShowSprintModal(true)} size="sm">Create Sprint</Button>} />
          ) : (
            project.sprints.map((sprint) => (
              <Card key={sprint.id}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h4 className="text-lg font-semibold text-slate-900 dark:text-white">{sprint.name}</h4>
                      <Badge color={sprintStatusColors[sprint.status]}>{sprint.status}</Badge>
                    </Card>
                    <p className="text-xs text-slate-500 mt-1">
                      Sprint #{sprint.sprintNumber} · {formatDate(sprint.startDate)} – {formatDate(sprint.endDate)} · {sprint._count.tasks} tasks
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setTaskSprintId(sprint.id); setShowTaskModal(true); }}>+ Task</Button>
                </div>

                {/* Task List */}
                {sprint.tasks.length > 0 ? (
                  <div className="space-y-2">
                    {sprint.tasks.map((task: any) => (
                      <div key={task.id} className="flex items-center justify-between rounded-lg bg-slate-100 dark:bg-slate-800/50 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <select
                            value={task.status}
                            onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value)}
                            className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-600 dark:text-slate-300"
                          >
                            {["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"].map((s) => (
                              <option key={s} value={s}>{s.replace("_", " ")}</option>
                            ))}
                          </select>
                          <span className="text-sm text-slate-200">{task.title}</span>
                          {task.isRnDRelated && <Badge color="emerald">R&D</Badge>}
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge color={taskPriorityColors[task.priority]}>{task.priority}</Badge>
                          {task.storyPoints && <span className="text-xs text-slate-500">{task.storyPoints}sp</span>}
                          {task.assignee && (
                            <span className="text-xs text-slate-400">{task.assignee.firstName} {task.assignee.lastName}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">No tasks in this sprint yet.</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── HARDWARE TAB ── */}
      {activeTab === "hardware" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowRevisionModal(true)} size="sm">+ New Revision</Button>
          </div>

          {project.hardwareRevisions.length === 0 ? (
            <EmptyState title="No Hardware Revisions" subtitle="Create a hardware revision to track BOM and PCB designs." actions={<Button onClick={() => setShowRevisionModal(true)} size="sm">Create Revision</Button>} />
          ) : (
            <DataTable
              columns={[{ key: "revisionCode", header: "Rev", render: (r: any) => <span className="font-mono text-brand-600 dark:text-brand-400">{r.revisionCode}</span> }, { key: "title", header: "Title", render: (r: any) => <span className="text-slate-900 dark:text-white">{r.title}</span> }, { key: "status", header: "Status", render: (r: any) => <Badge color={revisionStatusColors[r.status]}>{r.status}</Badge> }, { key: "bomItems", header: "BOM Items", render: (r: any) => <span>{r._count.bomItems}</span> }, { key: "createdAt", header: "Created", render: (r: any) => timeAgo(r.createdAt) },
              ]}
              data={project.hardwareRevisions}
              keyExtractor={(r: any) => r.id}
            />
          )}
        </div>
      )}

      {/* ── IoT DEVICES TAB ── */}
      {activeTab === "devices" && (
        <div>
          {project.devices.length === 0 ? (
            <EmptyState title="No Devices Linked" subtitle="Register IoT devices and link them to this project." />
          ) : (
            <DataTable
              columns={[{ key: "deviceCode", header: "Code" }, { key: "deviceName", header: "Name" }, { key: "macAddress", header: "MAC Address", render: (d: any) => <span className="font-mono text-xs">{d.macAddress}</span> }, { key: "firmwareVersion", header: "Firmware" }, { key: "status", header: "Status", render: (d: any) => <Badge color={d.status === "ONLINE" ? "green" : "red"}>{d.status}</Badge> },
              ]}
              data={project.devices}
              keyExtractor={(d: any) => d.id}
            />
          )}
        </div>
      )}

      {/* ── TEAM TAB ── */}
      {activeTab === "members" && (
        <Card>
          <CardHeader title="Project Team" subtitle={`${project.members.length} members`} />
          <div className="space-y-3">
            {project.members.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg bg-slate-100 dark:bg-slate-800/50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-slate-900 dark:text-white">
                    {m.user.firstName[0]}{m.user.lastName[0]}
                  </Card>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{m.user.firstName} {m.user.lastName}</p>
                    <p className="text-xs text-slate-500">{m.user.email}</p>
                  </div>
                </div>
                <Badge color={m.role === "lead" ? "amber" : "slate"}>{m.role}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODALS ── */}
      <Modal open={showSprintModal} onClose={() => setShowSprintModal(false)} title="Create Sprint">
        <div className="space-y-4">
          <Input label="Sprint Name" placeholder="Sprint 1" value={sprintForm.name} onChange={(e) => setSprintForm({ ...sprintForm, name: e.target.value })} />
          <Textarea label="Goal" placeholder="Sprint goal..." value={sprintForm.goal} onChange={(e) => setSprintForm({ ...sprintForm, goal: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" type="date" value={sprintForm.startDate} onChange={(e) => setSprintForm({ ...sprintForm, startDate: e.target.value })} />
            <Input label="End Date" type="date" value={sprintForm.endDate} onChange={(e) => setSprintForm({ ...sprintForm, endDate: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowSprintModal(false)}>Cancel</Button>
            <Button onClick={handleCreateSprint} loading={submitting} disabled={!sprintForm.name || !sprintForm.startDate}>Create Sprint</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showTaskModal} onClose={() => setShowTaskModal(false)} title="Add Task">
        <div className="space-y-4">
          <Input label="Title" placeholder="Implement feature X..." value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
          <Textarea label="Description" placeholder="Details..." value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Priority" options={[{ value: "LOW", label: "Low" }, { value: "MEDIUM", label: "Medium" }, { value: "HIGH", label: "High" }, { value: "CRITICAL", label: "Critical" }]} value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })} />
            <Input label="Story Points" type="number" placeholder="3" value={taskForm.storyPoints} onChange={(e) => setTaskForm({ ...taskForm, storyPoints: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowTaskModal(false)}>Cancel</Button>
            <Button onClick={handleCreateTask} loading={submitting} disabled={!taskForm.title}>Add Task</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showRevisionModal} onClose={() => setShowRevisionModal(false)} title="Create Hardware Revision">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Revision Code" placeholder="REV-A" value={revisionForm.revisionCode} onChange={(e) => setRevisionForm({ ...revisionForm, revisionCode: e.target.value })} />
            <Input label="Title" placeholder="PCB v1 Prototype" value={revisionForm.title} onChange={(e) => setRevisionForm({ ...revisionForm, title: e.target.value })} />
          </div>
          <Textarea label="Description" value={revisionForm.description} onChange={(e) => setRevisionForm({ ...revisionForm, description: e.target.value })} />
          <div className="flex items-center gap-3">
            <input type="checkbox" id="revRnD" checked={revisionForm.isRnDRelated} onChange={(e) => setRevisionForm({ ...revisionForm, isRnDRelated: e.target.checked })} className="rounded border-slate-600 bg-slate-100 dark:bg-slate-800" />
            <label htmlFor="revRnD" className="text-sm text-slate-600 dark:text-slate-300">R&D Tagged</label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowRevisionModal(false)}>Cancel</Button>
            <Button onClick={handleCreateRevision} loading={submitting} disabled={!revisionForm.revisionCode || !revisionForm.title}>Create Revision</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
