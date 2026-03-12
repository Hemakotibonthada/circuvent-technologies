"use client";
import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function FinanceDashboardPage() {
  const { token } = useAuth();
  const { data: dashboard, loading } = useApi<any>("/finance/reports/dashboard");
  const { data: trialBalance } = useApi<any>("/finance/reports/trial-balance");

  if (loading) return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center"><div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;

  const d = dashboard;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">💰 Financial Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Double-entry accounting, GST, P&L, and balance sheet</p>
        </div>
        <div className="flex gap-2">
          <Link href="/finance/journals"><button className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">+ New Journal Entry</button></Link>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {[
          { label: "Total Assets", value: `₹${((d?.totalAssets || 0) / 100000).toFixed(1)}L`, icon: "🏛️", color: "emerald" },
          { label: "Total Revenue", value: `₹${((d?.totalRevenue || 0) / 100000).toFixed(1)}L`, icon: "📈", color: "blue" },
          { label: "Total Expenses", value: `₹${((d?.totalExpenses || 0) / 100000).toFixed(1)}L`, icon: "📉", color: "red" },
          { label: "Net Profit", value: `₹${((d?.netProfit || 0) / 100000).toFixed(1)}L`, icon: "💎", color: d?.netProfit >= 0 ? "emerald" : "red" },
          { label: "Accounts", value: d?.accountCount || 0, icon: "📊", color: "cyan" },
          { label: "Journals Posted", value: d?.postedCount || 0, icon: "📒", color: "purple" },
        ].map(m => (
          <div key={m.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{m.icon}</span>
              <span className={`text-xl font-bold text-${m.color}-400`}>{m.value}</span>
            </div>
            <p className="text-xs text-slate-500">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trial Balance Summary */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">📋 Trial Balance</h2>
            <Link href="/finance/reports" className="text-xs text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">Full Report →</Link>
          </div>
          {trialBalance ? (
            <div>
              <div className="flex justify-between text-sm mb-3">
                <span className="text-slate-400">Total Debits</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-mono">₹{Number(trialBalance.totalDebits).toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-sm mb-3">
                <span className="text-slate-400">Total Credits</span>
                <span className="text-blue-600 dark:text-blue-400 font-mono">₹{Number(trialBalance.totalCredits).toLocaleString("en-IN")}</span>
              </div>
              <div className={`flex justify-between text-sm p-2 rounded ${trialBalance.isBalanced ? "bg-emerald-900/30" : "bg-red-900/30"}`}>
                <span className="text-slate-600 dark:text-slate-300 font-medium">Balance Status</span>
                <span className={trialBalance.isBalanced ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                  {trialBalance.isBalanced ? "✓ Balanced" : `✗ Difference: ₹${trialBalance.difference}`}
                </span>
              </div>
              <div className="mt-4 space-y-1 max-h-40 overflow-y-auto">
                {trialBalance.entries?.slice(0, 10).map((e: any) => (
                  <div key={e.code} className="flex items-center justify-between text-xs py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                    <span className="text-slate-400">{e.code} {e.name}</span>
                    <div className="flex gap-4">
                      {e.debit > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-mono w-20 text-right">₹{Number(e.debit).toLocaleString("en-IN")}</span>}
                      {e.credit > 0 && <span className="text-blue-600 dark:text-blue-400 font-mono w-20 text-right">₹{Number(e.credit).toLocaleString("en-IN")}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-slate-500 text-sm text-center py-6">No accounts configured yet</p>}
        </div>

        {/* Recent Journal Entries */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">📒 Recent Journals</h2>
            <Link href="/finance/journals" className="text-xs text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">View All →</Link>
          </div>
          {d?.recentJournals?.length > 0 ? (
            <div className="space-y-2">
              {d.recentJournals.map((j: any) => (
                <div key={j.entryNumber} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-500 font-mono">{j.entryNumber}</span>
                      <p className="text-sm text-slate-900 dark:text-white">{j.description}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded ${j.status === "POSTED" ? "bg-emerald-900/50 text-emerald-600 dark:text-emerald-400" : j.status === "DRAFT" ? "bg-amber-900/50 text-amber-600 dark:text-amber-400" : "bg-slate-100 dark:bg-slate-700 text-slate-400"}`}>
                      {j.status}
                    </span>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-slate-500">
                    <span>📅 {new Date(j.date).toLocaleDateString()}</span>
                    <span>📁 {j.source}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-slate-500 text-sm text-center py-6">No journal entries yet</p>}
        </div>
      </div>

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
        {[
          { label: "Chart of Accounts", icon: "📊", href: "/finance/accounts" },
          { label: "Journal Entries", icon: "📒", href: "/finance/journals" },
          { label: "Financial Reports", icon: "📋", href: "/finance/reports" },
          { label: "GST Management", icon: "🏛️", href: "/finance/gst" },
          { label: "Budget Tracking", icon: "💰", href: "/finance/budget" },
        ].map(item => (
          <Link key={item.label} href={item.href}>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center hover:border-brand-300 dark:hover:border-brand-500/50 transition-colors cursor-pointer">
              <span className="text-2xl block mb-1">{item.icon}</span>
              <span className="text-xs text-slate-600 dark:text-slate-300">{item.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
