"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function HelpdeskPage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ category: "IT_SOFTWARE", priority: "MEDIUM", subject: "", description: "" });

  useEffect(() => { if (token) loadEmployee(); }, [token]);
  useEffect(() => { if (employee) loadTickets(); }, [employee, filter]);

  const loadEmployee = async () => {
    const res = await api.get<any[]>("/hr/employees", token!);
    if (res.success && res.data) setEmployee(res.data.find((e: any) => e.user?.email === user?.email) || res.data[0]);
  };

  const loadTickets = async () => {
    if (!employee) return;
    setLoading(true);
    const statusFilter = filter !== "all" ? `&status=${filter}` : "";
    const [ticketsRes, statsRes] = await Promise.all([
      api.get<any[]>(`/hr/portal/helpdesk?employeeId=${employee.id}${statusFilter}`, token!),
      api.get<any>("/hr/portal/helpdesk/dashboard/stats", token!),
    ]);
    if (ticketsRes.success) setTickets(ticketsRes.data || []);
    if (statsRes.success) setStats(statsRes.data);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!employee || !form.subject || !form.description) return;
    await api.post("/hr/portal/helpdesk", { ...form, employeeId: employee.id }, token!);
    setShowCreate(false);
    setForm({ category: "IT_SOFTWARE", priority: "MEDIUM", subject: "", description: "" });
    loadTickets();
  };

  const statusColors: Record<string, string> = {
    OPEN: "bg-blue-900/50 text-blue-400", IN_PROGRESS: "bg-amber-900/50 text-amber-400",
    WAITING_ON_USER: "bg-purple-900/50 text-purple-400", RESOLVED: "bg-emerald-900/50 text-emerald-400",
    CLOSED: "bg-slate-100 dark:bg-slate-700 text-slate-400",
  };
  const priorityIcons: Record<string, string> = { LOW: "🟢", MEDIUM: "🟡", HIGH: "🟠", CRITICAL: "🔴" };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-400 hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">🎫 Helpdesk & Support</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm">+ Raise Ticket</button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Total", value: stats.total, color: "slate" },
            { label: "Open", value: stats.open, color: "blue" },
            { label: "In Progress", value: stats.inProgress, color: "amber" },
            { label: "Resolved", value: stats.resolved, color: "emerald" },
            { label: "Closed", value: stats.closed, color: "slate" },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold text-${s.color}-400`}>{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {[{ id: "all", label: "All" }, { id: "OPEN", label: "Open" }, { id: "IN_PROGRESS", label: "In Progress" }, { id: "RESOLVED", label: "Resolved" }, { id: "CLOSED", label: "Closed" }].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${filter === f.id ? "bg-brand-600 text-slate-900 dark:text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-900 dark:hover:text-white"}`}>{f.label}</button>
        ))}
      </div>

      {/* Tickets List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center text-slate-500 py-12">Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No tickets found</div>
        ) : tickets.map(ticket => (
          <div key={ticket.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-slate-500 font-mono">{ticket.ticketCode}</span>
                  <span className={`px-2 py-0.5 text-xs rounded ${statusColors[ticket.status]}`}>{ticket.status.replace(/_/g, " ")}</span>
                  <span className="text-sm">{priorityIcons[ticket.priority]}</span>
                </div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-white">{ticket.subject}</h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{ticket.description}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                  <span>📁 {ticket.category.replace(/_/g, " ")}</span>
                  <span>📅 {new Date(ticket.createdAt).toLocaleDateString()}</span>
                  {ticket._count?.comments > 0 && <span>💬 {ticket._count.comments}</span>}
                </div>
              </div>
            </div>
            {ticket.resolution && (
              <div className="mt-3 bg-emerald-900/20 border border-emerald-900/30 rounded-lg p-2 text-xs text-emerald-400">
                ✅ Resolution: {ticket.resolution}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create Ticket Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Raise a Support Ticket</h2>
            <div className="space-y-3">
              <input placeholder="Subject *" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              <textarea placeholder="Describe your issue in detail *" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" rows={4} />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                  <option value="IT_HARDWARE">IT Hardware</option><option value="IT_SOFTWARE">IT Software</option>
                  <option value="IT_ACCESS">IT Access</option><option value="HR_QUERY">HR Query</option>
                  <option value="PAYROLL">Payroll</option><option value="FACILITIES">Facilities</option>
                  <option value="OTHER">Other</option>
                </select>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                  <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
              <button onClick={handleCreate} disabled={!form.subject || !form.description}
                className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">Submit Ticket</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
