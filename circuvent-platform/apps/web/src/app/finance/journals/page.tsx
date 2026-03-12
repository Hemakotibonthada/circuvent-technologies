"use client";
import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function JournalsPage() {
  const { token } = useAuth();
  const { data: journals, loading, refetch } = useApi<any[]>("/finance/journals");
  const [showCreate, setShowCreate] = useState(false);
  const [posting, setPosting] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    source: "MANUAL",
    lines: [
      { accountCode: "", debit: "", credit: "", description: "" },
      { accountCode: "", debit: "", credit: "", description: "" },
    ],
  });

  const handleCreate = async () => {
    if (!form.description || form.lines.length < 2) return;
    const lines = form.lines.filter(l => l.accountCode).map(l => ({
      accountCode: l.accountCode,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      description: l.description || undefined,
    }));
    const res = await api.post("/finance/journals", { date: form.date, description: form.description, source: form.source, lines }, token || undefined);
    if (res.success) {
      setShowCreate(false);
      setForm({ date: new Date().toISOString().split("T")[0], description: "", source: "MANUAL", lines: [{ accountCode: "", debit: "", credit: "", description: "" }, { accountCode: "", debit: "", credit: "", description: "" }] });
      refetch();
    }
  };

  const handlePost = async (id: string) => {
    setPosting(id);
    await api.post(`/finance/journals/${id}/post`, {}, token || undefined);
    setPosting(null);
    refetch();
  };

  const addLine = () => setForm({ ...form, lines: [...form.lines, { accountCode: "", debit: "", credit: "", description: "" }] });

  const totalDebit = form.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = form.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const statusColors: Record<string, string> = {
    DRAFT: "bg-amber-900/50 text-amber-600 dark:text-amber-400", POSTED: "bg-emerald-900/50 text-emerald-600 dark:text-emerald-400",
    REVERSED: "bg-purple-900/50 text-purple-600 dark:text-purple-400", VOID: "bg-slate-100 dark:bg-slate-700 text-slate-400",
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/finance" className="text-sm text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Finance</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">📒 Journal Entries</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">+ New Journal</button>
      </div>

      {/* Journals List */}
      <div className="space-y-3">
        {loading ? <div className="text-center text-slate-500 py-12">Loading...</div> :
          !journals || journals.length === 0 ? <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No journal entries. Create your first double-entry transaction!</div> :
          journals.map((j: any) => (
            <div key={j.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-500 font-mono">{j.entryNumber}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${statusColors[j.status]}`}>{j.status}</span>
                    <span className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-400 rounded">{j.source}</span>
                  </div>
                  <p className="text-sm text-slate-900 dark:text-white">{j.description}</p>
                  <p className="text-xs text-slate-500 mt-1">📅 {new Date(j.date).toLocaleDateString()} &middot; Period: {j.fiscalPeriod}</p>
                </div>
                <div className="text-right">
                  {j.lines && (
                    <p className="text-sm font-mono text-slate-600 dark:text-slate-300">
                      ₹{j.lines.reduce((s: number, l: any) => s + Number(l.debit), 0).toLocaleString("en-IN")}
                    </p>
                  )}
                  {j.status === "DRAFT" && (
                    <button onClick={() => handlePost(j.id)} disabled={posting === j.id}
                      className="mt-2 px-3 py-1 text-xs bg-emerald-600 text-slate-900 dark:text-white rounded hover:bg-emerald-700 disabled:opacity-50">
                      {posting === j.id ? "Posting..." : "Post to Ledger"}
                    </button>
                  )}
                </div>
              </div>
              {j.lines && j.lines.length > 0 && (
                <div className="mt-3 bg-white dark:bg-slate-800/30 rounded-lg p-2">
                  <table className="w-full text-xs">
                    <thead><tr className="text-slate-600"><th className="text-left py-1">Account</th><th className="text-right py-1">Debit</th><th className="text-right py-1">Credit</th></tr></thead>
                    <tbody>
                      {j.lines.map((l: any, i: number) => (
                        <tr key={i} className="border-t border-slate-200 dark:border-slate-800/50">
                          <td className="py-1 text-slate-400">{l.accountCode} — {l.account?.name || l.description}</td>
                          <td className="py-1 text-right text-emerald-600 dark:text-emerald-400 font-mono">{Number(l.debit) > 0 ? `₹${Number(l.debit).toLocaleString("en-IN")}` : ""}</td>
                          <td className="py-1 text-right text-blue-600 dark:text-blue-400 font-mono">{Number(l.credit) > 0 ? `₹${Number(l.credit).toLocaleString("en-IN")}` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        }
      </div>

      {/* Create Journal Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-2xl my-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">New Journal Entry</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm" />
                <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                  <option value="MANUAL">Manual</option><option value="PAYROLL">Payroll</option>
                  <option value="INVOICE">Invoice</option><option value="EXPENSE">Expense</option>
                  <option value="ADJUSTMENT">Adjustment</option>
                </select>
              </div>
              <input placeholder="Description *" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500 font-semibold">Journal Lines</p>
                  <button onClick={addLine} className="text-xs text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">+ Add Line</button>
                </div>
                {form.lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-4 gap-2">
                    <input placeholder="Account Code" value={line.accountCode}
                      onChange={e => { const lines = [...form.lines]; lines[i].accountCode = e.target.value; setForm({ ...form, lines }); }}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-900 dark:text-white text-sm font-mono" />
                    <input placeholder="Debit" type="number" value={line.debit}
                      onChange={e => { const lines = [...form.lines]; lines[i].debit = e.target.value; setForm({ ...form, lines }); }}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-emerald-600 dark:text-emerald-400 text-sm" />
                    <input placeholder="Credit" type="number" value={line.credit}
                      onChange={e => { const lines = [...form.lines]; lines[i].credit = e.target.value; setForm({ ...form, lines }); }}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-blue-600 dark:text-blue-400 text-sm" />
                    <input placeholder="Note" value={line.description}
                      onChange={e => { const lines = [...form.lines]; lines[i].description = e.target.value; setForm({ ...form, lines }); }}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-600 dark:text-slate-300 text-sm" />
                  </div>
                ))}
                <div className={`flex justify-between text-sm p-2 rounded ${isBalanced && totalDebit > 0 ? "bg-emerald-900/30" : totalDebit > 0 ? "bg-red-900/30" : "bg-slate-50 dark:bg-slate-800/50"}`}>
                  <span className="text-slate-400">Totals:</span>
                  <div className="flex gap-6">
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">DR ₹{totalDebit.toLocaleString("en-IN")}</span>
                    <span className="text-blue-600 dark:text-blue-400 font-mono">CR ₹{totalCredit.toLocaleString("en-IN")}</span>
                    {!isBalanced && totalDebit > 0 && <span className="text-red-600 dark:text-red-400">Diff: ₹{Math.abs(totalDebit - totalCredit).toLocaleString("en-IN")}</span>}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
              <button onClick={handleCreate} disabled={!form.description || !isBalanced || totalDebit === 0}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">Create Journal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
