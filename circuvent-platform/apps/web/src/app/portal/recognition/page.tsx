"use client";

// ══════════════════════════════════════════════════════════════
// Employee Recognition Page — Kudos wall, give recognition,
// points balance, leaderboard, and recent activity.
// ══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

interface Recognition {
  id: string;
  fromName: string;
  fromDepartment: string;
  toName: string;
  toDepartment: string;
  category: string;
  message: string;
  points: number;
  reactions: number;
  createdAt: string;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  department: string;
  points: number;
  recognitionsReceived: number;
}

const RECOGNITION_CATEGORIES = [
  { value: "TEAMWORK", label: "🤝 Teamwork", points: 50 },
  { value: "INNOVATION", label: "💡 Innovation", points: 100 },
  { value: "LEADERSHIP", label: "👑 Leadership", points: 75 },
  { value: "CUSTOMER_FOCUS", label: "🎯 Customer Focus", points: 75 },
  { value: "GOING_EXTRA_MILE", label: "🚀 Going Extra Mile", points: 100 },
  { value: "MENTORSHIP", label: "📚 Mentorship", points: 50 },
  { value: "QUALITY", label: "⭐ Quality Work", points: 50 },
  { value: "PROBLEM_SOLVING", label: "🧩 Problem Solving", points: 75 },
];

const CATEGORY_ICONS: Record<string, string> = {
  TEAMWORK: "🤝", INNOVATION: "💡", LEADERSHIP: "👑",
  CUSTOMER_FOCUS: "🎯", GOING_EXTRA_MILE: "🚀", MENTORSHIP: "📚",
  QUALITY: "⭐", PROBLEM_SOLVING: "🧩",
};

export default function RecognitionPage() {
  const { token, user } = useAuth();
  const [recognitions, setRecognitions] = useState<Recognition[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myPoints, setMyPoints] = useState(0);
  const [myGiven, setMyGiven] = useState(0);
  const [myReceived, setMyReceived] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"wall" | "give" | "leaderboard" | "my">("wall");
  const [submitting, setSubmitting] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);

  const [kudosForm, setKudosForm] = useState({
    toEmployeeId: "",
    category: "TEAMWORK",
    message: "",
  });

  useEffect(() => {
    if (token) loadData();
  }, [token]);

  const loadData = async () => {
    setLoading(true);
    const [recogRes, leaderRes, myRes, empRes] = await Promise.all([
      api.get<Recognition[]>("/hr/recognition/feed", token!),
      api.get<LeaderboardEntry[]>("/hr/recognition/leaderboard", token!),
      api.get<any>("/hr/recognition/my", token!),
      api.get<any[]>("/hr/employees", token!),
    ]);

    if (recogRes.success && recogRes.data) {
      setRecognitions(recogRes.data);
    } else {
      // Sample data
      setRecognitions([
        { id: "r1", fromName: "Priya Sharma", fromDepartment: "Engineering", toName: "Rahul Verma", toDepartment: "Engineering", category: "TEAMWORK", message: "Amazing collaboration on the payment gateway integration! Your attention to detail saved us from a critical bug.", points: 50, reactions: 8, createdAt: new Date(Date.now() - 3600000).toISOString() }, { key: "r2", fromName: "Anita Deshmukh", fromDepartment: "HR", toName: "Sneha Reddy", toDepartment: "Engineering", category: "INNOVATION", message: "The new dashboard design is incredible! The user feedback has been overwhelmingly positive.", points: 100, reactions: 15, createdAt: new Date(Date.now() - 86400000).toISOString() }, { key: "r3", fromName: "Vikram Patel", fromDepartment: "Engineering", toName: "Amit Kumar", toDepartment: "Engineering", category: "GOING_EXTRA_MILE", message: "Stayed late to fix the production issue and documented everything for the team. True dedication!", points: 100, reactions: 12, createdAt: new Date(Date.now() - 172800000).toISOString() }, { key: "r4", fromName: "Raj Patel", fromDepartment: "Engineering", toName: "Anjali Nair", toDepartment: "Design", category: "QUALITY", message: "The UI components library you built is incredibly well-structured. Great work!", points: 50, reactions: 6, createdAt: new Date(Date.now() - 259200000).toISOString() }, { key: "r5", fromName: "Sonia Gupta", fromDepartment: "Product", toName: "Vikram Joshi", toDepartment: "DevOps", category: "PROBLEM_SOLVING", message: "Quick resolution of the CI/CD pipeline issues. The team was unblocked within an hour!", points: 75, reactions: 9, createdAt: new Date(Date.now() - 345600000).toISOString() },
      ]);
    }

    if (leaderRes.success && leaderRes.data) {
      setLeaderboard(leaderRes.data);
    } else {
      setLeaderboard([
        { rank: 1, name: "Amit Kumar", department: "Engineering", points: 450, recognitionsReceived: 12 },
        { rank: 2, name: "Sneha Reddy", department: "Engineering", points: 380, recognitionsReceived: 9 },
        { rank: 3, name: "Vikram Joshi", department: "DevOps", points: 325, recognitionsReceived: 8 },
        { rank: 4, name: "Anjali Nair", department: "Design", points: 275, recognitionsReceived: 7 },
        { rank: 5, name: "Rahul Verma", department: "Engineering", points: 250, recognitionsReceived: 6 },
        { rank: 6, name: "Priya Singh", department: "QA", points: 200, recognitionsReceived: 5 },
        { rank: 7, name: "Raj Patel", department: "Engineering", points: 175, recognitionsReceived: 4 },
        { rank: 8, name: "Sonia Gupta", department: "Product", points: 150, recognitionsReceived: 4 },
      ]);
    }

    if (myRes.success && myRes.data) {
      setMyPoints(myRes.data.totalPoints || 0);
      setMyGiven(myRes.data.given || 0);
      setMyReceived(myRes.data.received || 0);
    } else {
      setMyPoints(175);
      setMyGiven(6);
      setMyReceived(4);
    }

    if (empRes.success && empRes.data) {
      setEmployees(empRes.data);
    }

    setLoading(false);
  };

  const handleGiveKudos = async () => {
    if (!kudosForm.toEmployeeId || !kudosForm.message) return;
    setSubmitting(true);
    const selectedCategory = RECOGNITION_CATEGORIES.find((c) => c.value === kudosForm.category);
    const toEmployee = employees.find((e: any) => e.id === kudosForm.toEmployeeId);

    await api.post("/hr/recognition", {
      toEmployeeId: kudosForm.toEmployeeId,
      category: kudosForm.category,
      message: kudosForm.message,
      points: selectedCategory?.points || 50,
    }, token!);

    const newRecog: Recognition = {
      id: `r-${Date.now()}`,
      fromName: `${user?.firstName || ""} ${user?.lastName || ""}`.trim(),
      fromDepartment: "My Dept",
      toName: toEmployee ? `${toEmployee.user?.firstName || ""} ${toEmployee.user?.lastName || ""}`.trim() : "Colleague",
      toDepartment: toEmployee?.department || "",
      category: kudosForm.category,
      message: kudosForm.message,
      points: selectedCategory?.points || 50,
      reactions: 0,
      createdAt: new Date().toISOString(),
    };

    setRecognitions((prev) => [newRecog, ...prev]);
    setMyGiven((prev) => prev + 1);
    setKudosForm({ toEmployeeId: "", category: "TEAMWORK", message: "" });
    setSubmitting(false);
    setActiveTab("wall");
  };

  const handleReact = (recognitionId: string) => {
    setRecognitions((prev) =>
      prev.map((r) => (r.id === recognitionId ? { ...r, reactions: r.reactions + 1 } : r))
    );
    api.post(`/hr/recognition/${recognitionId}/react`, {}, token!);
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const rankMedal = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">🏆 Recognition</h1>
        </div>
      </div>

      {/* Points Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{myPoints}</p>
          <p className="text-xs text-slate-500">My Points</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{myReceived}</p>
          <p className="text-xs text-slate-500">Received</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{myGiven}</p>
          <p className="text-xs text-slate-500">Given</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50 p-1 mb-6">
        {(["wall", "give", "leaderboard", "my"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab ? "bg-brand-600 text-white" : "text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:bg-slate-800"
            }`}
          >
            {tab === "wall" && "🌟 "}
            {tab === "give" && "🎁 "}
            {tab === "leaderboard" && "🏅 "}
            {tab === "my" && "📬 "}
            {tab === "wall" ? "Wall" : tab === "give" ? "Give Kudos" : tab === "leaderboard" ? "Leaderboard" : "My Activity"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : (
        <>
          {/* Recognition Wall */}
          {activeTab === "wall" && (
            <div className="space-y-4">
              {recognitions.map((r) => (
                <div key={r.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-brand-200 dark:bg-brand-500/20 flex items-center justify-center text-lg">
                      {CATEGORY_ICONS[r.category] || "🌟"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{r.fromName}</span>
                        <span className="text-xs text-slate-500">recognized</span>
                        <span className="text-sm font-medium text-brand-600 dark:text-brand-400">{r.toName}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500">{r.fromDepartment}</span>
                        <span className="text-xs text-slate-600">·</span>
                        <span className="text-xs text-slate-500">{formatTimeAgo(r.createdAt)}</span>
                        <span className="text-xs text-slate-600">·</span>
                        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">+{r.points} pts</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{r.message}</p>
                      <div className="flex items-center gap-3 mt-3">
                        <button
                          onClick={() => handleReact(r.id)}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-amber-600 dark:text-amber-400 transition-colors"
                        >
                          👏 {r.reactions}
                        </button>
                        <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                          {r.category.replace(/_/g, " ")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {recognitions.length === 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
                  <p className="text-4xl mb-2">🌟</p>
                  <p className="text-sm text-slate-400">No recognitions yet. Be the first to give kudos!</p>
                </div>
              )}
            </div>
          )}

          {/* Give Kudos */}
          {activeTab === "give" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-w-lg mx-auto">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">🎁 Give Kudos</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-500">Colleague *</label>
                  <select
                    value={kudosForm.toEmployeeId}
                    onChange={(e) => setKudosForm({ ...kudosForm, toEmployeeId: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm mt-1"
                  >
                    <option value="">Select a colleague</option>
                    {employees.map((emp: any) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.user?.firstName} {emp.user?.lastName} — {emp.department}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1.5 block">Category *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {RECOGNITION_CATEGORIES.map((cat) => (
                      <button
                        key={cat.value}
                        onClick={() => setKudosForm({ ...kudosForm, category: cat.value })}
                        className={`rounded-lg border p-2.5 text-left text-sm transition-colors ${
                          kudosForm.category === cat.value
                            ? "border-brand-500 bg-brand-100 dark:bg-brand-500/10 text-slate-900 dark:text-white"
                            : "border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        <span>{cat.label}</span>
                        <span className="block text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">+{cat.points} pts</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Message *</label>
                  <textarea
                    value={kudosForm.message}
                    onChange={(e) => setKudosForm({ ...kudosForm, message: e.target.value })}
                    rows={3}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm mt-1"
                    placeholder="Share what they did and why it mattered..."
                  />
                </div>
                <button
                  onClick={handleGiveKudos}
                  disabled={submitting || !kudosForm.toEmployeeId || !kudosForm.message}
                  className="w-full px-4 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50"
                >
                  {submitting ? "Sending..." : "🎉 Send Kudos"}
                </button>
              </div>
            </div>
          )}

          {/* Leaderboard */}
          {activeTab === "leaderboard" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">🏅 Recognition Leaderboard</h2>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {leaderboard.map((entry) => (
                  <div
                    key={entry.rank}
                    className={`flex items-center gap-4 p-4 ${entry.rank <= 3 ? "bg-slate-50 dark:bg-slate-800/30" : ""}`}
                  >
                    <span className="text-xl w-8 text-center">{rankMedal(entry.rank)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{entry.name}</p>
                      <p className="text-xs text-slate-500">{entry.department}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{entry.points}</p>
                      <p className="text-[10px] text-slate-500">{entry.recognitionsReceived} received</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* My Activity */}
          {activeTab === "my" && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Recognitions Received</h3>
                <div className="space-y-2">
                  {recognitions
                    .filter((r) => r.toName.includes(user?.firstName || "___"))
                    .map((r) => (
                      <div key={r.id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-900 dark:text-white">From: {r.fromName}</span>
                          <span className="text-xs text-amber-600 dark:text-amber-400">+{r.points} pts</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{r.message}</p>
                        <span className="text-[10px] text-slate-500">{formatTimeAgo(r.createdAt)}</span>
                      </div>
                    ))}
                  {recognitions.filter((r) => r.toName.includes(user?.firstName || "___")).length === 0 && (
                    <p className="text-center text-slate-500 text-sm py-4">No recognitions received yet</p>
                  )}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Recognitions Given</h3>
                <div className="space-y-2">
                  {recognitions
                    .filter((r) => r.fromName.includes(user?.firstName || "___"))
                    .map((r) => (
                      <div key={r.id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-900 dark:text-white">To: {r.toName}</span>
                          <span className="text-[10px] text-slate-500">{CATEGORY_ICONS[r.category] || ""} {r.category.replace(/_/g, " ")}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{r.message}</p>
                        <span className="text-[10px] text-slate-500">{formatTimeAgo(r.createdAt)}</span>
                      </div>
                    ))}
                  {recognitions.filter((r) => r.fromName.includes(user?.firstName || "___")).length === 0 && (
                    <p className="text-center text-slate-500 text-sm py-4">You haven&apos;t given any recognitions yet</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
