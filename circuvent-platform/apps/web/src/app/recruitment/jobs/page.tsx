"use client";
import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

const DIVISIONS = ["AI_ML", "IOT_EMBEDDED", "FULL_STACK", "DEVOPS", "DATA_SCIENCE", "DESIGN", "MANAGEMENT", "HR_ADMIN"];

export default function JobPostingsPage() {
  const { token } = useAuth();
  const { data: jobs, loading, refetch } = useApi<any[]>("/recruitment/jobs");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", requirements: "", division: "FULL_STACK", department: "Engineering",
    experienceMin: "0", experienceMax: "", skills: "", niceToHave: "", openings: "1",
    location: "Bangalore, India", workMode: "HYBRID",
  });

  const handleCreate = async () => {
    if (!form.title || !form.description || !form.requirements) return;
    await api.post("/recruitment/jobs", {
      ...form, experienceMin: Number(form.experienceMin), experienceMax: form.experienceMax ? Number(form.experienceMax) : null,
      openings: Number(form.openings), skills: form.skills.split(",").map(s => s.trim()).filter(Boolean),
      niceToHave: form.niceToHave.split(",").map(s => s.trim()).filter(Boolean),
    }, token || undefined);
    setShowCreate(false);
    setForm({ title: "", description: "", requirements: "", division: "FULL_STACK", department: "Engineering", experienceMin: "0", experienceMax: "", skills: "", niceToHave: "", openings: "1", location: "Bangalore, India", workMode: "HYBRID" });
    refetch();
  };

  const handlePublish = async (id: string) => {
    await api.patch(`/recruitment/jobs/${id}/publish`, {}, token || undefined);
    refetch();
  };

  const statusColors: Record<string, string> = {
    DRAFT: "bg-amber-900/50 text-amber-400", OPEN: "bg-emerald-900/50 text-emerald-400",
    CLOSED: "bg-slate-100 dark:bg-slate-700 text-slate-400", CANCELLED: "bg-red-900/50 text-red-400", ON_HOLD: "bg-purple-900/50 text-purple-400",
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/recruitment" className="text-sm text-brand-400 hover:text-brand-300">← Recruitment</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">📋 Job Postings</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg text-sm hover:bg-brand-700">+ New Job</button>
      </div>

      <div className="space-y-3">
        {loading ? <div className="text-center text-slate-500 py-12">Loading...</div> :
          !jobs || jobs.length === 0 ? <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No job postings yet</div> :
          jobs.map((job: any) => (
            <div key={job.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-500 font-mono">{job.jobCode}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${statusColors[job.status]}`}>{job.status}</span>
                    <span className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">{job.division.replace("_", "/")}</span>
                    <span className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">{job.workMode}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{job.title}</h3>
                  <p className="text-sm text-slate-400 mt-1">{job.department} &middot; {job.location} &middot; {job.experienceMin}-{job.experienceMax || "∞"} years</p>
                  {job.skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {job.skills.map((s: string) => (
                        <span key={s} className="px-2 py-0.5 text-xs bg-brand-900/50 text-brand-400 rounded">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{job._count?.applications || 0}</p>
                  <p className="text-xs text-slate-500">applications</p>
                  <p className="text-xs text-slate-500 mt-1">{job.filled}/{job.openings} filled</p>
                  {job.status === "DRAFT" && (
                    <button onClick={() => handlePublish(job.id)} className="mt-2 px-3 py-1 text-xs bg-emerald-600 text-slate-900 dark:text-white rounded hover:bg-emerald-700">Publish</button>
                  )}
                </div>
              </div>
            </div>
          ))
        }
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-2xl my-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Post a New Job</h2>
            <div className="space-y-3">
              <input placeholder="Job Title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              <div className="grid grid-cols-3 gap-3">
                <select value={form.division} onChange={e => setForm({ ...form, division: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                  {DIVISIONS.map(d => <option key={d} value={d}>{d.replace("_", "/")}</option>)}
                </select>
                <input placeholder="Department" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
                <select value={form.workMode} onChange={e => setForm({ ...form, workMode: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                  <option value="ONSITE">Onsite</option><option value="REMOTE">Remote</option><option value="HYBRID">Hybrid</option>
                </select>
              </div>
              <textarea placeholder="Job Description *" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" rows={4} />
              <textarea placeholder="Requirements *" value={form.requirements} onChange={e => setForm({ ...form, requirements: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" rows={3} />
              <div className="grid grid-cols-3 gap-3">
                <input placeholder="Min Experience" type="number" value={form.experienceMin} onChange={e => setForm({ ...form, experienceMin: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
                <input placeholder="Max Experience" type="number" value={form.experienceMax} onChange={e => setForm({ ...form, experienceMax: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
                <input placeholder="Openings" type="number" value={form.openings} onChange={e => setForm({ ...form, openings: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              </div>
              <input placeholder="Required Skills (comma-separated)" value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              <input placeholder="Nice-to-Have Skills (comma-separated)" value={form.niceToHave} onChange={e => setForm({ ...form, niceToHave: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
              <button onClick={handleCreate} disabled={!form.title || !form.description || !form.requirements}
                className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">Create Job</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
