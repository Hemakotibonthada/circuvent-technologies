"use client";
import React from "react";
import { useApi } from "@/hooks/use-auth";
import Link from "next/link";

export default function AnnouncementsPage() {
  const { data: announcements, loading } = useApi<any[]>("/hr/portal/announcements");
  const priorityColors: Record<string, string> = { LOW: "border-slate-200 dark:border-slate-700", NORMAL: "border-slate-200 dark:border-slate-700", HIGH: "border-amber-700/50", URGENT: "border-red-700/50" };
  const priorityBadges: Record<string, string> = { LOW: "bg-slate-100 dark:bg-slate-700 text-slate-400", NORMAL: "bg-blue-900/50 text-blue-400", HIGH: "bg-amber-900/50 text-amber-400", URGENT: "bg-red-900/50 text-red-400" };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="mb-6">
        <Link href="/portal" className="text-sm text-brand-400 hover:text-brand-300">← Back to Portal</Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">📢 Announcements</h1>
      </div>
      {loading ? <div className="text-center text-slate-500 py-12">Loading...</div> :
        !announcements || announcements.length === 0 ? <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No announcements</div> : (
        <div className="space-y-4">
          {announcements.map((a: any) => (
            <div key={a.id} className={`bg-white shadow-sm dark:bg-slate-900 border rounded-xl p-5 ${priorityColors[a.priority]} ${a.isPinned ? "ring-1 ring-brand-500/30" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {a.isPinned && <span className="text-sm">📌</span>}
                    <h2 className="text-white font-semibold">{a.title}</h2>
                    <span className={`px-2 py-0.5 text-xs rounded ${priorityBadges[a.priority]}`}>{a.priority}</span>
                    <span className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">{a.category}</span>
                  </div>
                  <p className="text-sm text-slate-400 mt-2 whitespace-pre-wrap">{a.content}</p>
                  <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                    <span>📅 {new Date(a.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                    {a.department && <span>🏢 {a.department}</span>}
                    {a.expiresAt && <span>⏰ Expires: {new Date(a.expiresAt).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
