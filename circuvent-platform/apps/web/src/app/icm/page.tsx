"use client";

import React, { useState, useMemo } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, StatCard, Badge, Button,
  DataTable, Modal, Input, Textarea, Tabs, EmptyState,
} from "@/components/ui";
import { timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

/* ── Types ──────────────────────────────────────────────── */

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

interface Ticket {
  id: string;
  ticketCode: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  slaDeadline: string;
  slaRemainingMs: number;
  isOverdue: boolean;
  watcherCount: number;
  employee: {
    id: string;
    user: { id: string; firstName: string; lastName: string; email: string };
  };
  comments: Array<{
    id: string;
    userId: string;
    content: string;
    isInternal: boolean;
    createdAt: string;
  }>;
}

interface Dashboard {
  total: number;
  open: number;
  inProgress: number;
  waitingOnUser: number;
  resolved: number;
  closed: number;
  highPriority: number;
  overdue: number;
  avgResolutionHours: number;
  statusDistribution: Record<string, number>;
  priorityDistribution: Record<string, number>;
  byCategory: Array<{ category: string; count: number }>;
}

/* ── Color maps ─────────────────────────────────────────── */

const priorityColors: Record<string, BadgeColor> = {
  CRITICAL: "red",
  HIGH: "orange",
  MEDIUM: "amber",
  LOW: "green",
};

const statusColors: Record<string, BadgeColor> = {
  OPEN: "blue",
  IN_PROGRESS: "amber",
  WAITING_ON_USER: "purple",
  RESOLVED: "green",
  CLOSED: "slate",
};

const categoryLabels: Record<string, string> = {
  IT_HARDWARE: "IT Hardware",
  IT_SOFTWARE: "IT Software",
  IT_ACCESS: "IT Access",
  HR_QUERY: "HR Query",
  PAYROLL: "Payroll",
  FACILITIES: "Facilities",
  OTHER: "Other",
};

/* ── Component ──────────────────────────────────────────── */

export default function ICMPage() {
  const { token, user } = useAuth();
  const { data: tickets, loading, refetch } = useApi<Ticket[]>("/hr/icm/tickets");
  const { data: dashboard } = useApi<Dashboard>("/hr/icm/dashboard");

  const [activeTab, setActiveTab] = useState("all");
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [newSubject, setNewSubject] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState("OTHER");
  const [newPriority, setNewPriority] = useState("MEDIUM");
  const [newAssignee, setNewAssignee] = useState("");

  /* ── Filtered Tickets ──────────────────────────────────── */

  const filteredTickets = useMemo(() => {
    if (!tickets) return [];
    let list = [...tickets];

    if (activeTab === "open") list = list.filter((t) => t.status === "OPEN");
    if (activeTab === "in_progress") list = list.filter((t) => t.status === "IN_PROGRESS");
    if (activeTab === "resolved") list = list.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED");
    if (activeTab === "my_tickets") list = list.filter((t) => t.assignedTo === user?.id);

    if (filterStatus) list = list.filter((t) => t.status === filterStatus);
    if (filterPriority) list = list.filter((t) => t.priority === filterPriority);
    if (filterCategory) list = list.filter((t) => t.category === filterCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.ticketCode.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [tickets, activeTab, filterStatus, filterPriority, filterCategory, searchQuery, user?.id]);

  /* ── Handlers ──────────────────────────────────────────── */

  const handleCreate = async () => {
    if (!newSubject || !newDescription) return;
    setSubmitting(true);
    await api.post("/hr/icm/tickets", {
      subject: newSubject,
      description: newDescription,
      category: newCategory,
      priority: newPriority,
      assignedTo: newAssignee || undefined,
      employeeId: (user as any)?.employeeId || user?.id,
    }, token || undefined);
    setShowCreateModal(false);
    setNewSubject(""); setNewDescription(""); setNewCategory("OTHER"); setNewPriority("MEDIUM"); setNewAssignee("");
    setSubmitting(false);
    refetch();
  };

  const handleAddComment = async (ticketId: string) => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    await api.post(`/hr/icm/tickets/${ticketId}/comments`, {
      userId: user?.id,
      content: commentText,
      isInternal: false,
    }, token || undefined);
    setCommentText("");
    setSubmitting(false);
    refetch();
  };

  const handleAssign = async (ticketId: string) => {
    await api.post(`/hr/icm/tickets/${ticketId}/assign`, { assignedTo: user?.id }, token || undefined);
    refetch();
  };

  const handleEscalate = async (ticketId: string) => {
    await api.post(`/hr/icm/tickets/${ticketId}/escalate`, { userId: user?.id, reason: "Manual escalation" }, token || undefined);
    refetch();
  };

  const handleResolve = async (ticketId: string) => {
    const resolution = prompt("Enter resolution notes:");
    if (!resolution) return;
    await api.post(`/hr/icm/tickets/${ticketId}/resolve`, { resolution, userId: user?.id }, token || undefined);
    refetch();
  };

  /* ── SLA Bar ───────────────────────────────────────────── */

  const SLABar = ({ remainingMs, isOverdue: overdue }: { remainingMs: number; isOverdue: boolean }) => {
    if (overdue) {
      return (
        <div className="w-full rounded-full h-2 bg-red-200 dark:bg-red-900">
          <div className="h-2 rounded-full bg-red-500 w-full" />
        </div>
      );
    }
    const maxMs = 72 * 60 * 60 * 1000;
    const pct = Math.min(100, Math.max(0, (remainingMs / maxMs) * 100));
    const color = pct > 50 ? "bg-green-500" : pct > 20 ? "bg-amber-500" : "bg-red-500";
    return (
      <div className="w-full rounded-full h-2 bg-slate-200 dark:bg-slate-700">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    );
  };

  /* ── Tabs ──────────────────────────────────────────────── */

  const tabs = [
    { id: "all", label: "All", count: tickets?.length },
    { id: "open", label: "Open", count: tickets?.filter((t) => t.status === "OPEN").length },
    { id: "in_progress", label: "In Progress", count: tickets?.filter((t) => t.status === "IN_PROGRESS").length },
    { id: "resolved", label: "Resolved", count: tickets?.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length },
    { id: "my_tickets", label: "My Tickets", count: tickets?.filter((t) => t.assignedTo === user?.id).length },
  ];

  /* ── Table Columns ─────────────────────────────────────── */

  const columns = [
    {
      key: "ticketCode",
      header: "Code",
      render: (t: Ticket) => (
        <button onClick={() => setExpandedTicketId(expandedTicketId === t.id ? null : t.id)} className="font-mono text-xs text-brand-600 dark:text-brand-400 hover:underline">
          {t.ticketCode}
        </button>
      ),
    },
    {
      key: "subject",
      header: "Subject",
      render: (t: Ticket) => (
        <button onClick={() => setExpandedTicketId(expandedTicketId === t.id ? null : t.id)} className="text-left font-medium text-slate-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 truncate max-w-[240px] block">
          {t.subject}
        </button>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      render: (t: Ticket) => <Badge color={priorityColors[t.priority] || "slate"}>{t.priority}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (t: Ticket) => <Badge color={statusColors[t.status] || "slate"}>{t.status.replace(/_/g, " ")}</Badge>,
    },
    {
      key: "category",
      header: "Category",
      render: (t: Ticket) => <span className="text-xs text-slate-500 dark:text-slate-400">{categoryLabels[t.category] || t.category}</span>,
    },
    {
      key: "assignedTo",
      header: "Assignee",
      render: (t: Ticket) => (
        <span className="text-xs text-slate-600 dark:text-slate-300">{t.assignedTo || "Unassigned"}</span>
      ),
    },
    {
      key: "sla",
      header: "SLA",
      render: (t: Ticket) => (
        <div className="w-24">
          <SLABar remainingMs={t.slaRemainingMs} isOverdue={t.isOverdue} />
          <span className={`text-[10px] ${t.isOverdue ? "text-red-500" : "text-slate-400 dark:text-slate-500"}`}>
            {t.isOverdue ? "Overdue" : `${Math.round(t.slaRemainingMs / 3600000)}h left`}
          </span>
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      render: (t: Ticket) => <span className="text-xs text-slate-400 dark:text-slate-500">{timeAgo(t.createdAt)}</span>,
    },
  ];

  /* ── Render ────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incident & Case Management"
        subtitle="Track, manage, and resolve support tickets with SLA monitoring"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard title="Total Tickets" value={dashboard?.total ?? "—"} color="blue" />
        <StatCard title="Open" value={dashboard?.open ?? "—"} color="amber" />
        <StatCard title="High Priority" value={dashboard?.highPriority ?? "—"} color="red" />
        <StatCard title="Overdue" value={dashboard?.overdue ?? "—"} color="red" />
        <StatCard title="Avg Resolution" value={dashboard?.avgResolutionHours ? `${dashboard.avgResolutionHours}h` : "—"} color="green" />
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search tickets..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
            value={filterStatus}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="WAITING_ON_USER">Waiting on User</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
          <select
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
            value={filterPriority}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterPriority(e.target.value)}
          >
            <option value="">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
            value={filterCategory}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {Object.entries(categoryLabels).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <Button onClick={() => setShowCreateModal(true)}>+ New Ticket</Button>
        </div>
      </Card>

      {/* Tabs + Table */}
      <Card>
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        {loading ? (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500">Loading tickets…</div>
        ) : filteredTickets.length === 0 ? (
          <EmptyState title="No tickets found" description="Create a new ticket or adjust your filters." />
        ) : (
          <>
            <DataTable
              data={filteredTickets}
              columns={columns}
              keyExtractor={(t: Ticket) => t.id}
            />

            {/* Expanded ticket detail */}
            {expandedTicketId && (() => {
              const ticket = filteredTickets.find((t) => t.id === expandedTicketId);
              if (!ticket) return null;
              return (
                <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{ticket.subject}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{ticket.ticketCode} · {categoryLabels[ticket.category]} · Created by {ticket.employee?.user?.firstName} {ticket.employee?.user?.lastName}</p>
                    </div>
                    <div className="flex gap-2">
                      {ticket.status !== "RESOLVED" && ticket.status !== "CLOSED" && (
                        <>
                          <Button onClick={() => handleAssign(ticket.id)}>Assign to me</Button>
                          <Button onClick={() => handleEscalate(ticket.id)}>Escalate</Button>
                          <Button onClick={() => handleResolve(ticket.id)}>Resolve</Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{ticket.description}</p>
                  </div>

                  {/* SLA */}
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">SLA:</span>
                    <div className="flex-1 max-w-xs">
                      <SLABar remainingMs={ticket.slaRemainingMs} isOverdue={ticket.isOverdue} />
                    </div>
                    <span className={`text-xs ${ticket.isOverdue ? "text-red-500 font-bold" : "text-slate-500 dark:text-slate-400"}`}>
                      {ticket.isOverdue ? "BREACHED" : `${Math.round(ticket.slaRemainingMs / 3600000)}h remaining`}
                    </span>
                  </div>

                  {/* Comments */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Comments ({ticket.comments?.length || 0})</h4>
                    {(ticket.comments || []).map((c) => (
                      <div key={c.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md p-3">
                        <div className="flex justify-between">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{c.userId}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">{timeAgo(c.createdAt)}</span>
                        </div>
                        <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">{c.content}</p>
                        {c.isInternal && <Badge color="amber">Internal</Badge>}
                      </div>
                    ))}

                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Textarea
                          value={commentText}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCommentText(e.target.value)}
                          placeholder="Add a comment…"
                          rows={2}
                        />
                      </div>
                      <Button onClick={() => handleAddComment(ticket.id)} disabled={submitting || !commentText.trim()}>
                        Send
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </Card>

      {/* Create Ticket Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Support Ticket">
        <div className="space-y-4">
          <Input label="Subject" value={newSubject} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewSubject(e.target.value)} placeholder="Brief summary of the issue" />
          <Textarea label="Description" value={newDescription} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewDescription(e.target.value)} placeholder="Detailed description…" rows={4} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
              <select
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                value={newCategory}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewCategory(e.target.value)}
              >
                {Object.entries(categoryLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
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
          <Input label="Assign to (User ID)" value={newAssignee} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAssignee(e.target.value)} placeholder="Optional" />
          <div className="flex justify-end gap-3 pt-2">
            <Button onClick={() => setShowCreateModal(false)} variant="outline">Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting || !newSubject || !newDescription}>
              {submitting ? "Creating…" : "Create Ticket"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
