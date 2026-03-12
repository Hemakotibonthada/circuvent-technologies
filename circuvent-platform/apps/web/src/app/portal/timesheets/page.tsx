"use client";

// ══════════════════════════════════════════════════════════════
// Employee Timesheet Page — Self-service weekly time logging,
// project/task assignment, billable/non-billable tracking,
// submission workflow, and history viewer.
// ══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

interface TimesheetEntry {
  id: string;
  date: string;
  projectId: string;
  projectName: string;
  taskCategory: string;
  hours: number;
  description: string;
  billable: boolean;
}

interface Timesheet {
  id: string;
  weekStart: string;
  weekEnd: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  entries: TimesheetEntry[];
  submittedAt?: string;
  approvedBy?: string;
}

const TASK_CATEGORIES = [
  "Development", "Code Review", "Testing", "Documentation",
  "Meetings", "Design", "DevOps", "Research", "Bug Fix",
  "Client Call", "Training", "Administrative",
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function TimesheetPage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [currentTimesheet, setCurrentTimesheet] = useState<Timesheet | null>(null);
  const [history, setHistory] = useState<Timesheet[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [editingDay, setEditingDay] = useState<number | null>(null);

  const [newEntry, setNewEntry] = useState({
    projectId: "",
    taskCategory: "Development",
    hours: 0,
    description: "",
    billable: true,
  });

  useEffect(() => {
    if (token) loadInitialData();
  }, [token]);

  const loadInitialData = async () => {
    setLoading(true);
    const [empRes, projRes] = await Promise.all([
      api.get<any[]>("/hr/employees", token!),
      api.get<any[]>("/projects", token!),
    ]);
    if (empRes.success && empRes.data) {
      const emp = empRes.data.find((e: any) => e.user?.email === user?.email) || empRes.data[0];
      setEmployee(emp);
    }
    if (projRes.success && projRes.data) {
      setProjects(projRes.data);
    }
    await loadTimesheet();
    setLoading(false);
  };

  const loadTimesheet = async () => {
    const tsRes = await api.get<any>("/hr/timesheets/current", token!);
    if (tsRes.success && tsRes.data) {
      setCurrentTimesheet(tsRes.data);
    } else {
      // Generate empty timesheet for current week
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setCurrentTimesheet({
        id: "draft",
        weekStart: monday.toISOString().split("T")[0],
        weekEnd: sunday.toISOString().split("T")[0],
        status: "DRAFT",
        totalHours: 0,
        billableHours: 0,
        nonBillableHours: 0,
        entries: [],
      });
    }

    const histRes = await api.get<Timesheet[]>("/hr/timesheets?limit=10", token!);
    if (histRes.success && histRes.data) {
      setHistory(histRes.data);
    }
  };

  const getWeekDates = (): string[] => {
    if (!currentTimesheet?.weekStart) return [];
    const start = new Date(currentTimesheet.weekStart);
    return DAYS.map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d.toISOString().split("T")[0];
    });
  };

  const weekDates = getWeekDates();

  const getEntriesForDay = (dateStr: string): TimesheetEntry[] => {
    return currentTimesheet?.entries.filter((e) => e.date === dateStr) || [];
  };

  const getDayTotal = (dateStr: string): number => {
    return getEntriesForDay(dateStr).reduce((s, e) => s + e.hours, 0);
  };

  const handleAddEntry = async () => {
    if (!newEntry.projectId || !newEntry.hours || editingDay === null) return;
    const dateStr = weekDates[editingDay];
    const project = projects.find((p) => p.id === newEntry.projectId);

    const entry: TimesheetEntry = {
      id: `entry-${Date.now()}`,
      date: dateStr,
      projectId: newEntry.projectId,
      projectName: project?.name || "Unknown Project",
      taskCategory: newEntry.taskCategory,
      hours: newEntry.hours,
      description: newEntry.description,
      billable: newEntry.billable,
    };

    if (employee) {
      await api.post("/hr/timesheets/entries", {
        employeeId: employee.id,
        ...entry,
      }, token!);
    }

    const entries = [...(currentTimesheet?.entries || []), entry];
    const billable = entries.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0);
    const total = entries.reduce((s, e) => s + e.hours, 0);

    setCurrentTimesheet((prev) =>
      prev
        ? { ...prev, entries, totalHours: total, billableHours: billable, nonBillableHours: total - billable }
        : prev
    );

    setShowAddEntry(false);
    setNewEntry({ projectId: "", taskCategory: "Development", hours: 0, description: "", billable: true });
  };

  const handleSubmit = async () => {
    if (!currentTimesheet || currentTimesheet.status !== "DRAFT") return;
    setSubmitting(true);
    await api.post("/hr/timesheets/submit", {
      timesheetId: currentTimesheet.id,
      employeeId: employee?.id,
    }, token!);
    setCurrentTimesheet((prev) => prev ? { ...prev, status: "SUBMITTED", submittedAt: new Date().toISOString() } : prev);
    setSubmitting(false);
  };

  const handleDeleteEntry = async (entryId: string) => {
    await api.delete(`/hr/timesheets/entries/${entryId}`, token!);
    setCurrentTimesheet((prev) => {
      if (!prev) return prev;
      const entries = prev.entries.filter((e) => e.id !== entryId);
      const billable = entries.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0);
      const total = entries.reduce((s, e) => s + e.hours, 0);
      return { ...prev, entries, totalHours: total, billableHours: billable, nonBillableHours: total - billable };
    });
  };

  const statusColors: Record<string, string> = {
    DRAFT: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
    SUBMITTED: "bg-blue-900/50 text-blue-400",
    APPROVED: "bg-emerald-900/50 text-emerald-400",
    REJECTED: "bg-red-900/50 text-red-400",
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-400 hover:text-brand-300">
            ← Back to Portal
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">⏱️ My Timesheets</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("current")}
            className={`px-4 py-2 rounded-lg text-sm ${activeTab === "current" ? "bg-brand-600 text-slate-900 dark:text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-400"}`}
          >
            Current Week
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 rounded-lg text-sm ${activeTab === "history" ? "bg-brand-600 text-slate-900 dark:text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-400"}`}
          >
            History
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : activeTab === "current" ? (
        <>
          {/* Weekly Summary */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{currentTimesheet?.totalHours || 0}h</p>
              <p className="text-xs text-slate-500">Total Hours</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-emerald-400">{currentTimesheet?.billableHours || 0}h</p>
              <p className="text-xs text-slate-500">Billable</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-amber-400">{currentTimesheet?.nonBillableHours || 0}h</p>
              <p className="text-xs text-slate-500">Non-Billable</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
              <span className={`px-2 py-1 rounded text-xs ${statusColors[currentTimesheet?.status || "DRAFT"]}`}>
                {currentTimesheet?.status || "DRAFT"}
              </span>
              <p className="text-xs text-slate-500 mt-1">Status</p>
            </div>
          </div>

          {/* Weekly Grid */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mb-6">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Week: {currentTimesheet?.weekStart} — {currentTimesheet?.weekEnd}
              </h2>
              {currentTimesheet?.status === "DRAFT" && (
                <button
                  onClick={handleSubmit}
                  disabled={submitting || (currentTimesheet?.totalHours || 0) === 0}
                  className="px-4 py-1.5 bg-brand-600 text-slate-900 dark:text-white rounded-lg text-xs hover:bg-brand-700 disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit for Approval"}
                </button>
              )}
            </div>

            <div className="grid grid-cols-7 divide-x divide-slate-200 dark:divide-slate-800">
              {DAYS.map((day, i) => {
                const dateStr = weekDates[i];
                const entries = getEntriesForDay(dateStr);
                const total = getDayTotal(dateStr);
                const isToday = dateStr === new Date().toISOString().split("T")[0];

                return (
                  <div
                    key={day}
                    className={`min-h-[200px] p-2 ${isToday ? "bg-brand-500/5" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className={`text-xs font-medium ${isToday ? "text-brand-400" : "text-slate-400"}`}>
                          {day}
                        </span>
                        <span className="text-xs text-slate-600 ml-1">
                          {dateStr ? new Date(dateStr).getDate() : ""}
                        </span>
                      </div>
                      <span className={`text-xs font-bold ${total > 0 ? "text-slate-900 dark:text-white" : "text-slate-600"}`}>
                        {total}h
                      </span>
                    </div>

                    {/* Entries for this day */}
                    <div className="space-y-1">
                      {entries.map((entry) => (
                        <div
                          key={entry.id}
                          className={`rounded p-1.5 text-[10px] ${entry.billable ? "bg-emerald-900/30 border border-emerald-800/30" : "bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50"}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-slate-900 dark:text-white font-medium truncate">{entry.projectName}</span>
                            {currentTimesheet?.status === "DRAFT" && (
                              <button
                                onClick={() => handleDeleteEntry(entry.id)}
                                className="text-red-400 hover:text-red-300 text-[10px]"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          <p className="text-slate-400">{entry.taskCategory} · {entry.hours}h</p>
                        </div>
                      ))}
                    </div>

                    {/* Add entry button */}
                    {currentTimesheet?.status === "DRAFT" && dateStr && (
                      <button
                        onClick={() => {
                          setEditingDay(i);
                          setShowAddEntry(true);
                        }}
                        className="mt-2 w-full rounded border border-dashed border-slate-200 p- dark:border-slate-7001 text-[10px] text-slate-500 hover:border-brand-500 hover:text-brand-400 transition-colors"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Category Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {TASK_CATEGORIES.map((cat) => {
                const catHours = currentTimesheet?.entries
                  .filter((e) => e.taskCategory === cat)
                  .reduce((s, e) => s + e.hours, 0) || 0;
                if (catHours === 0) return null;
                return (
                  <div key={cat} className="rounded-lg bg-slate-100 dark:bg-slate-800/50 p-2 text-center">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{catHours}h</p>
                    <p className="text-[10px] text-slate-400">{cat}</p>
                  </div>
                );
              })}
              {currentTimesheet?.entries.length === 0 && (
                <p className="col-span-4 text-center text-slate-500 text-sm py-4">
                  No entries yet. Add time entries to see the breakdown.
                </p>
              )}
            </div>
          </div>
        </>
      ) : (
        /* History Tab */
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500">
              No past timesheets found
            </div>
          ) : (
            history.map((ts) => (
              <div key={ts.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      {ts.weekStart} — {ts.weekEnd}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs ${statusColors[ts.status]}`}>
                    {ts.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{ts.totalHours}h</p>
                    <p className="text-xs text-slate-500">Total</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-400">{ts.billableHours}h</p>
                    <p className="text-xs text-slate-500">Billable</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-400">{ts.nonBillableHours}h</p>
                    <p className="text-xs text-slate-500">Non-Billable</p>
                  </div>
                </div>
                {ts.submittedAt && (
                  <p className="text-xs text-slate-500 mt-2">
                    Submitted: {new Date(ts.submittedAt).toLocaleDateString("en-IN")}
                    {ts.approvedBy && ` · Approved by: ${ts.approvedBy}`}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Entry Modal */}
      {showAddEntry && editingDay !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Add Time Entry</h2>
            <p className="text-xs text-slate-400 mb-4">
              {DAYS[editingDay]} — {weekDates[editingDay]}
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">Project *</label>
                <select
                  value={newEntry.projectId}
                  onChange={(e) => setNewEntry({ ...newEntry, projectId: e.target.value })}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm mt-1"
                >
                  <option value="">Select project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Task Category</label>
                <select
                  value={newEntry.taskCategory}
                  onChange={(e) => setNewEntry({ ...newEntry, taskCategory: e.target.value })}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm mt-1"
                >
                  {TASK_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Hours *</label>
                <input
                  type="number"
                  min="0.5"
                  max="16"
                  step="0.5"
                  value={newEntry.hours || ""}
                  onChange={(e) => setNewEntry({ ...newEntry, hours: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm mt-1"
                  placeholder="e.g., 4"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Description</label>
                <textarea
                  value={newEntry.description}
                  onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm mt-1"
                  placeholder="What did you work on?"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newEntry.billable}
                  onChange={(e) => setNewEntry({ ...newEntry, billable: e.target.checked })}
                  className="rounded border-slate-600"
                />
                <span className="text-sm text-slate-600 dark:text-slate-300">Billable</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => {
                  setShowAddEntry(false);
                  setEditingDay(null);
                }}
                className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAddEntry}
                disabled={!newEntry.projectId || !newEntry.hours}
                className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50"
              >
                Add Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
