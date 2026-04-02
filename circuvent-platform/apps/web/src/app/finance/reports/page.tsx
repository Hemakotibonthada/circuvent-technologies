"use client";
import React, { useState } from "react";
import { useApi } from "@/hooks/use-auth";
import Link from "next/link";

export default function FinancialReportsPage() {
  const [report, setReport] = useState<"trial" | "pnl" | "bs">("trial");
  const { data: trialBalance } = useApi<any>("/finance/reports/trial-balance");
  const { data: pnl } = useApi<any>("/finance/reports/profit-loss");
  const { data: bs } = useApi<any>("/finance/reports/balance-sheet");

  const typeColors: Record<string, string> = { ASSET: "text-emerald-600 dark:text-emerald-400", LIABILITY: "text-red-600 dark:text-red-400", EQUITY: "text-purple-600 dark:text-purple-400", REVENUE: "text-blue-600 dark:text-blue-400", EXPENSE: "text-amber-600 dark:text-amber-400" };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="mb-6">
        <Link href="/finance" className="text-sm text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Finance</Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">📋 Financial Reports</h1>
      </div>

      <div className="flex gap-2 mb-6">
        {[{ id: "trial" as const, label: "Trial Balance" }, { key: "pnl" as const, label: "Profit & Loss" }, { key: "bs" as const, label: "Balance Sheet" }].map(r => (
          <button key={r.id} onClick={() => setReport(r.id)}
            className={`px-4 py-2 rounded-lg text-sm ${report === r.id ? "bg-brand-600 text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-400"}`}>{r.label}</button>
        ))}
      </div>

      {report === "trial" && trialBalance && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Trial Balance — {new Date(trialBalance.asOf).toLocaleDateString()}</h2>
            <span className={trialBalance.isBalanced ? "text-emerald-600 dark:text-emerald-400 text-xs" : "text-red-600 dark:text-red-400 text-xs"}>{trialBalance.isBalanced ? "✓ Balanced" : `✗ Diff: ₹${trialBalance.difference}`}</span>
          </div>
          <table className="w-full">
            <thead><tr className="border-b border-slate-200 dark:border-slate-800"><th className="px-4 py-2 text-xs text-slate-500 text-left">Code</th><th className="px-4 py-2 text-xs text-slate-500 text-left">Account</th><th className="px-4 py-2 text-xs text-slate-500 text-left">Type</th><th className="px-4 py-2 text-xs text-slate-500 text-right">Debit</th><th className="px-4 py-2 text-xs text-slate-500 text-right">Credit</th></tr></thead>
            <tbody>
              {trialBalance.entries?.filter((e: any) => e.debit > 0 || e.credit > 0).map((e: any) => (
                <tr key={e.code} className="border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-4 py-2 text-sm text-brand-600 dark:text-brand-400 font-mono">{e.code}</td>
                  <td className="px-4 py-2 text-sm text-slate-900 dark:text-white">{e.name}</td>
                  <td className="px-4 py-2"><span className={`text-xs ${typeColors[e.type]}`}>{e.type}</span></td>
                  <td className="px-4 py-2 text-sm text-right font-mono text-emerald-600 dark:text-emerald-400">{e.debit > 0 ? `₹${Number(e.debit).toLocaleString("en-IN")}` : ""}</td>
                  <td className="px-4 py-2 text-sm text-right font-mono text-blue-600 dark:text-blue-400">{e.credit > 0 ? `₹${Number(e.credit).toLocaleString("en-IN")}` : ""}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-bold">
                <td colSpan={3} className="px-4 py-3 text-sm text-slate-900 dark:text-white">TOTAL</td>
                <td className="px-4 py-3 text-sm text-right font-mono text-emerald-600 dark:text-emerald-400">₹{Number(trialBalance.totalDebits).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 text-sm text-right font-mono text-blue-600 dark:text-blue-400">₹{Number(trialBalance.totalCredits).toLocaleString("en-IN")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {report === "pnl" && pnl && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Profit & Loss Statement — {pnl.period}</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-xs text-blue-600 dark:text-blue-400 font-semibold uppercase mb-2">Revenue</h3>
              {pnl.revenue?.map((r: any) => (
                <div key={r.code} className="flex justify-between py-1 text-sm"><span className="text-slate-400">{r.code} {r.name}</span><span className="text-blue-600 dark:text-blue-400 font-mono">₹{Number(r.amount).toLocaleString("en-IN")}</span></div>
              ))}
              <div className="flex justify-between py-2 border-t border-slate-200 dark:border-slate-700 font-semibold text-sm"><span className="text-slate-900 dark:text-white">Total Revenue</span><span className="text-blue-600 dark:text-blue-400 font-mono">₹{Number(pnl.totalRevenue).toLocaleString("en-IN")}</span></div>
            </div>
            <div>
              <h3 className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase mb-2">Expenses</h3>
              {pnl.expenses?.map((e: any) => (
                <div key={e.code} className="flex justify-between py-1 text-sm"><span className="text-slate-400">{e.code} {e.name}</span><span className="text-amber-600 dark:text-amber-400 font-mono">₹{Number(e.amount).toLocaleString("en-IN")}</span></div>
              ))}
              <div className="flex justify-between py-2 border-t border-slate-200 dark:border-slate-700 font-semibold text-sm"><span className="text-slate-900 dark:text-white">Total Expenses</span><span className="text-amber-600 dark:text-amber-400 font-mono">₹{Number(pnl.totalExpenses).toLocaleString("en-IN")}</span></div>
            </div>
            <div className={`flex justify-between p-3 rounded-lg text-lg font-bold ${pnl.netProfit >= 0 ? "bg-emerald-900/30" : "bg-red-900/30"}`}>
              <span className="text-slate-900 dark:text-white">Net Profit</span>
              <span className={pnl.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>₹{Number(pnl.netProfit).toLocaleString("en-IN")} ({pnl.netProfitMargin}%)</span>
            </div>
          </div>
        </div>
      )}

      {report === "bs" && bs && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Balance Sheet — {new Date(bs.asOf).toLocaleDateString()}</h2>
            <span className={bs.isBalanced ? "text-emerald-600 dark:text-emerald-400 text-xs" : "text-red-600 dark:text-red-400 text-xs"}>{bs.isBalanced ? "✓ A=L+E" : "✗ Unbalanced"}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase mb-2">Assets</h3>
              {bs.assets?.map((a: any) => (
                <div key={a.code} className="flex justify-between py-1 text-sm"><span className="text-slate-400">{a.name}</span><span className="text-emerald-600 dark:text-emerald-400 font-mono">₹{Number(a.amount).toLocaleString("en-IN")}</span></div>
              ))}
              <div className="flex justify-between py-2 border-t border-slate-200 dark:border-slate-700 font-bold text-sm"><span className="text-slate-900 dark:text-white">Total Assets</span><span className="text-emerald-600 dark:text-emerald-400 font-mono">₹{Number(bs.totalAssets).toLocaleString("en-IN")}</span></div>
            </div>
            <div>
              <h3 className="text-xs text-red-600 dark:text-red-400 font-semibold uppercase mb-2">Liabilities</h3>
              {bs.liabilities?.map((l: any) => (
                <div key={l.code} className="flex justify-between py-1 text-sm"><span className="text-slate-400">{l.name}</span><span className="text-red-600 dark:text-red-400 font-mono">₹{Number(l.amount).toLocaleString("en-IN")}</span></div>
              ))}
              <h3 className="text-xs text-purple-600 dark:text-purple-400 font-semibold uppercase mb-2 mt-4">Equity</h3>
              {bs.equity?.map((e: any) => (
                <div key={e.code} className="flex justify-between py-1 text-sm"><span className="text-slate-400">{e.name}</span><span className="text-purple-600 dark:text-purple-400 font-mono">₹{Number(e.amount).toLocaleString("en-IN")}</span></div>
              ))}
              <div className="flex justify-between py-2 border-t border-slate-200 dark:border-slate-700 font-bold text-sm"><span className="text-slate-900 dark:text-white">Total L+E</span><span className="text-purple-600 dark:text-purple-400 font-mono">₹{Number(bs.totalLiabilities + bs.totalEquity).toLocaleString("en-IN")}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
