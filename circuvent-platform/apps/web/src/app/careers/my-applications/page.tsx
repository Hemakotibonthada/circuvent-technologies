"use client";

// ══════════════════════════════════════════════════════════════
// My Applications — Candidate's own application tracker
// Only shows the logged-in user's applications. No admin access.
// ══════════════════════════════════════════════════════════════

import React from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, Badge } from "@/components/ui";

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

const STAGE_COLORS: Record<string, BadgeColor> = {
  APPLIED: "blue",
  SCREENING: "cyan",
  SHORTLISTED: "purple",
  TECHNICAL_ROUND: "amber",
  HR_ROUND: "pink",
  FINAL_ROUND: "orange",
  OFFER_EXTENDED: "emerald",
  OFFER_ACCEPTED: "green",
  HIRED: "green",
  REJECTED: "red",
  WITHDRAWN: "slate",
};

export default function MyApplicationsPage() {
  const { user } = useAuth();
  const { data: applications, loading } = useApi<any[]>("/recruitment/applications");

  // Filter to only show current user's applications
  const myApps = (applications || []).filter(
    (app: any) => app.candidate?.email === user?.email || app.candidateId === user?.id
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Applications"
        subtitle="Track the status of your job applications"
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : myApps.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <p className="text-4xl">📭</p>
            <p className="mt-2 text-sm text-slate-400">No applications yet</p>
            <a href="/careers" className="mt-4 inline-block rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-slate-900 dark:text-white hover:bg-brand-700">
              Browse Open Positions
            </a>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {myApps.map((app: any) => (
            <Card key={app.id}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-mono">{app.applicationCode}</span>
                    <Badge color={STAGE_COLORS[app.currentStage] || "slate"}>
                      {(app.currentStage || "APPLIED").replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <h3 className="mt-1 text-base font-medium text-slate-900 dark:text-white">
                    {app.job?.title || "Position"}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {app.job?.department || "—"} · Applied {new Date(app.createdAt).toLocaleDateString("en-IN")}
                  </p>
                </div>
                {app.atsScore !== null && app.atsScore !== undefined && (
                  <div className="text-right">
                    <p className={`text-lg font-bold ${app.atsScore >= 70 ? "text-green-400" : app.atsScore >= 50 ? "text-amber-400" : "text-red-400"}`}>
                      {app.atsScore}<span className="text-xs text-slate-500">/100</span>
                    </p>
                    <p className="text-xs text-slate-500">Match Score</p>
                  </div>
                )}
              </div>

              {/* Stage Timeline */}
              {app.timeline && app.timeline.length > 0 && (
                <div className="mt-4 border-t border-slate-200 dark:border-slate-800 pt-3">
                  <p className="text-xs font-medium text-slate-400 mb-2">Timeline</p>
                  <div className="space-y-1">
                    {app.timeline.slice(-5).map((entry: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                        <span className="text-slate-500">{new Date(entry.changedAt || entry.createdAt).toLocaleDateString("en-IN")}</span>
                        <Badge color={STAGE_COLORS[entry.toStage] || "slate"}>
                          {(entry.toStage || entry.stage || "").replace(/_/g, " ")}
                        </Badge>
                        {entry.notes && <span className="text-slate-600">— {entry.notes}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
