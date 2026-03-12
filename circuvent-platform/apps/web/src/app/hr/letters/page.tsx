"use client";

import React, { useState, useCallback } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, StatCard, Badge, Button,
  DataTable, Modal, Input, Select, Tabs,
} from "@/components/ui";
import { api } from "@/lib/api-client";
import { formatDate, timeAgo } from "@/lib/utils";

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

/* ══════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════ */

interface LetterDashboardStats {
  totalLetters: number;
  sentThisMonth: number;
  pendingAcknowledgment: number;
  activeTemplates: number;
}

interface Letter {
  id: string;
  recipientId: string;
  recipientName: string;
  recipientEmail?: string;
  letterType: string;
  status: string;
  sentAt?: string;
  createdAt: string;
  acknowledgedAt?: string;
  templateId?: string;
  metadata?: Record<string, unknown>;
}

interface LetterTemplate {
  id: string;
  name: string;
  type: string;
  category: string;
  description?: string;
  isActive: boolean;
  letterCount: number;
  createdAt: string;
}

interface Recipient {
  id: string;
  name: string;
  email: string;
  type: "employee" | "candidate";
  department?: string;
  designation?: string;
}

interface BatchRecord {
  id: string;
  templateId: string;
  templateName: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: string;
  createdAt: string;
}

/* ══════════════════════════════════════════════════════════════
   Constants
   ══════════════════════════════════════════════════════════════ */

const STATUS_COLORS: Record<string, BadgeColor> = {
  DRAFT: "slate",
  GENERATED: "blue",
  SENT: "purple",
  ACKNOWLEDGED: "green",
  SIGNED: "emerald",
  REJECTED: "red",
  REVOKED: "orange",
};

const LETTER_TYPES = [
  { id: "offer", label: "Offer Letter", icon: "📄", description: "Extend official job offers to selected candidates" }, { id: "call", label: "Call Letter", icon: "📞", description: "Invite candidates for interviews or assessments" }, { id: "experience", label: "Experience Letter", icon: "🏅", description: "Certify work experience for departing employees" }, { id: "relieving", label: "Relieving Letter", icon: "🔓", description: "Formally relieve employees from their duties" }, { id: "internship", label: "Internship Letter", icon: "🎓", description: "Onboard interns with role and stipend details" }, { id: "appointment", label: "Appointment Letter", icon: "📋", description: "Confirm official appointment after joining" }, { id: "promotion", label: "Promotion Letter", icon: "🚀", description: "Announce promotions with new designation and pay" }, { id: "warning", label: "Warning Letter", icon: "⚠️", description: "Issue formal warnings for policy violations" }, { id: "salary-revision", label: "Salary Revision", icon: "💰", description: "Communicate revised compensation details" }, { id: "appreciation", label: "Appreciation", icon: "⭐", description: "Recognize outstanding contributions and performance" }, { id: "internship-completion", label: "Internship Completion", icon: "🎉", description: "Certify successful completion of internship" }, { id: "employment-verification", label: "Employment Verification", icon: "✅", description: "Verify employment details for third-party requests" },
] as const;

type LetterTypeKey = (typeof LETTER_TYPES)[number]["key"];

const LETTER_TYPE_OPTIONS = LETTER_TYPES.map((lt) => ({ value: lt.key, label: lt.label }));

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "GENERATED", label: "Generated" },
  { value: "SENT", label: "Sent" },
  { value: "ACKNOWLEDGED", label: "Acknowledged" },
  { value: "SIGNED", label: "Signed" },
  { value: "REJECTED", label: "Rejected" },
  { value: "REVOKED", label: "Revoked" },
];

const INTERVIEW_TYPE_OPTIONS = [
  { value: "in-person", label: "In-Person" },
  { value: "virtual", label: "Virtual" },
];

const PERFORMANCE_RATING_OPTIONS = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "satisfactory", label: "Satisfactory" },
  { value: "needs-improvement", label: "Needs Improvement" },
];

const CLEARANCE_STATUS_OPTIONS = [
  { value: "cleared", label: "Cleared" },
  { value: "pending", label: "Pending" },
  { value: "partial", label: "Partial" },
];

const TABS = [
  { id: "quick-send", label: "Quick Send" }, { id: "all-letters", label: "All Letters" }, { id: "templates", label: "Templates" }, { id: "batch", label: "Batch Operations" },
];

/* ══════════════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════════════ */

export default function LetterManagementPage() {
  const { token, isAdmin, isHR } = useAuth();
  const canManage = isAdmin || isHR;

  /* ── tabs ──────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState("quick-send");

  /* ── API data ─────────────────────────────────────────── */
  const { data: stats } = useApi<LetterDashboardStats>("/hr/letters/dashboard/stats");
  const { data: letters, loading: lettersLoading, refetch: refetchLetters } = useApi<Letter[]>("/hr/letters");
  const { data: templates, loading: templatesLoading, refetch: refetchTemplates } = useApi<LetterTemplate[]>("/hr/letters/templates");
  const { data: recipients } = useApi<Recipient[]>("/hr/letters/recipients");
  const { data: batchHistory, loading: batchLoading, refetch: refetchBatch } = useApi<BatchRecord[]>("/hr/letters/batch-history");

  /* ── UI state ─────────────────────────────────────────── */
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /* Quick-send modal state */
  const [quickSendType, setQuickSendType] = useState<LetterTypeKey | null>(null);
  const [quickSendData, setQuickSendData] = useState<Record<string, string>>({});

  /* All-letters filters */
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  /* View letter modal */
  const [viewLetter, setViewLetter] = useState<Letter | null>(null);

  /* Batch state */
  const [batchTemplateId, setBatchTemplateId] = useState("");
  const [batchRecipientIds, setBatchRecipientIds] = useState<string[]>([]);

  /* ── helpers ──────────────────────────────────────────── */
  const flash = useCallback((type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  const recipientList = recipients || [];
  const employees = recipientList.filter((r) => r.type === "employee");
  const candidates = recipientList.filter((r) => r.type === "candidate");
  const allRecipientOptions = recipientList.map((r) => ({ value: r.id, label: `${r.name} (${r.email})` }));
  const employeeOptions = employees.map((r) => ({ value: r.id, label: `${r.name} (${r.email})` }));
  const candidateOptions = candidates.map((r) => ({ value: r.id, label: `${r.name} (${r.email})` }));

  const updateField = (key: string, value: string) => {
    setQuickSendData((prev) => ({ ...prev, [key]: value }));
  };

  /* ══════════════════════════════════════════════════════════
     Quick Send — open modal for a letter type
     ══════════════════════════════════════════════════════════ */
  const openQuickSend = (type: LetterTypeKey) => {
    setQuickSendData({});
    setQuickSendType(type);
  };

  const closeQuickSend = () => {
    setQuickSendType(null);
    setQuickSendData({});
  };

  const handleQuickSend = async () => {
    if (!quickSendType) return;
    setSubmitting(true);
    const res = await api.post(`/hr/letters/quick/${quickSendType}`, quickSendData, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", `${LETTER_TYPES.find((lt) => lt.key === quickSendType)?.label || "Letter"} sent successfully!`);
      closeQuickSend();
      refetchLetters();
    } else {
      flash("error", res.error || "Failed to send letter");
    }
  };

  /* ══════════════════════════════════════════════════════════
     All Letters — actions
     ══════════════════════════════════════════════════════════ */
  const handleResend = async (letter: Letter) => {
    setSubmitting(true);
    const res = await api.post(`/hr/letters/${letter.id}/resend`, {}, token || undefined);
    setSubmitting(false);
    if (res.success) { flash("success", "Letter resent successfully"); refetchLetters(); }
    else flash("error", res.error || "Failed to resend");
  };

  const handleRevoke = async (letter: Letter) => {
    setSubmitting(true);
    const res = await api.post(`/hr/letters/${letter.id}/revoke`, {}, token || undefined);
    setSubmitting(false);
    if (res.success) { flash("success", "Letter revoked"); refetchLetters(); }
    else flash("error", res.error || "Failed to revoke");
  };

  /* ══════════════════════════════════════════════════════════
     Templates — actions
     ══════════════════════════════════════════════════════════ */
  const handleSeedTemplates = async () => {
    setSubmitting(true);
    const res = await api.post("/hr/letters/seed-templates", {}, token || undefined);
    setSubmitting(false);
    if (res.success) { flash("success", "Default letter templates seeded successfully"); refetchTemplates(); }
    else flash("error", res.error || "Failed to seed templates");
  };

  /* ══════════════════════════════════════════════════════════
     Batch — actions
     ══════════════════════════════════════════════════════════ */
  const toggleBatchRecipient = (id: string) => {
    setBatchRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  };

  const selectAllRecipients = () => {
    if (batchRecipientIds.length === recipientList.length) {
      setBatchRecipientIds([]);
    } else {
      setBatchRecipientIds(recipientList.map((r) => r.id));
    }
  };

  const handleBatchSend = async () => {
    if (!batchTemplateId || batchRecipientIds.length === 0) {
      flash("error", "Select a template and at least one recipient");
      return;
    }
    setSubmitting(true);
    const res = await api.post("/hr/letters/batch-send", {
      templateId: batchTemplateId,
      recipientIds: batchRecipientIds,
    }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", `Batch sent to ${batchRecipientIds.length} recipients`);
      setBatchTemplateId("");
      setBatchRecipientIds([]);
      refetchBatch();
      refetchLetters();
    } else {
      flash("error", res.error || "Batch send failed");
    }
  };

  /* ══════════════════════════════════════════════════════════
     Filtered letters
     ══════════════════════════════════════════════════════════ */
  const filteredLetters = (letters || []).filter((l) => {
    if (filterType && l.letterType !== filterType) return false;
    if (filterStatus && l.status !== filterStatus) return false;
    return true;
  });

  /* ══════════════════════════════════════════════════════════
     DataTable columns for All Letters
     ══════════════════════════════════════════════════════════ */
  const letterColumns = [
    {
      id: "recipientName",
      header: "Recipient",
      render: (l: Letter) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{l.recipientName}</p>
          {l.recipientEmail && <p className="text-xs text-slate-500">{l.recipientEmail}</p>}
        </div>
      ),
    }, { key: "letterType",
      header: "Letter Type",
      render: (l: Letter) => {
        const lt = LETTER_TYPES.find((t) => t.key === l.letterType);
        return (
          <span className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            <span>{lt?.icon || "📄"}</span>
            <span>{lt?.label || l.letterType}</span>
          </span>
        );
      },
    }, { key: "status",
      header: "Status",
      render: (l: Letter) => (
        <Badge color={STATUS_COLORS[l.status] || "slate"}>
          {l.status}
        </Badge>
      ),
    }, { key: "sentAt",
      header: "Sent",
      render: (l: Letter) =>
        l.sentAt ? (
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{formatDate(l.sentAt)}</p>
            <p className="text-xs text-slate-500">{timeAgo(l.sentAt)}</p>
          </div>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        ),
    }, { key: "actions",
      header: "",
      render: (l: Letter) => (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setViewLetter(l)}>
            View
          </Button>
          {(l.status === "SENT" || l.status === "GENERATED") && (
            <Button size="sm" variant="outline" onClick={() => handleResend(l)} loading={submitting}>
              Resend
            </Button>
          )}
          {l.status !== "REVOKED" && l.status !== "REJECTED" && l.status !== "DRAFT" && (
            <Button size="sm" variant="ghost" onClick={() => handleRevoke(l)}>
              Revoke
            </Button>
          )}
        </div>
      ),
    },
  ];

  /* ══════════════════════════════════════════════════════════
     Quick Send modal content per letter type
     ══════════════════════════════════════════════════════════ */
  const renderQuickSendFields = () => {
    if (!quickSendType) return null;

    switch (quickSendType) {
      /* ─── Offer Letter ───────────────────────────────── */
      case "offer":
        return (
          <div className="space-y-4">
            <Select
              label="Candidate"
              options={[{ value: "", label: "Select candidate..." }, ...candidateOptions]}
              value={quickSendData.recipientId || ""}
              onChange={(e) => updateField("recipientId", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Designation"
                placeholder="Software Engineer"
                value={quickSendData.designation || ""}
                onChange={(e) => updateField("designation", e.target.value)}
              />
              <Input
                label="Department"
                placeholder="Engineering"
                value={quickSendData.department || ""}
                onChange={(e) => updateField("department", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Annual Salary (CTC)"
                placeholder="1200000"
                type="number"
                value={quickSendData.salary || ""}
                onChange={(e) => updateField("salary", e.target.value)}
              />
              <Input
                label="Joining Date"
                type="date"
                value={quickSendData.joiningDate || ""}
                onChange={(e) => updateField("joiningDate", e.target.value)}
              />
            </div>
          </div>
        );

      /* ─── Call Letter ────────────────────────────────── */
      case "call":
        return (
          <div className="space-y-4">
            <Select
              label="Candidate"
              options={[{ value: "", label: "Select candidate..." }, ...candidateOptions]}
              value={quickSendData.recipientId || ""}
              onChange={(e) => updateField("recipientId", e.target.value)}
            />
            <Input
              label="Position"
              placeholder="Senior Frontend Developer"
              value={quickSendData.position || ""}
              onChange={(e) => updateField("position", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Interview Date"
                type="date"
                value={quickSendData.interviewDate || ""}
                onChange={(e) => updateField("interviewDate", e.target.value)}
              />
              <Input
                label="Interview Time"
                type="time"
                value={quickSendData.interviewTime || ""}
                onChange={(e) => updateField("interviewTime", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Venue / Meeting Link"
                placeholder="Conference Room A / Zoom link"
                value={quickSendData.venue || ""}
                onChange={(e) => updateField("venue", e.target.value)}
              />
              <Select
                label="Interview Type"
                options={[{ value: "", label: "Select type..." }, ...INTERVIEW_TYPE_OPTIONS]}
                value={quickSendData.interviewType || ""}
                onChange={(e) => updateField("interviewType", e.target.value)}
              />
            </div>
          </div>
        );

      /* ─── Experience Letter ──────────────────────────── */
      case "experience":
        return (
          <div className="space-y-4">
            <Select
              label="Employee"
              options={[{ value: "", label: "Select employee..." }, ...employeeOptions]}
              value={quickSendData.recipientId || ""}
              onChange={(e) => updateField("recipientId", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Last Working Date"
                type="date"
                value={quickSendData.lastWorkingDate || ""}
                onChange={(e) => updateField("lastWorkingDate", e.target.value)}
              />
              <Select
                label="Performance Rating"
                options={[{ value: "", label: "Select rating..." }, ...PERFORMANCE_RATING_OPTIONS]}
                value={quickSendData.performanceRating || ""}
                onChange={(e) => updateField("performanceRating", e.target.value)}
              />
            </div>
          </div>
        );

      /* ─── Relieving Letter ───────────────────────────── */
      case "relieving":
        return (
          <div className="space-y-4">
            <Select
              label="Employee"
              options={[{ value: "", label: "Select employee..." }, ...employeeOptions]}
              value={quickSendData.recipientId || ""}
              onChange={(e) => updateField("recipientId", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Last Working Date"
                type="date"
                value={quickSendData.lastWorkingDate || ""}
                onChange={(e) => updateField("lastWorkingDate", e.target.value)}
              />
              <Select
                label="Clearance Status"
                options={[{ value: "", label: "Select status..." }, ...CLEARANCE_STATUS_OPTIONS]}
                value={quickSendData.clearanceStatus || ""}
                onChange={(e) => updateField("clearanceStatus", e.target.value)}
              />
            </div>
          </div>
        );

      /* ─── Internship Letter ──────────────────────────── */
      case "internship":
        return (
          <div className="space-y-4">
            <Select
              label="Candidate / Intern"
              options={[{ value: "", label: "Select candidate..." }, ...candidateOptions]}
              value={quickSendData.recipientId || ""}
              onChange={(e) => updateField("recipientId", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Role"
                placeholder="Frontend Intern"
                value={quickSendData.role || ""}
                onChange={(e) => updateField("role", e.target.value)}
              />
              <Input
                label="Department"
                placeholder="Engineering"
                value={quickSendData.department || ""}
                onChange={(e) => updateField("department", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Duration"
                placeholder="6 months"
                value={quickSendData.duration || ""}
                onChange={(e) => updateField("duration", e.target.value)}
              />
              <Input
                label="Monthly Stipend"
                placeholder="25000"
                type="number"
                value={quickSendData.stipend || ""}
                onChange={(e) => updateField("stipend", e.target.value)}
              />
              <Input
                label="Start Date"
                type="date"
                value={quickSendData.startDate || ""}
                onChange={(e) => updateField("startDate", e.target.value)}
              />
            </div>
            <Input
              label="Mentor Name"
              placeholder="Assigned mentor for the intern"
              value={quickSendData.mentor || ""}
              onChange={(e) => updateField("mentor", e.target.value)}
            />
          </div>
        );

      /* ─── Generic: appointment, promotion, warning, salary-revision, appreciation, internship-completion, employment-verification ── */
      default:
        return (
          <div className="space-y-4">
            <Select
              label="Recipient"
              options={[{ value: "", label: "Select recipient..." }, ...allRecipientOptions]}
              value={quickSendData.recipientId || ""}
              onChange={(e) => updateField("recipientId", e.target.value)}
            />
            {quickSendType === "appointment" && (
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Designation"
                  placeholder="Senior Developer"
                  value={quickSendData.designation || ""}
                  onChange={(e) => updateField("designation", e.target.value)}
                />
                <Input
                  label="Effective Date"
                  type="date"
                  value={quickSendData.effectiveDate || ""}
                  onChange={(e) => updateField("effectiveDate", e.target.value)}
                />
              </div>
            )}
            {quickSendType === "promotion" && (
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="New Designation"
                  placeholder="Tech Lead"
                  value={quickSendData.newDesignation || ""}
                  onChange={(e) => updateField("newDesignation", e.target.value)}
                />
                <Input
                  label="Revised Salary"
                  type="number"
                  placeholder="1800000"
                  value={quickSendData.revisedSalary || ""}
                  onChange={(e) => updateField("revisedSalary", e.target.value)}
                />
              </div>
            )}
            {quickSendType === "warning" && (
              <div className="space-y-3">
                <Input
                  label="Subject / Reason"
                  placeholder="Policy violation – attendance"
                  value={quickSendData.reason || ""}
                  onChange={(e) => updateField("reason", e.target.value)}
                />
                <Select
                  label="Severity"
                  options={[
                    { value: "", label: "Select severity..." },
                    { value: "verbal", label: "Verbal Warning" },
                    { value: "written", label: "Written Warning" },
                    { value: "final", label: "Final Warning" },
                  ]}
                  value={quickSendData.severity || ""}
                  onChange={(e) => updateField("severity", e.target.value)}
                />
              </div>
            )}
            {quickSendType === "salary-revision" && (
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Previous Salary"
                  type="number"
                  placeholder="1200000"
                  value={quickSendData.previousSalary || ""}
                  onChange={(e) => updateField("previousSalary", e.target.value)}
                />
                <Input
                  label="Revised Salary"
                  type="number"
                  placeholder="1500000"
                  value={quickSendData.revisedSalary || ""}
                  onChange={(e) => updateField("revisedSalary", e.target.value)}
                />
                <Input
                  label="Effective Date"
                  type="date"
                  value={quickSendData.effectiveDate || ""}
                  onChange={(e) => updateField("effectiveDate", e.target.value)}
                />
                <Input
                  label="Increment %"
                  placeholder="25"
                  value={quickSendData.incrementPercent || ""}
                  onChange={(e) => updateField("incrementPercent", e.target.value)}
                />
              </div>
            )}
            {quickSendType === "appreciation" && (
              <div className="space-y-3">
                <Input
                  label="Achievement / Reason"
                  placeholder="Outstanding Q4 delivery performance"
                  value={quickSendData.achievement || ""}
                  onChange={(e) => updateField("achievement", e.target.value)}
                />
                <Input
                  label="Award / Recognition (optional)"
                  placeholder="Employee of the Quarter"
                  value={quickSendData.award || ""}
                  onChange={(e) => updateField("award", e.target.value)}
                />
              </div>
            )}
            {quickSendType === "internship-completion" && (
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Internship Start Date"
                  type="date"
                  value={quickSendData.startDate || ""}
                  onChange={(e) => updateField("startDate", e.target.value)}
                />
                <Input
                  label="Internship End Date"
                  type="date"
                  value={quickSendData.endDate || ""}
                  onChange={(e) => updateField("endDate", e.target.value)}
                />
                <Select
                  label="Performance Rating"
                  options={[{ value: "", label: "Select rating..." }, ...PERFORMANCE_RATING_OPTIONS]}
                  value={quickSendData.performanceRating || ""}
                  onChange={(e) => updateField("performanceRating", e.target.value)}
                />
                <Input
                  label="Project / Department"
                  placeholder="Frontend – Web Platform"
                  value={quickSendData.project || ""}
                  onChange={(e) => updateField("project", e.target.value)}
                />
              </div>
            )}
            {quickSendType === "employment-verification" && (
              <div className="space-y-3">
                <Input
                  label="Requesting Organization"
                  placeholder="Bank of India"
                  value={quickSendData.requestingOrg || ""}
                  onChange={(e) => updateField("requestingOrg", e.target.value)}
                />
                <Input
                  label="Purpose"
                  placeholder="Home loan application"
                  value={quickSendData.purpose || ""}
                  onChange={(e) => updateField("purpose", e.target.value)}
                />
              </div>
            )}
          </div>
        );
    }
  };

  const quickSendModalTitle = quickSendType
    ? `Send ${LETTER_TYPES.find((lt) => lt.key === quickSendType)?.label || "Letter"}`
    : "Send Letter";

  const isQuickSendValid = !!quickSendData.recipientId;

  /* ══════════════════════════════════════════════════════════
     Stats
     ══════════════════════════════════════════════════════════ */
  const s = stats || { totalLetters: 0, sentThisMonth: 0, pendingAcknowledgment: 0, activeTemplates: 0 };

  /* ══════════════════════════════════════════════════════════
     Batch columns
     ══════════════════════════════════════════════════════════ */
  const batchColumns = [
    {
      id: "templateName",
      header: "Template",
      render: (b: BatchRecord) => <span className="font-medium text-slate-900 dark:text-white">{b.templateName}</span>,
    }, { key: "recipientCount",
      header: "Recipients",
      render: (b: BatchRecord) => <span className="text-sm text-slate-600 dark:text-slate-300">{b.recipientCount}</span>,
    }, { key: "sentCount",
      header: "Sent",
      render: (b: BatchRecord) => <Badge color="green">{b.sentCount}</Badge>,
    }, { key: "failedCount",
      header: "Failed",
      render: (b: BatchRecord) =>
        b.failedCount > 0 ? <Badge color="red">{b.failedCount}</Badge> : <span className="text-xs text-slate-600">0</span>,
    }, { key: "status",
      header: "Status",
      render: (b: BatchRecord) => (
        <Badge color={b.status === "COMPLETED" ? "green" : b.status === "PARTIAL" ? "amber" : b.status === "FAILED" ? "red" : "blue"}>
          {b.status}
        </Badge>
      ),
    }, { key: "createdAt",
      header: "Sent At",
      render: (b: BatchRecord) => (
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{formatDate(b.createdAt)}</p>
          <p className="text-xs text-slate-500">{timeAgo(b.createdAt)}</p>
        </div>
      ),
    },
  ];

  /* ══════════════════════════════════════════════════════════
     Template options for batch select
     ══════════════════════════════════════════════════════════ */
  const templateOptions = (templates || [])
    .filter((t) => t.isActive)
    .map((t) => ({ value: t.id, label: t.name }));

  /* ══════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-6">
      {/* ── Toast ──────────────────────────────────────── */}
      {feedback && (
        <div
          className={`fixed right-4 top-4 z-[100] rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all ${
            feedback.type === "success"
              ? "border border-green-200 dark:border-green-500/30 bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400"
              : "border border-red-200 dark:border-red-500/30 bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* ── Page Header ───────────────────────────────── */}
      <PageHeader
        title="Letter Management"
        subtitle="Create, send, and track HR letters for employees and candidates"
        breadcrumbs={[{ label: "HR & Payroll", href: "/hr" }, { label: "Letters" }]}
        actions={
          canManage ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleSeedTemplates} loading={submitting}>
                Seed Default Templates
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* ── Stats Row ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="Total Letters" value={s.totalLetters} color="blue" />
        <StatCard title="Sent This Month" value={s.sentThisMonth} color="purple" />
        <StatCard title="Pending Acknowledgment" value={s.pendingAcknowledgment} color="amber" />
        <StatCard title="Active Templates" value={s.activeTemplates} color="green" />
      </div>

      {/* ── Tabs ──────────────────────────────────────── */}
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* ════════════════════════════════════════════════
          TAB: Quick Send
         ════════════════════════════════════════════════ */}
      {activeTab === "quick-send" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">One-Click Letter Dispatch</h2>
              <p className="text-sm text-slate-400">Select a letter type to instantly compose and send</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {LETTER_TYPES.map((lt) => (
              <Card key={lt.key}>
                <div className="flex flex-col items-center p-4 text-center">
                  <span className="mb-2 text-3xl">{lt.icon}</span>
                  <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">{lt.label}</h3>
                  <p className="mb-4 text-xs leading-relaxed text-slate-500">{lt.description}</p>
                  <Button
                    size="sm"
                    onClick={() => openQuickSend(lt.key)}
                    disabled={!canManage}
                  >
                    Send
                  </Button>
                </Card>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB: All Letters
         ════════════════════════════════════════════════ */}
      {activeTab === "all-letters" && (
        <div className="space-y-4">
          {/* Filters */}
          <Card>
            <div className="flex flex-wrap items-end gap-4 p-4">
              <div className="min-w-[180px]">
                <Select
                  label="Letter Type"
                  options={[{ value: "", label: "All Types" }, ...LETTER_TYPE_OPTIONS]}
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                />
              </Card>
              <div className="min-w-[180px]">
                <Select
                  label="Status"
                  options={STATUS_OPTIONS}
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterType("");
                  setFilterStatus("");
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>

          {/* Data Table */}
          <Card>
            <DataTable
              columns={letterColumns}
              data={filteredLetters}
              keyExtractor={(l) => l.id}
              loading={lettersLoading}
              emptyMessage="No letters found. Use Quick Send to dispatch your first letter."
            />
          </Card>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB: Templates
         ════════════════════════════════════════════════ */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Letter Templates</h2>
              <p className="text-sm text-slate-400">Manage reusable letter templates for quick dispatch</p>
            </div>
            {canManage && (
              <Button onClick={handleSeedTemplates} variant="secondary" loading={submitting}>
                Seed Default Templates
              </Button>
            )}
          </div>

          {templatesLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : (templates || []).length === 0 ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="mb-3 text-4xl">📑</span>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No Templates Yet</h3>
                <p className="mb-4 text-sm text-slate-400">
                  Click &quot;Seed Default Templates&quot; to create standard HR letter templates.
                </p>
                <Button onClick={handleSeedTemplates} loading={submitting}>
                  Seed Default Templates
                </Button>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(templates || []).map((tmpl) => (
                <Card key={tmpl.id}>
                  <div className="p-4">
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{tmpl.name}</h3>
                        {tmpl.description && (
                          <p className="mt-0.5 text-xs text-slate-500">{tmpl.description}</p>
                        )}
                      </Card>
                      <Badge color={tmpl.isActive ? "green" : "slate"}>
                        {tmpl.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>

                    <div className="mb-3 flex flex-wrap gap-2">
                      <div className="flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800/50 px-2 py-1 text-xs text-slate-400">
                        <span>Type:</span>
                        <span className="font-medium text-slate-600 dark:text-slate-300">{tmpl.type}</span>
                      </div>
                      <div className="flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800/50 px-2 py-1 text-xs text-slate-400">
                        <span>Category:</span>
                        <span className="font-medium text-slate-600 dark:text-slate-300">{tmpl.category}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-3">
                      <span className="text-xs text-slate-500">
                        {tmpl.letterCount} letter{tmpl.letterCount !== 1 ? "s" : ""} sent
                      </span>
                      <span className="text-xs text-slate-600">{formatDate(tmpl.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB: Batch Operations
         ════════════════════════════════════════════════ */}
      {activeTab === "batch" && (
        <div className="space-y-6">
          {/* Batch Compose */}
          <Card>
            <div className="p-5">
              <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Batch Letter Dispatch</h2>
              <p className="mb-5 text-sm text-slate-400">
                Send letters to multiple recipients at once using a template
              </p>

              <div className="space-y-5">
                {/* Template selection */}
                <Select
                  label="Select Template"
                  options={[{ value: "", label: "Choose a template..." }, ...templateOptions]}
                  value={batchTemplateId}
                  onChange={(e) => setBatchTemplateId(e.target.value)}
                />

                {/* Recipient selection */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      Select Recipients ({batchRecipientIds.length} selected)
                    </label>
                    <Button variant="ghost" size="sm" onClick={selectAllRecipients}>
                      {batchRecipientIds.length === recipientList.length ? "Deselect All" : "Select All"}
                    </Button>
                  </Card>

                  <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/30">
                    {recipientList.length === 0 ? (
                      <p className="p-4 text-center text-sm text-slate-500">No recipients available</p>
                    ) : (
                      recipientList.map((r) => {
                        const selected = batchRecipientIds.includes(r.id);
                        return (
                          <button
                            key={r.id}
                            className={`flex w-full items-center gap-3 border-b border-slate-200 dark:border-slate-700/50 px-4 py-2.5 text-left transition-colors last:border-0 ${
                              selected ? "bg-brand-100 dark:bg-brand-500/10" : "hover:bg-slate-100 dark:bg-slate-700/30"
                            }`}
                            onClick={() => toggleBatchRecipient(r.id)}
                          >
                            <div
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                selected
                                  ? "border-brand-500 bg-brand-500 text-white"
                                  : "border-slate-600"
                              }`}
                            >
                              {selected && (
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-slate-900 dark:text-white">{r.name}</p>
                              <p className="text-xs text-slate-500">{r.email}</p>
                            </div>
                            <Badge color={r.type === "employee" ? "blue" : "cyan"}>
                              {r.type}
                            </Badge>
                            {r.department && (
                              <span className="text-xs text-slate-500">{r.department}</span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Send button */}
                <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4">
                  <p className="text-sm text-slate-500">
                    {batchRecipientIds.length > 0
                      ? `${batchRecipientIds.length} recipient${batchRecipientIds.length !== 1 ? "s" : ""} will receive the letter`
                      : "Select at least one recipient"}
                  </p>
                  <Button
                    onClick={handleBatchSend}
                    loading={submitting}
                    disabled={!batchTemplateId || batchRecipientIds.length === 0}
                  >
                    Send Batch ({batchRecipientIds.length})
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Batch History */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Batch History</h2>
            <Card>
              <DataTable
                columns={batchColumns}
                data={batchHistory || []}
                keyExtractor={(b) => b.id}
                loading={batchLoading}
                emptyMessage="No batch operations yet. Send your first batch above."
              />
            </Card>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          MODAL: Quick Send
         ════════════════════════════════════════════════ */}
      <Modal
        open={!!quickSendType}
        onClose={closeQuickSend}
        title={quickSendModalTitle}
        size="lg"
      >
        <div className="space-y-5">
          {/* Letter type badge */}
          {quickSendType && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
              <span className="text-xl">
                {LETTER_TYPES.find((lt) => lt.key === quickSendType)?.icon}
              </span>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {LETTER_TYPES.find((lt) => lt.key === quickSendType)?.label}
                </p>
                <p className="text-xs text-slate-500">
                  {LETTER_TYPES.find((lt) => lt.key === quickSendType)?.description}
                </p>
              </div>
            </div>
          )}

          {/* Dynamic fields */}
          {renderQuickSendFields()}

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={closeQuickSend}>
              Cancel
            </Button>
            <Button
              onClick={handleQuickSend}
              loading={submitting}
              disabled={!isQuickSendValid}
            >
              Send Now
            </Button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════
          MODAL: View Letter Details
         ════════════════════════════════════════════════ */}
      <Modal
        open={!!viewLetter}
        onClose={() => setViewLetter(null)}
        title="Letter Details"
        size="lg"
      >
        {viewLetter && (
          <div className="space-y-5">
            {/* Header info */}
            <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-white p- dark:bg-slate-800/304">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">Recipient</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">{viewLetter.recipientName}</p>
                  {viewLetter.recipientEmail && (
                    <p className="text-xs text-slate-400">{viewLetter.recipientEmail}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">Letter Type</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
                    {LETTER_TYPES.find((lt) => lt.key === viewLetter.letterType)?.label || viewLetter.letterType}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">Status</p>
                  <div className="mt-1">
                    <Badge color={STATUS_COLORS[viewLetter.status] || "slate"}>
                      {viewLetter.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">Created</p>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{formatDate(viewLetter.createdAt)}</p>
                </div>
                {viewLetter.sentAt && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">Sent</p>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{formatDate(viewLetter.sentAt)}</p>
                  </div>
                )}
                {viewLetter.acknowledgedAt && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">Acknowledged</p>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{formatDate(viewLetter.acknowledgedAt)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Metadata */}
            {viewLetter.metadata && Object.keys(viewLetter.metadata).length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Additional Details</h4>
                <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-white p- dark:bg-slate-800/304">
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(viewLetter.metadata).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-xs text-slate-500">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
              <Button variant="ghost" onClick={() => setViewLetter(null)}>
                Close
              </Button>
              {(viewLetter.status === "SENT" || viewLetter.status === "GENERATED") && (
                <Button
                  variant="outline"
                  onClick={() => {
                    handleResend(viewLetter);
                    setViewLetter(null);
                  }}
                >
                  Resend
                </Button>
              )}
              {viewLetter.status !== "REVOKED" && viewLetter.status !== "REJECTED" && viewLetter.status !== "DRAFT" && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    handleRevoke(viewLetter);
                    setViewLetter(null);
                  }}
                >
                  Revoke
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
