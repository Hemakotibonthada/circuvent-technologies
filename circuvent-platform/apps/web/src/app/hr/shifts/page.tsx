"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, CardHeader, StatCard, Badge, Button,
  DataTable, Modal, Input, Select, Tabs, EmptyState,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/utils";
import { api } from "@/lib/api-client";

/* ── colour maps ────────────────────────────────────────── */

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

const shiftTypeColors: Record<string, BadgeColor> = {
  MORNING: "amber", DAY: "blue", EVENING: "purple", NIGHT: "slate", ROTATIONAL: "cyan", FLEXIBLE: "green",
};

const attendanceColors: Record<string, BadgeColor> = {
  PRESENT: "green", ABSENT: "red", LATE: "amber", ON_LEAVE: "purple", HALF_DAY: "orange",
};

/* ── types ──────────────────────────────────────────────── */

interface ShiftDefinition {
  id: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
  isActive: boolean;
}

interface ShiftSchedule {
  id: string;
  employeeId: string;
  employeeName?: string;
  shiftId: string;
  shiftName?: string;
  date: string;
  status: string;
  checkIn?: string;
  checkOut?: string;
}

interface TodayView {
  id: string;
  employeeName: string;
  shiftName: string;
  scheduledStart: string;
  scheduledEnd: string;
  checkIn?: string;
  checkOut?: string;
  status: string;
}

interface ShiftStats {
  todayScheduled: number;
  checkedIn: number;
  absent: number;
  late: number;
  totalDefinitions: number;
}

/* ── component ──────────────────────────────────────────── */

export default function ShiftManagementPage() {
  const { token, isAdmin, isHR } = useAuth();

  const [activeTab, setActiveTab] = useState("definitions");
  const tabs = [
    { id: "definitions", label: "Definitions" }, { key: "schedules", label: "Schedules" }, { key: "today", label: "Today's View" },
  ];

  /* ── data ─────────────────────────────────────────────── */
  const { data: definitions, loading: defLoading, refetch: refetchDefs } = useApi<ShiftDefinition[]>("/hr/shifts/definitions");
  const { data: schedules, loading: schedLoading, refetch: refetchScheds } = useApi<ShiftSchedule[]>("/hr/shifts/schedules");
  const { data: todayView, loading: todayLoading, refetch: refetchToday } = useApi<TodayView[]>("/hr/shifts/today");
  const { data: stats } = useApi<ShiftStats>("/hr/shifts/stats");

  /* ── modals & state ───────────────────────────────────── */
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [form, setForm] = useState({
    name: "", type: "DAY", startTime: "09:00", endTime: "18:00",
    breakMinutes: "60", graceMinutes: "15",
  });

  const [bulkForm, setBulkForm] = useState({
    shiftId: "", startDate: "", endDate: "", employeeIds: "",
  });

  /* ── helpers ──────────────────────────────────────────── */
  const flash = (type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  /* ── actions ──────────────────────────────────────────── */
  const handleCreateDef = async () => {
    setSubmitting(true);
    const res = await api.post("/hr/shifts/definitions", {
      ...form, breakMinutes: Number(form.breakMinutes), graceMinutes: Number(form.graceMinutes),
    }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Shift definition created");
      setShowCreate(false);
      setForm({ name: "", type: "DAY", startTime: "09:00", endTime: "18:00", breakMinutes: "60", graceMinutes: "15" });
      refetchDefs();
    } else flash("error", res.error || "Failed");
  };

  const handleBulkGenerate = async () => {
    setSubmitting(true);
    const ids = bulkForm.employeeIds.split(",").map((s) => s.trim()).filter(Boolean);
    const res = await api.post("/hr/shifts/schedules/bulk", {
      shiftId: bulkForm.shiftId,
      startDate: bulkForm.startDate,
      endDate: bulkForm.endDate,
      employeeIds: ids,
    }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", `Schedules generated for ${ids.length} employees`);
      setShowBulk(false);
      setBulkForm({ shiftId: "", startDate: "", endDate: "", employeeIds: "" });
      refetchScheds();
    } else flash("error", res.error || "Bulk generation failed");
  };

  const handleCheckIn = async (scheduleId: string) => {
    const res = await api.patch(`/hr/shifts/schedules/${scheduleId}/check-in`, {}, token || undefined);
    if (res.success) { flash("success", "Checked in"); refetchToday(); refetchScheds(); }
    else flash("error", res.error || "Check-in failed");
  };

  const handleCheckOut = async (scheduleId: string) => {
    const res = await api.patch(`/hr/shifts/schedules/${scheduleId}/check-out`, {}, token || undefined);
    if (res.success) { flash("success", "Checked out"); refetchToday(); refetchScheds(); }
    else flash("error", res.error || "Check-out failed");
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    const res = await api.patch(`/hr/shifts/definitions/${id}`, { isActive: !isActive }, token || undefined);
    if (res.success) { flash("success", `Shift ${!isActive ? "activated" : "deactivated"}`); refetchDefs(); }
    else flash("error", res.error || "Failed");
  };

  /* ── columns ──────────────────────────────────────────── */
  const defColumns = [
    { id: "name", header: "Shift Name", render: (d: ShiftDefinition) => <span className="font-medium text-slate-900 dark:text-white">{d.name}</span> }, { key: "type", header: "Type", render: (d: ShiftDefinition) => <Badge color={shiftTypeColors[d.type] || "slate"}>{d.type}</Badge> }, { key: "startTime", header: "Start" }, { key: "endTime", header: "End" }, { key: "breakMinutes", header: "Break", render: (d: ShiftDefinition) => `${d.breakMinutes} min` }, { key: "graceMinutes", header: "Grace", render: (d: ShiftDefinition) => `${d.graceMinutes} min` }, { key: "isActive", header: "Status",
      render: (d: ShiftDefinition) => (
        <button
          onClick={() => handleToggleActive(d.id, d.isActive)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${d.isActive ? "bg-brand-600" : "bg-slate-100 dark:bg-slate-700"}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${d.isActive ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      ),
    },
  ];

  const schedColumns = [
    { id: "employeeName", header: "Employee", render: (s: ShiftSchedule) => <span className="font-medium text-slate-900 dark:text-white">{s.employeeName || s.employeeId}</span> }, { key: "shiftName", header: "Shift", render: (s: ShiftSchedule) => <Badge color="blue">{s.shiftName || s.shiftId}</Badge> }, { key: "date", header: "Date", render: (s: ShiftSchedule) => formatDate(s.date) }, { key: "status", header: "Status", render: (s: ShiftSchedule) => <Badge color={attendanceColors[s.status] || "slate"}>{s.status}</Badge> }, { key: "checkIn", header: "Check In", render: (s: ShiftSchedule) => s.checkIn || <span className="text-slate-500">—</span> }, { key: "checkOut", header: "Check Out", render: (s: ShiftSchedule) => s.checkOut || <span className="text-slate-500">—</span> }, { key: "actions", header: "",
      render: (s: ShiftSchedule) => (
        <div className="flex gap-2">
          {!s.checkIn && <Button size="sm" variant="outline" onClick={() => handleCheckIn(s.id)}>Check In</Button>}
          {s.checkIn && !s.checkOut && <Button size="sm" variant="secondary" onClick={() => handleCheckOut(s.id)}>Check Out</Button>}
        </div>
      ),
    },
  ];

  const todayColumns = [
    { id: "employeeName", header: "Employee", render: (t: TodayView) => <span className="font-medium text-slate-900 dark:text-white">{t.employeeName}</span> }, { key: "shiftName", header: "Shift", render: (t: TodayView) => <Badge color="blue">{t.shiftName}</Badge> }, { key: "scheduledStart", header: "Scheduled Start" }, { key: "scheduledEnd", header: "Scheduled End" }, { key: "checkIn", header: "Check In",
      render: (t: TodayView) => t.checkIn ? <span className="text-green-600 dark:text-green-400">{t.checkIn}</span> : <span className="text-slate-500">—</span>,
    }, { key: "checkOut", header: "Check Out",
      render: (t: TodayView) => t.checkOut ? <span className="text-green-600 dark:text-green-400">{t.checkOut}</span> : <span className="text-slate-500">—</span>,
    }, { key: "status", header: "Status", render: (t: TodayView) => <Badge color={attendanceColors[t.status] || "slate"}>{t.status}</Badge> }, { key: "actions", header: "",
      render: (t: TodayView) => (
        <div className="flex gap-2">
          {!t.checkIn && <Button size="sm" variant="outline" onClick={() => handleCheckIn(t.id)}>In</Button>}
          {t.checkIn && !t.checkOut && <Button size="sm" variant="secondary" onClick={() => handleCheckOut(t.id)}>Out</Button>}
        </div>
      ),
    },
  ];

  const s = stats || { todayScheduled: 0, checkedIn: 0, absent: 0, late: 0, totalDefinitions: 0 };

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`fixed right-4 top-4 z-[100] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          feedback.type === "success" ? "border border-green-200 dark:border-green-500/30 bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400"
            : "border border-red-200 dark:border-red-500/30 bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400"
        }`}>{feedback.msg}</div>
      )}

      <PageHeader
        title="Shift Management"
        subtitle="Define shifts, build schedules, and track attendance"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Shifts" }]}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setShowCreate(true)}>+ New Shift</Button>
            {(isAdmin || isHR) && (
              <Button variant="secondary" onClick={() => setShowBulk(true)}>Bulk Schedule</Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard title="Today Scheduled" value={s.todayScheduled} color="blue" />
        <StatCard title="Checked In" value={s.checkedIn} color="green" />
        <StatCard title="Absent" value={s.absent} color="red" />
        <StatCard title="Late" value={s.late} color="amber" />
        <StatCard title="Shift Definitions" value={s.totalDefinitions} color="purple" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <Card>
        {activeTab === "definitions" && (
          <>
            <CardHeader title="Shift Definitions" subtitle="All configured shifts" actions={<Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>+ Add</Button>} />
            <DataTable columns={defColumns} data={definitions || []} keyExtractor={(d) => d.id} loading={defLoading} emptyMessage="No shift definitions yet." />
          </>
        )}
        {activeTab === "schedules" && (
          <>
            <CardHeader title="Schedules" subtitle="Assigned shift schedules" />
            <DataTable columns={schedColumns} data={schedules || []} keyExtractor={(s) => s.id} loading={schedLoading} emptyMessage="No schedules found." />
          </>
        )}
        {activeTab === "today" && (
          <>
            <CardHeader title="Today's Attendance" subtitle={`${formatDate(new Date())}`} />
            <DataTable columns={todayColumns} data={todayView || []} keyExtractor={(t) => t.id} loading={todayLoading} emptyMessage="No schedules for today." />
          </>
        )}
      </Card>

      {/* ── create shift definition modal ───────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Shift Definition" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Shift Name" placeholder="Morning Shift A" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label="Type" options={[
              { value: "MORNING", label: "Morning" }, { value: "DAY", label: "Day" },
              { value: "EVENING", label: "Evening" }, { value: "NIGHT", label: "Night" },
              { value: "ROTATIONAL", label: "Rotational" }, { value: "FLEXIBLE", label: "Flexible" },
            ]} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <Input label="Start Time" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            <Input label="End Time" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            <Input label="Break (min)" type="number" value={form.breakMinutes} onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })} />
            <Input label="Grace (min)" type="number" value={form.graceMinutes} onChange={(e) => setForm({ ...form, graceMinutes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreateDef} loading={submitting} disabled={!form.name}>Create Shift</Button>
          </div>
        </div>
      </Modal>

      {/* ── bulk schedule modal ─────────────────────────── */}
      <Modal open={showBulk} onClose={() => setShowBulk(false)} title="Bulk Schedule Generation" size="lg">
        <div className="space-y-4">
          <Select label="Shift" options={[
            { value: "", label: "Select shift..." },
            ...(definitions || []).map((d) => ({ value: d.id, label: d.name })),
          ]} value={bulkForm.shiftId} onChange={(e) => setBulkForm({ ...bulkForm, shiftId: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" type="date" value={bulkForm.startDate} onChange={(e) => setBulkForm({ ...bulkForm, startDate: e.target.value })} />
            <Input label="End Date" type="date" value={bulkForm.endDate} onChange={(e) => setBulkForm({ ...bulkForm, endDate: e.target.value })} />
          </div>
          <Input label="Employee IDs (comma-separated)" placeholder="emp_001, emp_002, emp_003" value={bulkForm.employeeIds} onChange={(e) => setBulkForm({ ...bulkForm, employeeIds: e.target.value })} />
          <p className="text-xs text-slate-500">Schedules will be created for each employee on every weekday in the selected range.</p>
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowBulk(false)}>Cancel</Button>
            <Button onClick={handleBulkGenerate} loading={submitting} disabled={!bulkForm.shiftId || !bulkForm.startDate || !bulkForm.endDate}>Generate</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
