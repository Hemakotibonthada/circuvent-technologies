"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, StatCard, Badge, Button,
  Modal, Input, Textarea, Tabs, EmptyState,
} from "@/components/ui";
import { formatDate, formatDateTime, timeAgo } from "@/lib/utils";
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
  assigneeName?: string;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  slaDeadline: string;
  slaRemainingMs: number;
  isOverdue: boolean;
  watcherCount: number;
  escalationLevel?: number;
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
    userName?: string;
  }>;
  history?: Array<{
    action: string;
    details: string;
    userId: string;
    userName: string;
    createdAt: string;
  }>;
  watchers?: string[];
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

const priorityColors: Record<string, BadgeColor> = { CRITICAL: "red", HIGH: "orange", MEDIUM: "amber", LOW: "green" };
const statusColors: Record<string, BadgeColor> = { OPEN: "blue", IN_PROGRESS: "amber", WAITING_ON_USER: "purple", RESOLVED: "green", CLOSED: "slate" };

const categoryLabels: Record<string, string> = {
  IT_HARDWARE: "IT Hardware", IT_SOFTWARE: "IT Software", IT_ACCESS: "IT Access",
  IT_NETWORK: "IT Network", HR_GENERAL: "HR General", HR_PAYROLL: "HR Payroll",
  FACILITIES: "Facilities", ADMIN: "Admin", SECURITY: "Security", OTHER: "Other",
};

const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"];
const CATEGORIES = Object.keys(categoryLabels);
const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest First" },
  { value: "createdAt:asc", label: "Oldest First" },
  { value: "priority:asc", label: "Priority (High-Low)" },
  { value: "sla:asc", label: "SLA Deadline" },
];

/* ── SLA Timer Component ─────────────────────────────────── */

function SLACountdown({ remainingMs, isOverdue }: { remainingMs: number; isOverdue: boolean }) {
  const [remaining, setRemaining] = useState(remainingMs);

  useEffect(() => {
    if (isOverdue) return;
    const interval = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOverdue]);

  if (isOverdue) {
    const overdueMins = Math.abs(Math.floor(remaining / 60000));
    return <span className="text-red-600 dark:text-red-400 font-mono text-sm">⚠️ Overdue by {overdueMins}m</span>;
  }

  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  const color = hours < 1 ? "text-red-600 dark:text-red-400" : hours < 4 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400";

  return <span className={`${color} font-mono text-sm`}>⏱ {hours}h {mins}m</span>;
}

/* ── Escalation Chain Visualization ──────────────────────── */

function EscalationChain({ level }: { level: number }) {
  const chain = ["L1 Support", "L2 Senior", "L3 Manager", "L4 Director"];
  return (
    <div className="flex items-center gap-1">
      {chain.map((label, idx) => (
        <React.Fragment key={label}>
          <span className={`px-2 py-0.5 rounded text-xs ${
            idx < level
              ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
              : idx === level
              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-bold"
              : "bg-slate-100 dark:bg-slate-800 text-slate-400"
          }`}>{label}</span>
          {idx < chain.length - 1 && <span className="text-slate-300 dark:text-slate-600">→</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ── Component ──────────────────────────────────────────── */

export default function TicketsPage() {
  const { token, user } = useAuth();
  const { data: dashboard } = useApi<Dashboard>("/hr/icm/dashboard");

  const [activeTab, setActiveTab] = useState("list");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /* Filters */
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("createdAt:desc");

  /* Bulk actions */
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("");

  /* Comment form */
  const [commentText, setCommentText] = useState("");
  const [commentInternal, setCommentInternal] = useState(false);

  /* Detail tab */
  const [detailTab, setDetailTab] = useState("details");

  /* Build query */
  const queryParams = new URLSearchParams();
  if (filterPriority) queryParams.set("priority", filterPriority);
  if (filterStatus) queryParams.set("status", filterStatus);
  if (filterCategory) queryParams.set("category", filterCategory);
  if (filterAssignee === "me") queryParams.set("assignee", user?.id || "");
  if (searchQuery) queryParams.set("search", searchQuery);
  const [sortField, sortOrder] = sortBy.split(":");
  queryParams.set("sortBy", sortField);
  queryParams.set("sortOrder", sortOrder);

  const { data: ticketsList, refetch: refetchTickets } = useApi<Ticket[]>(`/hr/icm/tickets?${queryParams.toString()}`);

  /* ── Filtered tickets (date filters applied client-side) ── */

  const filteredTickets = useMemo(() => {
    if (!ticketsList) return [];
    let result = [...ticketsList];

    if (filterDateFrom) {
      result = result.filter((t) => t.createdAt >= filterDateFrom);
    }
    if (filterDateTo) {
      result = result.filter((t) => t.createdAt <= filterDateTo + "T23:59:59");
    }

    return result;
  }, [ticketsList, filterDateFrom, filterDateTo]);

  /* ── Handlers ──────────────────────────────────────────── */

  const handleViewTicket = async (ticket: Ticket) => {
    const res = await api.get(`/hr/icm/tickets/${ticket.id}`, token || undefined);
    if (res.success) setSelectedTicket(res.data as any);
    else setSelectedTicket(ticket);
    setDetailTab("details");
    setActiveTab("detail");
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    await api.put(`/hr/icm/tickets/${ticketId}/status`, { status: newStatus }, token || undefined);
    refetchTickets();
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket({ ...selectedTicket, status: newStatus });
    }
  };

  const handleAddComment = async () => {
    if (!selectedTicket || !commentText) return;
    setSubmitting(true);
    await api.post(`/hr/icm/tickets/${selectedTicket.id}/comments`, {
      content: commentText,
      isInternal: commentInternal,
      userId: user?.id,
    }, token || undefined);
    setCommentText(""); setCommentInternal(false);
    setSubmitting(false);
    const res = await api.get(`/hr/icm/tickets/${selectedTicket.id}`, token || undefined);
    if (res.success) setSelectedTicket(res.data as any);
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedTicketIds.size === 0) return;
    setSubmitting(true);
    const ids = Array.from(selectedTicketIds);

    if (bulkAction.startsWith("status:")) {
      const status = bulkAction.replace("status:", "");
      for (const id of ids) {
        await api.put(`/hr/icm/tickets/${id}/status`, { status }, token || undefined);
      }
    } else if (bulkAction === "assign_me") {
      for (const id of ids) {
        await api.put(`/hr/icm/tickets/${id}/assign`, { assigneeId: user?.id }, token || undefined);
      }
    }

    setSelectedTicketIds(new Set());
    setBulkAction("");
    setSubmitting(false);
    refetchTickets();
  };

  const toggleTicketSelection = (id: string) => {
    const next = new Set(selectedTicketIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedTicketIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedTicketIds.size === filteredTickets.length) {
      setSelectedTicketIds(new Set());
    } else {
      setSelectedTicketIds(new Set(filteredTickets.map((t) => t.id)));
    }
  };

  /* ── Tab definitions ───────────────────────────────────── */

  const tabs = [
    { id: "list", label: "📋 Ticket List" },
    { id: "detail", label: "🎫 Ticket Detail" },
    { id: "dashboard", label: "📊 Dashboard" },
  ];

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="ICM Tickets" subtitle="Incident & case management tickets with SLA tracking" />

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── Ticket List Tab ─────────────────────────────────── */}
      {activeTab === "list" && (
        <div className="space-y-4">
          {/* Quick Stats */}
          {dashboard && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Open" value={dashboard.open} color="blue" />
              <StatCard title="In Progress" value={dashboard.inProgress} color="amber" />
              <StatCard title="Overdue" value={dashboard.overdue} color="red" />
              <StatCard title="Avg Resolution" value={`${dashboard.avgResolutionHours}h`} color="green" />
            </div>
          )}

          {/* Advanced Filters */}
          <Card>
            <div className="flex flex-wrap gap-3 items-end">
              <Input placeholder="Search tickets..." value={searchQuery} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)} className="w-56" />
              <div>
                <select className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white" value={filterPriority} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterPriority(e.target.value)}>
                  <option value="">All Priorities</option>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <select className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white" value={filterStatus} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterStatus(e.target.value)}>
                  <option value="">All Statuses</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <select className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white" value={filterCategory} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterCategory(e.target.value)}>
                  <option value="">All Categories</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}
                </select>
              </div>
              <div>
                <select className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white" value={filterAssignee} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterAssignee(e.target.value)}>
                  <option value="">All Assignees</option>
                  <option value="me">Assigned to Me</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <Input type="date" value={filterDateFrom} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterDateFrom(e.target.value)} className="w-36" />
                <span className="text-slate-500">—</span>
                <Input type="date" value={filterDateTo} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterDateTo(e.target.value)} className="w-36" />
              </div>
              <div>
                <select className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white" value={sortBy} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value)}>
                  {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </Card>

          {/* Bulk Actions */}
          {selectedTicketIds.size > 0 && (
            <Card className="bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {selectedTicketIds.size} ticket{selectedTicketIds.size > 1 ? "s" : ""} selected
                </span>
                <select
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white w-48"
                  value={bulkAction}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBulkAction(e.target.value)}
                >
                  <option value="">Select action...</option>
                  <option value="assign_me">Assign to me</option>
                  <option value="status:IN_PROGRESS">Set In Progress</option>
                  <option value="status:RESOLVED">Set Resolved</option>
                  <option value="status:CLOSED">Set Closed</option>
                </select>
                <Button onClick={handleBulkAction} disabled={!bulkAction || submitting}>Apply</Button>
                <Button variant="outline" onClick={() => setSelectedTicketIds(new Set())}>Clear</Button>
              </div>
            </Card>
          )}

          {/* Ticket List */}
          {filteredTickets.length > 0 ? (
            <div className="space-y-2">
              {/* Select All */}
              <div className="flex items-center gap-2 px-2">
                <input type="checkbox" checked={selectedTicketIds.size === filteredTickets.length && filteredTickets.length > 0} onChange={toggleSelectAll} className="rounded" />
                <span className="text-xs text-slate-500">Select all ({filteredTickets.length})</span>
              </div>

              {filteredTickets.map((ticket) => (
                <Card key={ticket.id} className="hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedTicketIds.has(ticket.id)}
                      onChange={() => toggleTicketSelection(ticket.id)}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      className="rounded"
                    />
                    <div className="flex-1 cursor-pointer" onClick={() => handleViewTicket(ticket)}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{ticket.ticketCode}</span>
                        <h4 className="font-medium text-sm text-slate-900 dark:text-white">{ticket.subject}</h4>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge color={priorityColors[ticket.priority] || "slate"}>{ticket.priority}</Badge>
                        <Badge color={statusColors[ticket.status] || "slate"}>{ticket.status.replace(/_/g, " ")}</Badge>
                        <span className="text-xs text-slate-500">{categoryLabels[ticket.category] || ticket.category}</span>
                        <SLACountdown remainingMs={ticket.slaRemainingMs} isOverdue={ticket.isOverdue} />
                        <span className="text-xs text-slate-500 dark:text-slate-400">{timeAgo(ticket.createdAt)}</span>
                      </div>
                    </div>
                    <select
                      value={ticket.status}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleStatusChange(ticket.id, e.target.value)}
                      className="text-xs border border-slate-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                    </select>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState title="No tickets found" description="Adjust your filters or create a new ticket" />
          )}
        </div>
      )}

      {/* ── Ticket Detail Tab ──────────────────────────────── */}
      {activeTab === "detail" && selectedTicket && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-slate-500 dark:text-slate-400">{selectedTicket.ticketCode}</span>
                    <Badge color={priorityColors[selectedTicket.priority] || "slate"}>{selectedTicket.priority}</Badge>
                    <Badge color={statusColors[selectedTicket.status] || "slate"}>{selectedTicket.status.replace(/_/g, " ")}</Badge>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selectedTicket.subject}</h2>
                </div>
                <SLACountdown remainingMs={selectedTicket.slaRemainingMs} isOverdue={selectedTicket.isOverdue} />
              </div>

              {/* Escalation Chain */}
              {selectedTicket.escalationLevel !== undefined && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Escalation Chain</h4>
                  <EscalationChain level={selectedTicket.escalationLevel} />
                </div>
              )}

              <Tabs
                tabs={[
                  { id: "details", label: "Details" },
                  { id: "history", label: "History" },
                  { id: "comments", label: `Comments (${selectedTicket.comments?.length || 0})` },
                  { id: "watchers", label: `Watchers (${selectedTicket.watcherCount})` },
                ]}
                activeTab={detailTab}
                onChange={setDetailTab}
              />
            </Card>

            {detailTab === "details" && (
              <Card>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Description</h4>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{selectedTicket.description}</p>

                {selectedTicket.resolution && (
                  <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <h4 className="text-sm font-semibold text-green-800 dark:text-green-300 mb-1">Resolution</h4>
                    <p className="text-sm text-green-700 dark:text-green-400">{selectedTicket.resolution}</p>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Category</span>
                    <span className="text-slate-900 dark:text-white">{categoryLabels[selectedTicket.category] || selectedTicket.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Assigned To</span>
                    <span className="text-slate-900 dark:text-white">{selectedTicket.assigneeName || selectedTicket.assignedTo || "Unassigned"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Reporter</span>
                    <span className="text-slate-900 dark:text-white">{selectedTicket.employee?.user?.firstName} {selectedTicket.employee?.user?.lastName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Created</span>
                    <span className="text-slate-900 dark:text-white">{formatDateTime(selectedTicket.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">SLA Deadline</span>
                    <span className="text-slate-900 dark:text-white">{formatDateTime(selectedTicket.slaDeadline)}</span>
                  </div>
                  {selectedTicket.resolvedAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Resolved</span>
                      <span className="text-slate-900 dark:text-white">{formatDateTime(selectedTicket.resolvedAt)}</span>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {detailTab === "history" && (
              <Card>
                {selectedTicket.history && selectedTicket.history.length > 0 ? (
                  <div className="space-y-3">
                    {selectedTicket.history.map((entry, idx) => (
                      <div key={idx} className="flex gap-3 p-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-slate-700 dark:text-slate-300">
                            <span className="font-medium">{entry.userName}</span> — {entry.action}
                          </p>
                          <p className="text-xs text-slate-500">{entry.details}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(entry.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No history available</p>
                )}
              </Card>
            )}

            {detailTab === "comments" && (
              <Card>
                <div className="space-y-3 mb-4">
                  <div className="flex gap-2">
                    <Input placeholder="Add comment..." value={commentText} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCommentText(e.target.value)} className="flex-1" />
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      <input type="checkbox" checked={commentInternal} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCommentInternal(e.target.checked)} className="rounded" />
                      Internal
                    </label>
                    <Button onClick={handleAddComment} disabled={!commentText || submitting}>Post</Button>
                  </div>
                </div>
                {selectedTicket.comments && selectedTicket.comments.length > 0 ? (
                  <div className="space-y-3">
                    {selectedTicket.comments.map((c) => (
                      <div key={c.id} className={`p-3 rounded-lg ${c.isInternal ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800" : "bg-slate-50 dark:bg-slate-800"}`}>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-slate-900 dark:text-white">{c.userName || "User"}</span>
                          {c.isInternal && <Badge color="amber">Internal</Badge>}
                          <span className="text-slate-500 ml-auto">{timeAgo(c.createdAt)}</span>
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

            {detailTab === "watchers" && (
              <Card>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {selectedTicket.watcherCount} watcher{selectedTicket.watcherCount !== 1 ? "s" : ""} on this ticket
                </p>
                {selectedTicket.watchers && selectedTicket.watchers.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {selectedTicket.watchers.map((w) => (
                      <div key={w} className="text-sm text-slate-600 dark:text-slate-400">👤 {w}</div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-3 text-sm">Quick Actions</h4>
              <div className="space-y-2">
                <select
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  value={selectedTicket.status}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleStatusChange(selectedTicket.id, e.target.value)}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </div>
            </Card>
            <Card>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2 text-sm">SLA Info</h4>
              <SLACountdown remainingMs={selectedTicket.slaRemainingMs} isOverdue={selectedTicket.isOverdue} />
              <p className="text-xs text-slate-500 mt-2">Deadline: {formatDateTime(selectedTicket.slaDeadline)}</p>
            </Card>
          </div>
        </div>
      )}

      {/* ── Dashboard Tab ──────────────────────────────────── */}
      {activeTab === "dashboard" && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Tickets" value={dashboard.total} color="blue" />
            <StatCard title="Open" value={dashboard.open} color="blue" />
            <StatCard title="High Priority" value={dashboard.highPriority} color="red" />
            <StatCard title="Overdue" value={dashboard.overdue} color="red" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="In Progress" value={dashboard.inProgress} color="amber" />
            <StatCard title="Waiting on User" value={dashboard.waitingOnUser} color="purple" />
            <StatCard title="Resolved" value={dashboard.resolved} color="green" />
            <StatCard title="Avg Resolution" value={`${dashboard.avgResolutionHours}h`} color="cyan" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">By Category</h3>
              {dashboard.byCategory.map((cat) => (
                <div key={cat.category} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="text-sm text-slate-700 dark:text-slate-300">{categoryLabels[cat.category] || cat.category}</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{cat.count}</span>
                </div>
              ))}
            </Card>
            <Card>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Status Distribution</h3>
              {Object.entries(dashboard.statusDistribution).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <Badge color={statusColors[status.toUpperCase()] || "slate"}>{status}</Badge>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{count}</span>
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
