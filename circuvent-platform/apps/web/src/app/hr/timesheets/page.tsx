"use client";

import React, { useState, useMemo } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, CardHeader, StatCard, Badge, Button,
  DataTable, Modal, Input, Select, Textarea, Tabs, EmptyState,
} from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { api } from "@/lib/api-client";

/* ── colour maps ────────────────────────────────────────── */

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

const statusColors: Record<string, BadgeColor> = {
  DRAFT: "slate",
  SUBMITTED: "amber",
  APPROVED: "green",
  REJECTED: "red",
  REVISION_REQUESTED: "orange",
};

/* ── types ──────────────────────────────────────────────── */

interface TimesheetEntry {
  id: string;
  date: string;
  projectId?: string;
  projectName?: string;
  taskDescription: string;
  hours: number;
  overtimeHours: number;
  category: string;
}

interface Timesheet {
  id: string;
  employeeId: string;
  employeeName?: string;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  totalHours: number;
  overtimeHours: number;
  entries: TimesheetEntry[];
  submittedAt?: string;
  approvedAt?: string;
  comments?: string;
}

interface TimesheetStats {
  currentWeekHours: number;
  pendingApprovals: number;
  avgWeeklyHours: number;
  overtimeThisMonth: number;
}

/* ── helpers ────────────────────────────────────────────── */

function getWeekStart(d: Date): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  return mon.toISOString().split("T")[0];
}

function getWeekDays(start: string): string[] {
  const days: string[] = [];
  const d = new Date(start);
  for (let i = 0; i < 7; i++) {
    days.push(new Date(d.getTime() + i * 86400000).toISOString().split("T")[0]);
  }
  return days;
}

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ── component ──────────────────────────────────────────── */

export default function TimesheetManagementPage() {
  const { token, user, isAdmin, isHR } = useAuth();

  const [activeTab, setActiveTab] = useState("current");
  const tabs = [
    { id: "current", label: "Current Week" }, { id: "history", label: "My History" },
    ...((isAdmin || isHR) ? [{ id: "review", label: "Team Review" }] : []),
  ];

  /* ── data ─────────────────────────────────────────────── */
  const weekStart = getWeekStart(new Date());
  const { data: currentTimesheet, loading, refetch } = useApi<Timesheet>(`/hr/timesheets/current?weekStart=${weekStart}`);
  const { data: history, loading: histLoading, refetch: refetchHist } = useApi<Timesheet[]>("/hr/timesheets/history");
  const { data: teamTimesheets, loading: teamLoading, refetch: refetchTeam } = useApi<Timesheet[]>(
    (isAdmin || isHR) ? "/hr/timesheets/team-review" : null,
  );
  const { data: stats } = useApi<TimesheetStats>("/hr/timesheets/stats");

  /* ── state ────────────────────────────────────────────── */
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [entryForm, setEntryForm] = useState({
    date: "", projectName: "", taskDescription: "", hours: "", overtimeHours: "0", category: "DEVELOPMENT",
  });

  const flash = (type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  /* ── computed week view ───────────────────────────────── */
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const entries = currentTimesheet?.entries || [];

  const dailyHours = useMemo(() => {
    const map: Record<string, number> = {};
    weekDays.forEach((d) => { map[d] = 0; });
    entries.forEach((e) => { map[e.date] = (map[e.date] || 0) + e.hours + e.overtimeHours; });
    return map;
  }, [entries, weekDays]);

  const totalWeekHours = Object.values(dailyHours).reduce((a, b) => a + b, 0);
  const totalRegular = entries.reduce((a, e) => a + e.hours, 0);
  const totalOvertime = entries.reduce((a, e) => a + e.overtimeHours, 0);

  /* ── actions ──────────────────────────────────────────── */
  const handleAddEntry = async () => {
    setSubmitting(true);
    const res = await api.post("/hr/timesheets/entries", {
      ...entryForm,
      hours: Number(entryForm.hours),
      overtimeHours: Number(entryForm.overtimeHours),
      weekStart,
    }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Entry added");
      setShowAddEntry(false);
      setEntryForm({ date: "", projectName: "", taskDescription: "", hours: "", overtimeHours: "0", category: "DEVELOPMENT" });
      refetch();
    } else flash("error", res.error || "Failed to add entry");
  };

  const handleSubmit = async () => {
    if (!currentTimesheet) return;
    setSubmitting(true);
    const res = await api.patch(`/hr/timesheets/${currentTimesheet.id}/submit`, {}, token || undefined);
    setSubmitting(false);
    if (res.success) { flash("success", "Timesheet submitted for approval"); refetch(); }
    else flash("error", res.error || "Submission failed");
  };

  const handleApprove = async (id: string) => {
    const res = await api.patch(`/hr/timesheets/${id}/approve`, {}, token || undefined);
    if (res.success) { flash("success", "Timesheet approved"); refetchTeam(); }
    else flash("error", res.error || "Approval failed");
  };

  const handleReject = async (id: string) => {
    const res = await api.patch(`/hr/timesheets/${id}/reject`, { comments: "Please review hours." }, token || undefined);
    if (res.success) { flash("success", "Timesheet rejected"); refetchTeam(); }
    else flash("error", res.error || "Rejection failed");
  };

  const handleDeleteEntry = async (entryId: string) => {
    const res = await api.delete(`/hr/timesheets/entries/${entryId}`, token || undefined);
    if (res.success) { flash("success", "Entry deleted"); refetch(); }
    else flash("error", res.error || "Delete failed");
  };

  /* ── columns ──────────────────────────────────────────── */
  const entryColumns = [
    { id: "date", header: "Date", render: (e: TimesheetEntry) => formatDate(e.date) }, { key: "projectName", header: "Project", render: (e: TimesheetEntry) => e.projectName || "—" }, { key: "taskDescription", header: "Task" }, { key: "category", header: "Category", render: (e: TimesheetEntry) => <Badge color="blue">{e.category}</Badge> }, { key: "hours", header: "Hours", render: (e: TimesheetEntry) => <span className="font-mono text-slate-900 dark:text-white">{e.hours}h</span> }, { key: "overtimeHours", header: "OT", render: (e: TimesheetEntry) => e.overtimeHours > 0 ? <span className="font-mono text-amber-600 dark:text-amber-400">{e.overtimeHours}h</span> : "—" }, { key: "actions", header: "",
      render: (e: TimesheetEntry) => currentTimesheet?.status === "DRAFT" ? (
        <Button size="sm" variant="ghost" onClick={() => handleDeleteEntry(e.id)}>✕</Button>
      ) : null,
    },
  ];

  const historyColumns = [
    { id: "weekStartDate", header: "Week", render: (t: Timesheet) => `${formatDate(t.weekStartDate)} — ${formatDate(t.weekEndDate)}` }, { key: "totalHours", header: "Total", render: (t: Timesheet) => <span className="font-mono text-slate-900 dark:text-white">{t.totalHours}h</span> }, { key: "overtimeHours", header: "Overtime", render: (t: Timesheet) => <span className="font-mono text-amber-600 dark:text-amber-400">{t.overtimeHours}h</span> }, { key: "status", header: "Status", render: (t: Timesheet) => <Badge color={statusColors[t.status] || "slate"}>{t.status}</Badge> }, { key: "submittedAt", header: "Submitted", render: (t: Timesheet) => t.submittedAt ? formatDate(t.submittedAt) : "—" },
  ];

  const teamColumns = [
    { id: "employeeName", header: "Employee", render: (t: Timesheet) => <span className="font-medium text-slate-900 dark:text-white">{t.employeeName || t.employeeId}</span> }, { key: "weekStartDate", header: "Week", render: (t: Timesheet) => `${formatDate(t.weekStartDate)} — ${formatDate(t.weekEndDate)}` }, { key: "totalHours", header: "Hours", render: (t: Timesheet) => <span className="font-mono text-slate-900 dark:text-white">{t.totalHours}h</span> }, { key: "overtimeHours", header: "OT", render: (t: Timesheet) => <span className="font-mono text-amber-600 dark:text-amber-400">{t.overtimeHours}h</span> }, { key: "status", header: "Status", render: (t: Timesheet) => <Badge color={statusColors[t.status] || "slate"}>{t.status}</Badge> }, { key: "actions", header: "",
      render: (t: Timesheet) => t.status === "SUBMITTED" ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => handleApprove(t.id)}>Approve</Button>
          <Button size="sm" variant="ghost" onClick={() => handleReject(t.id)}>Reject</Button>
        </div>
      ) : null,
    },
  ];

  const s = stats || { currentWeekHours: 0, pendingApprovals: 0, avgWeeklyHours: 0, overtimeThisMonth: 0 };

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`fixed right-4 top-4 z-[100] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          feedback.type === "success" ? "border border-green-200 dark:border-green-500/30 bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400"
            : "border border-red-200 dark:border-red-500/30 bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400"
        }`}>{feedback.msg}</div>
      )}

      <PageHeader
        title="Timesheet Management"
        subtitle="Log hours, submit timesheets, and approve team entries"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Timesheets" }]}
        actions={
          <div className="flex gap-2">
            {currentTimesheet?.status === "DRAFT" && (
              <>
                <Button onClick={() => setShowAddEntry(true)}>+ Add Entry</Button>
                <Button variant="secondary" onClick={handleSubmit} loading={submitting}>Submit Week</Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="This Week" value={`${s.currentWeekHours}h`} color="blue" />
        <StatCard title="Pending Approvals" value={s.pendingApprovals} color="amber" />
        <StatCard title="Avg Weekly" value={`${s.avgWeeklyHours}h`} color="green" />
        <StatCard title="OT This Month" value={`${s.overtimeThisMonth}h`} color="orange" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── current week ────────────────────────────────── */}
      {activeTab === "current" && (
        <div className="space-y-4">
          {/* weekly hours bar */}
          <Card>
            <CardHeader title="Weekly Summary" subtitle={`${formatDate(weekStart)} — Week Total: ${totalWeekHours}h`} />
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day, i) => {
                const hours = dailyHours[day] || 0;
                const barH = Math.min(hours * 10, 100);
                return (
                  <div key={day} className="flex flex-col items-center">
                    <div className="relative mb-1 h-24 w-full rounded-lg bg-slate-100 dark:bg-slate-800">
                      <div
                        className="absolute bottom-0 w-full rounded-lg bg-brand-600/60"
                        style={{ height: `${barH}%` }}
                      />
                    </Card>
                    <span className="text-xs font-medium text-slate-400">{dayNames[i]}</span>
                    <span className="text-xs font-mono text-slate-900 dark:text-white">{hours}h</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex gap-6 border-t border-slate-200 dark:border-slate-800 pt-3 text-sm">
              <div><span className="text-slate-500">Regular:</span> <span className="font-mono text-slate-900 dark:text-white">{totalRegular}h</span></div>
              <div><span className="text-slate-500">Overtime:</span> <span className="font-mono text-amber-600 dark:text-amber-400">{totalOvertime}h</span></div>
              <div><span className="text-slate-500">Status:</span>{" "}
                <Badge color={statusColors[currentTimesheet?.status || "DRAFT"] || "slate"}>
                  {currentTimesheet?.status || "DRAFT"}
                </Badge>
              </div>
            </div>
          </div>

          {/* entries table */}
          <Card>
            <CardHeader
              title="Time Entries"
              subtitle={`${entries.length} entries this week`}
              actions={currentTimesheet?.status === "DRAFT" ? <Button size="sm" onClick={() => setShowAddEntry(true)}>+ Add</Button> : undefined}
            />
            <DataTable
              columns={entryColumns}
              data={entries}
              keyExtractor={(e) => e.id}
              loading={loading}
              emptyMessage="No time entries this week. Click '+ Add Entry' to start."
            />
          </Card>
        </div>
      )}

      {/* ── history ─────────────────────────────────────── */}
      {activeTab === "history" && (
        <Card>
          <CardHeader title="My Timesheet History" subtitle="Past submitted timesheets" />
          <DataTable columns={historyColumns} data={history || []} keyExtractor={(t) => t.id} loading={histLoading} emptyMessage="No timesheet history." />
        </Card>
      )}

      {/* ── team review ─────────────────────────────────── */}
      {activeTab === "review" && (
        <Card>
          <CardHeader title="Team Timesheets" subtitle="Pending approval" />
          <DataTable columns={teamColumns} data={teamTimesheets || []} keyExtractor={(t) => t.id} loading={teamLoading} emptyMessage="No timesheets awaiting review." />
        </Card>
      )}

      {/* ── add entry modal ─────────────────────────────── */}
      <Modal open={showAddEntry} onClose={() => setShowAddEntry(false)} title="Add Time Entry" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Date" options={weekDays.map((d, i) => ({
              value: d, label: `${dayNames[i]} — ${formatDate(d)}`,
            }))} value={entryForm.date} onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })} />
            <Select label="Category" options={[
              { value: "DEVELOPMENT", label: "Development" },
              { value: "MEETING", label: "Meeting" },
              { value: "REVIEW", label: "Code Review" },
              { value: "TESTING", label: "Testing" },
              { value: "DOCUMENTATION", label: "Documentation" },
              { value: "ADMIN", label: "Administrative" },
              { value: "TRAINING", label: "Training" },
              { value: "OTHER", label: "Other" },
            ]} value={entryForm.category} onChange={(e) => setEntryForm({ ...entryForm, category: e.target.value })} />
          </div>
          <Input label="Project" placeholder="Project name or ID" value={entryForm.projectName} onChange={(e) => setEntryForm({ ...entryForm, projectName: e.target.value })} />
          <Textarea label="Task Description" placeholder="What did you work on?" value={entryForm.taskDescription} onChange={(e) => setEntryForm({ ...entryForm, taskDescription: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Hours" type="number" step="0.5" min="0" max="24" value={entryForm.hours} onChange={(e) => setEntryForm({ ...entryForm, hours: e.target.value })} />
            <Input label="Overtime Hours" type="number" step="0.5" min="0" value={entryForm.overtimeHours} onChange={(e) => setEntryForm({ ...entryForm, overtimeHours: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowAddEntry(false)}>Cancel</Button>
            <Button onClick={handleAddEntry} loading={submitting} disabled={!entryForm.date || !entryForm.hours || !entryForm.taskDescription}>Add Entry</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
