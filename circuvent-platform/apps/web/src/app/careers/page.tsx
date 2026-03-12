"use client";

// ══════════════════════════════════════════════════════════════
// Careers — Candidate-facing job browser (read-only)
// No admin actions. Only view open jobs and apply.
// ══════════════════════════════════════════════════════════════

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, Badge, Button, Modal, Input, Textarea } from "@/components/ui";
import { api } from "@/lib/api-client";

interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  employmentType: string;
  description: string;
  requirements: string;
  status: string;
  minSalary: number | null;
  maxSalary: number | null;
  createdAt: string;
}

export default function CareersPage() {
  const { user, token } = useAuth();
  const { data: jobs, loading } = useApi<Job[]>("/recruitment/jobs");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [applyModal, setApplyModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const openJobs = (jobs || []).filter(j => j.status === "OPEN");

  const filtered = openJobs.filter(j => {
    const matchSearch = !search || j.title.toLowerCase().includes(search.toLowerCase()) || j.department.toLowerCase().includes(search.toLowerCase());
    const matchDept = !deptFilter || j.department === deptFilter;
    return matchSearch && matchDept;
  });

  const departments = [...new Set(openJobs.map(j => j.department))].sort();

  const handleApply = async () => {
    if (!selectedJob) return;
    setApplying(true);
    const res = await api.post("/recruitment/applications", {
      jobId: selectedJob.id,
      coverLetter,
      resumeUrl,
    }, token || undefined);
    setApplying(false);
    setApplyModal(false);

    if (res.success) {
      setMessage({ type: "success", text: `Applied to "${selectedJob.title}" successfully!` });
      setCoverLetter("");
      setResumeUrl("");
    } else {
      setMessage({ type: "error", text: res.error || "Failed to apply" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Open Positions"
        subtitle="Find your next role at Circuvent Technologies"
      />

      {message && (
        <div className={`flex items-center justify-between rounded-lg border p-4 ${message.type === "success" ? "border-green-500/20 bg-green-500/10 text-green-400" : "border-red-500/20 bg-red-500/10 text-red-400"}`}>
          <span className="text-sm">{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs hover:underline">Dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search positions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 px-4 py-2 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
        />
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 px-4 py-2 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none"
        >
          <option value="">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <span className="flex items-center text-xs text-slate-500">{filtered.length} position{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Job Listings */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <p className="text-4xl">🔍</p>
            <p className="mt-2 text-sm text-slate-400">No open positions match your search</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((job) => (
            <Card key={job.id}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">{job.title}</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {job.department} · {job.location || "Remote"} · {job.employmentType || "Full-time"}
                  </p>
                </div>
                <Badge color="green">OPEN</Badge>
              </div>

              {job.description && (
                <p className="mt-3 text-sm text-slate-400 line-clamp-3">{job.description}</p>
              )}

              {(job.minSalary || job.maxSalary) && (
                <p className="mt-2 text-xs text-slate-500">
                  💰 {job.minSalary ? `₹${(job.minSalary / 100000).toFixed(1)}L` : ""} 
                  {job.minSalary && job.maxSalary ? " — " : ""}
                  {job.maxSalary ? `₹${(job.maxSalary / 100000).toFixed(1)}L` : ""} / year
                </p>
              )}

              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Posted {new Date(job.createdAt).toLocaleDateString("en-IN")}
                </span>
                <Button
                  size="sm"
                  onClick={() => { setSelectedJob(job); setApplyModal(true); }}
                >
                  Apply Now
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Apply Modal */}
      <Modal open={applyModal} onClose={() => setApplyModal(false)} title={`Apply — ${selectedJob?.title || ""}`} size="lg">
        {selectedJob && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 p-4 dark:bg-slate-800/50">
              <p className="text-sm font-medium text-white">{selectedJob.title}</p>
              <p className="text-xs text-slate-400">{selectedJob.department} · {selectedJob.location || "Remote"}</p>
            </div>

            {selectedJob.requirements && (
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Requirements</p>
                <p className="text-xs text-slate-500">{selectedJob.requirements}</p>
              </div>
            )}

            <Textarea
              label="Cover Letter (optional)"
              placeholder="Tell us why you're a great fit for this role..."
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
            />

            <Input
              label="Resume URL (optional)"
              placeholder="https://drive.google.com/your-resume"
              value={resumeUrl}
              onChange={(e) => setResumeUrl(e.target.value)}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setApplyModal(false)}>Cancel</Button>
              <Button onClick={handleApply} disabled={applying}>
                {applying ? "Submitting..." : "Submit Application"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
