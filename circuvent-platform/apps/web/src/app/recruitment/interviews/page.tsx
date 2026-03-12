"use client";
import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function InterviewsPage() {
  const { token } = useAuth();
  const { data: interviews, loading, refetch } = useApi<any[]>("/recruitment/interviews");
  const [showSchedule, setShowSchedule] = useState(false);
  const [form, setForm] = useState({ applicationId: "", interviewerId: "", roundType: "TECHNICAL", scheduledAt: "", durationMinutes: "60", meetingLink: "" });

  const handleSchedule = async () => {
    if (!form.applicationId || !form.interviewerId || !form.scheduledAt) return;
    await api.post("/recruitment/interviews", { ...form, durationMinutes: Number(form.durationMinutes) }, token || undefined);
    setShowSchedule(false);
    setForm({ applicationId: "", interviewerId: "", roundType: "TECHNICAL", scheduledAt: "", durationMinutes: "60", meetingLink: "" });
    refetch();
  };

  const handleComplete = async (id: string) => {
    await api.patch(`/recruitment/interviews/${id}/complete`, {}, token || undefined);
    refetch();
  };

  const statusColors: Record<string, string> = {
    SCHEDULED: "bg-blue-900/50 text-blue-400", IN_PROGRESS: "bg-amber-900/50 text-amber-400",
    COMPLETED: "bg-emerald-900/50 text-emerald-400", CANCELLED: "bg-red-900/50 text-red-400", NO_SHOW: "bg-slate-100 dark:bg-slate-700 text-slate-400",
  };

  const today = new Date();
  const upcoming = interviews?.filter((i: any) => new Date(i.scheduledAt) >= today && i.status === "SCHEDULED") || [];
  const past = interviews?.filter((i: any) => new Date(i.scheduledAt) < today || i.status !== "SCHEDULED") || [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/recruitment" className="text-sm text-brand-400 hover:text-brand-300">← Recruitment</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">🎙️ Interviews</h1>
        </div>
        <button onClick={() => setShowSchedule(true)} className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg text-sm hover:bg-brand-700">+ Schedule Interview</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total", value: interviews?.length || 0, color: "brand" },
          { label: "Upcoming", value: upcoming.length, color: "blue" },
          { label: "Completed", value: interviews?.filter((i: any) => i.status === "COMPLETED").length || 0, color: "emerald" },
          { label: "With Reviews", value: interviews?.filter((i: any) => i.review).length || 0, color: "purple" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
            <p className={`text-xl font-bold text-${s.color}-400`}>{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">📅 Upcoming Interviews</h2>
          <div className="space-y-2">
            {upcoming.map((i: any) => (
              <div key={i.id} className="bg-white dark:bg-slate-900 border border-blue-800/30 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs rounded ${statusColors[i.status]}`}>{i.status}</span>
                      <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded">{i.roundType}</span>
                      <span className="text-xs text-slate-500">Round {i.roundNumber}</span>
                    </div>
                    <p className="text-sm text-slate-900 dark:text-white">{i.application?.candidate?.firstName} {i.application?.candidate?.lastName} — {i.job?.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span>📅 {new Date(i.scheduledAt).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      <span>⏱️ {i.durationMinutes}min</span>
                      {i.meetingLink && <a href={i.meetingLink} className="text-brand-400 hover:text-brand-300">🔗 Join</a>}
                    </div>
                  </div>
                  <button onClick={() => handleComplete(i.id)} className="px-3 py-1 text-xs bg-emerald-600 text-slate-900 dark:text-white rounded hover:bg-emerald-700">Complete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past */}
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">📋 All Interviews</h2>
      <div className="space-y-2">
        {loading ? <div className="text-center text-slate-500 py-12">Loading...</div> :
          past.length === 0 && upcoming.length === 0 ? <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No interviews scheduled</div> :
          past.map((i: any) => (
            <div key={i.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs rounded ${statusColors[i.status]}`}>{i.status}</span>
                  <span className="text-sm text-slate-900 dark:text-white">{i.application?.candidate?.firstName} {i.application?.candidate?.lastName}</span>
                  <span className="text-xs text-slate-500">{i.roundType} R{i.roundNumber}</span>
                </div>
                <div className="flex items-center gap-2">
                  {i.review && (
                    <span className={`px-2 py-0.5 text-xs rounded ${i.review.decision === "STRONG_YES" || i.review.decision === "YES" ? "bg-emerald-900/50 text-emerald-400" : i.review.decision === "NO" || i.review.decision === "STRONG_NO" ? "bg-red-900/50 text-red-400" : "bg-amber-900/50 text-amber-400"}`}>
                      {i.review.decision} {i.review.overallScore ? `(${Number(i.review.overallScore).toFixed(1)})` : ""}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">{new Date(i.scheduledAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))
        }
      </div>

      {showSchedule && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Schedule Interview</h2>
            <div className="space-y-3">
              <input placeholder="Application ID *" value={form.applicationId} onChange={e => setForm({ ...form, applicationId: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm font-mono" />
              <input placeholder="Interviewer User ID *" value={form.interviewerId} onChange={e => setForm({ ...form, interviewerId: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm font-mono" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.roundType} onChange={e => setForm({ ...form, roundType: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                  <option value="SCREENING">Screening</option><option value="TECHNICAL">Technical</option>
                  <option value="SYSTEM_DESIGN">System Design</option><option value="HR">HR</option>
                  <option value="CULTURE_FIT">Culture Fit</option><option value="FINAL">Final</option>
                </select>
                <input type="number" placeholder="Duration (min)" value={form.durationMinutes} onChange={e => setForm({ ...form, durationMinutes: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              </div>
              <input type="datetime-local" value={form.scheduledAt} onChange={e => setForm({ ...form, scheduledAt: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm" />
              <input placeholder="Meeting Link (optional)" value={form.meetingLink} onChange={e => setForm({ ...form, meetingLink: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowSchedule(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
              <button onClick={handleSchedule} disabled={!form.applicationId || !form.interviewerId || !form.scheduledAt}
                className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">Schedule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
