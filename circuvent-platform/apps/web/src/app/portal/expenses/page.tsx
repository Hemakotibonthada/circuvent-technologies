"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function PortalExpensesPage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", items: [{ description: "", amount: "" }] });

  useEffect(() => { if (token) loadEmployee(); }, [token]);
  useEffect(() => { if (employee) loadExpenses(); }, [employee]);

  const loadEmployee = async () => {
    const res = await api.get<any[]>("/hr/employees", token!);
    if (res.success && res.data) setEmployee(res.data.find((e: any) => e.user?.email === user?.email) || res.data[0]);
  };

  const loadExpenses = async () => {
    if (!employee) return;
    setLoading(true);
    const res = await api.get<any[]>(`/hr/expenses?employeeId=${employee.id}`, token!);
    if (res.success) setExpenses(res.data || []);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!employee || !form.title) return;
    setSubmitting(true);
    await api.post("/hr/expenses", {
      employeeId: employee.id, title: form.title, description: form.description,
      items: form.items.filter(i => i.description && i.amount).map(i => ({ description: i.description, amount: Number(i.amount) })),
    }, token!);
    setShowCreate(false);
    setForm({ title: "", description: "", items: [{ description: "", amount: "" }] });
    setSubmitting(false);
    loadExpenses();
  };

  const statusColors: Record<string, string> = {
    DRAFT: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300", SUBMITTED: "bg-blue-900/50 text-blue-600 dark:text-blue-400",
    APPROVED: "bg-emerald-900/50 text-emerald-600 dark:text-emerald-400", REJECTED: "bg-red-900/50 text-red-600 dark:text-red-400",
    REIMBURSED: "bg-cyan-900/50 text-cyan-600 dark:text-cyan-400",
  };

  const totalAmount = expenses.reduce((s, e) => s + Number(e.totalAmount || 0), 0);
  const approved = expenses.filter(e => e.status === "APPROVED" || e.status === "REIMBURSED");

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">🧾 My Expenses</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm">+ New Claim</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-slate-900 dark:text-white">{expenses.length}</p>
          <p className="text-xs text-slate-500">Total Claims</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">₹{totalAmount.toLocaleString("en-IN")}</p>
          <p className="text-xs text-slate-500">Total Claimed</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">₹{approved.reduce((s, e) => s + Number(e.totalAmount || 0), 0).toLocaleString("en-IN")}</p>
          <p className="text-xs text-slate-500">Approved</p>
        </div>
      </div>

      {/* Claims List */}
      <div className="space-y-3">
        {loading ? <div className="text-center text-slate-500 py-12">Loading...</div> :
          expenses.length === 0 ? <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No expense claims</div> :
          expenses.map(exp => (
            <div key={exp.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-500 font-mono">{exp.claimCode}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${statusColors[exp.status]}`}>{exp.status}</span>
                    {exp.isRnDExpense && <span className="px-2 py-0.5 text-xs bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded">R&D</span>}
                  </div>
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white">{exp.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{new Date(exp.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">₹{Number(exp.totalAmount).toLocaleString("en-IN")}</p>
              </div>
            </div>
          ))
        }
      </div>

      {/* Create Expense Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">New Expense Claim</h2>
            <div className="space-y-3">
              <input placeholder="Claim title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              <textarea placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" rows={2} />
              <div className="space-y-2">
                <p className="text-xs text-slate-500">Line Items</p>
                {form.items.map((item, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2">
                    <input placeholder="Description" value={item.description} onChange={e => { const items = [...form.items]; items[i].description = e.target.value; setForm({ ...form, items }); }}
                      className="col-span-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
                    <input placeholder="Amount" type="number" value={item.amount} onChange={e => { const items = [...form.items]; items[i].amount = e.target.value; setForm({ ...form, items }); }}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
                  </div>
                ))}
                <button onClick={() => setForm({ ...form, items: [...form.items, { description: "", amount: "" }] })}
                  className="text-xs text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">+ Add Item</button>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
              <button onClick={handleCreate} disabled={submitting || !form.title}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">{submitting ? "Submitting..." : "Submit Claim"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
