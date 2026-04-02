"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, CardHeader, StatCard, Badge, Button,
  DataTable, Modal, Input, Select, Textarea, Tabs, EmptyState,
} from "@/components/ui";
import { formatDate, timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

/* ── colour maps ────────────────────────────────────────── */

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

const categoryColors: Record<string, BadgeColor> = {
  KUDOS: "green",
  INNOVATION: "purple",
  TEAMWORK: "blue",
  LEADERSHIP: "amber",
  CUSTOMER_FOCUS: "cyan",
  GOING_ABOVE: "pink",
  MENTORSHIP: "emerald",
  VALUES: "orange",
};

const awardColors: Record<string, BadgeColor> = {
  BRONZE: "amber",
  SILVER: "slate",
  GOLD: "orange",
  PLATINUM: "purple",
};

/* ── types ──────────────────────────────────────────────── */

interface Recognition {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  category: string;
  message: string;
  points: number;
  isPublic: boolean;
  reactions?: Record<string, number>;
  createdAt: string;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  totalPoints: number;
  recognitionsReceived: number;
  recognitionsGiven: number;
  topCategory: string;
}

interface AwardProgram {
  id: string;
  name: string;
  description: string;
  tier: string;
  pointsRequired: number;
  isActive: boolean;
  winnersCount: number;
}

interface RecognitionStats {
  totalRecognitions: number;
  myPoints: number;
  myRecognitionsGiven: number;
  myRecognitionsReceived: number;
  thisMonthTotal: number;
}

/* ── component ──────────────────────────────────────────── */

export default function RecognitionWallPage() {
  const { token, user, isAdmin, isHR } = useAuth();

  const [activeTab, setActiveTab] = useState("wall");
  const tabs = [
    { id: "wall", label: "Recognition Wall" }, { id: "leaderboard", label: "Leaderboard" }, { id: "awards", label: "Award Programs" }, { id: "my", label: "My Points" },
  ];

  /* ── data ─────────────────────────────────────────────── */
  const { data: recognitions, loading, refetch } = useApi<Recognition[]>("/recognition");
  const { data: leaderboard, loading: lbLoading } = useApi<LeaderboardEntry[]>("/recognition/leaderboard");
  const { data: awards, loading: awLoading, refetch: refetchAwards } = useApi<AwardProgram[]>("/recognition/awards");
  const { data: stats } = useApi<RecognitionStats>("/recognition/stats");
  const { data: myRecognitions, loading: myLoading } = useApi<Recognition[]>("/recognition/me");

  /* ── state ────────────────────────────────────────────── */
  const [showGive, setShowGive] = useState(false);
  const [showCreateAward, setShowCreateAward] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [form, setForm] = useState({
    toUserId: "", category: "KUDOS", message: "", points: "10", isPublic: "true",
  });

  const [awardForm, setAwardForm] = useState({
    name: "", description: "", tier: "BRONZE", pointsRequired: "",
  });

  /* ── helpers ──────────────────────────────────────────── */
  const flash = (type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  /* ── actions ──────────────────────────────────────────── */
  const handleGive = async () => {
    setSubmitting(true);
    const res = await api.post("/recognition", {
      ...form,
      points: Number(form.points),
      isPublic: form.isPublic === "true",
    }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Recognition sent!");
      setShowGive(false);
      setForm({ toUserId: "", category: "KUDOS", message: "", points: "10", isPublic: "true" });
      refetch();
    } else flash("error", res.error || "Failed to send recognition");
  };

  const handleReact = async (id: string, emoji: string) => {
    const res = await api.post(`/recognition/${id}/react`, { emoji }, token || undefined);
    if (res.success) refetch();
    else flash("error", res.error || "Reaction failed");
  };

  const handleCreateAward = async () => {
    setSubmitting(true);
    const res = await api.post("/recognition/awards", {
      ...awardForm, pointsRequired: Number(awardForm.pointsRequired),
    }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Award program created");
      setShowCreateAward(false);
      setAwardForm({ name: "", description: "", tier: "BRONZE", pointsRequired: "" });
      refetchAwards();
    } else flash("error", res.error || "Failed");
  };

  /* ── columns ──────────────────────────────────────────── */
  const leaderboardColumns = [
    {
      id: "rank", header: "#",
      render: (e: LeaderboardEntry) => (
        <span className={`font-bold ${e.rank <= 3 ? "text-amber-600 dark:text-amber-400" : "text-slate-400"}`}>
          {e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : `#${e.rank}`}
        </span>
      ),
    }, { key: "userName", header: "Employee", render: (e: LeaderboardEntry) => <span className="font-medium text-slate-900 dark:text-white">{e.userName}</span> }, { key: "totalPoints", header: "Points", render: (e: LeaderboardEntry) => <span className="font-mono text-brand-600 dark:text-brand-400">{e.totalPoints}</span> }, { key: "recognitionsReceived", header: "Received", render: (e: LeaderboardEntry) => e.recognitionsReceived }, { key: "recognitionsGiven", header: "Given", render: (e: LeaderboardEntry) => e.recognitionsGiven }, { key: "topCategory", header: "Top Category", render: (e: LeaderboardEntry) => <Badge color={categoryColors[e.topCategory] || "slate"}>{e.topCategory}</Badge> },
  ];

  const awardColumns = [
    { id: "name", header: "Program", render: (a: AwardProgram) => <span className="font-medium text-slate-900 dark:text-white">{a.name}</span> }, { key: "description", header: "Description" }, { key: "tier", header: "Tier", render: (a: AwardProgram) => <Badge color={awardColors[a.tier] || "slate"}>{a.tier}</Badge> }, { key: "pointsRequired", header: "Points Required", render: (a: AwardProgram) => <span className="font-mono text-slate-900 dark:text-white">{a.pointsRequired}</span> }, { key: "winnersCount", header: "Winners", render: (a: AwardProgram) => a.winnersCount }, { key: "isActive", header: "Status", render: (a: AwardProgram) => <Badge color={a.isActive ? "green" : "slate"}>{a.isActive ? "Active" : "Inactive"}</Badge> },
  ];

  const s = stats || { totalRecognitions: 0, myPoints: 0, myRecognitionsGiven: 0, myRecognitionsReceived: 0, thisMonthTotal: 0 };
  const emojis = ["👏", "🎉", "💪", "❤️", "🌟"];

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`fixed right-4 top-4 z-[100] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          feedback.type === "success" ? "border border-green-200 dark:border-green-500/30 bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400"
            : "border border-red-200 dark:border-red-500/30 bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400"
        }`}>{feedback.msg}</div>
      )}

      <PageHeader
        title="Recognition Wall"
        subtitle="Celebrate achievements and appreciate your colleagues"
        breadcrumbs={[{ label: "Recognition" }]}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setShowGive(true)}>Give Recognition</Button>
            {(isAdmin || isHR) && (
              <Button variant="secondary" onClick={() => setShowCreateAward(true)}>+ Award Program</Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard title="Total Recognitions" value={s.totalRecognitions} color="blue" />
        <StatCard title="My Points" value={s.myPoints} color="purple" />
        <StatCard title="Given" value={s.myRecognitionsGiven} color="green" />
        <StatCard title="Received" value={s.myRecognitionsReceived} color="cyan" />
        <StatCard title="This Month" value={s.thisMonthTotal} color="amber" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── wall feed ───────────────────────────────────── */}
      {activeTab === "wall" && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="h-6 w-6 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : (recognitions || []).length === 0 ? (
            <EmptyState title="No Recognitions Yet" subtitle="Be the first to give recognition to a colleague!" actions={<Button onClick={() => setShowGive(true)}>Give Recognition</Button>} />
          ) : (
            (recognitions || []).map((r) => (
              <Card key={r.id}>
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600/20 text-lg font-bold text-brand-600 dark:text-brand-400">
                    {r.fromUserName?.charAt(0) || "?"}
                  </Card>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-900 dark:text-white">{r.fromUserName}</span>
                      <span className="text-slate-500">→</span>
                      <span className="font-medium text-brand-600 dark:text-brand-400">{r.toUserName}</span>
                      <Badge color={categoryColors[r.category] || "slate"}>{r.category}</Badge>
                      <span className="ml-auto text-xs text-slate-500">{timeAgo(r.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">{r.message}</p>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-brand-600/20 px-2.5 py-0.5 text-xs font-mono font-bold text-brand-600 dark:text-brand-400">+{r.points} pts</span>
                      <div className="flex gap-1">
                        {emojis.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleReact(r.id, emoji)}
                            className="rounded-full px-1.5 py-0.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            {emoji} {r.reactions?.[emoji] ? <span className="text-xs text-slate-500">{r.reactions[emoji]}</span> : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── leaderboard ─────────────────────────────────── */}
      {activeTab === "leaderboard" && (
        <Card>
          <CardHeader title="Leaderboard" subtitle="Top recognized employees" />
          <DataTable columns={leaderboardColumns} data={leaderboard || []} keyExtractor={(e) => e.userId} loading={lbLoading} emptyMessage="No leaderboard data." />
        </Card>
      )}

      {/* ── award programs ──────────────────────────────── */}
      {activeTab === "awards" && (
        <Card>
          <CardHeader title="Award Programs" subtitle="Recognition tiers and programs" />
          <DataTable columns={awardColumns} data={awards || []} keyExtractor={(a) => a.id} loading={awLoading} emptyMessage="No award programs." />
        </Card>
      )}

      {/* ── my points ───────────────────────────────────── */}
      {activeTab === "my" && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Your Total Points</p>
                <p className="text-4xl font-bold text-brand-600 dark:text-brand-400">{s.myPoints}</p>
              </Card>
              <div className="grid grid-cols-2 gap-6 text-center">
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{s.myRecognitionsReceived}</p>
                  <p className="text-xs text-slate-500">Received</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{s.myRecognitionsGiven}</p>
                  <p className="text-xs text-slate-500">Given</p>
                </div>
              </div>
            </div>
          </div>
          <Card>
            <CardHeader title="My Recognitions" subtitle="Recognitions you've received" />
            {myLoading ? (
              <div className="flex items-center justify-center py-12">
                <svg className="h-6 w-6 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </Card>
            ) : (myRecognitions || []).length === 0 ? (
              <EmptyState title="No Recognitions" subtitle="You haven't received any recognitions yet." />
            ) : (
              <div className="space-y-3">
                {(myRecognitions || []).map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <Badge color={categoryColors[r.category] || "slate"}>{r.category}</Badge>
                    <div className="flex-1">
                      <p className="text-sm text-slate-600 dark:text-slate-300">{r.message}</p>
                      <p className="text-xs text-slate-500">From: {r.fromUserName} • {timeAgo(r.createdAt)}</p>
                    </div>
                    <span className="font-mono text-brand-600 dark:text-brand-400">+{r.points}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── give recognition modal ──────────────────────── */}
      <Modal open={showGive} onClose={() => setShowGive(false)} title="Give Recognition" size="lg">
        <div className="space-y-4">
          <Input label="Recipient (User ID)" placeholder="usr_xxxxxxxx" value={form.toUserId} onChange={(e) => setForm({ ...form, toUserId: e.target.value })} />
          <div className="grid grid-cols-3 gap-4">
            <Select label="Category" options={[
              { value: "KUDOS", label: "Kudos" },
              { value: "INNOVATION", label: "Innovation" },
              { value: "TEAMWORK", label: "Teamwork" },
              { value: "LEADERSHIP", label: "Leadership" },
              { value: "CUSTOMER_FOCUS", label: "Customer Focus" },
              { value: "GOING_ABOVE", label: "Going Above & Beyond" },
              { value: "MENTORSHIP", label: "Mentorship" },
              { value: "VALUES", label: "Company Values" },
            ]} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Input label="Points" type="number" min="1" max="100" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
            <Select label="Public" options={[
              { value: "true", label: "Yes – Show on wall" },
              { value: "false", label: "No – Private" },
            ]} value={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.value })} />
          </div>
          <Textarea label="Message" placeholder="Tell them why they're awesome..." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowGive(false)}>Cancel</Button>
            <Button onClick={handleGive} loading={submitting} disabled={!form.toUserId || !form.message}>Send Recognition</Button>
          </div>
        </div>
      </Modal>

      {/* ── create award modal ──────────────────────────── */}
      <Modal open={showCreateAward} onClose={() => setShowCreateAward(false)} title="Create Award Program">
        <div className="space-y-4">
          <Input label="Program Name" placeholder="Employee of the Month" value={awardForm.name} onChange={(e) => setAwardForm({ ...awardForm, name: e.target.value })} />
          <Textarea label="Description" placeholder="Describe the award program..." value={awardForm.description} onChange={(e) => setAwardForm({ ...awardForm, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Tier" options={[
              { value: "BRONZE", label: "Bronze" },
              { value: "SILVER", label: "Silver" },
              { value: "GOLD", label: "Gold" },
              { value: "PLATINUM", label: "Platinum" },
            ]} value={awardForm.tier} onChange={(e) => setAwardForm({ ...awardForm, tier: e.target.value })} />
            <Input label="Points Required" type="number" value={awardForm.pointsRequired} onChange={(e) => setAwardForm({ ...awardForm, pointsRequired: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowCreateAward(false)}>Cancel</Button>
            <Button onClick={handleCreateAward} loading={submitting} disabled={!awardForm.name}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
