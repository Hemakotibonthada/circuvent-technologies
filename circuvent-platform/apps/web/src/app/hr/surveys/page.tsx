"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, CardHeader, StatCard, Badge, Button,
  DataTable, Modal, Input, Select, Textarea, Tabs, EmptyState,
} from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { api } from "@/lib/api-client";

/* ── colour maps ────────────────────────────────────────── */

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

const statusColors: Record<string, BadgeColor> = {
  DRAFT: "slate",
  ACTIVE: "green",
  CLOSED: "blue",
  ARCHIVED: "slate",
};

const questionTypeColors: Record<string, BadgeColor> = {
  RATING: "amber",
  TEXT: "blue",
  MULTIPLE_CHOICE: "purple",
  YES_NO: "cyan",
  SCALE: "emerald",
};

/* ── types ──────────────────────────────────────────────── */

interface SurveyQuestion {
  id: string;
  text: string;
  type: string;
  options?: string[];
  required: boolean;
  order: number;
}

interface Survey {
  id: string;
  title: string;
  description: string;
  status: string;
  questions: SurveyQuestion[];
  totalResponses: number;
  targetResponses: number;
  responseRate: number;
  createdAt: string;
  deadline?: string;
  isAnonymous: boolean;
  createdByName?: string;
}

interface SurveyResult {
  questionId: string;
  questionText: string;
  type: string;
  responses: number;
  distribution?: Record<string, number>;
  averageRating?: number;
  textResponses?: string[];
}

interface SurveyStats {
  totalSurveys: number;
  active: number;
  avgResponseRate: number;
  totalResponses: number;
}

/* ── component ──────────────────────────────────────────── */

export default function SurveyManagementPage() {
  const { token, isAdmin, isHR } = useAuth();

  const [activeTab, setActiveTab] = useState("active");
  const tabs = [
    { id: "active", label: "Active Surveys" },
    { id: "draft", label: "Drafts" },
    { id: "closed", label: "Closed" },
  ];

  /* ── data ─────────────────────────────────────────────── */
  const { data: surveys, loading, refetch } = useApi<Survey[]>("/hr/surveys");
  const { data: stats } = useApi<SurveyStats>("/hr/surveys/stats");

  /* ── state ────────────────────────────────────────────── */
  const [showCreate, setShowCreate] = useState(false);
  const [showResults, setShowResults] = useState<Survey | null>(null);
  const [results, setResults] = useState<SurveyResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [form, setForm] = useState({
    title: "", description: "", deadline: "", isAnonymous: "true", targetResponses: "",
  });

  const [questions, setQuestions] = useState<Array<{
    text: string; type: string; options: string; required: boolean;
  }>>([
    { text: "", type: "RATING", options: "", required: true },
  ]);

  /* ── helpers ──────────────────────────────────────────── */
  const flash = (type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const filtered = (status: string) => (surveys || []).filter((s) => s.status === status.toUpperCase());
  const displayData = activeTab === "active" ? filtered("ACTIVE")
    : activeTab === "draft" ? filtered("DRAFT")
    : filtered("CLOSED");

  /* ── actions ──────────────────────────────────────────── */
  const handleCreate = async () => {
    setSubmitting(true);
    const body = {
      ...form,
      isAnonymous: form.isAnonymous === "true",
      targetResponses: Number(form.targetResponses) || 0,
      questions: questions
        .filter((q) => q.text.trim())
        .map((q, i) => ({
          text: q.text,
          type: q.type,
          required: q.required,
          order: i + 1,
          options: q.type === "MULTIPLE_CHOICE" ? q.options.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
        })),
    };
    const res = await api.post("/hr/surveys", body, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Survey created");
      setShowCreate(false);
      setForm({ title: "", description: "", deadline: "", isAnonymous: "true", targetResponses: "" });
      setQuestions([{ text: "", type: "RATING", options: "", required: true }]);
      refetch();
    } else flash("error", res.error || "Failed to create survey");
  };

  const handlePublish = async (id: string) => {
    const res = await api.patch(`/hr/surveys/${id}/publish`, {}, token || undefined);
    if (res.success) { flash("success", "Survey published"); refetch(); }
    else flash("error", res.error || "Publish failed");
  };

  const handleClose = async (id: string) => {
    const res = await api.patch(`/hr/surveys/${id}/close`, {}, token || undefined);
    if (res.success) { flash("success", "Survey closed"); refetch(); }
    else flash("error", res.error || "Close failed");
  };

  const handleViewResults = async (survey: Survey) => {
    setShowResults(survey);
    setResultsLoading(true);
    const res = await api.get<SurveyResult[]>(`/hr/surveys/${survey.id}/results`, token || undefined);
    setResultsLoading(false);
    if (res.success && res.data) setResults(res.data);
    else setResults([]);
  };

  /* ── question builder ─────────────────────────────────── */
  const addQuestion = () => setQuestions([...questions, { text: "", type: "RATING", options: "", required: true }]);
  const removeQuestion = (idx: number) => setQuestions(questions.filter((_, i) => i !== idx));
  const updateQuestion = (idx: number, field: string, value: any) => {
    const next = [...questions];
    next[idx] = { ...next[idx], [field]: value };
    setQuestions(next);
  };

  /* ── columns ──────────────────────────────────────────── */
  const surveyColumns = [
    {
      key: "title", header: "Survey",
      render: (s: Survey) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{s.title}</p>
          <p className="text-xs text-slate-500">{s.description?.slice(0, 60)}{s.description?.length > 60 ? "…" : ""}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (s: Survey) => <Badge color={statusColors[s.status] || "slate"}>{s.status}</Badge> },
    {
      key: "responseRate", header: "Response Rate",
      render: (s: Survey) => (
        <div className="flex items-center gap-2">
          <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(s.responseRate, 100)}%` }} />
          </div>
          <span className="text-xs text-slate-400">{s.responseRate}%</span>
        </div>
      ),
    },
    {
      key: "totalResponses", header: "Responses",
      render: (s: Survey) => `${s.totalResponses}/${s.targetResponses || "∞"}`,
    },
    {
      key: "questions", header: "Questions",
      render: (s: Survey) => <span className="text-slate-400">{s.questions?.length || 0}</span>,
    },
    { key: "deadline", header: "Deadline", render: (s: Survey) => s.deadline ? formatDate(s.deadline) : "—" },
    {
      key: "isAnonymous", header: "",
      render: (s: Survey) => s.isAnonymous ? <Badge color="purple">Anonymous</Badge> : null,
    },
    {
      key: "actions", header: "",
      render: (s: Survey) => (
        <div className="flex gap-2">
          {s.status === "ACTIVE" || s.status === "CLOSED" ? (
            <Button size="sm" variant="ghost" onClick={() => handleViewResults(s)}>Results</Button>
          ) : null}
          {s.status === "DRAFT" && (isAdmin || isHR) && (
            <Button size="sm" variant="outline" onClick={() => handlePublish(s.id)}>Publish</Button>
          )}
          {s.status === "ACTIVE" && (isAdmin || isHR) && (
            <Button size="sm" variant="danger" onClick={() => handleClose(s.id)}>Close</Button>
          )}
        </div>
      ),
    },
  ];

  const s2 = stats || { totalSurveys: 0, active: 0, avgResponseRate: 0, totalResponses: 0 };

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`fixed right-4 top-4 z-[100] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          feedback.type === "success" ? "border border-green-500/30 bg-green-500/10 text-green-400"
            : "border border-red-500/30 bg-red-500/10 text-red-400"
        }`}>{feedback.msg}</div>
      )}

      <PageHeader
        title="Survey Management"
        subtitle="Create and manage employee surveys"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Surveys" }]}
        actions={
          (isAdmin || isHR) ? <Button onClick={() => setShowCreate(true)}>+ Create Survey</Button> : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="Total Surveys" value={s2.totalSurveys} color="blue" />
        <StatCard title="Active" value={s2.active} color="green" />
        <StatCard title="Avg Response Rate" value={`${s2.avgResponseRate}%`} color="purple" />
        <StatCard title="Total Responses" value={s2.totalResponses} color="cyan" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <Card>
        <CardHeader title={`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Surveys`} subtitle={`${displayData.length} surveys`} />
        <DataTable columns={surveyColumns} data={displayData} keyExtractor={(s) => s.id} loading={loading} emptyMessage={`No ${activeTab} surveys.`} />
      </Card>

      {/* ── create survey modal ─────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Survey" size="xl">
        <div className="max-h-[70vh] space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Title" placeholder="Employee Satisfaction Q1 2026" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input label="Target Responses" type="number" placeholder="50" value={form.targetResponses} onChange={(e) => setForm({ ...form, targetResponses: e.target.value })} />
          </div>
          <Textarea label="Description" placeholder="Brief description of the survey..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Deadline" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            <Select label="Anonymous?" options={[
              { value: "true", label: "Yes – Responses are anonymous" },
              { value: "false", label: "No – Track respondents" },
            ]} value={form.isAnonymous} onChange={(e) => setForm({ ...form, isAnonymous: e.target.value })} />
          </div>

          {/* question builder */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7004">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Questions</h4>
              <Button size="sm" variant="outline" onClick={addQuestion}>+ Add Question</Button>
            </div>
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 text-xs font-mono text-slate-500">Q{idx + 1}</span>
                    <div className="flex-1 space-y-2">
                      <Input placeholder="Question text..." value={q.text} onChange={(e) => updateQuestion(idx, "text", e.target.value)} />
                      <div className="grid grid-cols-3 gap-2">
                        <Select options={[
                          { value: "RATING", label: "Rating (1-5)" },
                          { value: "TEXT", label: "Free Text" },
                          { value: "MULTIPLE_CHOICE", label: "Multiple Choice" },
                          { value: "YES_NO", label: "Yes/No" },
                          { value: "SCALE", label: "Scale (1-10)" },
                        ]} value={q.type} onChange={(e) => updateQuestion(idx, "type", e.target.value)} />
                        {q.type === "MULTIPLE_CHOICE" && (
                          <Input placeholder="Option1, Option2, Option3" value={q.options} onChange={(e) => updateQuestion(idx, "options", e.target.value)} className="col-span-2" />
                        )}
                      </div>
                    </div>
                    {questions.length > 1 && (
                      <Button size="sm" variant="danger" onClick={() => removeQuestion(idx)}>✕</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={submitting} disabled={!form.title || questions.every((q) => !q.text.trim())}>
              Create Survey
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── results modal ───────────────────────────────── */}
      <Modal open={!!showResults} onClose={() => setShowResults(null)} title={`Results: ${showResults?.title || ""}`} size="xl">
        <div className="max-h-[70vh] space-y-4 overflow-y-auto">
          {resultsLoading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="h-6 w-6 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : results.length === 0 ? (
            <EmptyState title="No Results" description="No responses have been recorded yet." />
          ) : (
            results.map((r) => (
              <div key={r.questionId} className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">{r.questionText}</p>
                  <Badge color={questionTypeColors[r.type] || "slate"}>{r.type}</Badge>
                </div>
                <p className="text-xs text-slate-500 mb-2">{r.responses} responses</p>

                {/* distribution chart */}
                {r.distribution && (
                  <div className="space-y-1">
                    {Object.entries(r.distribution).map(([key, count]) => {
                      const pct = r.responses > 0 ? Math.round((count / r.responses) * 100) : 0;
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className="w-24 text-xs text-slate-400 truncate">{key}</span>
                          <div className="flex-1 h-4 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div className="h-full rounded-full bg-brand-600/60" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-12 text-right text-xs text-slate-400">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {r.averageRating !== undefined && (
                  <p className="text-lg font-bold text-brand-400">{r.averageRating.toFixed(1)} / 5</p>
                )}

                {r.textResponses && r.textResponses.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto rounded-lg bg-slate-100 dark:bg-slate-800/50 p-2 space-y-1">
                    {r.textResponses.map((t, i) => (
                      <p key={i} className="text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 pb-1 last:border-0">"{t}"</p>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
