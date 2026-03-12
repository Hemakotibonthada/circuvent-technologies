"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function AttendancePage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (token) loadEmployee(); }, [token]);
  useEffect(() => { if (employee) loadData(); }, [employee, month, year]);

  const loadEmployee = async () => {
    const res = await api.get<any[]>("/hr/employees", token!);
    if (res.success && res.data) {
      const emp = res.data.find((e: any) => e.user?.email === user?.email) || res.data[0];
      setEmployee(emp);
    }
  };

  const loadData = async () => {
    if (!employee) return;
    setLoading(true);
    const [logsRes, summaryRes] = await Promise.all([
      api.get<any[]>(`/hr/attendance/history/${employee.id}?month=${month}&year=${year}`, token!),
      api.get<any>(`/hr/attendance/summary/${employee.id}?month=${month}&year=${year}`, token!),
    ]);
    if (logsRes.success) setLogs(logsRes.data || []);
    if (summaryRes.success) setSummary(summaryRes.data);
    setLoading(false);
  };

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const statusColors: Record<string, string> = {
    PRESENT: "bg-emerald-900/50 text-emerald-600 dark:text-emerald-400",
    HALF_DAY: "bg-amber-900/50 text-amber-600 dark:text-amber-400",
    ABSENT: "bg-red-900/50 text-red-600 dark:text-red-400",
    WORK_FROM_HOME: "bg-blue-900/50 text-blue-600 dark:text-blue-400",
    ON_LEAVE: "bg-purple-900/50 text-purple-600 dark:text-purple-400",
    HOLIDAY: "bg-cyan-900/50 text-cyan-600 dark:text-cyan-400",
    WEEK_OFF: "bg-slate-100 dark:bg-slate-700 text-slate-400",
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">📅 Attendance & Time Tracking</h1>
        </div>
        <div className="flex gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg px-3 py-2 text-sm">
            {monthNames.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg px-3 py-2 text-sm">
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {[
            { label: "Present", value: summary.present, color: "emerald" },
            { label: "Half Day", value: summary.halfDay, color: "amber" },
            { label: "WFH", value: summary.wfh, color: "blue" },
            { label: "Absent", value: summary.absent, color: "red" },
            { label: "On Leave", value: summary.onLeave, color: "purple" },
            { label: "Total Hours", value: `${summary.totalHours.toFixed(1)}h`, color: "cyan" },
            { label: "Overtime", value: `${summary.overtimeHours.toFixed(1)}h`, color: "orange" },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold text-${s.color}-400`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Daily Logs Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Daily Attendance Log — {monthNames[month - 1]} {year}</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No attendance records for this period</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 text-left dark:border-slate-800">
                  <th className="px-4 py-3 text-xs font-medium text-slate-500">Date</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500">Check In</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500">Check Out</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500">Hours</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500">OT</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500">Location</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{new Date(log.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs ${statusColors[log.status] || "bg-slate-100 dark:bg-slate-700 text-slate-400"}`}>{log.status}</span></td>
                    <td className="px-4 py-3 text-sm text-slate-400">{log.checkIn ? new Date(log.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{log.checkOut ? new Date(log.checkOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{log.totalHours ? `${Number(log.totalHours).toFixed(1)}h` : "—"}</td>
                    <td className="px-4 py-3 text-sm text-orange-600 dark:text-orange-400">{log.overtimeHours && Number(log.overtimeHours) > 0 ? `+${Number(log.overtimeHours).toFixed(1)}h` : "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{log.location || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
