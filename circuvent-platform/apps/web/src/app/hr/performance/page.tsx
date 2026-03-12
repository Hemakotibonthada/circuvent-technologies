"use client";

import React, { useState, useMemo } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, StatCard, Badge, Button, Input, Select, Tabs, DataTable } from "@/components/ui";
import { formatDate, formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api-client";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface ReviewCycle {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  totalParticipants: number;
  completedReviews: number;
}

interface PerformanceReport {
  cycleId: string;
  cycleName: string;
  totalParticipants: number;
  completionRate: number;
  avgRating: number;
  byDepartment: Array<{ department: string; avgRating: number; totalReviews: number; highPerformers: number; lowPerformers: number }>;
  topPerformers: Array<{ name: string; department: string; rating: number }>;
  bottomPerformers: Array<{ name: string; department: string; rating: number }>;
  ratingDistribution: Array<{ range: string; count: number; percentage: number }>;
  promotionRecommendations: number;
}

interface BellCurveData {
  totalReviews: number;
  mean: number;
  standardDeviation: number;
  distribution: Array<{ rating: string; range: string; count: number; percentage: number; employees: Array<{ id: string; name: string; rating: number }> }>;
}

interface PIPRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  areas: string[];
  timeline: number;
  startDate: string;
  endDate: string;
  status: string;
}

interface PromotionRecommendation {
  id: string;
  employeeId: string;
  employeeName: string;
  currentDesignation: string;
  newDesignation: string;
  currentSalary: number;
  newSalary: number;
  incrementPercent: number;
  status: string;
}

const CYCLE_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
  ACTIVE: "bg-green-900/50 text-green-600 dark:text-green-400",
  COMPLETED: "bg-blue-900/50 text-blue-600 dark:text-blue-400",
  CANCELLED: "bg-red-900/50 text-red-600 dark:text-red-400",
};

const BELL_CURVE_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6"];

// ══════════════════════════════════════════════════════════════
// Page Component
// ══════════════════════════════════════════════════════════════

export default function PerformanceManagementPage() {
  const { token } = useAuth();
  const { data: cycles, refetch: refetchCycles } = useApi<ReviewCycle[]>("/hr/performance/cycles");
  const [activeTab, setActiveTab] = useState("overview");

  // Create cycle form
  const [showCreateCycle, setShowCreateCycle] = useState(false);
  const [cycleForm, setCycleForm] = useState({
    name: "",
    type: "ANNUAL",
    startDate: "",
    endDate: "",
    targetRoles: "ENGINEER",
  });

  // Selected cycle
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [bellCurve, setBellCurve] = useState<BellCurveData | null>(null);
  const [pips, setPIPs] = useState<PIPRecord[]>([]);
  const [promotions, setPromotions] = useState<PromotionRecommendation[]>([]);
  const [loading, setLoading] = useState(false);

  // PIP form
  const [showPIPForm, setShowPIPForm] = useState(false);
  const [pipForm, setPIPForm] = useState({
    employeeId: "",
    areas: "",
    goals: "",
    timeline: "90",
  });

  // Calibrate
  const [calibrateResult, setCalibrateResult] = useState<any>(null);

  const tabs = [
    { id: "overview", label: "Overview" }, { id: "cycles", label: "Review Cycles" }, { id: "bellcurve", label: "Bell Curve" }, { id: "performers", label: "Performers" }, { id: "pip", label: "PIPs" }, { id: "promotions", label: "Promotions" }, { id: "calibration", label: "Calibration" },
  ];

  const handleCreateCycle = async () => {
    if (!cycleForm.name || !cycleForm.startDate || !cycleForm.endDate) return;
    setLoading(true);
    const res = await api.post("/hr/performance/cycles", {
      name: cycleForm.name,
      type: cycleForm.type,
      startDate: cycleForm.startDate,
      endDate: cycleForm.endDate,
      targetRoles: cycleForm.targetRoles.split(",").map((r) => r.trim()),
    }, token || undefined);

    if (res.success) {
      setShowCreateCycle(false);
      setCycleForm({ name: "", type: "ANNUAL", startDate: "", endDate: "", targetRoles: "ENGINEER" });
      refetchCycles();
    }
    setLoading(false);
  };

  const loadReport = async (cycleId: string) => {
    setSelectedCycleId(cycleId);
    setLoading(true);
    const [reportRes, bellRes] = await Promise.all([
      api.get<PerformanceReport>(`/hr/performance/report/${cycleId}`, token || undefined),
      api.get<BellCurveData>(`/hr/performance/bell-curve/${cycleId}`, token || undefined),
    ]);
    if (reportRes.success && reportRes.data) setReport(reportRes.data);
    if (bellRes.success && bellRes.data) setBellCurve(bellRes.data);
    setLoading(false);
  };

  const loadPIPs = async () => {
    const res = await api.get<PIPRecord[]>("/hr/performance/pips", token || undefined);
    if (res.success && res.data) setPIPs(res.data);
  };

  const loadPromotions = async () => {
    const res = await api.get<PromotionRecommendation[]>("/hr/performance/promotions", token || undefined);
    if (res.success && res.data) setPromotions(res.data);
  };

  const handleCreatePIP = async () => {
    if (!pipForm.employeeId || !pipForm.areas) return;
    setLoading(true);
    const goals = pipForm.goals.split("\n").filter(Boolean).map((g) => {
      const parts = g.split("|");
      return { goal: parts[0]?.trim() || g, metric: parts[1]?.trim() || "Completion", target: parts[2]?.trim() || "100%" };
    });

    await api.post("/hr/performance/pip", {
      employeeId: pipForm.employeeId,
      areas: pipForm.areas.split(",").map((a) => a.trim()),
      goals,
      timeline: Number(pipForm.timeline),
    }, token || undefined);

    setShowPIPForm(false);
    loadPIPs();
    setLoading(false);
  };

  const handleCalibrate = async () => {
    if (!selectedCycleId) return;
    setLoading(true);
    const res = await api.post<any>(`/hr/performance/calibrate/${selectedCycleId}`, {}, token || undefined);
    if (res.success && res.data) setCalibrateResult(res.data);
    setLoading(false);
  };

  // Active cycle stats
  const activeCycles = useMemo(() => (cycles || []).filter((c) => c.status === "ACTIVE"), [cycles]);
  const totalParticipants = useMemo(
    () => (cycles || []).reduce((sum, c) => sum + c.totalParticipants, 0),
    [cycles]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance Management"
        subtitle="Review cycles, ratings, PIPs, and promotions"
        breadcrumbs={[{ label: "HR & Payroll", href: "/hr" }, { label: "Performance" }]}
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard title="Total Cycles" value={cycles?.length || 0} color="blue" />
        <StatCard title="Active Cycles" value={activeCycles.length} color="green" />
        <StatCard title="Total Participants" value={totalParticipants} color="purple" />
        <StatCard title="Avg Rating" value={report?.avgRating?.toFixed(2) || "—"} color="cyan" />
        <StatCard title="PIPs Active" value={pips.filter((p) => p.status === "ACTIVE").length} color="amber" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={(t) => {
        setActiveTab(t);
        if (t === "pip") loadPIPs();
        if (t === "promotions") loadPromotions();
      }} />

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Recent Review Cycles" />
            <div className="space-y-3">
              {(cycles || []).slice(0, 5).map((cycle) => (
                <div key={cycle.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-900 dark:text-white font-medium">{cycle.name}</p>
                    <p className="text-xs text-slate-500">{cycle.type} · {formatDate(cycle.startDate)} — {formatDate(cycle.endDate)}</p>
                  </Card>
                  <div className="flex items-center gap-2">
                    <Badge color={cycle.status === "ACTIVE" ? "green" : cycle.status === "COMPLETED" ? "blue" : "slate"}>
                      {cycle.status}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => { loadReport(cycle.id); setActiveTab("bellcurve"); }}>
                      View
                    </Button>
                  </div>
                </div>
              ))}
              {(!cycles || cycles.length === 0) && <p className="text-sm text-slate-500">No review cycles created yet.</p>}
            </div>
          </div>

          {report && (
            <Card>
              <CardHeader title="Rating Distribution" subtitle={report.cycleName} />
              <div className="space-y-2">
                {report.ratingDistribution.map((d) => (
                  <div key={d.range} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-20">{d.range}</span>
                    <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                        style={{ width: `${d.percentage}%` }}
                      />
                    </Card>
                    <span className="text-xs text-slate-600 dark:text-slate-300 w-16 text-right">{d.count} ({d.percentage}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review Cycles Tab */}
      {activeTab === "cycles" && (
        <Card>
          <CardHeader
            title="Review Cycles"
            subtitle="Create and manage performance review cycles"
            actions={<Button onClick={() => setShowCreateCycle(true)}>+ New Cycle</Button>}
          />

          {/* Cycle list */}
          <DataTable
            columns={[{ key: "name", header: "Name", render: (c: ReviewCycle) => <span className="font-medium text-slate-900 dark:text-white">{c.name}</span> }, { key: "type", header: "Type", render: (c: ReviewCycle) => <Badge color="blue">{c.type}</Badge> }, { key: "period", header: "Period", render: (c: ReviewCycle) => <span className="text-xs text-slate-400">{formatDate(c.startDate)} — {formatDate(c.endDate)}</span> }, { key: "participants", header: "Participants", render: (c: ReviewCycle) => c.totalParticipants }, { key: "completed", header: "Completed", render: (c: ReviewCycle) => `${c.completedReviews}/${c.totalParticipants}` }, { key: "status", header: "Status", render: (c: ReviewCycle) => (
                <span className={`px-2 py-0.5 text-xs rounded ${CYCLE_STATUS_COLORS[c.status] || "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>{c.status}</span>
              )}, { key: "actions", header: "", render: (c: ReviewCycle) => (
                <Button size="sm" variant="outline" onClick={() => loadReport(c.id)}>Report</Button>
              )},
            ]}
            data={cycles || []}
            keyExtractor={(c: ReviewCycle) => c.id}
            emptyMessage="No review cycles. Create one to get started."
          />

          {/* Create Cycle Modal */}
          {showCreateCycle && (
            <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create Review Cycle</h2>
                <div className="space-y-3">
                  <Input label="Cycle Name" value={cycleForm.name} onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })} placeholder="Annual Review 2026" />
                  <Select
                    label="Type"
                    options={[
                      { value: "QUARTERLY", label: "Quarterly" },
                      { value: "HALF_YEARLY", label: "Half Yearly" },
                      { value: "ANNUAL", label: "Annual" },
                      { value: "PROBATION", label: "Probation" },
                    ]}
                    value={cycleForm.type}
                    onChange={(e) => setCycleForm({ ...cycleForm, type: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Start Date" type="date" value={cycleForm.startDate} onChange={(e) => setCycleForm({ ...cycleForm, startDate: e.target.value })} />
                    <Input label="End Date" type="date" value={cycleForm.endDate} onChange={(e) => setCycleForm({ ...cycleForm, endDate: e.target.value })} />
                  </Card>
                  <Input label="Target Roles (comma-separated)" value={cycleForm.targetRoles} onChange={(e) => setCycleForm({ ...cycleForm, targetRoles: e.target.value })} placeholder="ENGINEER, MANAGER" />
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <Button variant="outline" onClick={() => setShowCreateCycle(false)}>Cancel</Button>
                  <Button onClick={handleCreateCycle} loading={loading}>Create Cycle</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bell Curve Tab */}
      {activeTab === "bellcurve" && (
        <Card>
          <CardHeader
            title="Bell Curve Distribution"
            subtitle={bellCurve ? `${bellCurve.totalReviews} reviews · Mean: ${bellCurve.mean} · SD: ${bellCurve.standardDeviation}` : "Select a cycle to view"}
          />
          {bellCurve ? (
            <div className="space-y-6">
              {/* Visual Bell Curve */}
              <div className="flex items-end gap-2 justify-center h-48">
                {bellCurve.distribution.map((bucket, i) => {
                  const maxCount = Math.max(...bellCurve.distribution.map((d) => d.count), 1);
                  const height = maxCount > 0 ? Math.max(8, (bucket.count / maxCount) * 160) : 8;
                  return (
                    <div key={bucket.rating} className="flex flex-col items-center gap-1">
                      <span className="text-xs text-slate-900 dark:text-white font-bold">{bucket.count}</span>
                      <div
                        className="w-16 lg:w-24 rounded-t-md transition-all"
                        style={{ height: `${height}px`, backgroundColor: BELL_CURVE_COLORS[i] || "#666" }}
                      />
                      <span className="text-[10px] text-slate-400 text-center leading-tight">{bucket.rating}</span>
                      <span className="text-[10px] text-slate-600">{bucket.range}</span>
                    </Card>
                  );
                })}
              </div>

              {/* Detailed Table */}
              <div className="space-y-3">
                {bellCurve.distribution.map((bucket) => (
                  <div key={bucket.rating} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{bucket.rating}</span>
                      <span className="text-xs text-slate-400">{bucket.count} employees ({bucket.percentage}%)</span>
                    </div>
                    {bucket.employees.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {bucket.employees.slice(0, 8).map((emp) => (
                          <span key={emp.id} className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded px-1.5 py-0.5">
                            {emp.name} ({emp.rating.toFixed(1)})
                          </span>
                        ))}
                        {bucket.employees.length > 8 && (
                          <span className="text-[10px] text-slate-500">+{bucket.employees.length - 8} more</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 py-6 text-center">Select a review cycle from the Cycles tab to view the bell curve.</p>
          )}
        </div>
      )}

      {/* Performers Tab */}
      {activeTab === "performers" && report && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* High Performers */}
          <Card>
            <CardHeader title="🏆 Top Performers" subtitle={`Top ${report.topPerformers.length} employees`} />
            <div className="space-y-2">
              {report.topPerformers.map((p, i) => (
                <div key={i} className="flex items-center gap-3 bg-emerald-900/10 rounded-lg px-3 py-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-slate-900 dark:text-white font-medium">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.department}</p>
                  </Card>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{p.rating.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Low Performers */}
          <Card>
            <CardHeader title="⚠️ Needs Improvement" subtitle="Employees requiring attention" />
            <div className="space-y-2">
              {report.bottomPerformers.map((p, i) => (
                <div key={i} className="flex items-center gap-3 bg-red-900/10 rounded-lg px-3 py-2">
                  <span className="w-6 h-6 rounded-full bg-red-900/50 text-red-600 dark:text-red-400 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-slate-900 dark:text-white font-medium">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.department}</p>
                  </Card>
                  <span className="text-sm font-bold text-red-600 dark:text-red-400">{p.rating.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Department Performance */}
          <Card className="lg:col-span-2">
            <CardHeader title="Department-wise Performance" />
            <DataTable
              columns={[{ key: "department", header: "Department", render: (d: any) => <span className="font-medium text-slate-900 dark:text-white">{d.department}</span> }, { key: "avgRating", header: "Avg Rating", render: (d: any) => (
                  <span className={`font-bold ${d.avgRating >= 4 ? "text-emerald-600 dark:text-emerald-400" : d.avgRating >= 3 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                    {d.avgRating.toFixed(2)}
                  </span>
                )}, { key: "totalReviews", header: "Reviews", render: (d: any) => d.totalReviews }, { key: "highPerformers", header: "High Performers", render: (d: any) => <Badge color="green">{d.highPerformers}</Badge> }, { key: "lowPerformers", header: "Low Performers", render: (d: any) => <Badge color={d.lowPerformers > 0 ? "red" : "slate"}>{d.lowPerformers}</Badge> },
              ]}
              data={report.byDepartment}
              keyExtractor={(d: any) => d.department}
              emptyMessage="No department data."
            />
          </Card>
        </div>
      )}

      {activeTab === "performers" && !report && (
        <Card>
          <p className="text-sm text-slate-500 py-6 text-center">Select and load a review cycle to view performers.</p>
        </Card>
      )}

      {/* PIPs Tab */}
      {activeTab === "pip" && (
        <Card>
          <CardHeader
            title="Performance Improvement Plans"
            subtitle="Active and historical PIPs"
            actions={<Button onClick={() => setShowPIPForm(true)}>+ Create PIP</Button>}
          />

          <DataTable
            columns={[{ key: "employeeName", header: "Employee", render: (p: PIPRecord) => <span className="font-medium text-slate-900 dark:text-white">{p.employeeName}</span> }, { key: "areas", header: "Areas", render: (p: PIPRecord) => (
                <div className="flex flex-wrap gap-1">{p.areas.map((a) => <Badge key={a} color="amber">{a}</Badge>)}</div>
              )}, { key: "timeline", header: "Timeline", render: (p: PIPRecord) => `${p.timeline} days` }, { key: "period", header: "Period", render: (p: PIPRecord) => `${formatDate(p.startDate)} — ${formatDate(p.endDate)}` }, { key: "status", header: "Status", render: (p: PIPRecord) => (
                <Badge color={p.status === "ACTIVE" ? "amber" : p.status === "COMPLETED" ? "green" : p.status === "FAILED" ? "red" : "slate"}>
                  {p.status}
                </Badge>
              )},
            ]}
            data={pips}
            keyExtractor={(p: PIPRecord) => p.id}
            emptyMessage="No PIPs created."
          />

          {/* PIP Form Modal */}
          {showPIPForm && (
            <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create PIP</h2>
                <div className="space-y-3">
                  <Input label="Employee ID" value={pipForm.employeeId} onChange={(e) => setPIPForm({ ...pipForm, employeeId: e.target.value })} placeholder="emp-xxx" />
                  <Input label="Areas (comma-separated)" value={pipForm.areas} onChange={(e) => setPIPForm({ ...pipForm, areas: e.target.value })} placeholder="Communication, Technical Skills" />
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Goals (one per line, format: Goal|Metric|Target)</label>
                    <textarea
                      value={pipForm.goals}
                      onChange={(e) => setPIPForm({ ...pipForm, goals: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm text-slate-200"
                      rows={4}
                      placeholder="Improve code review quality|Review accuracy|95%&#10;Complete communication training|Certificate|Completed"
                    />
                  </Card>
                  <Select
                    label="Timeline (days)"
                    options={[
                      { value: "30", label: "30 days" },
                      { value: "60", label: "60 days" },
                      { value: "90", label: "90 days" },
                      { value: "120", label: "120 days" },
                    ]}
                    value={pipForm.timeline}
                    onChange={(e) => setPIPForm({ ...pipForm, timeline: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <Button variant="outline" onClick={() => setShowPIPForm(false)}>Cancel</Button>
                  <Button onClick={handleCreatePIP} loading={loading}>Create PIP</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Promotions Tab */}
      {activeTab === "promotions" && (
        <Card>
          <CardHeader title="Promotion Recommendations" subtitle="Pending and approved promotions" />
          <DataTable
            columns={[{ key: "employeeName", header: "Employee", render: (p: PromotionRecommendation) => <span className="font-medium text-slate-900 dark:text-white">{p.employeeName}</span> }, { key: "current", header: "Current", render: (p: PromotionRecommendation) => (
                <div><p className="text-xs text-slate-400">{p.currentDesignation}</p><p className="text-xs text-slate-500">{formatCurrency(p.currentSalary)}</p></div>
              )}, { key: "proposed", header: "Proposed", render: (p: PromotionRecommendation) => (
                <div><p className="text-xs text-slate-900 dark:text-white font-medium">{p.newDesignation}</p><p className="text-xs text-green-600 dark:text-green-400">{formatCurrency(p.newSalary)}</p></div>
              )}, { key: "increment", header: "Increment", render: (p: PromotionRecommendation) => <Badge color="green">{p.incrementPercent}%</Badge> }, { key: "status", header: "Status", render: (p: PromotionRecommendation) => (
                <Badge color={p.status === "APPROVED" ? "green" : p.status === "PENDING" ? "amber" : "red"}>{p.status}</Badge>
              )},
            ]}
            data={promotions}
            keyExtractor={(p: PromotionRecommendation) => p.id}
            emptyMessage="No promotion recommendations."
          />
        </Card>
      )}

      {/* Calibration Tab */}
      {activeTab === "calibration" && (
        <Card>
          <CardHeader
            title="Rating Calibration"
            subtitle="Normalize ratings across departments to ensure fairness"
            actions={
              <Button onClick={handleCalibrate} loading={loading} disabled={!selectedCycleId}>
                Run Calibration
              </Button>
            }
          />

          {!selectedCycleId && (
            <p className="text-sm text-slate-500 py-4">Select a review cycle from the Cycles tab first, then run calibration.</p>
          )}

          {calibrateResult && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{calibrateResult.adjustments}</p>
                  <p className="text-xs text-slate-500">Adjustments Made</p>
                </Card>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{calibrateResult.avgBefore}</p>
                  <p className="text-xs text-slate-500">Avg Before</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{calibrateResult.avgAfter}</p>
                  <p className="text-xs text-slate-500">Avg After</p>
                </div>
              </div>

              <DataTable
                columns={[{ key: "department", header: "Department", render: (d: any) => <span className="font-medium text-slate-900 dark:text-white">{d.department}</span> }, { key: "avgBefore", header: "Avg Before", render: (d: any) => d.avgBefore.toFixed(2) }, { key: "avgAfter", header: "Avg After", render: (d: any) => (
                    <span className={d.avgAfter > d.avgBefore ? "text-green-600 dark:text-green-400" : d.avgAfter < d.avgBefore ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}>
                      {d.avgAfter.toFixed(2)}
                    </span>
                  )}, { key: "adjustments", header: "Adjustments", render: (d: any) => <Badge color={d.adjustments > 0 ? "amber" : "slate"}>{d.adjustments}</Badge> },
                ]}
                data={calibrateResult.byDepartment}
                keyExtractor={(d: any) => d.department}
                emptyMessage="No department data."
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
