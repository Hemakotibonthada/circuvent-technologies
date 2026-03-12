"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

// ══════════════════════════════════════════════════════════════
// Employee Self-Service Portal — Dashboard
// Personal overview, quick clock-in/out, widgets for all modules
// ══════════════════════════════════════════════════════════════

interface DashboardData {
  profile: any;
  attendance: { today: any; monthPresent: number; isClockedIn: boolean };
  leaves: { pending: number; takenThisYear: number };
  expenses: { pendingClaims: number };
  payroll: { latestSlip: any };
  goals: { active: number };
  helpdesk: { openTickets: number };
  announcements: any[];
  upcomingHolidays: any[];
  training: { activeEnrollments: number };
}

export default function EmployeePortalPage() {
  const { token, user } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [clockLoading, setClockLoading] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, [token]);

  const loadDashboard = async () => {
    if (!token) return;
    setLoading(true);
    // First find the employee record for current user
    const empRes = await api.get<any[]>("/hr/employees", token);
    if (empRes.success && empRes.data) {
      const myEmp = empRes.data.find((e: any) => e.user?.email === user?.email) || empRes.data[0];
      if (myEmp) {
        setEmployee(myEmp);
        const res = await api.get<DashboardData>(`/hr/portal/my-dashboard/${myEmp.id}`, token);
        if (res.success && res.data) setDashboard(res.data);
      }
    }
    setLoading(false);
  };

  const handleClockIn = async () => {
    if (!employee || !token) return;
    setClockLoading(true);
    await api.post("/hr/attendance/clock-in", { employeeId: employee.id, location: "Office" }, token);
    await loadDashboard();
    setClockLoading(false);
  };

  const handleClockOut = async () => {
    if (!employee || !token) return;
    setClockLoading(true);
    await api.post("/hr/attendance/clock-out", { employeeId: employee.id }, token);
    await loadDashboard();
    setClockLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading your portal...</p>
        </div>
      </div>
    );
  }

  const d = dashboard;
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good Morning" : now.getHours() < 17 ? "Good Afternoon" : "Good Evening";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-brand-900/50 to-cyan-900/30 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{greeting}, {d?.profile?.user?.firstName || user?.email?.split("@")[0]}! 👋</h1>
            <p className="text-slate-400 mt-1">
              {employee?.designation} &middot; {employee?.department} &middot; {employee?.employeeCode}
            </p>
          </div>
          {/* Clock In/Out Button */}
          <div className="flex items-center gap-3">
            {d?.attendance?.isClockedIn ? (
              <button
                onClick={handleClockOut}
                disabled={clockLoading}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-slate-900 dark:text-white rounded-xl font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {clockLoading ? (
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : <span className="text-lg">🔴</span>}
                Clock Out
              </button>
            ) : (
              <button
                onClick={handleClockIn}
                disabled={clockLoading}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-slate-900 dark:text-white rounded-xl font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {clockLoading ? (
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : <span className="text-lg">🟢</span>}
                Clock In
              </button>
            )}
            <div className="text-right text-sm">
              <p className="text-slate-400">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</p>
              {d?.attendance?.today?.checkIn && (
                <p className="text-emerald-400">In: {new Date(d.attendance.today.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {[
          { label: "Present This Month", value: d?.attendance?.monthPresent || 0, icon: "📅", color: "emerald", href: "/portal/attendance" },
          { label: "Pending Leaves", value: d?.leaves?.pending || 0, icon: "🏖️", color: "amber", href: "/portal/leaves" },
          { label: "Leaves Taken", value: d?.leaves?.takenThisYear || 0, icon: "📋", color: "blue", href: "/portal/leaves" },
          { label: "Open Expenses", value: d?.expenses?.pendingClaims || 0, icon: "🧾", color: "purple", href: "/portal/expenses" },
          { label: "Active Goals", value: d?.goals?.active || 0, icon: "🎯", color: "cyan", href: "/portal/goals" },
          { label: "Open Tickets", value: d?.helpdesk?.openTickets || 0, icon: "🎫", color: "orange", href: "/portal/helpdesk" },
        ].map((stat) => (
          <Link href={stat.href} key={stat.label}>
            <div className={`bg-white shadow-sm dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-${stat.color}-500/50 transition-colors cursor-pointer`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">{stat.icon}</span>
                <span className={`text-2xl font-bold text-${stat.color}-400`}>{stat.value}</span>
              </div>
              <p className="text-xs text-slate-500">{stat.label}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Announcements */}
          <div className="bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">📢 Announcements</h2>
              <Link href="/portal/announcements" className="text-xs text-brand-400 hover:text-brand-300">View All →</Link>
            </div>
            {d?.announcements && d.announcements.length > 0 ? (
              <div className="space-y-3">
                {d.announcements.map((a: any) => (
                  <div key={a.id} className="bg-slate-50 border dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-slate-900 dark:text-white">{a.title}</h3>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{a.content}</p>
                      </div>
                      {a.priority === "URGENT" && (
                        <span className="px-2 py-0.5 text-xs bg-red-900/50 text-red-400 rounded-full">URGENT</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-slate-500">{new Date(a.publishedAt).toLocaleDateString()}</span>
                      <span className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">{a.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm text-center py-6">No announcements</p>
            )}
          </div>

          {/* Quick Actions Grid */}
          <div className="bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">⚡ Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Apply Leave", icon: "🏖️", href: "/portal/leaves" },
                { label: "Submit Expense", icon: "🧾", href: "/portal/expenses" },
                { label: "My Payslips", icon: "💰", href: "/portal/payslips" },
                { label: "Directory", icon: "👥", href: "/portal/directory" },
                { label: "My Goals", icon: "🎯", href: "/portal/goals" },
                { label: "Raise Ticket", icon: "🎫", href: "/portal/helpdesk" },
                { label: "Training", icon: "📚", href: "/portal/training" },
                { label: "My Profile", icon: "👤", href: "/portal/profile" },
              ].map((action) => (
                <Link href={action.href} key={action.label}>
                  <div className="bg-slate-50 border dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-lg p-3 text-center hover:border-brand-500/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                    <span className="text-2xl block mb-1">{action.icon}</span>
                    <span className="text-xs text-slate-600 dark:text-slate-300">{action.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Latest Salary Slip */}
          {d?.payroll?.latestSlip && (
            <div className="bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">💰 Latest Payslip</h2>
                <Link href="/portal/payslips" className="text-xs text-brand-400 hover:text-brand-300">View All →</Link>
              </div>
              <div className="bg-slate-50 border dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-slate-400">{`${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.payroll.latestSlip.month - 1]} ${d.payroll.latestSlip.year}`}</p>
                    <p className="text-lg font-semibold text-emerald-400 mt-1">₹{Number(d.payroll.latestSlip.netSalary).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-slate-500">Gross: ₹{Number(d.payroll.latestSlip.grossSalary).toLocaleString("en-IN")}</p>
                    <p className="text-slate-500">Deductions: ₹{Number(d.payroll.latestSlip.totalDeductions).toLocaleString("en-IN")}</p>
                  </div>
                </div>
                <div className={`mt-2 px-2 py-0.5 text-xs rounded inline-block ${d.payroll.latestSlip.isPaid ? "bg-emerald-900/50 text-emerald-400" : "bg-amber-900/50 text-amber-400"}`}>
                  {d.payroll.latestSlip.isPaid ? "✓ Paid" : "⏳ Processing"}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Profile Card */}
          <div className="bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="text-center">
              <div className="w-16 h-16 bg-brand-600 rounded-full flex items-center justify-center text-2xl font-bold text-slate-900 dark:text-white mx-auto mb-3">
                {d?.profile?.user?.firstName?.[0]}{d?.profile?.user?.lastName?.[0]}
              </div>
              <h3 className="text-slate-900 dark:text-white font-semibold">{d?.profile?.user?.firstName} {d?.profile?.user?.lastName}</h3>
              <p className="text-slate-400 text-sm">{employee?.designation}</p>
              <p className="text-slate-500 text-xs mt-1">{employee?.department} &middot; {employee?.employeeCode}</p>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="text-slate-600 dark:text-slate-300">{d?.profile?.user?.email}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="text-slate-600 dark:text-slate-300">{d?.profile?.user?.phone || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Joined</span><span className="text-slate-600 dark:text-slate-300">{employee?.dateOfJoining ? new Date(employee.dateOfJoining).toLocaleDateString() : "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Type</span><span className="text-slate-600 dark:text-slate-300">{employee?.employmentType}</span></div>
            </div>
            <Link href="/portal/profile">
              <button className="w-full mt-4 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-700 text-sm transition-colors">
                View Full Profile
              </button>
            </Link>
          </div>

          {/* Upcoming Holidays */}
          <div className="bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">🎉 Upcoming Holidays</h2>
              <Link href="/portal/holidays" className="text-xs text-brand-400 hover:text-brand-300">All →</Link>
            </div>
            {d?.upcomingHolidays && d.upcomingHolidays.length > 0 ? (
              <div className="space-y-2">
                {d.upcomingHolidays.map((h: any) => (
                  <div key={h.id} className="flex items-center justify-between bg-slate-100 dark:bg-slate-800/50 rounded-lg p-2 text-sm">
                    <div>
                      <p className="text-slate-600 dark:text-slate-300 font-medium">{h.name}</p>
                      <p className="text-xs text-slate-500">{h.type}{h.isOptional ? " (Optional)" : ""}</p>
                    </div>
                    <span className="text-xs text-slate-400">{new Date(h.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm text-center py-4">No upcoming holidays</p>
            )}
          </div>

          {/* Training */}
          <div className="bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">📚 Training</h2>
              <Link href="/portal/training" className="text-xs text-brand-400 hover:text-brand-300">All →</Link>
            </div>
            <div className="text-center py-4">
              <span className="text-3xl font-bold text-cyan-400">{d?.training?.activeEnrollments || 0}</span>
              <p className="text-xs text-slate-500 mt-1">Active Enrollments</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
