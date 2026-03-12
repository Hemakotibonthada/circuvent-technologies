"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, StatCard, Badge, Button, Input, Select, Tabs, DataTable } from "@/components/ui";
import { formatDate, formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api-client";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface InternProgram {
  id: string;
  name: string;
  department: string;
  durationWeeks: number;
  mentorName: string;
  stipend: number;
  maxCapacity: number;
  enrolledCount: number;
  status: string;
  startDate: string;
  endDate: string;
  description?: string;
}

interface InternRecord {
  internId: string;
  programId: string;
  programName: string;
  employeeCode: string;
  internName: string;
  mentorName: string;
  startDate: string;
  endDate: string;
  status: string;
  weekNumber?: number;
  totalWeeks?: number;
  progressPercent?: number;
  avgScore?: number;
}

interface InternDashboard {
  totalActiveInterns: number;
  totalPrograms: number;
  activePrograms: number;
  completionRate: number;
  conversionRate: number;
  avgScore: number;
  byDepartment: Array<{ department: string; count: number }>;
  recentEnrollments: Array<{ name: string; program: string; department: string; startDate: string }>;
  upcomingCompletions: Array<{ name: string; program: string; endDate: string; score: number }>;
}

interface EvaluationScores {
  technical: number;
  communication: number;
  teamwork: number;
  initiative: number;
  punctuality: number;
  learningAbility: number;
}

const PROGRAM_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "green",
  COMPLETED: "blue",
  UPCOMING: "amber",
  CANCELLED: "red",
};

const INTERN_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "green",
  COMPLETED: "blue",
  TERMINATED: "red",
  CONVERTED: "purple",
};

// ══════════════════════════════════════════════════════════════
// Page Component
// ══════════════════════════════════════════════════════════════

export default function InternManagementPage() {
  const { token } = useAuth();
  const { data: dashboard, refetch: refetchDashboard } = useApi<InternDashboard>("/hr/interns/dashboard");
  const [programs, setPrograms] = useState<InternProgram[]>([]);
  const [interns, setInterns] = useState<InternRecord[]>([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(false);

  // Create program form
  const [showCreateProgram, setShowCreateProgram] = useState(false);
  const [programForm, setProgramForm] = useState({
    name: "",
    department: "Engineering",
    durationWeeks: "12",
    mentorId: "",
    stipend: "15000",
    maxCapacity: "5",
    description: "",
  });

  // Enroll intern form
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ userId: "", programId: "" });

  // Evaluate intern
  const [showEvalForm, setShowEvalForm] = useState(false);
  const [evalInternId, setEvalInternId] = useState("");
  const [evalScores, setEvalScores] = useState<EvaluationScores>({
    technical: 3,
    communication: 3,
    teamwork: 3,
    initiative: 3,
    punctuality: 3,
    learningAbility: 3,
  });
  const [evalFeedback, setEvalFeedback] = useState("");

  // Convert to full-time
  const [showConvertForm, setShowConvertForm] = useState(false);
  const [convertId, setConvertId] = useState("");
  const [convertForm, setConvertForm] = useState({
    designation: "SDE-1",
    baseSalary: "600000",
    department: "",
  });

  const tabs = [
    { id: "dashboard", label: "Dashboard" }, { key: "programs", label: "Programs" }, { key: "interns", label: "Active Interns" }, { key: "evaluations", label: "Evaluate" }, { key: "actions", label: "Actions" },
  ];

  useEffect(() => {
    loadPrograms();
    loadInterns();
  }, [token]);

  const loadPrograms = async () => {
    const res = await api.get<InternProgram[]>("/hr/interns/programs", token || undefined);
    if (res.success && res.data) setPrograms(res.data);
  };

  const loadInterns = async () => {
    const res = await api.get<InternRecord[]>("/hr/interns/active", token || undefined);
    if (res.success && res.data) setInterns(res.data);
  };

  const handleCreateProgram = async () => {
    if (!programForm.name || !programForm.mentorId) return;
    setLoading(true);
    const res = await api.post("/hr/interns/programs", {
      name: programForm.name,
      department: programForm.department,
      durationWeeks: Number(programForm.durationWeeks),
      mentorId: programForm.mentorId,
      stipend: Number(programForm.stipend),
      maxCapacity: Number(programForm.maxCapacity),
      description: programForm.description,
    }, token || undefined);

    if (res.success) {
      setShowCreateProgram(false);
      setProgramForm({ name: "", department: "Engineering", durationWeeks: "12", mentorId: "", stipend: "15000", maxCapacity: "5", description: "" });
      loadPrograms();
      refetchDashboard();
    }
    setLoading(false);
  };

  const handleEnrollIntern = async () => {
    if (!enrollForm.userId || !enrollForm.programId) return;
    setLoading(true);
    const res = await api.post("/hr/interns/enroll", {
      userId: enrollForm.userId,
      programId: enrollForm.programId,
    }, token || undefined);

    if (res.success) {
      setShowEnrollForm(false);
      setEnrollForm({ userId: "", programId: "" });
      loadInterns();
      loadPrograms();
      refetchDashboard();
    }
    setLoading(false);
  };

  const handleEvaluate = async () => {
    if (!evalInternId || !evalFeedback) return;
    setLoading(true);
    const res = await api.post(`/hr/interns/${evalInternId}/evaluate`, {
      scores: evalScores,
      feedback: evalFeedback,
    }, token || undefined);

    if (res.success) {
      setShowEvalForm(false);
      setEvalInternId("");
      setEvalFeedback("");
      setEvalScores({ technical: 3, communication: 3, teamwork: 3, initiative: 3, punctuality: 3, learningAbility: 3 });
      loadInterns();
    }
    setLoading(false);
  };

  const handleGenerateCertificate = async (internId: string) => {
    setLoading(true);
    const res = await api.post<{ html: string }>(`/hr/interns/${internId}/certificate`, {}, token || undefined);
    if (res.success && res.data) {
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(typeof res.data === "string" ? res.data : (res.data as any).html || "");
        w.document.close();
      }
    }
    setLoading(false);
  };

  const handleConvertToFullTime = async () => {
    if (!convertId || !convertForm.designation || !convertForm.baseSalary) return;
    setLoading(true);
    const res = await api.post(`/hr/interns/${convertId}/convert`, {
      designation: convertForm.designation,
      baseSalary: Number(convertForm.baseSalary),
      department: convertForm.department || undefined,
    }, token || undefined);

    if (res.success) {
      setShowConvertForm(false);
      setConvertId("");
      loadInterns();
      refetchDashboard();
    }
    setLoading(false);
  };

  const activeInterns = useMemo(() => interns.filter((i) => i.status === "ACTIVE"), [interns]);
  const avgOverallScore = useMemo(() => {
    const scores = activeInterns.filter((i) => i.avgScore && i.avgScore > 0).map((i) => i.avgScore!);
    return scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
  }, [activeInterns]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Intern Management"
        subtitle="Programs, enrollment, evaluations, and conversions"
        breadcrumbs={[{ label: "HR & Payroll", href: "/hr" }, { label: "Interns" }]}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard title="Active Interns" value={dashboard?.totalActiveInterns || 0} color="blue" />
        <StatCard title="Programs" value={dashboard?.totalPrograms || 0} color="purple" />
        <StatCard title="Active Programs" value={dashboard?.activePrograms || 0} color="green" />
        <StatCard title="Completion Rate" value={`${dashboard?.completionRate || 0}%`} color="cyan" />
        <StatCard title="Conversion Rate" value={`${dashboard?.conversionRate || 0}%`} color="amber" />
        <StatCard title="Avg Score" value={dashboard?.avgScore?.toFixed(1) || "—"} color="pink" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Dashboard Tab */}
      {activeTab === "dashboard" && dashboard && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Department Distribution */}
          <Card>
            <CardHeader title="Interns by Department" />
            <div className="space-y-3">
              {dashboard.byDepartment.map((d) => (
                <div key={d.department} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-300">{d.department}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-cyan-500"
                        style={{ width: `${Math.min(100, (d.count / Math.max(1, dashboard.totalActiveInterns)) * 100)}%` }}
                      />
                    </Card>
                    <Badge color="blue">{d.count}</Badge>
                  </div>
                </div>
              ))}
              {dashboard.byDepartment.length === 0 && <p className="text-sm text-slate-500">No data available.</p>}
            </div>
          </div>

          {/* Recent Enrollments */}
          <Card>
            <CardHeader title="Recent Enrollments" />
            <div className="space-y-3">
              {dashboard.recentEnrollments.map((e, i) => (
                <div key={i} className="flex items-center justify-between bg-white dark:bg-slate-800/30 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm text-slate-900 dark:text-white font-medium">{e.name}</p>
                    <p className="text-xs text-slate-500">{e.program}</p>
                  </Card>
                  <span className="text-xs text-slate-400">{formatDate(e.startDate)}</span>
                </div>
              ))}
              {dashboard.recentEnrollments.length === 0 && <p className="text-sm text-slate-500">No recent enrollments.</p>}
            </div>
          </div>

          {/* Upcoming Completions */}
          <Card className="lg:col-span-2">
            <CardHeader title="Upcoming Completions (30 days)" subtitle="Interns completing their program soon" />
            {dashboard.upcomingCompletions.length > 0 ? (
              <DataTable
                columns={[{ key: "name", header: "Intern", render: (c: any) => <span className="font-medium text-slate-900 dark:text-white">{c.name}</span> }, { key: "program", header: "Program", render: (c: any) => c.program }, { key: "endDate", header: "End Date", render: (c: any) => formatDate(c.endDate) }, { key: "score", header: "Score", render: (c: any) => (
                    <span className={`font-bold ${c.score >= 4 ? "text-emerald-600 dark:text-emerald-400" : c.score >= 3 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                      {c.score > 0 ? c.score.toFixed(1) : "—"}
                    </span>
                  )}, { key: "actions", header: "", render: (c: any) => (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => { setConvertId(c.internId || ""); setShowConvertForm(true); }}>
                        Convert
                      </Button>
                    </Card>
                  )},
                ]}
                data={dashboard.upcomingCompletions}
                keyExtractor={(c: any) => c.name}
                emptyMessage="No upcoming completions."
              />
            ) : (
              <p className="text-sm text-slate-500 py-4">No interns completing in the next 30 days.</p>
            )}
          </div>
        </div>
      )}

      {/* Programs Tab */}
      {activeTab === "programs" && (
        <Card>
          <CardHeader
            title="Intern Programs"
            subtitle="Create and manage intern programs"
            actions={<Button onClick={() => setShowCreateProgram(true)}>+ New Program</Button>}
          />

          <DataTable
            columns={[{ key: "name", header: "Program", render: (p: InternProgram) => (
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</p>
                  {p.description && <p className="text-xs text-slate-500 truncate max-w-xs">{p.description}</p>}
                </Card>
              )}, { key: "department", header: "Department", render: (p: InternProgram) => <Badge color="blue">{p.department}</Badge> }, { key: "mentor", header: "Mentor", render: (p: InternProgram) => p.mentorName }, { key: "duration", header: "Duration", render: (p: InternProgram) => `${p.durationWeeks} weeks` }, { key: "stipend", header: "Stipend", render: (p: InternProgram) => formatCurrency(p.stipend) + "/mo" }, { key: "capacity", header: "Enrollment", render: (p: InternProgram) => (
                <div className="flex items-center gap-2">
                  <div className="w-16 bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-cyan-500"
                      style={{ width: `${Math.min(100, (p.enrolledCount / p.maxCapacity) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400">{p.enrolledCount}/{p.maxCapacity}</span>
                </div>
              )}, { key: "status", header: "Status", render: (p: InternProgram) => (
                <Badge color={PROGRAM_STATUS_COLORS[p.status] as any || "slate"}>{p.status}</Badge>
              )},
            ]}
            data={programs}
            keyExtractor={(p: InternProgram) => p.id}
            emptyMessage="No programs created. Click 'New Program' to create one."
          />

          {/* Create Program Modal */}
          {showCreateProgram && (
            <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create Intern Program</h2>
                <div className="space-y-3">
                  <Input label="Program Name" value={programForm.name} onChange={(e) => setProgramForm({ ...programForm, name: e.target.value })} placeholder="Summer Intern Program 2026" />
                  <Select
                    label="Department"
                    options={["Engineering", "Design", "Marketing", "HR", "Finance", "Operations", "QA"].map((d) => ({ value: d, label: d }))}
                    value={programForm.department}
                    onChange={(e) => setProgramForm({ ...programForm, department: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Duration (weeks)" type="number" value={programForm.durationWeeks} onChange={(e) => setProgramForm({ ...programForm, durationWeeks: e.target.value })} />
                    <Input label="Max Capacity" type="number" value={programForm.maxCapacity} onChange={(e) => setProgramForm({ ...programForm, maxCapacity: e.target.value })} />
                  </div>
                  <Input label="Mentor Employee ID" value={programForm.mentorId} onChange={(e) => setProgramForm({ ...programForm, mentorId: e.target.value })} placeholder="emp-xxx" />
                  <Input label="Monthly Stipend (₹)" type="number" value={programForm.stipend} onChange={(e) => setProgramForm({ ...programForm, stipend: e.target.value })} />
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Description (optional)</label>
                    <textarea
                      value={programForm.description}
                      onChange={(e) => setProgramForm({ ...programForm, description: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm text-slate-200"
                      rows={3}
                      placeholder="Program objectives and expectations..."
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <Button variant="outline" onClick={() => setShowCreateProgram(false)}>Cancel</Button>
                  <Button onClick={handleCreateProgram} loading={loading}>Create Program</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active Interns Tab */}
      {activeTab === "interns" && (
        <Card>
          <CardHeader
            title="Active Interns"
            subtitle={`${activeInterns.length} interns currently active`}
            actions={<Button onClick={() => setShowEnrollForm(true)}>+ Enroll Intern</Button>}
          />

          <DataTable
            columns={[{ key: "internName", header: "Intern", render: (i: InternRecord) => (
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{i.internName}</p>
                  <p className="text-xs text-slate-500">{i.employeeCode}</p>
                </Card>
              )}, { key: "programName", header: "Program", render: (i: InternRecord) => i.programName }, { key: "mentorName", header: "Mentor", render: (i: InternRecord) => i.mentorName }, { key: "progress", header: "Progress", render: (i: InternRecord) => (
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                      style={{ width: `${i.progressPercent || 0}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400">{i.progressPercent || 0}%</span>
                </div>
              )}, { key: "week", header: "Week", render: (i: InternRecord) => i.weekNumber && i.totalWeeks ? `${i.weekNumber}/${i.totalWeeks}` : "—" }, { key: "score", header: "Score", render: (i: InternRecord) => (
                <span className={`text-sm font-bold ${
                  (i.avgScore || 0) >= 4 ? "text-emerald-600 dark:text-emerald-400" :
                  (i.avgScore || 0) >= 3 ? "text-amber-600 dark:text-amber-400" :
                  (i.avgScore || 0) > 0 ? "text-red-600 dark:text-red-400" : "text-slate-500"
                }`}>
                  {i.avgScore ? i.avgScore.toFixed(1) : "—"}
                </span>
              )}, { key: "status", header: "Status", render: (i: InternRecord) => (
                <Badge color={INTERN_STATUS_COLORS[i.status] as any || "slate"}>{i.status}</Badge>
              )}, { key: "actions", header: "", render: (i: InternRecord) => (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => {
                    setEvalInternId(i.internId);
                    setShowEvalForm(true);
                  }}>
                    Evaluate
                  </Button>
                  {i.status === "ACTIVE" && (
                    <Button size="sm" variant="outline" onClick={() => handleGenerateCertificate(i.internId)}>
                      Certificate
                    </Button>
                  )}
                  {i.avgScore && i.avgScore >= 4 && i.status === "ACTIVE" && (
                    <Button size="sm" onClick={() => {
                      setConvertId(i.internId);
                      setShowConvertForm(true);
                    }}>
                      Convert
                    </Button>
                  )}
                </div>
              )},
            ]}
            data={interns}
            keyExtractor={(i: InternRecord) => i.internId}
            emptyMessage="No interns enrolled yet."
          />

          {/* Enroll Modal */}
          {showEnrollForm && (
            <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Enroll Intern</h2>
                <div className="space-y-3">
                  <Input label="User ID" value={enrollForm.userId} onChange={(e) => setEnrollForm({ ...enrollForm, userId: e.target.value })} placeholder="user-xxx" />
                  <Select
                    label="Program"
                    options={programs.filter((p) => p.status === "ACTIVE" && p.enrolledCount < p.maxCapacity).map((p) => ({
                      value: p.id,
                      label: `${p.name} (${p.enrolledCount}/${p.maxCapacity})`,
                    }))}
                    value={enrollForm.programId}
                    onChange={(e) => setEnrollForm({ ...enrollForm, programId: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <Button variant="outline" onClick={() => setShowEnrollForm(false)}>Cancel</Button>
                  <Button onClick={handleEnrollIntern} loading={loading}>Enroll</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evaluate Tab */}
      {activeTab === "evaluations" && (
        <Card>
          <CardHeader title="Intern Evaluations" subtitle="Submit performance evaluation for interns" />

          {!showEvalForm ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-400 mb-4">Select an intern to evaluate:</p>
              {activeInterns.map((intern) => (
                <div key={intern.internId} className="flex items-center justify-between bg-white dark:bg-slate-800/30 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm text-slate-900 dark:text-white font-medium">{intern.internName}</p>
                    <p className="text-xs text-slate-500">{intern.programName} · Week {intern.weekNumber || "?"}/{intern.totalWeeks || "?"}</p>
                  </Card>
                  <Button size="sm" onClick={() => { setEvalInternId(intern.internId); setShowEvalForm(true); }}>
                    Evaluate
                  </Button>
                </div>
              ))}
              {activeInterns.length === 0 && <p className="text-sm text-slate-500 py-4">No active interns to evaluate.</p>}
            </div>
          ) : (
            <div className="max-w-lg mx-auto space-y-4">
              <p className="text-sm text-slate-400">Evaluating intern: <span className="text-slate-900 dark:text-white font-medium">{evalInternId}</span></p>

              {(Object.keys(evalScores) as Array<keyof EvaluationScores>).map((key) => (
                <div key={key}>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-slate-400 capitalize">{key.replace(/([A-Z])/g, " $1")}</label>
                    <span className="text-xs text-slate-900 dark:text-white font-medium">{evalScores[key]}/5</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={evalScores[key]}
                    onChange={(e) => setEvalScores({ ...evalScores, [key]: Number(e.target.value) })}
                    className="w-full accent-brand-500"
                  />
                </div>
              ))}

              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Feedback</label>
                <textarea
                  value={evalFeedback}
                  onChange={(e) => setEvalFeedback(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm text-slate-200"
                  rows={4}
                  placeholder="Provide detailed feedback on the intern's performance..."
                />
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Overall Score</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {(Object.values(evalScores).reduce((a, b) => a + b, 0) / Object.values(evalScores).length).toFixed(2)}/5
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowEvalForm(false)}>Cancel</Button>
                <Button onClick={handleEvaluate} loading={loading} disabled={!evalFeedback}>Submit Evaluation</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions Tab */}
      {activeTab === "actions" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Convert to Full-Time */}
          <Card>
            <CardHeader title="Convert to Full-Time" subtitle="Promote top interns to permanent employees" />
            <div className="space-y-3">
              {activeInterns
                .filter((i) => (i.avgScore || 0) >= 3.5)
                .map((intern) => (
                  <div key={intern.internId} className="flex items-center justify-between bg-white dark:bg-slate-800/30 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm text-slate-900 dark:text-white font-medium">{intern.internName}</p>
                      <p className="text-xs text-slate-500">Score: {intern.avgScore?.toFixed(1) || "—"}</p>
                    </Card>
                    <Button size="sm" onClick={() => { setConvertId(intern.internId); setShowConvertForm(true); }}>
                      Convert
                    </Button>
                  </div>
                ))}
              {activeInterns.filter((i) => (i.avgScore || 0) >= 3.5).length === 0 && (
                <p className="text-sm text-slate-500 py-4">No interns eligible for conversion (score &gt;= 3.5 required).</p>
              )}
            </div>
          </div>

          {/* Generate Certificates */}
          <Card>
            <CardHeader title="Generate Certificates" subtitle="Create completion certificates for interns" />
            <div className="space-y-3">
              {interns.map((intern) => (
                <div key={intern.internId} className="flex items-center justify-between bg-white dark:bg-slate-800/30 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm text-slate-900 dark:text-white font-medium">{intern.internName}</p>
                    <p className="text-xs text-slate-500">{intern.programName}</p>
                  </Card>
                  <Button size="sm" variant="outline" onClick={() => handleGenerateCertificate(intern.internId)} loading={loading}>
                    Generate
                  </Button>
                </div>
              ))}
              {interns.length === 0 && <p className="text-sm text-slate-500 py-4">No interns to generate certificates for.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Convert Modal */}
      {showConvertForm && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Convert to Full-Time</h2>
            <p className="text-xs text-slate-500 mb-4">This will promote the intern to a permanent employee with a new employee code and offer letter.</p>
            <div className="space-y-3">
              <Input label="Designation" value={convertForm.designation} onChange={(e) => setConvertForm({ ...convertForm, designation: e.target.value })} placeholder="SDE-1" />
              <Input label="Annual CTC (₹)" type="number" value={convertForm.baseSalary} onChange={(e) => setConvertForm({ ...convertForm, baseSalary: e.target.value })} />
              <Input label="Department (optional)" value={convertForm.department} onChange={(e) => setConvertForm({ ...convertForm, department: e.target.value })} placeholder="Same as intern program" />
            </div>
            <div className="bg-emerald-900/20 border border-emerald-900/30 rounded-lg p-3 mt-4 text-xs text-emerald-600 dark:text-emerald-400">
              <p className="font-medium mb-1">This action will:</p>
              <ul className="list-disc list-inside space-y-0.5 text-emerald-300/80">
                <li>Change employment type from INTERN to FULL_TIME</li>
                <li>Generate a new employee code (CIR-EMP-XXX)</li>
                <li>Generate an offer letter</li>
                <li>Send congratulations notification</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={() => setShowConvertForm(false)}>Cancel</Button>
              <Button onClick={handleConvertToFullTime} loading={loading}>Confirm Conversion</Button>
            </div>
          </div>
        </div>
      )}

      {/* Eval Modal (standalone) */}
      {showEvalForm && activeTab !== "evaluations" && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md my-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Evaluate Intern</h2>
            {(Object.keys(evalScores) as Array<keyof EvaluationScores>).map((key) => (
              <div key={key} className="mb-3">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-slate-400 capitalize">{key.replace(/([A-Z])/g, " $1")}</label>
                  <span className="text-xs text-slate-900 dark:text-white font-medium">{evalScores[key]}/5</span>
                </div>
                <input type="range" min={1} max={5} value={evalScores[key]} onChange={(e) => setEvalScores({ ...evalScores, [key]: Number(e.target.value) })} className="w-full accent-brand-500" />
              </div>
            ))}
            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Feedback</label>
              <textarea value={evalFeedback} onChange={(e) => setEvalFeedback(e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm text-slate-200" rows={3} placeholder="Feedback..." />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowEvalForm(false)}>Cancel</Button>
              <Button onClick={handleEvaluate} loading={loading} disabled={!evalFeedback}>Submit</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
