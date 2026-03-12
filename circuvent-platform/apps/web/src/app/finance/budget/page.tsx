"use client";
import React from "react";
import { useApi } from "@/hooks/use-auth";
import Link from "next/link";

export default function BudgetPage() {
  const { data: budgets, loading } = useApi<any[]>("/finance/budgets");
  const { data: variance } = useApi<any>("/finance/budgets/variance");

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="mb-6">
        <Link href="/finance" className="text-sm text-brand-400 hover:text-brand-300">← Finance</Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">💰 Budget Tracking</h1>
      </div>

      {/* Variance Summary */}
      {variance && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-blue-400">₹{(variance.totalBudgeted / 100000).toFixed(1)}L</p>
            <p className="text-xs text-slate-500">Total Budgeted</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-amber-400">₹{(variance.totalActual / 100000).toFixed(1)}L</p>
            <p className="text-xs text-slate-500">Total Spent</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
            <p className={`text-xl font-bold ${variance.totalVariance >= 0 ? "text-emerald-400" : "text-red-400"}`}>₹{(Math.abs(variance.totalVariance) / 100000).toFixed(1)}L</p>
            <p className="text-xs text-slate-500">{variance.totalVariance >= 0 ? "Under Budget" : "Over Budget"}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-red-400">{variance.overBudgetCount}</p>
            <p className="text-xs text-slate-500">Over Budget Items</p>
          </div>
        </div>
      )}

      {/* Budget Items */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {loading ? <div className="p-8 text-center text-slate-500">Loading...</div> :
          !budgets || budgets.length === 0 ? <div className="p-8 text-center text-slate-500">No budgets configured</div> : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="px-4 py-3 text-xs text-slate-500 text-left">Account</th>
              <th className="px-4 py-3 text-xs text-slate-500 text-left">Department</th>
              <th className="px-4 py-3 text-xs text-slate-500 text-right">Budget</th>
              <th className="px-4 py-3 text-xs text-slate-500 text-right">Spent</th>
              <th className="px-4 py-3 text-xs text-slate-500 text-right">Remaining</th>
              <th className="px-4 py-3 text-xs text-slate-500 text-right">Utilization</th>
            </tr></thead>
            <tbody>
              {budgets.map((b: any) => (
                <tr key={b.id} className="border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-sm text-brand-400 font-mono">{b.accountCode}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{b.department || "—"}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-slate-600 dark:text-slate-300">₹{Number(b.amount).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-amber-400">₹{Number(b.spent).toLocaleString("en-IN")}</td>
                  <td className={`px-4 py-3 text-sm text-right font-mono ${b.remaining >= 0 ? "text-emerald-400" : "text-red-400"}`}>₹{Number(b.remaining).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${b.utilization > 100 ? "bg-red-500" : b.utilization > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${Math.min(100, b.utilization)}%` }} />
                      </div>
                      <span className="text-xs text-slate-400 w-10 text-right">{b.utilization}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
