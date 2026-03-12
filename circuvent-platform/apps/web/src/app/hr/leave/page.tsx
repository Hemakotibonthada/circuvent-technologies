"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, StatCard, Badge, Button, DataTable, Modal, Input, Select, Textarea, Tabs } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { api } from "@/lib/api-client";

const leaveTypeColors: Record<string, any> = {
  CASUAL: "blue", SICK: "red", EARNED: "green", MATERNITY: "pink",
  PATERNITY: "cyan", UNPAID: "slate", COMPENSATORY: "purple",
};

const statusColors: Record<string, any> = {
  PENDING: "amber", APPROVED: "green", REJECTED: "red", CANCELLED: "slate",
};

export default function LeaveManagementPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("requests");
  const { data: pendingLeaves, loading, refetch } = useApi<any[]>("/hr/leave");
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    employeeId: "", leaveType: "CASUAL", startDate: "", endDate: "", reason: "", approverId: "",
  });

  const handleApply = async () => {
    setSubmitting(true);
    await api.post("/hr/leave", form, token || undefined);
    setShowApplyModal(false);
    setForm({ employeeId: "", leaveType: "CASUAL", startDate: "", endDate: "", reason: "", approverId: "" });
    setSubmitting(false);
    refetch();
  };

  const handleApprove = async (leaveId: string) => {
    await api.patch(`/hr/leave/${leaveId}/approve`, {}, token || undefined);
    refetch();
  };

  const handleReject = async (leaveId: string) => {
    await api.patch(`/hr/leave/${leaveId}/reject`, { comments: "Insufficient coverage" }, token || undefined);
    refetch();
  };

  const tabs = [
    { id: "requests", label: "All Requests" }, { key: "pending", label: "Pending Approvals" }, { key: "calendar", label: "Team Calendar" }, { key: "balance", label: "Leave Balance" },
  ];

  const leaveColumns = [
    {
      id: "employee", header: "Employee",
      render: (l: any) => l.employee ? (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{l.employee.user?.firstName} {l.employee.user?.lastName}</p>
          <p className="text-xs text-slate-500">{l.employee.employeeCode}</p>
        </div>
      ) : "—",
    }, { key: "leaveType", header: "Type", render: (l: any) => <Badge color={leaveTypeColors[l.leaveType]}>{l.leaveType}</Badge> }, { key: "startDate", header: "From", render: (l: any) => formatDate(l.startDate) }, { key: "endDate", header: "To", render: (l: any) => formatDate(l.endDate) }, { key: "totalDays", header: "Days", render: (l: any) => `${Number(l.totalDays)}d` }, { key: "reason", header: "Reason", render: (l: any) => l.reason || "—" }, { key: "status", header: "Status", render: (l: any) => <Badge color={statusColors[l.status]}>{l.status}</Badge> }, { key: "actions", header: "",
      render: (l: any) => l.status === "PENDING" ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => handleApprove(l.id)}>Approve</Button>
          <Button size="sm" variant="ghost" onClick={() => handleReject(l.id)}>Reject</Button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Management"
        subtitle="Apply for leave, track balances, and manage approvals"
        breadcrumbs={[{ label: "HR & Payroll", href: "/hr" }, { label: "Leave Management" }]}
        actions={<Button onClick={() => setShowApplyModal(true)}>+ Apply Leave</Button>}
      />

      {/* Leave type summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
        {Object.entries(leaveTypeColors).map(([type, color]) => (
          <Card key={type} className="text-center p-3">
            <Badge color={color}>{type}</Badge>
            <p className="mt-1 text-xs text-slate-500">
              {type === "CASUAL" ? "12d" : type === "SICK" ? "12d" : type === "EARNED" ? "15d" :
               type === "MATERNITY" ? "182d" : type === "PATERNITY" ? "15d" : "—"}
            </p>
          </Card>
        ))}
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Requests/Pending Tab */}
      {(activeTab === "requests" || activeTab === "pending") && (
        <Card padding={false}>
          <DataTable
            columns={leaveColumns}
            data={pendingLeaves || []}
            keyExtractor={(l: any) => l.id}
            loading={loading}
            emptyMessage="No leave requests found."
          />
        </Card>
      )}

      {/* Calendar Tab */}
      {activeTab === "calendar" && (
        <Card>
          <CardHeader title="Team Calendar" subtitle="View leave schedule across departments" />
          <div className="grid grid-cols-7 gap-1">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day} className="text-center text-xs font-medium text-slate-500 py-2">{day}</div>
            ))}
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className={`rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-center text-xs ${i % 7 >= 5 ? "bg-slate-900/50 text-slate-600" : "text-slate-400"}`}>
                {i + 1 <= 31 ? i + 1 : ""}
              </Card>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500 text-center">Select a department and month to view the team leave calendar.</p>
        </div>
      )}

      {/* Balance Tab */}
      {activeTab === "balance" && (
        <Card>
          <CardHeader title="Leave Balance" subtitle="Enter employee ID to check balance" />
          <p className="text-sm text-slate-400">Use the employee detail page to view individual leave balances with full breakdown.</p>
        </Card>
      )}

      {/* Apply Leave Modal */}
      <Modal open={showApplyModal} onClose={() => setShowApplyModal(false)} title="Apply for Leave" size="lg">
        <div className="space-y-4">
          <Input label="Employee ID" placeholder="Employee ID..." value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
          <Select label="Leave Type" options={[
            { value: "CASUAL", label: "Casual Leave (12d/year)" },
            { value: "SICK", label: "Sick Leave (12d/year)" },
            { value: "EARNED", label: "Earned Leave (15d/year)" },
            { value: "MATERNITY", label: "Maternity Leave (26 weeks)" },
            { value: "PATERNITY", label: "Paternity Leave (15d)" },
            { value: "COMPENSATORY", label: "Compensatory Off" },
            { value: "UNPAID", label: "Leave Without Pay" },
          ]} value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <Input label="End Date" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <Textarea label="Reason" placeholder="Reason for leave..." value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <Input label="Approver ID" placeholder="Manager's user ID..." value={form.approverId} onChange={(e) => setForm({ ...form, approverId: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowApplyModal(false)}>Cancel</Button>
            <Button onClick={handleApply} loading={submitting} disabled={!form.employeeId || !form.startDate || !form.endDate}>
              Submit Request
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
