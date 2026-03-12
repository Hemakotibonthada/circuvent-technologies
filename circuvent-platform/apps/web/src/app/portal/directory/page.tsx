"use client";
import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function DirectoryPage() {
  const { token } = useAuth();
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const { data: employees, loading } = useApi<any[]>(`/hr/directory?search=${search}&department=${dept}`);
  const { data: departments } = useApi<any[]>("/hr/directory/departments");
  const { data: anniversaries } = useApi<any[]>("/hr/directory/anniversaries");

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">👥 Employee Directory</h1>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input placeholder="Search by name, email, code..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[250px] bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white text-sm placeholder-slate-500" />
        <select value={dept} onChange={e => setDept(e.target.value)}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
          <option value="">All Departments</option>
          {departments?.map((d: any) => <option key={d.name} value={d.name}>{d.name} ({d.count})</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Directory */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading directory...</div>
            ) : !employees || employees.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No employees found</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-100 dark:bg-slate-800">
                {employees.map((emp: any) => (
                  <div key={emp.id} className="bg-white p- dark:bg-slate-9004 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-brand-600 rounded-full flex items-center justify-center text-sm font-bold text-slate-900 dark:text-white flex-shrink-0">
                        {emp.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{emp.name}</p>
                        <p className="text-xs text-slate-400 truncate">{emp.designation}</p>
                        <p className="text-xs text-slate-500 truncate">{emp.department} &middot; {emp.employeeCode}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                      <span>📧 {emp.email}</span>
                      {emp.phone && <span>📱 {emp.phone}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Department Breakdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">🏢 Departments</h2>
            <div className="space-y-2">
              {departments?.map((d: any) => (
                <button key={d.name} onClick={() => setDept(d.name === dept ? "" : d.name)}
                  className={`w-full flex items-center justify-between p-2 rounded-lg text-sm transition-colors ${d.name === dept ? "bg-brand-900/50 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-500/30" : "bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 hover:bg-slate-800"}`}>
                  <span>{d.name}</span>
                  <span className="text-xs font-semibold">{d.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Work Anniversaries */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">🎂 Work Anniversaries</h2>
            {anniversaries && anniversaries.length > 0 ? (
              <div className="space-y-2">
                {anniversaries.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between bg-slate-100 dark:bg-slate-800/50 rounded-lg p-2 text-sm">
                    <div>
                      <p className="text-slate-600 dark:text-slate-300">{a.name}</p>
                      <p className="text-xs text-slate-500">{a.department}</p>
                    </div>
                    <span className="text-amber-600 dark:text-amber-400 text-xs font-semibold">{a.years}y</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-slate-500 text-sm text-center py-4">None this month</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
