"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function TrainingPage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [programs, setPrograms] = useState<any[]>([]);
  const [myEnrollments, setMyEnrollments] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [tab, setTab] = useState<"available" | "my">("available");
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (token) loadEmployee(); }, [token]);
  useEffect(() => { if (employee) loadData(); }, [employee]);

  const loadEmployee = async () => {
    const res = await api.get<any[]>("/hr/employees", token!);
    if (res.success && res.data) setEmployee(res.data.find((e: any) => e.user?.email === user?.email) || res.data[0]);
  };

  const loadData = async () => {
    if (!employee) return;
    setLoading(true);
    const [programsRes, myRes, statsRes] = await Promise.all([
      api.get<any[]>("/hr/portal/training", token!),
      api.get<any[]>(`/hr/portal/training/my/${employee.id}`, token!),
      api.get<any>("/hr/portal/training/dashboard/stats", token!),
    ]);
    if (programsRes.success) setPrograms(programsRes.data || []);
    if (myRes.success) setMyEnrollments(myRes.data || []);
    if (statsRes.success) setStats(statsRes.data);
    setLoading(false);
  };

  const handleEnroll = async (programId: string) => {
    if (!employee) return;
    await api.post(`/hr/portal/training/${programId}/enroll`, { employeeId: employee.id }, token!);
    loadData();
  };

  const statusColors: Record<string, string> = {
    UPCOMING: "bg-blue-900/50 text-blue-400", ONGOING: "bg-emerald-900/50 text-emerald-400",
    COMPLETED: "bg-slate-100 dark:bg-slate-700 text-slate-400", CANCELLED: "bg-red-900/50 text-red-400",
  };
  const enrollColors: Record<string, string> = {
    ENROLLED: "bg-blue-900/50 text-blue-400", IN_PROGRESS: "bg-amber-900/50 text-amber-400",
    COMPLETED: "bg-emerald-900/50 text-emerald-400", DROPPED: "bg-red-900/50 text-red-400",
    WAITLISTED: "bg-purple-900/50 text-purple-400",
  };

  const enrolledIds = new Set(myEnrollments.map(e => e.programId));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-400 hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">📚 Training & Learning</h1>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Programs Available", value: stats.totalPrograms, color: "blue" },
            { label: "Active", value: stats.activePrograms, color: "emerald" },
            { label: "My Enrolled", value: myEnrollments.length, color: "brand" },
            { label: "Completion Rate", value: `${stats.completionRate}%`, color: "cyan" },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold text-${s.color}-400`}>{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab("available")} className={`px-4 py-2 rounded-lg text-sm ${tab === "available" ? "bg-brand-600 text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-400"}`}>
          Available Programs ({programs.length})
        </button>
        <button onClick={() => setTab("my")} className={`px-4 py-2 rounded-lg text-sm ${tab === "my" ? "bg-brand-600 text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-400"}`}>
          My Enrollments ({myEnrollments.length})
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : tab === "available" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.length === 0 ? (
            <div className="col-span-full text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No training programs available</div>
          ) : programs.map(p => (
            <div key={p.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className={`px-2 py-0.5 text-xs rounded ${statusColors[p.status]}`}>{p.status}</span>
                <span className="text-xs text-slate-500">{p.mode}</span>
              </div>
              <h3 className="text-white font-medium mb-1">{p.title}</h3>
              {p.description && <p className="text-xs text-slate-400 line-clamp-2 mb-3">{p.description}</p>}
              <div className="space-y-1 text-xs text-slate-500 mb-4">
                {p.instructor && <p>👨‍🏫 {p.instructor}</p>}
                {p.duration && <p>⏱️ {p.duration}</p>}
                {p.startDate && <p>📅 {new Date(p.startDate).toLocaleDateString()} — {p.endDate ? new Date(p.endDate).toLocaleDateString() : "TBD"}</p>}
                {p.maxSeats && <p>💺 {p._count?.enrollments || 0}/{p.maxSeats} seats</p>}
                {p.certificate && <p>🏅 Certificate on completion</p>}
                {p.mandatory && <p className="text-red-400">⚠ Mandatory</p>}
              </div>
              {enrolledIds.has(p.id) ? (
                <span className="inline-block px-3 py-1.5 text-xs bg-emerald-900/50 text-emerald-400 rounded-lg">✓ Enrolled</span>
              ) : (
                <button onClick={() => handleEnroll(p.id)}
                  className="px-3 py-1.5 text-xs bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700">Enroll Now</button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {myEnrollments.length === 0 ? (
            <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">Not enrolled in any programs yet</div>
          ) : myEnrollments.map(e => (
            <div key={e.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white font-medium">{e.program?.title}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded ${enrollColors[e.status]}`}>{e.status}</span>
                  </div>
                  <p className="text-xs text-slate-400">{e.program?.category} &middot; {e.program?.mode} &middot; {e.program?.duration || "Self-paced"}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-brand-400">{e.progress}%</p>
                  {e.score && <p className="text-xs text-slate-500">Score: {Number(e.score).toFixed(0)}</p>}
                </div>
              </div>
              <div className="mt-3 bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all ${e.progress >= 100 ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${e.progress}%` }} />
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                <span>Enrolled: {new Date(e.enrolledAt).toLocaleDateString()}</span>
                {e.completedAt && <span>Completed: {new Date(e.completedAt).toLocaleDateString()}</span>}
                {e.certificateUrl && <a href={e.certificateUrl} className="text-brand-400">📜 Certificate</a>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
