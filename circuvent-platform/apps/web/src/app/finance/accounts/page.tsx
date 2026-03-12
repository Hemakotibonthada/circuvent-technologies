"use client";
import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function ChartOfAccountsPage() {
  const { token } = useAuth();
  const { data: accounts, loading, refetch } = useApi<any[]>("/finance/accounts");
  const { data: summary } = useApi<any[]>("/finance/accounts/summary");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", type: "ASSET", subType: "BANK", description: "" });

  const handleCreate = async () => {
    if (!form.code || !form.name) return;
    await api.post("/finance/accounts", form, token || undefined);
    setShowCreate(false);
    setForm({ code: "", name: "", type: "ASSET", subType: "BANK", description: "" });
    refetch();
  };

  const typeColors: Record<string, string> = {
    ASSET: "text-emerald-400", LIABILITY: "text-red-400", EQUITY: "text-purple-400",
    REVENUE: "text-blue-400", EXPENSE: "text-amber-400",
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/finance" className="text-sm text-brand-400 hover:text-brand-300">← Finance</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">📊 Chart of Accounts</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg text-sm hover:bg-brand-700">+ New Account</button>
      </div>

      {/* Type Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {summary.map((s: any) => (
            <div key={s.type} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
              <p className={`text-lg font-bold ${typeColors[s.type]}`}>₹{Number(s.totalBalance).toLocaleString("en-IN")}</p>
              <p className="text-xs text-slate-500">{s.type} ({s.accountCount})</p>
            </div>
          ))}
        </div>
      )}

      {/* Accounts Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {loading ? <div className="p-8 text-center text-slate-500">Loading...</div> :
          !accounts || accounts.length === 0 ? <div className="p-8 text-center text-slate-500">No accounts configured. Create your first account to get started.</div> : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 text-left dark:border-slate-800">
                <th className="px-4 py-3 text-xs font-medium text-slate-500">Code</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500">Name</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500">Type</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500">Sub-Type</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 text-right">Balance</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 text-right">Entries</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc: any) => (
                <tr key={acc.code} className="border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-sm text-brand-400 font-mono">{acc.code}</td>
                  <td className="px-4 py-3 text-sm text-white">{acc.name}</td>
                  <td className="px-4 py-3"><span className={`text-xs ${typeColors[acc.type]}`}>{acc.type}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-400">{acc.subType}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-slate-600 dark:text-slate-300">₹{Number(acc.balance).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-xs text-right text-slate-500">{acc._count?.journalLines || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">New Ledger Account</h2>
            <div className="space-y-3">
              <input placeholder="Account Code (e.g., 1100)" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm font-mono" />
              <input placeholder="Account Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                  <option value="ASSET">Asset</option><option value="LIABILITY">Liability</option>
                  <option value="EQUITY">Equity</option><option value="REVENUE">Revenue</option>
                  <option value="EXPENSE">Expense</option>
                </select>
                <input placeholder="Sub-Type" value={form.subType} onChange={e => setForm({ ...form, subType: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              </div>
              <input placeholder="Description (optional)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
              <button onClick={handleCreate} disabled={!form.code || !form.name}
                className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
