"use client";
import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function CandidatesPage() {
  const { token } = useAuth();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const { data: candidates, loading, refetch } = useApi<any[]>(`/recruitment/candidates?search=${search}&source=${source}`);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", skills: "", experienceYears: "0", currentRole: "", currentCompany: "", source: "WEBSITE", linkedinUrl: "" });

  const handleCreate = async () => {
    if (!form.firstName || !form.lastName || !form.email) return;
    await api.post("/recruitment/candidates", { ...form, experienceYears: Number(form.experienceYears), skills: form.skills.split(",").map(s => s.trim()).filter(Boolean) }, token || undefined);
    setShowCreate(false);
    setForm({ firstName: "", lastName: "", email: "", phone: "", skills: "", experienceYears: "0", currentRole: "", currentCompany: "", source: "WEBSITE", linkedinUrl: "" });
    refetch();
  };

  const sourceColors: Record<string, string> = { WEBSITE: "text-blue-400", LINKEDIN: "text-cyan-400", REFERRAL: "text-emerald-400", NAUKRI: "text-purple-400", CAMPUS: "text-amber-400", AGENCY: "text-pink-400" };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/recruitment" className="text-sm text-brand-400 hover:text-brand-300">← Recruitment</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">👤 Candidates</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg text-sm hover:bg-brand-700">+ Add Candidate</button>
      </div>

      <div className="flex gap-3 mb-6">
        <input placeholder="Search by name, email, role..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white text-sm placeholder-slate-500" />
        <select value={source} onChange={e => setSource(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
          <option value="">All Sources</option>
          {["WEBSITE", "LINKEDIN", "REFERRAL", "NAUKRI", "INDEED", "CAMPUS", "AGENCY", "DIRECT"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {loading ? <div className="p-8 text-center text-slate-500">Loading...</div> :
          !candidates || candidates.length === 0 ? <div className="p-8 text-center text-slate-500">No candidates found</div> : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-200 text-left dark:border-slate-800">
              <th className="px-4 py-3 text-xs font-medium text-slate-500">Candidate</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500">Experience</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500">Source</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500">Skills</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 text-right">ATS Score</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 text-right">Apps</th>
            </tr></thead>
            <tbody>
              {candidates.map((c: any) => (
                <tr key={c.id} className="border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{c.firstName} {c.lastName}</p>
                    <p className="text-xs text-slate-500">{c.candidateCode} &middot; {c.email}</p>
                    {c.currentRole && <p className="text-xs text-slate-400">{c.currentRole}{c.currentCompany ? ` @ ${c.currentCompany}` : ""}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{Number(c.experienceYears)}y</td>
                  <td className="px-4 py-3"><span className={`text-xs ${sourceColors[c.source] || "text-slate-400"}`}>{c.source}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {c.skills?.slice(0, 4).map((s: string) => <span key={s} className="px-1.5 py-0.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded">{s}</span>)}
                      {c.skills?.length > 4 && <span className="text-xs text-slate-500">+{c.skills.length - 4}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.resumeScore ? (
                      <span className={`text-sm font-bold ${Number(c.resumeScore) >= 70 ? "text-emerald-400" : Number(c.resumeScore) >= 50 ? "text-amber-400" : "text-red-400"}`}>
                        {Number(c.resumeScore).toFixed(0)}
                      </span>
                    ) : <span className="text-xs text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-400">{c._count?.applications || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Add Candidate</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="First Name *" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
                <input placeholder="Last Name *" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              </div>
              <input placeholder="Email *" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
                <input placeholder="Experience (years)" type="number" value={form.experienceYears} onChange={e => setForm({ ...form, experienceYears: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Current Role" value={form.currentRole} onChange={e => setForm({ ...form, currentRole: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
                <input placeholder="Current Company" value={form.currentCompany} onChange={e => setForm({ ...form, currentCompany: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              </div>
              <input placeholder="Skills (comma-separated)" value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                  {["WEBSITE", "LINKEDIN", "REFERRAL", "NAUKRI", "INDEED", "CAMPUS", "AGENCY", "DIRECT", "OTHER"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input placeholder="LinkedIn URL" value={form.linkedinUrl} onChange={e => setForm({ ...form, linkedinUrl: e.target.value })} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
              <button onClick={handleCreate} disabled={!form.firstName || !form.lastName || !form.email}
                className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">Add Candidate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
