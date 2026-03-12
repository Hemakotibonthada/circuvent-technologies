"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, CardHeader, StatCard, Badge, Button,
  DataTable, Modal, Input, Select, Textarea, Tabs, EmptyState,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/utils";
import { api } from "@/lib/api-client";

/* ── colour maps ────────────────────────────────────────── */

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

const statusColors: Record<string, BadgeColor> = {
  PRE_REGISTERED: "blue",
  CHECKED_IN: "green",
  CHECKED_OUT: "slate",
  CANCELLED: "red",
  NO_SHOW: "amber",
};

const purposeColors: Record<string, BadgeColor> = {
  MEETING: "blue",
  INTERVIEW: "purple",
  DELIVERY: "amber",
  MAINTENANCE: "cyan",
  TOUR: "emerald",
  PERSONAL: "pink",
  OTHER: "slate",
};

/* ── types ──────────────────────────────────────────────── */

interface Visitor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  purpose: string;
  hostEmployeeId: string;
  hostName?: string;
  status: string;
  badgeNumber?: string;
  photoUrl?: string;
  preRegisteredAt?: string;
  checkInTime?: string;
  checkOutTime?: string;
  expectedArrival?: string;
  notes?: string;
}

interface VisitorStats {
  todayTotal: number;
  checkedIn: number;
  checkedOut: number;
  preRegistered: number;
  noShow: number;
  weeklyTotal: number;
}

/* ── component ──────────────────────────────────────────── */

export default function VisitorManagementPage() {
  const { token, isAdmin, isHR } = useAuth();

  const [activeTab, setActiveTab] = useState("today");
  const tabs = [
    { id: "today", label: "Today" },
    { id: "upcoming", label: "Upcoming" },
    { id: "history", label: "History" },
  ];

  /* ── data ─────────────────────────────────────────────── */
  const { data: visitors, loading, refetch } = useApi<Visitor[]>("/hr/visitors");
  const { data: todayVisitors, loading: todayLoading, refetch: refetchToday } = useApi<Visitor[]>("/hr/visitors?scope=today");
  const { data: upcomingVisitors, loading: upcomingLoading } = useApi<Visitor[]>("/hr/visitors?scope=upcoming");
  const { data: stats } = useApi<VisitorStats>("/hr/visitors/stats");

  /* ── state ────────────────────────────────────────────── */
  const [showRegister, setShowRegister] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [form, setForm] = useState({
    name: "", email: "", phone: "", company: "",
    purpose: "MEETING", hostEmployeeId: "",
    expectedArrival: "", notes: "",
  });

  /* ── helpers ──────────────────────────────────────────── */
  const flash = (type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  /* ── actions ──────────────────────────────────────────── */
  const handleRegister = async () => {
    setSubmitting(true);
    const res = await api.post("/hr/visitors", form, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Visitor pre-registered");
      setShowRegister(false);
      setForm({ name: "", email: "", phone: "", company: "", purpose: "MEETING", hostEmployeeId: "", expectedArrival: "", notes: "" });
      refetch();
      refetchToday();
    } else flash("error", res.error || "Failed to register visitor");
  };

  const handleCheckIn = async (id: string) => {
    const res = await api.patch(`/hr/visitors/${id}/check-in`, {}, token || undefined);
    if (res.success) { flash("success", "Visitor checked in"); refetch(); refetchToday(); }
    else flash("error", res.error || "Check-in failed");
  };

  const handleCheckOut = async (id: string) => {
    const res = await api.patch(`/hr/visitors/${id}/check-out`, {}, token || undefined);
    if (res.success) { flash("success", "Visitor checked out"); refetch(); refetchToday(); }
    else flash("error", res.error || "Check-out failed");
  };

  const handleCancel = async (id: string) => {
    const res = await api.patch(`/hr/visitors/${id}/cancel`, {}, token || undefined);
    if (res.success) { flash("success", "Visit cancelled"); refetch(); refetchToday(); }
    else flash("error", res.error || "Cancellation failed");
  };

  /* ── columns ──────────────────────────────────────────── */
  const visitorColumns = [
    {
      key: "name", header: "Visitor",
      render: (v: Visitor) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{v.name}</p>
          {v.company && <p className="text-xs text-slate-500">{v.company}</p>}
        </div>
      ),
    },
    {
      key: "contact", header: "Contact",
      render: (v: Visitor) => (
        <div className="text-xs">
          {v.email && <p>{v.email}</p>}
          {v.phone && <p className="text-slate-500">{v.phone}</p>}
        </div>
      ),
    },
    { key: "purpose", header: "Purpose", render: (v: Visitor) => <Badge color={purposeColors[v.purpose] || "slate"}>{v.purpose}</Badge> },
    { key: "hostName", header: "Host", render: (v: Visitor) => v.hostName || v.hostEmployeeId },
    { key: "status", header: "Status", render: (v: Visitor) => <Badge color={statusColors[v.status] || "slate"}>{v.status.replace(/_/g, " ")}</Badge> },
    {
      key: "badge", header: "Badge",
      render: (v: Visitor) => v.badgeNumber ?
        <span className="rounded bg-brand-600/20 px-2 py-0.5 text-xs font-mono text-brand-400">{v.badgeNumber}</span>
        : <span className="text-slate-500">—</span>,
    },
    {
      key: "checkInTime", header: "Check In",
      render: (v: Visitor) => v.checkInTime ?
        <span className="text-green-400 text-xs">{formatDateTime(v.checkInTime)}</span>
        : v.expectedArrival ?
        <span className="text-slate-500 text-xs">Expected: {formatDateTime(v.expectedArrival)}</span>
        : <span className="text-slate-500">—</span>,
    },
    {
      key: "checkOutTime", header: "Check Out",
      render: (v: Visitor) => v.checkOutTime ?
        <span className="text-slate-400 text-xs">{formatDateTime(v.checkOutTime)}</span>
        : <span className="text-slate-500">—</span>,
    },
    {
      key: "actions", header: "",
      render: (v: Visitor) => (
        <div className="flex gap-2">
          {v.status === "PRE_REGISTERED" && (
            <>
              <Button size="sm" variant="outline" onClick={() => handleCheckIn(v.id)}>Check In</Button>
              <Button size="sm" variant="ghost" onClick={() => handleCancel(v.id)}>Cancel</Button>
            </>
          )}
          {v.status === "CHECKED_IN" && (
            <Button size="sm" variant="secondary" onClick={() => handleCheckOut(v.id)}>Check Out</Button>
          )}
        </div>
      ),
    },
  ];

  const s = stats || { todayTotal: 0, checkedIn: 0, checkedOut: 0, preRegistered: 0, noShow: 0, weeklyTotal: 0 };

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`fixed right-4 top-4 z-[100] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          feedback.type === "success" ? "border border-green-500/30 bg-green-500/10 text-green-400"
            : "border border-red-500/30 bg-red-500/10 text-red-400"
        }`}>{feedback.msg}</div>
      )}

      <PageHeader
        title="Visitor Management"
        subtitle="Pre-register, check-in, and track visitors"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Visitors" }]}
        actions={<Button onClick={() => setShowRegister(true)}>+ Pre-Register Visitor</Button>}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard title="Today Total" value={s.todayTotal} color="blue" />
        <StatCard title="Checked In" value={s.checkedIn} color="green" />
        <StatCard title="Checked Out" value={s.checkedOut} color="slate" />
        <StatCard title="Pre-Registered" value={s.preRegistered} color="cyan" />
        <StatCard title="No Shows" value={s.noShow} color="amber" />
        <StatCard title="This Week" value={s.weeklyTotal} color="purple" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <Card>
        {activeTab === "today" && (
          <>
            <CardHeader title="Today's Visitors" subtitle={formatDate(new Date())} />
            <DataTable columns={visitorColumns} data={todayVisitors || []} keyExtractor={(v) => v.id} loading={todayLoading} emptyMessage="No visitors registered for today." />
          </>
        )}
        {activeTab === "upcoming" && (
          <>
            <CardHeader title="Upcoming Visitors" subtitle="Future pre-registered visits" />
            <DataTable columns={visitorColumns} data={upcomingVisitors || []} keyExtractor={(v) => v.id} loading={upcomingLoading} emptyMessage="No upcoming visits." />
          </>
        )}
        {activeTab === "history" && (
          <>
            <CardHeader title="Visitor History" subtitle="All past visits" />
            <DataTable columns={visitorColumns} data={visitors || []} keyExtractor={(v) => v.id} loading={loading} emptyMessage="No visitor history." />
          </>
        )}
      </Card>

      {/* ── pre-register modal ──────────────────────────── */}
      <Modal open={showRegister} onClose={() => setShowRegister(false)} title="Pre-Register Visitor" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Full Name" placeholder="John Doe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Company" placeholder="Acme Corp" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" placeholder="john@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Phone" type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Select label="Purpose" options={[
              { value: "MEETING", label: "Meeting" },
              { value: "INTERVIEW", label: "Interview" },
              { value: "DELIVERY", label: "Delivery" },
              { value: "MAINTENANCE", label: "Maintenance" },
              { value: "TOUR", label: "Facility Tour" },
              { value: "PERSONAL", label: "Personal" },
              { value: "OTHER", label: "Other" },
            ]} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            <Input label="Host Employee ID" placeholder="emp_xxxxxxxx" value={form.hostEmployeeId} onChange={(e) => setForm({ ...form, hostEmployeeId: e.target.value })} />
            <Input label="Expected Arrival" type="datetime-local" value={form.expectedArrival} onChange={(e) => setForm({ ...form, expectedArrival: e.target.value })} />
          </div>
          <Textarea label="Notes" placeholder="Additional information, access requirements..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowRegister(false)}>Cancel</Button>
            <Button onClick={handleRegister} loading={submitting} disabled={!form.name || !form.hostEmployeeId}>Register</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
