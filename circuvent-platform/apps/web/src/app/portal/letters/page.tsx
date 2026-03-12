"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/utils";
import Link from "next/link";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface Letter {
  id: string;
  letterType: string;
  subject: string;
  recipientName: string;
  htmlContent: string;
  pdfUrl?: string;
  status: string;
  sentAt?: string;
  acknowledgedAt?: string;
  createdAt: string;
  metadata?: Record<string, any>;
  template?: { name: string; category: string };
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  DRAFT: { color: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300", label: "Draft", icon: "📝" },
  GENERATED: { color: "bg-blue-900/50 text-blue-400", label: "Generated", icon: "📄" },
  SENT: { color: "bg-amber-900/50 text-amber-400", label: "Sent", icon: "📨" },
  ACKNOWLEDGED: { color: "bg-emerald-900/50 text-emerald-400", label: "Acknowledged", icon: "✅" },
  SIGNED: { color: "bg-green-900/50 text-green-400", label: "Signed", icon: "✍️" },
  REJECTED: { color: "bg-red-900/50 text-red-400", label: "Rejected", icon: "❌" },
  REVOKED: { color: "bg-slate-50 dark:bg-slate-800 text-slate-500", label: "Revoked", icon: "🚫" },
};

const LETTER_TYPE_LABELS: Record<string, string> = {
  OFFER_LETTER: "Offer Letter",
  APPOINTMENT_LETTER: "Appointment Letter",
  CALL_LETTER: "Call Letter",
  EXPERIENCE_LETTER: "Experience Certificate",
  RELIEVING_LETTER: "Relieving Letter",
  INTERNSHIP_LETTER: "Internship Offer",
  INTERNSHIP_COMPLETION: "Internship Completion",
  PROBATION_CONFIRMATION: "Probation Confirmation",
  PROMOTION_LETTER: "Promotion Letter",
  TRANSFER_LETTER: "Transfer Letter",
  WARNING_LETTER: "Warning Letter",
  TERMINATION_LETTER: "Termination Letter",
  SALARY_REVISION_LETTER: "Salary Revision",
  BONUS_LETTER: "Bonus Letter",
  NDA_AGREEMENT: "NDA Agreement",
  NON_COMPETE: "Non-Compete Agreement",
  EMPLOYMENT_VERIFICATION: "Employment Verification",
  ADDRESS_PROOF: "Address Proof",
  REFERENCE_LETTER: "Reference Letter",
  APPRECIATION_LETTER: "Appreciation Letter",
  CUSTOM: "Custom Letter",
};

const LETTER_TYPE_ICONS: Record<string, string> = {
  OFFER_LETTER: "💼",
  APPOINTMENT_LETTER: "📋",
  CALL_LETTER: "📞",
  EXPERIENCE_LETTER: "🏆",
  RELIEVING_LETTER: "🎓",
  INTERNSHIP_LETTER: "🎒",
  SALARY_REVISION_LETTER: "💰",
  PROMOTION_LETTER: "🚀",
  BONUS_LETTER: "🎁",
  WARNING_LETTER: "⚠️",
  TERMINATION_LETTER: "🔴",
  NDA_AGREEMENT: "🔒",
  REFERENCE_LETTER: "📜",
};

// ══════════════════════════════════════════════════════════════
// Page Component
// ══════════════════════════════════════════════════════════════

export default function PortalLettersPage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null);
  const [showViewer, setShowViewer] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "acknowledged">("all");
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => { if (token) loadEmployee(); }, [token]);
  useEffect(() => { if (employee) loadLetters(); }, [employee]);

  const loadEmployee = async () => {
    const res = await api.get<any[]>("/hr/employees", token!);
    if (res.success && res.data) {
      setEmployee(res.data.find((e: any) => e.user?.email === user?.email) || res.data[0]);
    }
  };

  const loadLetters = async () => {
    if (!employee) return;
    setLoading(true);
    const res = await api.get<Letter[]>(`/hr/letters/employee/${employee.id}`, token!);
    if (res.success && res.data) setLetters(res.data);
    setLoading(false);
  };

  const filteredLetters = useMemo(() => {
    switch (activeTab) {
      case "pending":
        return letters.filter((l) => ["SENT", "GENERATED"].includes(l.status));
      case "acknowledged":
        return letters.filter((l) => ["ACKNOWLEDGED", "SIGNED"].includes(l.status));
      default:
        return letters;
    }
  }, [letters, activeTab]);

  const stats = useMemo(() => ({
    total: letters.length,
    pending: letters.filter((l) => ["SENT", "GENERATED"].includes(l.status)).length,
    acknowledged: letters.filter((l) => l.status === "ACKNOWLEDGED" || l.status === "SIGNED").length,
  }), [letters]);

  const handleAcknowledge = async (letterId: string) => {
    setAcknowledging(true);
    await api.patch(`/hr/letters/${letterId}/acknowledge`, {}, token!);
    await loadLetters();
    setAcknowledging(false);
    if (selectedLetter?.id === letterId) {
      setSelectedLetter((prev) => prev ? { ...prev, status: "ACKNOWLEDGED", acknowledgedAt: new Date().toISOString() } : null);
    }
  };

  const openViewer = (letter: Letter) => {
    setSelectedLetter(letter);
    setShowViewer(true);
  };

  // Group letters by year-month for timeline
  const timeline = useMemo(() => {
    const grouped = new Map<string, Letter[]>();
    for (const letter of [...letters].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())) {
      const d = new Date(letter.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(letter);
    }
    return Array.from(grouped.entries()).map(([month, items]) => ({
      month,
      label: new Date(items[0].createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      items,
    }));
  }, [letters]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-400 hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">📧 My Letters</h1>
          <p className="text-sm text-slate-500">View and acknowledge your HR letters</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Total Letters", value: stats.total, color: "text-slate-900 dark:text-white" },
          { label: "Pending Action", value: stats.pending, color: "text-amber-400" },
          { label: "Acknowledged", value: stats.acknowledged, color: "text-emerald-400" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white shadow-sm rounded dark:bg-slate-900-lg p-1 w-fit">
        {(["all", "pending", "acknowledged"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition ${
              activeTab === tab ? "bg-brand-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === "pending" && stats.pending > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-500 text-slate-900 dark:text-white rounded-full">{stats.pending}</span>
            )}
          </button>
        ))}
      </div>

      {/* Letters Timeline */}
      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : filteredLetters.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">
          No letters found
        </div>
      ) : (
        <div className="space-y-6">
          {timeline.map((group) => {
            const visibleLetters = group.items.filter((l) =>
              activeTab === "all" ? true :
              activeTab === "pending" ? ["SENT", "GENERATED"].includes(l.status) :
              ["ACKNOWLEDGED", "SIGNED"].includes(l.status)
            );
            if (visibleLetters.length === 0) return null;

            return (
              <div key={group.month}>
                <h3 className="text-xs text-slate-500 font-medium mb-2 uppercase">{group.label}</h3>
                <div className="space-y-2">
                  {visibleLetters.map((letter) => (
                    <div
                      key={letter.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-slate-700 transition cursor-pointer"
                      onClick={() => openViewer(letter)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <span className="text-2xl">{LETTER_TYPE_ICONS[letter.letterType] || "📄"}</span>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium text-white">
                                {LETTER_TYPE_LABELS[letter.letterType] || letter.letterType.replace(/_/g, " ")}
                              </span>
                              <span className={`px-2 py-0.5 text-[10px] rounded ${STATUS_CONFIG[letter.status]?.color || "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>
                                {STATUS_CONFIG[letter.status]?.label || letter.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400">{letter.subject}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {letter.sentAt ? `Sent ${formatDate(letter.sentAt)}` : `Created ${formatDate(letter.createdAt)}`}
                              {letter.acknowledgedAt && ` · Acknowledged ${formatDate(letter.acknowledgedAt)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {letter.status === "SENT" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAcknowledge(letter.id); }}
                              disabled={acknowledging}
                              className="px-3 py-1 text-xs bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                            >
                              Acknowledge
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); openViewer(letter); }}
                            className="px-3 py-1 text-xs text-brand-400 border border-brand-900/50 rounded-lg hover:bg-brand-900/20"
                          >
                            View
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Letter Viewer Modal */}
      {showViewer && selectedLetter && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl my-8 overflow-hidden">
            {/* Toolbar */}
            <div className="bg-white dark:bg-slate-900 px-6 py-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">
                  {LETTER_TYPE_LABELS[selectedLetter.letterType] || selectedLetter.letterType}
                </h3>
                <p className="text-xs text-slate-400">{selectedLetter.subject}</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedLetter.status === "SENT" && (
                  <button
                    onClick={() => handleAcknowledge(selectedLetter.id)}
                    disabled={acknowledging}
                    className="px-3 py-1.5 text-xs bg-emerald-600 text-slate-900 dark:text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {acknowledging ? "..." : "Acknowledge"}
                  </button>
                )}
                {selectedLetter.pdfUrl && (
                  <a
                    href={selectedLetter.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-xs text-brand-400 border border-brand-400/30 rounded-lg hover:bg-brand-900/20"
                  >
                    Download PDF
                  </a>
                )}
                <button
                  onClick={() => setShowViewer(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Close ✕
                </button>
              </div>
            </div>

            {/* Letter content */}
            <div
              className="p-0 min-h-[500px]"
              dangerouslySetInnerHTML={{ __html: selectedLetter.htmlContent }}
            />

            {/* Status footer */}
            <div className="bg-slate-50 px-6 py-3 border-t flex items-center justify-between text-xs text-slate-500">
              <span>
                Status: <strong className="text-slate-700">{STATUS_CONFIG[selectedLetter.status]?.label || selectedLetter.status}</strong>
              </span>
              <span>
                {selectedLetter.sentAt && `Sent: ${formatDateTime(selectedLetter.sentAt)}`}
                {selectedLetter.acknowledgedAt && ` · Ack: ${formatDateTime(selectedLetter.acknowledgedAt)}`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
