"use client";

// ══════════════════════════════════════════════════════════════
// User Management — HR / Admin page for candidate onboarding
// View all users, promote candidates to employees, manage roles
// ══════════════════════════════════════════════════════════════

import React, { useState, useCallback } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, StatCard, Badge, Button, DataTable,
  Modal, Input, Select, Tabs,
} from "@/components/ui";
import { api } from "@/lib/api-client";
import { formatDate, timeAgo } from "@/lib/utils";

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

/* ── Types ──────────────────────────────────────────────── */
interface CandidateUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  department: string | null;
  createdAt: string;
}

interface AllUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  department: string | null;
  createdAt: string;
}

interface UserStats {
  totalUsers: number;
  totalEmployees: number;
  pendingCandidates: number;
  newRegistrations30d: number;
  byRole: { role: string; count: number }[];
  byStatus: { status: string; count: number }[];
}

/* ── Constants ──────────────────────────────────────────── */
const ROLES = [
  "ENGINEER", "DEVELOPER", "TESTER", "INTERN", "HR_MANAGER",
  "MANAGER", "PRODUCT_MANAGER", "MARKETING", "ADMIN",
];

const DEPARTMENTS = [
  "Engineering", "Product", "HR", "Marketing", "Finance",
  "Operations", "IoT", "AI/ML", "QA", "Design", "Sales",
];

const EMPLOYMENT_TYPES = [
  { value: "FULL_TIME", label: "Full Time" },
  { value: "PART_TIME", label: "Part Time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERN", label: "Intern" },
];

const ROLE_COLORS: Record<string, BadgeColor> = {
  ADMIN: "red", SUPER_ADMIN: "red", CEO: "amber",
  HR_MANAGER: "purple", MANAGER: "blue", PRODUCT_MANAGER: "cyan",
  ENGINEER: "green", DEVELOPER: "emerald", TESTER: "cyan",
  INTERN: "slate", MARKETING: "pink", CLIENT: "orange",
  CANDIDATE: "amber",
};

const STATUS_COLORS: Record<string, BadgeColor> = {
  ACTIVE: "green", INACTIVE: "slate", SUSPENDED: "red",
};

/* ══════════════════════════════════════════════════════════ */
export default function UserManagementPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("candidates");
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ── Data fetching ──────────────────────────────────────
  const { data: candidates, loading: loadingCandidates, refetch: refetchCandidates } =
    useApi<CandidateUser[]>("/auth/users/candidates");
  const { data: allUsers, loading: loadingUsers, refetch: refetchUsers } =
    useApi<AllUser[]>("/auth/users");
  const { data: stats, refetch: refetchStats } =
    useApi<UserStats>("/auth/users/stats");

  const refetchAll = useCallback(() => {
    refetchCandidates();
    refetchUsers();
    refetchStats();
  }, [refetchCandidates, refetchUsers, refetchStats]);

  // ── Promote Modal ──────────────────────────────────────
  const [promoteModal, setPromoteModal] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateUser | null>(null);
  const [promoteForm, setPromoteForm] = useState({
    role: "ENGINEER",
    designation: "",
    department: "Engineering",
    employmentType: "FULL_TIME",
    baseSalary: "",
    dateOfJoining: new Date().toISOString().split("T")[0],
    panNumber: "",
    aadhaarNumber: "",
  });
  const [promoting, setPromoting] = useState(false);

  const openPromote = (candidate: CandidateUser) => {
    setSelectedCandidate(candidate);
    setPromoteForm({
      role: "ENGINEER",
      designation: "",
      department: candidate.department || "Engineering",
      employmentType: "FULL_TIME",
      baseSalary: "",
      dateOfJoining: new Date().toISOString().split("T")[0],
      panNumber: "",
      aadhaarNumber: "",
    });
    setPromoteModal(true);
  };

  const handlePromote = async () => {
    if (!selectedCandidate || !promoteForm.designation || !promoteForm.baseSalary) {
      setActionMsg({ type: "error", text: "Designation and base salary are required" });
      return;
    }
    setPromoting(true);
    const res = await api.post(
      `/auth/users/${selectedCandidate.id}/promote-to-employee`,
      {
        role: promoteForm.role,
        designation: promoteForm.designation,
        department: promoteForm.department,
        employmentType: promoteForm.employmentType,
        baseSalary: Number(promoteForm.baseSalary),
        dateOfJoining: promoteForm.dateOfJoining,
        panNumber: promoteForm.panNumber || undefined,
        aadhaarNumber: promoteForm.aadhaarNumber || undefined,
      },
      token || undefined,
    );
    setPromoting(false);
    setPromoteModal(false);

    if (res.success) {
      setActionMsg({ type: "success", text: `${selectedCandidate.firstName} promoted to employee!` });
      refetchAll();
    } else {
      setActionMsg({ type: "error", text: res.error || "Promotion failed" });
    }
  };

  // ── Role / Status change ───────────────────────────────
  const [roleModal, setRoleModal] = useState(false);
  const [roleTarget, setRoleTarget] = useState<AllUser | null>(null);
  const [newRole, setNewRole] = useState("");

  const openRoleChange = (user: AllUser) => {
    setRoleTarget(user);
    setNewRole(user.role);
    setRoleModal(true);
  };

  const handleRoleChange = async () => {
    if (!roleTarget) return;
    const res = await api.patch(
      `/auth/users/${roleTarget.id}/role`,
      { role: newRole },
      token || undefined,
    );
    setRoleModal(false);
    if (res.success) {
      setActionMsg({ type: "success", text: `${roleTarget.firstName}'s role changed to ${newRole}` });
      refetchAll();
    } else {
      setActionMsg({ type: "error", text: res.error || "Role change failed" });
    }
  };

  const handleStatusToggle = async (user: AllUser) => {
    const newStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const res = await api.patch(
      `/auth/users/${user.id}/status`,
      { status: newStatus },
      token || undefined,
    );
    if (res.success) {
      setActionMsg({ type: "success", text: `${user.firstName} is now ${newStatus}` });
      refetchAll();
    } else {
      setActionMsg({ type: "error", text: res.error || "Status change failed" });
    }
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        subtitle="Onboard candidates, manage roles and access"
      />

      {/* Toast */}
      {actionMsg && (
        <div
          className={`flex items-center justify-between rounded-lg border p-4 ${
            actionMsg.type === "success"
              ? "border-green-500/20 bg-green-500/10 text-green-400"
              : "border-red-500/20 bg-red-500/10 text-red-400"
          }`}
        >
          <span className="text-sm">{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} className="text-xs hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard title="Total Users" value={stats.totalUsers} icon="👥" color="blue" />
          <StatCard
            title="Pending Candidates"
            value={stats.pendingCandidates}
            icon="🕐"
            color="amber"
            subtitle="Awaiting onboarding"
          />
          <StatCard title="Active Employees" value={stats.totalEmployees} icon="💼" color="green" />
          <StatCard
            title="New (30 days)"
            value={stats.newRegistrations30d}
            icon="📈"
            color="purple"
          />
        </div>
      )}

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: "candidates", label: `Candidates (${candidates?.length ?? 0})` },
          { id: "all-users", label: `All Users (${allUsers?.length ?? 0})` },
          { id: "role-breakdown", label: "Role Breakdown" },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* ─── Candidates Tab ────────────────────────────── */}
      {activeTab === "candidates" && (
        <Card>
          {loadingCandidates ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : !candidates || candidates.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-4xl">🎉</p>
              <p className="mt-2 text-sm text-slate-400">No pending candidates — all caught up!</p>
            </div>
          ) : (
            <DataTable
              columns={[
                {
                  key: "name",
                  header: "Name",
                  render: (c: CandidateUser) => (
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {c.firstName} {c.lastName}
                      </p>
                      <p className="text-xs text-slate-400">{c.email}</p>
                    </div>
                  ),
                },
                {
                  key: "phone",
                  header: "Phone",
                  render: (c: CandidateUser) => (
                    <span className="text-sm text-slate-600 dark:text-slate-300">{c.phone || "—"}</span>
                  ),
                },
                {
                  key: "registered",
                  header: "Registered",
                  render: (c: CandidateUser) => (
                    <div>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{formatDate(c.createdAt)}</p>
                      <p className="text-xs text-slate-500">{timeAgo(c.createdAt)}</p>
                    </div>
                  ),
                },
                {
                  key: "actions",
                  header: "Actions",
                  render: (c: CandidateUser) => (
                    <Button size="sm" onClick={() => openPromote(c)}>
                      🚀 Onboard
                    </Button>
                  ),
                },
              ]}
              data={candidates}
              keyExtractor={(c) => c.id}
            />
          )}
        </Card>
      )}

      {/* ─── All Users Tab ─────────────────────────────── */}
      {activeTab === "all-users" && (
        <Card>
          {loadingUsers ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : (
            <DataTable
              columns={[
                {
                  key: "name",
                  header: "User",
                  render: (u: AllUser) => (
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {u.firstName} {u.lastName}
                      </p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </div>
                  ),
                },
                {
                  key: "role",
                  header: "Role",
                  render: (u: AllUser) => (
                    <Badge color={ROLE_COLORS[u.role] || "slate"}>{u.role.replace(/_/g, " ")}</Badge>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  render: (u: AllUser) => (
                    <Badge color={STATUS_COLORS[u.status] || "slate"}>{u.status}</Badge>
                  ),
                },
                {
                  key: "dept",
                  header: "Department",
                  render: (u: AllUser) => (
                    <span className="text-sm text-slate-600 dark:text-slate-300">{u.department || "—"}</span>
                  ),
                },
                {
                  key: "joined",
                  header: "Joined",
                  render: (u: AllUser) => (
                    <span className="text-sm text-slate-400">{formatDate(u.createdAt)}</span>
                  ),
                },
                {
                  key: "actions",
                  header: "Actions",
                  render: (u: AllUser) => (
                    <div className="flex gap-2">
                      <button
                        onClick={() => openRoleChange(u)}
                        className="rounded bg-slate-200 px-2 py-1 dark:bg-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                        title="Change Role"
                      >
                        ✏️ Role
                      </button>
                      <button
                        onClick={() => handleStatusToggle(u)}
                        className={`rounded px-2 py-1 text-xs ${
                          u.status === "ACTIVE"
                            ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                            : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                        }`}
                        title={u.status === "ACTIVE" ? "Suspend" : "Activate"}
                      >
                        {u.status === "ACTIVE" ? "⏸ Suspend" : "▶ Activate"}
                      </button>
                      {u.role === "CANDIDATE" && (
                        <Button size="sm" onClick={() => openPromote(u as any)}>
                          🚀 Onboard
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
              data={allUsers || []}
              keyExtractor={(u) => u.id}
            />
          )}
        </Card>
      )}

      {/* ─── Role Breakdown Tab ────────────────────────── */}
      {activeTab === "role-breakdown" && stats && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <h3 className="mb-4 text-sm font-semibold text-white">By Role</h3>
            <div className="space-y-2">
              {stats.byRole.map(({ role, count }) => (
                <div
                  key={role}
                  className="flex items-center justify-between rounded-lg bg-slate-100 px-4 py-2 dark:bg-slate-800/50"
                >
                  <Badge color={ROLE_COLORS[role] || "slate"}>{role.replace(/_/g, " ")}</Badge>
                  <span className="text-sm font-medium text-white">{count}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h3 className="mb-4 text-sm font-semibold text-white">By Status</h3>
            <div className="space-y-2">
              {stats.byStatus.map(({ status, count }) => (
                <div
                  key={status}
                  className="flex items-center justify-between rounded-lg bg-slate-100 px-4 py-2 dark:bg-slate-800/50"
                >
                  <Badge color={STATUS_COLORS[status] || "slate"}>{status}</Badge>
                  <span className="text-sm font-medium text-white">{count}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ─── Promote / Onboard Modal ──────────────────── */}
      <Modal open={promoteModal} onClose={() => setPromoteModal(false)} title="Onboard Candidate as Employee" size="lg">
        {selectedCandidate && (
          <div className="space-y-5">
            {/* Candidate info header */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-800/60 p-4">
              <p className="text-sm font-medium text-white">
                {selectedCandidate.firstName} {selectedCandidate.lastName}
              </p>
              <p className="text-xs text-slate-400">{selectedCandidate.email}</p>
              {selectedCandidate.phone && (
                <p className="mt-1 text-xs text-slate-500">📞 {selectedCandidate.phone}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Assign Role"
                options={ROLES.map((r) => ({ value: r, label: r.replace(/_/g, " ") }))}
                value={promoteForm.role}
                onChange={(e) => setPromoteForm({ ...promoteForm, role: e.target.value })}
              />
              <Input
                label="Designation *"
                placeholder="e.g. Software Engineer"
                value={promoteForm.designation}
                onChange={(e) =>
                  setPromoteForm({ ...promoteForm, designation: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Department"
                options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
                value={promoteForm.department}
                onChange={(e) => setPromoteForm({ ...promoteForm, department: e.target.value })}
              />
              <Select
                label="Employment Type"
                options={EMPLOYMENT_TYPES}
                value={promoteForm.employmentType}
                onChange={(e) =>
                  setPromoteForm({ ...promoteForm, employmentType: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Base Salary (₹/month) *"
                type="number"
                placeholder="50000"
                value={promoteForm.baseSalary}
                onChange={(e) =>
                  setPromoteForm({ ...promoteForm, baseSalary: e.target.value })
                }
              />
              <Input
                label="Date of Joining"
                type="date"
                value={promoteForm.dateOfJoining}
                onChange={(e) =>
                  setPromoteForm({ ...promoteForm, dateOfJoining: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="PAN Number"
                placeholder="ABCDE1234F"
                value={promoteForm.panNumber}
                onChange={(e) =>
                  setPromoteForm({ ...promoteForm, panNumber: e.target.value.toUpperCase() })
                }
              />
              <Input
                label="Aadhaar Number"
                placeholder="1234 5678 9012"
                value={promoteForm.aadhaarNumber}
                onChange={(e) =>
                  setPromoteForm({ ...promoteForm, aadhaarNumber: e.target.value })
                }
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setPromoteModal(false)}>
                Cancel
              </Button>
              <Button onClick={handlePromote} disabled={promoting}>
                {promoting ? "Creating Employee…" : "🚀 Promote to Employee"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Change Role Modal ────────────────────────── */}
      <Modal open={roleModal} onClose={() => setRoleModal(false)} title="Change User Role">
        {roleTarget && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-800/60 p-4">
              <p className="text-sm font-medium text-white">
                {roleTarget.firstName} {roleTarget.lastName}
              </p>
              <p className="text-xs text-slate-400">
                Current role: <Badge color={ROLE_COLORS[roleTarget.role] || "slate"}>{roleTarget.role}</Badge>
              </p>
            </div>

            <Select
              label="New Role"
              options={[...ROLES, "CANDIDATE", "CLIENT"].map((r) => ({
                value: r,
                label: r.replace(/_/g, " "),
              }))}
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setRoleModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleRoleChange}>Save Role</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
